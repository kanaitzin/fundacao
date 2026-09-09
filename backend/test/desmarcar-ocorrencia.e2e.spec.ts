/**
 * DESMARCAR UMA OCORRÊNCIA — e o caminho até o lugar.
 *
 * Pedido da Fundação em 09/09/2026: o acompanhamento da Ana com a psicóloga é
 * toda semana; numa semana a psicóloga desmarcou. Até aqui o sistema só sabia
 * cancelar o COMPROMISSO INTEIRO — e cancelar a série porque uma semana caiu
 * apaga um combinado que continua valendo.
 *
 * O que estes testes protegem:
 *
 *  1. **desmarcar uma data não cancela a série.** A semana seguinte continua
 *     na agenda;
 *  2. **o dia desmarcado NÃO some.** Ele continua na projeção, marcado, com o
 *     motivo. Sumir esconderia que o atendimento estava previsto e não
 *     aconteceu — e no mês seguinte a ausência viraria esquecimento;
 *  3. **a lista do turno não cria a atividade** daquele dia: ninguém tem de
 *     levar a Ana a lugar nenhum;
 *  4. **motivo é obrigatório**, porque quem abre a agenda depois precisa saber;
 *  5. **quem desmarca é mais estreito que quem marca.** O líder e a enfermagem
 *     encerram a série, mas não desmarcam a quarta de uma criança: isso é
 *     reorganizar o plano dela;
 *  6. **remarcar não apaga a linha** — encerra-a, com autor;
 *  7. **desmarcar ontem é recusado.** O que passou se corrige na atividade,
 *     com o nome de quem corrigiu;
 *  8. **a hora de sair é diferente da hora de chegar**, e sair depois de ter
 *     de estar lá é recusado.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/* As datas são as da INSTITUIÇÃO, não as do servidor: depois das 21h de Porto
   Alegre o UTC já virou, e o teste marcaria para amanhã cobrando de hoje. */
const dia = (offset = 0) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() + offset * 86400_000));

