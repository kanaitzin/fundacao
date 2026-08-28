/**
 * AGENDA DA LINHA DO TEMPO.
 *
 * Pedido da Fundação: Líder Diurno, equipe técnica e coordenação marcando
 * atividade para um acolhido ou para a casa toda, com data e hora exatas,
 * semanas à frente — e com prazo indeterminado quando o tratamento não tem
 * data para acabar, como já acontece com a prescrição contínua da Enfermagem.
 *
 * O que estes testes protegem:
 *
 *  1. **o educador executa, não agenda.** Marcar compromisso futuro é de quem
 *     responde pelo planejamento;
 *  2. **a consulta de outubro é vista em agosto** — e sem criar sessenta
 *     linhas de atividade que ninguém pediu. A agenda futura é projeção; só o
 *     dia corrente vira linha do tempo;
 *  3. **sem prazo exige a frase.** "Todo dia, sem data de fim" é o que um
 *     tratamento contínuo pede, e é também a forma mais fácil de a agenda
 *     encher de compromisso que ninguém revisa. O motivo fica visível;
 *  4. **coletivo é coletivo.** Uma atividade da casa não vira vinte linhas
 *     individuais;
 *  5. **encerrar não apaga o passado.** O que já aconteceu continua na linha
 *     do tempo; o que estava marcado adiante sai da agenda.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** Datas fixas e futuras, para o teste não depender do dia em que roda. */
const hoje = new Date().toISOString().slice(0, 10);
const daquiUmMes = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
const daquiDoisMeses = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);

