/**
 * OS NÚMEROS DE UMA CRIANÇA, NO PERFIL DELA (fase 221, pedido de 14/10).
 *
 * "Faça cada menu do perfil ser ferramenta de trabalho, com as métricas dela."
 * O que esta suíte cobra:
 *
 *  1. o acolhimento em números: desde quando, há quantos dias, que episódio;
 *  2. as doses dos últimos trinta dias batem com o banco, contadas de outro jeito,
 *     e o educador as lê;
 *  3. quem não lê a internação recebe `null`, e não zero;
 *  4. o PIA só para a equipe técnica, a coordenação e a gestão;
 *  5. a outra casa não alcança: 404, e nenhum número dela.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Os números da criança', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  let crianca = '';
  let doses: string[] = [];
  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const numeros = (quem: string, id = crianca) =>
    request(http).get(`/api/v1/reports/acolhido/${id}/numeros`).set({ Authorization: `Bearer ${tokens[quem]}` });

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
      coord: 'coord.ai3@paodospobres.dev', tecnica: 'tecnica.ai3@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev', enfermagem: 'enfermagem@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);
    /* Uma criança da Casa 03 com remédio em uso. A suíte nasce sem dose
       nenhuma (superfície sem dado é superfície sem teste, lição 127): as
       doses de vinte dias atrás são escritas aqui, em estados que não mexem
       no armário, e saem no fim. */
    let receita = '', casa = '';
    ({ rows: [{ id: crianca, receita, casa }] } = await admin.query(
      `SELECT p.person_id AS id, p.id AS receita, p.house_id AS casa
         FROM prescription p
         JOIN house_stay s ON s.person_id = p.person_id AND s.status = 'ativa'
         JOIN house h ON h.id = s.house_id AND h.code = 'AI3'
        WHERE p.status = 'ativa'
        ORDER BY p.person_id LIMIT 1`));
    const { rows } = await admin.query(
      `INSERT INTO medication_administration (prescription_id, person_id, house_id, scheduled_at, state)
       SELECT $1, $2, $3, now() - interval '20 days' + (n || ' minutes')::interval, e::administration_state
         FROM unnest(ARRAY['recusado','acolhido_ausente','aguardando_confirmacao','nao_administrado','recusado'])
              WITH ORDINALITY AS t(e, n)
       RETURNING id`, [receita, crianca, casa]);
    doses = rows.map((x) => x.id);
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM medication_administration WHERE id = ANY($1::uuid[])`, [doses]);
    await app.close(); await admin.end();
  });

  it('o acolhimento em números: desde quando, há quantos dias, que episódio', async () => {
    const r = await numeros('coord').expect(200);
    const { rows: [e] } = await admin.query(
      `SELECT number, (started_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS desde
         FROM care_episode WHERE person_id = $1 AND status = 'ativo'`, [crianca]);
    const { rows: [{ hoje }] } = await admin.query(`SELECT app_hoje()::text AS hoje`);
    expect(r.body.geral).toMatchObject({ acolhidaDesde: e.desde, episodio: e.number });
    const dias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${e.desde}T12:00:00Z`)) / 86_400_000);
    expect(r.body.geral.diasNoAcolhimento).toBe(dias);
    expect(r.body.geral.casasNesteAcolhimento).toBeGreaterThanOrEqual(1);
  });

  it('as doses dos últimos trinta dias batem com o banco, contadas de outro jeito', async () => {
    const r = await numeros('educador').expect(200);
    const { rows } = await admin.query(
      `SELECT state::text AS s, count(*)::int AS n FROM medication_administration
        WHERE person_id = $1 AND scheduled_at <= now()
          AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date > app_hoje() - 30
        GROUP BY 1`, [crianca]);
    const por = Object.fromEntries(rows.map((x) => [x.s, x.n]));
    const soma = (...s: string[]) => s.reduce((t, k) => t + (por[k] ?? 0), 0);
    expect(r.body.saude.doses30).toEqual({
      previstas: rows.reduce((t, x) => t + x.n, 0),
      noHorario: soma('administrado_no_horario'),
      foraDoHorario: soma('administrado_com_atraso'),
      naoDadas: soma('recusado', 'nao_administrado', 'indisponivel', 'incidente'),
      semConfirmacao: soma('aguardando_confirmacao'),
      ausente: soma('acolhido_ausente'),
    });
    expect(r.body.saude.doses30.previstas).toBeGreaterThanOrEqual(5);
    expect(r.body.saude.doses30.naoDadas).toBeGreaterThanOrEqual(3);
  });

  it('quem não lê a internação recebe null, e não zero', async () => {
    const { rows: [{ n }] } = await admin.query(
      `SELECT count(*)::int AS n FROM hospitalization WHERE person_id = $1`, [crianca]);
    expect((await numeros('educador').expect(200)).body.saude.internacoes).toBeNull();
    expect((await numeros('enfermagem').expect(200)).body.saude.internacoes.total).toBe(n);
  });

  it('o PIA só para a equipe técnica, a coordenação e a gestão', async () => {
    expect((await numeros('educador').expect(200)).body.geral.pia).toBeNull();
    expect((await numeros('enfermagem').expect(200)).body.geral.pia).toBeNull();
    const { rows: [{ vence }] } = await admin.query(
      `SELECT max(valid_until)::text AS vence FROM document WHERE person_id = $1 AND checklist_key = 'pia'`,
      [crianca]);
    /* Sem PIA cadastrado, a técnica recebe o objeto com `vence: null`: é
       trabalho a fazer, e a tela diz isso a ela. */
    expect((await numeros('tecnica').expect(200)).body.geral.pia).toMatchObject({ vence });
  });

  it('a outra casa não alcança: 404, e nenhum número dela', async () => {
    const r = await numeros('coord4');
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(/doses30|acolhidaDesde/);
  });
});