describe('Desmarcar uma ocorrência sem cancelar o compromisso', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let AI3: string, pessoa: string;
  const criados: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password: SENHA });

  /** Um compromisso DIÁRIO: cai em todos os dias da janela, sem depender do
   *  dia da semana em que a suíte roda. */
  async function compromissoDiario(extra: Record<string, unknown> = {}) {
    const r = await request(http).post('/api/v1/activities/agenda')
      .set(auth(tokens.tecnica))
      .send({
        houseId: AI3, personId: pessoa, tipo: 'saude',
        titulo: 'Acompanhamento psicológico (teste desmarque)',
        local: 'Clínica Fictícia', inicio: dia(), hora: '15:00',
        recorrencia: 'diaria', fim: dia(20), ...extra,
      });
    if (r.body?.id) criados.push(r.body.id);
    return r;
  }

  const agenda = (token: string, de: string, ate: string) =>
    request(http).get(`/api/v1/activities/agenda?houseId=${AI3}&de=${de}&ate=${ate}`)
      .set(auth(token));

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
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord: 'coord.ai3@paodospobres.dev',
      lider: 'lider.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
      enfermagem: 'enfermagem@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;

    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    const { rows: [p] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id=$1 AND status='ativa' LIMIT 1`, [AI3]);
    pessoa = p.person_id;
  });

  afterAll(async () => {
    /* Suíte que muta estado compartilhado desfaz o que criou — inclusive as
       exceções, senão a agenda da próxima suíte nasce com buracos. */
    if (criados.length) {
      await admin.query(
        `DELETE FROM commitment_exception WHERE commitment_id = ANY($1::uuid[])`, [criados]);
      await admin.query(
        `DELETE FROM activity_assignment WHERE activity_id IN
           (SELECT id FROM activity WHERE commitment_id = ANY($1::uuid[]))`, [criados]);
      await admin.query(`DELETE FROM activity WHERE commitment_id = ANY($1::uuid[])`, [criados]);
      await admin.query(`DELETE FROM commitment WHERE id = ANY($1::uuid[])`, [criados]);
    }
    await app.close(); await admin.end();
  });

  it('desmarca UMA data e a série continua', async () => {
    const c = await compromissoDiario();
    expect(c.status).toBe(201);
    const alvo = dia(3);

    const r = await request(http).post(`/api/v1/activities/agenda/${c.body.id}/skip`)
      .set(auth(tokens.tecnica))
      .send({ data: alvo, motivo: 'A psicóloga desmarcou; remarcado para a semana seguinte.' });
    expect(r.status).toBe(201);

    const lista = await agenda(tokens.tecnica, dia(), dia(6));
    const meus = lista.body.filter((o: any) => o.compromissoId === c.body.id);

    // A data desmarcada CONTINUA na lista — marcada, com o motivo.
    const desmarcado = meus.find((o: any) => o.em.slice(0, 10) === alvo);
    expect(desmarcado).toBeDefined();
    expect(desmarcado.desmarcada).toBe(true);
    expect(desmarcado.motivoDesmarque).toMatch(/psicóloga/i);

    // E os outros dias seguem inteiros: cancelar a série seria outra coisa.
    const outros = meus.filter((o: any) => o.em.slice(0, 10) !== alvo);
    expect(outros.length).toBeGreaterThan(0);
    expect(outros.every((o: any) => o.desmarcada === false)).toBe(true);
  });

  it('o dia desmarcado não vira atividade do turno', async () => {
    const c = await compromissoDiario();
    const alvo = dia(1);
    await request(http).post(`/api/v1/activities/agenda/${c.body.id}/skip`)
      .set(auth(tokens.tecnica))
      .send({ data: alvo, motivo: 'Profissional em férias nesta data.' })
      .expect(201);

    await request(http).post('/api/v1/activities/agenda/generate')
      .set(auth(tokens.coord)).send({ houseId: AI3, date: alvo }).expect(201);

    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM activity
        WHERE commitment_id = $1
          AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date`,
      [c.body.id, alvo]);
    expect(rows[0].n).toBe(0);
  });

  it('exige motivo — quem abrir a agenda depois precisa saber', async () => {
    const c = await compromissoDiario();
    await request(http).post(`/api/v1/activities/agenda/${c.body.id}/skip`)
      .set(auth(tokens.tecnica)).send({ data: dia(2), motivo: 'x' })
      .expect((r) => { expect(r.status).toBeGreaterThanOrEqual(400); });
  });

  it('recusa desmarcar o passado', async () => {
    const c = await compromissoDiario();
    await request(http).post(`/api/v1/activities/agenda/${c.body.id}/skip`)
      .set(auth(tokens.tecnica))
      .send({ data: dia(-1), motivo: 'Tentando apagar o que já foi vivido.' })
      .expect((r) => { expect(r.status).toBeGreaterThanOrEqual(400); });
  });

  it('educador e enfermagem não desmarcam', async () => {
    const c = await compromissoDiario();
    for (const quem of ['educador', 'enfermagem', 'lider']) {
      await request(http).post(`/api/v1/activities/agenda/${c.body.id}/skip`)
        .set(auth(tokens[quem]))
        .send({ data: dia(4), motivo: 'Motivo suficientemente longo para passar.' })
        .expect((r) => { expect(r.status).toBeGreaterThanOrEqual(400); });
    }
  });

  it('remarcar devolve o dia, e a linha do desmarque fica no histórico', async () => {
    const c = await compromissoDiario();
    const alvo = dia(5);
    await request(http).post(`/api/v1/activities/agenda/${c.body.id}/skip`)
      .set(auth(tokens.coord)).send({ data: alvo, motivo: 'Sala indisponível nesta data.' })
      .expect(201);
    await request(http).post(`/api/v1/activities/agenda/${c.body.id}/unskip`)
      .set(auth(tokens.coord)).send({ data: alvo }).expect(201);

    const lista = await agenda(tokens.coord, alvo, alvo);
    const meu = lista.body.find((o: any) => o.compromissoId === c.body.id);
    expect(meu.desmarcada).toBe(false);

    // Desfazer não apaga: a linha continua, encerrada, com quem desfez.
    const { rows } = await admin.query(
      `SELECT undone_at, undone_by FROM commitment_exception
        WHERE commitment_id = $1 AND on_date = $2::date`, [c.body.id, alvo]);
    expect(rows.length).toBe(1);
    expect(rows[0].undone_at).not.toBeNull();
    expect(rows[0].undone_by).not.toBeNull();
  });

  it('a hora de sair vem junto da hora de estar lá, com o endereço', async () => {
    const c = await compromissoDiario({
      hora: '14:00', horaSaida: '13:00',
      endereco: 'Rua Fictícia, 100 — Bairro Exemplo',
    });
    expect(c.status).toBe(201);

    const lista = await agenda(tokens.educador, dia(), dia(1));
    const meu = lista.body.find((o: any) => o.compromissoId === c.body.id);
    expect(meu.hora).toBe('14:00');
    expect(meu.horaSaida).toBe('13:00');
    expect(meu.endereco).toMatch(/Rua Fictícia/);
  });

  it('recusa sair depois da hora de estar no local', async () => {
    const r = await compromissoDiario({ hora: '09:00', horaSaida: '10:30' });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
