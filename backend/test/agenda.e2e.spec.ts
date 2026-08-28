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