describe('Agenda — marcar na linha do tempo com data, hora e repetição', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, pessoa: string;
  const criados: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();

    for (const [k, email] of Object.entries({
      lider: 'lider.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: [p] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]);
    pessoa = p.person_id;
  });

  afterAll(async () => {
    if (criados.length) {
      await admin.query(
        `DELETE FROM activity_assignment WHERE activity_id IN
           (SELECT id FROM activity WHERE commitment_id = ANY($1::uuid[]))`, [criados]);
      await admin.query(`DELETE FROM activity WHERE commitment_id = ANY($1::uuid[])`, [criados]);
      await admin.query(`DELETE FROM commitment WHERE id = ANY($1::uuid[])`, [criados]);
    }
    await app.close(); await admin.end();
  });

  it('o educador não marca compromisso — executa o que está marcado', async () => {
    const res = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.educador)).send({
        houseId: AI3, personId: pessoa, tipo: 'atividade', titulo: 'Passeio (fictício)',
        inicio: hoje, hora: '15:00', recorrencia: 'unica',
      });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Líder Diurno, da equipe técnica/i);
  });

  it('a técnica marca uma consulta para daqui a dois meses, e ela aparece lá', async () => {
    const res = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.tecnica)).send({
        houseId: AI3, personId: pessoa, tipo: 'saude',
        titulo: 'Consulta oftalmológica (fictícia)', local: 'UBS fictícia',
        inicio: daquiDoisMeses, hora: '09:30', duracaoMin: 60, recorrencia: 'unica',
        orientacoes: 'Levar cartão SUS e o encaminhamento.',
      });
    expect(res.status).toBe(201);
    criados.push(res.body.id);

    // Está na agenda do dia certo…
    const agenda = await request(http)
      .get(`/api/v1/activities/agenda?houseId=${AI3}&de=${daquiDoisMeses}&ate=${daquiDoisMeses}`)
      .set(auth(tokens.lider));
    const item = agenda.body.find((a: any) => a.compromissoId === res.body.id);
    expect(item).toBeTruthy();
    expect(item.hora).toBe('09:30');
    expect(item.coletivo).toBe(false);

    // …e NÃO virou linha do tempo de hoje: agenda futura é projeção.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM activity WHERE commitment_id=$1`, [res.body.id]);
    expect(rows[0].n).toBe(0);
  });

  it('tratamento sem data para acabar exige o motivo — e passa a aparecer todo dia', async () => {
    const semMotivo = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.enfermagem)).send({
        houseId: AI3, personId: pessoa, tipo: 'tratamento',
        titulo: 'Colírio da manhã (fictício)', inicio: hoje, hora: '07:30',
        recorrencia: 'diaria', fim: null,
      });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.message).toMatch(/motivo/i);

    const res = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.enfermagem)).send({
        houseId: AI3, personId: pessoa, tipo: 'tratamento',
        titulo: 'Colírio da manhã (fictício)', inicio: hoje, hora: '07:30',
        recorrencia: 'diaria', fim: null,
        motivoSemPrazo: 'Uso contínuo conforme laudo oftalmológico, sem previsão de alta (fictício).',
      });
    expect(res.status).toBe(201);
    expect(res.body.indeterminado).toBe(true);
    expect(res.body.aviso).toMatch(/tempo indeterminado/i);
    criados.push(res.body.id);

    // Aparece hoje e continua aparecendo daqui a um mês.
    for (const dia of [hoje, daquiUmMes]) {
      const agenda = await request(http)
        .get(`/api/v1/activities/agenda?houseId=${AI3}&de=${dia}&ate=${dia}`)
        .set(auth(tokens.tecnica));
      expect(agenda.body.some((a: any) => a.compromissoId === res.body.id)).toBe(true);
    }

    // E como já vale hoje, virou linha do tempo agora.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM activity WHERE commitment_id=$1`, [res.body.id]);
    expect(rows[0].n).toBe(1);

    // O motivo fica visível para quem revisar a agenda depois.
    const vigentes = await request(http)
      .get(`/api/v1/activities/agenda/commitments?houseId=${AI3}`).set(auth(tokens.coord));
    const c = vigentes.body.find((x: any) => x.id === res.body.id);
    expect(c.indeterminado).toBe(true);
    expect(c.motivoSemPrazo).toMatch(/laudo oftalmológico/);
  });

  it('semanal cai só nos dias escolhidos, e sem dias não é semanal', async () => {
    const semDias = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.lider)).send({
        houseId: AI3, personId: pessoa, tipo: 'saude', titulo: 'Fono (fictícia)',
        inicio: hoje, hora: '14:00', recorrencia: 'semanal', fim: daquiDoisMeses,
      });
    expect(semDias.status).toBe(400);

    const res = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.lider)).send({
        houseId: AI3, personId: pessoa, tipo: 'saude', titulo: 'Fono (fictícia)',
        local: 'Clínica fictícia', inicio: hoje, hora: '14:00', duracaoMin: 45,
        recorrencia: 'semanal', diasSemana: [2], fim: daquiDoisMeses,   // terças
      });
    expect(res.status).toBe(201);
    criados.push(res.body.id);

    const agenda = await request(http)
      .get(`/api/v1/activities/agenda?houseId=${AI3}&de=${hoje}&ate=${daquiUmMes}`)
      .set(auth(tokens.lider));
    const desta = agenda.body.filter((a: any) => a.compromissoId === res.body.id);
    expect(desta.length).toBeGreaterThan(2);
    // Toda ocorrência cai numa terça-feira.
    for (const o of desta) {
      expect(new Date(`${String(o.em).slice(0, 10)}T12:00:00Z`).getUTCDay()).toBe(2);
    }
  });

  it('atividade coletiva é da casa: uma linha, não vinte', async () => {
    const res = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.coord)).send({
        houseId: AI3, tipo: 'lazer', titulo: 'Cinema na sala (fictício)',
        inicio: hoje, hora: '19:00', duracaoMin: 90, recorrencia: 'unica',
      });
    expect(res.status).toBe(201);
    expect(res.body.coletivo).toBe(true);
    criados.push(res.body.id);

    const agenda = await request(http)
      .get(`/api/v1/activities/agenda?houseId=${AI3}&de=${hoje}&ate=${hoje}`)
      .set(auth(tokens.educador));
    const item = agenda.body.find((a: any) => a.compromissoId === res.body.id);
    expect(item.coletivo).toBe(true);
    expect(item.pessoa).toBe('Casa toda');

    // Uma atividade para a casa — não uma por acolhido.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n, count(person_id)::int AS com_pessoa
         FROM activity WHERE commitment_id=$1`, [res.body.id]);
    expect(rows[0].n).toBe(1);
    expect(rows[0].com_pessoa).toBe(0);
  });

  it('marcar com um educador responsável faz a atividade cair no nome dele', async () => {
    // A lista traz quem pode ser nomeado, com quem está na escala do horário
    // aparecendo primeiro — o sinal ordena e avisa, não impede.
    const equipe = await request(http)
      .get(`/api/v1/activities/agenda/staff?houseId=${AI3}&data=${hoje}&hora=15:00`)
      .set(auth(tokens.tecnica));
    expect(equipe.status).toBe(200);
    expect(equipe.body.equipe.length).toBeGreaterThan(0);
    expect(equipe.body.equipe[0]).toHaveProperty('naEscala');
    expect(equipe.body).toHaveProperty('haEscala');
    // A cozinha não acompanha saída nem atividade: não é oferecida.
    expect(equipe.body.equipe.some((e: any) => e.cargo === 'cozinha')).toBe(false);

    const educador = equipe.body.equipe.find((e: any) => e.cargo === 'educador');
    const res = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.tecnica)).send({
        houseId: AI3, personId: pessoa, tipo: 'saude',
        titulo: 'Consulta com preparo (fictícia)', inicio: hoje, hora: '15:00',
        duracaoMin: 90, recorrencia: 'unica',
        responsavel: 'pessoa', responsavelId: educador.id,
        observacaoResponsavel: 'Combinado com ele na reunião de equipe (fictício).',
      });
    expect(res.status).toBe(201);
    expect(res.body.responsavel).toBe('pessoa');
    criados.push(res.body.id);

    // A ocorrência do dia nasce atribuída: é o que faz aparecer em
    // "Minhas responsabilidades" de quem foi nomeado.
    const { rows } = await admin.query(
      `SELECT aa.user_id FROM activity a
         JOIN activity_assignment aa ON aa.activity_id = a.id
        WHERE a.commitment_id = $1`, [res.body.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(educador.id);

    // E o cartão de revisão mostra o nome, em vez de "plantão".
    const vigentes = await request(http)
      .get(`/api/v1/activities/agenda/commitments?houseId=${AI3}`).set(auth(tokens.coord));
    const c = vigentes.body.find((x: any) => x.id === res.body.id);
    expect(c.responsavelNomeado).toBe(true);
    expect(c.responsavel).toBe(educador.nome);
  });

  it('sem nome, o compromisso é do plantão do horário — e ninguém é atribuído', async () => {
    const res = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.lider)).send({
        houseId: AI3, tipo: 'atividade', titulo: 'Lanche coletivo (fictício)',
        inicio: hoje, hora: '16:30', recorrencia: 'unica',
      });
    expect(res.status).toBe(201);
    expect(res.body.responsavel).toBe('plantao');
    expect(res.body.aviso).toMatch(/quem estiver no plantão/i);
    criados.push(res.body.id);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM activity a
         JOIN activity_assignment aa ON aa.activity_id = a.id
        WHERE a.commitment_id = $1`, [res.body.id]);
    expect(rows[0].n).toBe(0);

    const vigentes = await request(http)
      .get(`/api/v1/activities/agenda/commitments?houseId=${AI3}`).set(auth(tokens.coord));
    const c = vigentes.body.find((x: any) => x.id === res.body.id);
    expect(c.responsavel).toBe('Plantão do horário');
  });

  /**
   * Casa SEM escala cadastrada não tem ninguém "fora da escala".
   *
   * A tela de marcar mostrava "(fora da escala deste horário)" nos oito nomes
   * da casa — não porque todos estivessem de folga, mas porque não havia
   * escala nenhuma. Aviso que aparece em todo nome deixa de ser aviso, e
   * ensina a equipe a ignorá-lo justamente antes do dia em que ele acerta.
   */
  it('sem escala cadastrada, ninguém é marcado como fora dela', async () => {
    await admin.query(`DELETE FROM work_schedule WHERE house_id = $1`, [AI3]);

    const equipe = await request(http)
      .get(`/api/v1/activities/agenda/staff?houseId=${AI3}&data=${hoje}&hora=03:00`)
      .set(auth(tokens.coord));
    expect(equipe.body.haEscala).toBe(false);

    const alguem = equipe.body.equipe.find((e: any) => e.cargo === 'educador');
    const res = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.coord)).send({
        houseId: AI3, personId: pessoa, tipo: 'saude',
        titulo: 'Exame sem escala cadastrada (fictício)', inicio: hoje, hora: '03:00',
        recorrencia: 'unica', responsavel: 'pessoa', responsavelId: alguem.id,
      });
    expect(res.status).toBe(201);
    // Nada de alarme falso: não existe lista da qual estar fora.
    expect(res.body.foraDaEscala).toBeNull();
    expect(res.body.aviso).not.toMatch(/não está na escala/i);
    criados.push(res.body.id);
  });

  it('nomear quem está fora da escala avisa, mas não impede', async () => {
    // Com escala DE VERDADE cadastrada, o aviso volta a significar algo. Sem
    // este cadastro o teste passava sem provar nada: saía pelo `return` na
    // primeira linha, num ambiente onde ninguém estava em escala alguma.
    const { rows: [outro] } = await admin.query(
      `SELECT u.id FROM app_user u
         JOIN user_house_assignment a ON a.user_id = u.id AND a.house_id = $1
        WHERE u.role = 'educador' AND u.active LIMIT 1`, [AI3]);
    await admin.query(
      `INSERT INTO work_schedule (user_id, house_id, weekday, start_time, end_time, valid_from)
       VALUES ($1, $2, extract(dow from current_date)::smallint, '07:00', '19:00', current_date)`,
      [outro.id, AI3]);

    const equipe = await request(http)
      .get(`/api/v1/activities/agenda/staff?houseId=${AI3}&data=${hoje}&hora=03:00`)
      .set(auth(tokens.coord));
    expect(equipe.body.haEscala).toBe(true);
    const foraDaEscala = equipe.body.equipe.find((e: any) => !e.naEscala && e.cargo === 'educador');
    expect(foraDaEscala).toBeTruthy();

    const res = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.coord)).send({
        houseId: AI3, personId: pessoa, tipo: 'saude',
        titulo: 'Exame de madrugada (fictício)', inicio: hoje, hora: '03:00',
        recorrencia: 'unica', responsavel: 'pessoa', responsavelId: foraDaEscala.id,
      });
    // Marca, e diz o que precisa ser dito.
    expect(res.status).toBe(201);
    expect(res.body.foraDaEscala).toBe(foraDaEscala.nome);
    expect(res.body.aviso).toMatch(/não está na escala/i);
    criados.push(res.body.id);
  });

  it('materializar o dia é idempotente: rodar de novo não duplica', async () => {
    const primeira = await request(http).post('/api/v1/activities/agenda/generate')
      .set(auth(tokens.lider)).send({ houseId: AI3, date: hoje });
    expect(primeira.status).toBe(201);

    const segunda = await request(http).post('/api/v1/activities/agenda/generate')
      .set(auth(tokens.lider)).send({ houseId: AI3, date: hoje });
    expect(segunda.body.criadas).toBe(0);
  });

  it('encerrar tira da agenda para a frente e deixa o passado intacto', async () => {
    // Um compromisso diário que já materializou a ocorrência de hoje.
    const criado = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.tecnica)).send({
        houseId: AI3, personId: pessoa, tipo: 'curso', titulo: 'Curso fictício',
        inicio: hoje, hora: '16:00', recorrencia: 'diaria', fim: daquiDoisMeses,
      });
    criados.push(criado.body.id);
    await request(http).post('/api/v1/activities/agenda/generate')
      .set(auth(tokens.lider)).send({ houseId: AI3, date: hoje });

    // Materializa também um dia futuro, para provar que ele é retirado.
    const amanha = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    await request(http).post('/api/v1/activities/agenda/generate')
      .set(auth(tokens.lider)).send({ houseId: AI3, date: amanha });

    const semMotivo = await request(http).post(`/api/v1/activities/agenda/${criado.body.id}/cancel`)
      .set(auth(tokens.tecnica)).send({ motivo: '' });
    expect(semMotivo.status).toBe(400);

    const res = await request(http).post(`/api/v1/activities/agenda/${criado.body.id}/cancel`)
      .set(auth(tokens.tecnica)).send({ motivo: 'Curso concluído antes do previsto (fictício).' });
    expect(res.status).toBe(201);
    expect(res.body.futurasRemovidas).toBeGreaterThanOrEqual(1);

    // Sai da agenda futura…
    const agenda = await request(http)
      .get(`/api/v1/activities/agenda?houseId=${AI3}&de=${amanha}&ate=${daquiUmMes}`)
      .set(auth(tokens.tecnica));
    expect(agenda.body.some((a: any) => a.compromissoId === criado.body.id)).toBe(false);

    // …e a ocorrência de HOJE continua na linha do tempo, como aconteceu.
    const { rows } = await admin.query(
      `SELECT state FROM activity
        WHERE commitment_id=$1
          AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date`,
      [criado.body.id, hoje]);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('agendada');

    // O compromisso não foi apagado: continua registrado, inativo e com motivo.
    const { rows: [c] } = await admin.query(
      `SELECT active, cancel_reason FROM commitment WHERE id=$1`, [criado.body.id]);
    expect(c.active).toBe(false);
    expect(c.cancel_reason).toMatch(/Curso concluído/);
  });
});
