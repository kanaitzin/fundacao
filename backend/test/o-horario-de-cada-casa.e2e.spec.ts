/**
 * O HORÁRIO DE CADA CASA (fase 159).
 *
 * Pedido da Fundação em 26/09: a coordenação, o Líder Diurno e a equipe técnica
 * definem *"de qual horário a qual horário fica o turno da manhã e da noite"*,
 * e *"quando alterarem, o dia seguinte já sai no novo horário"*.
 *
 * O que esta suíte cobra:
 *
 *  1. sem configuração, vale o padrão da Fundação (08:00–20:00 / 20:01–07:59);
 *  2. só os três cargos, e só na própria casa, mudam;
 *  3. a mudança vale a partir de AMANHÃ — o turno de hoje não muda, e a ATA que
 *     passou guarda a janela que tinha;
 *  4. a noite de hoje termina no início do diurno NOVO de amanhã: nenhum
 *     minuto fica sem turno, nenhum fica com dois;
 *  5. a outra casa não é afetada;
 *  6. nada se apaga — cada mudança é uma linha, com autor, e vai à auditoria da
 *     casa.
 *
 * A suíte devolve a Casa 03 ao padrão no fim, como mudança registrada (não por
 * DELETE): outras suítes abrem plantões em datas futuras dela.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O horário de cada casa', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let hoje = '', amanha = '';

  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const turnoDe = async (casa: string, instante: string) => (await admin.query(
    `SELECT dia::text, periodo FROM app_turno_de($1::uuid, $2::timestamptz)`, [casa, instante])).rows[0];
  const janela = async (casa: string, dia: string, periodo: string) => (await admin.query(
    `SELECT to_char(de AT TIME ZONE app_fuso(), 'YYYY-MM-DD HH24:MI') AS de,
            to_char(ate AT TIME ZONE app_fuso(), 'YYYY-MM-DD HH24:MI') AS ate
       FROM app_janela_do_turno($1::uuid, $2::date, $3)`, [casa, dia, periodo])).rows[0];

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
      coord: 'coord.ai3@paodospobres.dev', lider: 'lider.ai3@paodospobres.dev',
      tecnica: 'tecnica.ai3@paodospobres.dev', educador: 'educador.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
    ({ rows: [{ hoje, amanha }] } = await admin.query(
      `SELECT app_hoje()::text AS hoje, (app_hoje() + 1)::text AS amanha`));
  });

  afterAll(async () => {
    /* De volta ao padrão, como mudança registrada — nada se apaga. */
    await request(http).post(`/api/v1/houses/${ids.AI3}/turnos`).set(auth(tokens.coord))
      .send({ diurnoDe: '08:00', diurnoAte: '20:00', motivo: 'Fim da conferência da fase 159.' });
    await app.close(); await admin.end();
  });

  it('sem configuração, a casa está no padrão da Fundação', async () => {
    const r = await request(http).get(`/api/v1/houses/${ids.AI3}/turnos`).set(auth(tokens.educador));
    expect(r.status).toBe(200);
    expect(r.body.hoje).toEqual({ diurno: { de: '08:00', ate: '20:00' }, noturno: { de: '20:01', ate: '07:59' } });
    expect(r.body.amanha).toBeNull();
    /* O educador lê, e a tela sabe que ele não muda. */
    expect(r.body.podeMudar).toBe(false);
  });

  it('o educador não muda, nem a coordenação de outra casa, nem um horário impossível', async () => {
    const e = await request(http).post(`/api/v1/houses/${ids.AI3}/turnos`).set(auth(tokens.educador))
      .send({ diurnoDe: '07:00', diurnoAte: '19:00' });
    expect(e.status).toBe(403);
    const f = await request(http).post(`/api/v1/houses/${ids.AI3}/turnos`).set(auth(tokens.coord4))
      .send({ diurnoDe: '07:00', diurnoAte: '19:00' });
    expect(f.status).toBe(404);
    const invertido = await request(http).post(`/api/v1/houses/${ids.AI3}/turnos`).set(auth(tokens.coord))
      .send({ diurnoDe: '20:00', diurnoAte: '08:00' });
    expect(invertido.status).toBe(400);
    expect(invertido.body.message).toMatch(/início vem antes do fim/);
    const lixo = await request(http).post(`/api/v1/houses/${ids.AI3}/turnos`).set(auth(tokens.coord))
      .send({ diurnoDe: '7h', diurnoAte: '19h' });
    expect(lixo.status).toBe(400);
  });

  it('o Líder Diurno muda para 07:00–19:00, e vale a partir de AMANHÃ', async () => {
    const r = await request(http).post(`/api/v1/houses/${ids.AI3}/turnos`).set(auth(tokens.lider))
      .send({ diurnoDe: '07:00', diurnoAte: '19:00', motivo: 'Troca de equipe às 7h nesta casa.' });
    expect(r.status).toBe(201);
    expect(r.body.vigenteDesde).toBe(amanha);
    expect(r.body.aviso).toMatch(/noturno das 19:01 às 06:59/);

    const g = await request(http).get(`/api/v1/houses/${ids.AI3}/turnos`).set(auth(tokens.coord));
    /* Hoje não mudou. */
    expect(g.body.hoje.diurno).toEqual({ de: '08:00', ate: '20:00' });
    expect(g.body.amanha).toEqual({
      diurno: { de: '07:00', ate: '19:00' }, noturno: { de: '19:01', ate: '06:59' }, desde: amanha,
    });
    expect(g.body.podeMudar).toBe(true);
  });

  it('a regra no banco: hoje é como era, amanhã é o novo, e a noite de hoje emenda no diurno novo', async () => {
    /* Hoje, 19:30, ainda é diurno — a mudança não vale para hoje. */
    expect(await turnoDe(ids.AI3, `${hoje}T19:30:00-03:00`)).toEqual({ dia: hoje, periodo: 'diurno' });
    /* Amanhã, 07:30, já é o diurno novo. */
    expect(await turnoDe(ids.AI3, `${amanha}T07:30:00-03:00`)).toEqual({ dia: amanha, periodo: 'diurno' });
    /* Amanhã, 19:30, já é noturno no horário novo. */
    expect(await turnoDe(ids.AI3, `${amanha}T19:30:00-03:00`)).toEqual({ dia: amanha, periodo: 'noturno' });
    /* A noturna de HOJE começa às 20:01 (horário de hoje) e acaba às 07:00 de
       amanhã (horário de amanhã): nenhum minuto sem turno, nenhum com dois. */
    expect(await janela(ids.AI3, hoje, 'noturno')).toEqual({ de: `${hoje} 20:01`, ate: `${amanha} 07:00` });
    expect(await janela(ids.AI3, amanha, 'diurno')).toEqual({ de: `${amanha} 07:00`, ate: `${amanha} 19:01` });
  });

  it('a outra casa não muda', async () => {
    expect(await turnoDe(ids.AI4, `${amanha}T07:30:00-03:00`)).toEqual({ dia: hoje, periodo: 'noturno' });
    const r = await request(http).get(`/api/v1/houses/${ids.AI4}/turnos`).set(auth(tokens.coord4));
    expect(r.body.amanha).toBeNull();
  });

  it('a segunda mudança do dia vale sobre a primeira — e as duas ficam no histórico', async () => {
    const r = await request(http).post(`/api/v1/houses/${ids.AI3}/turnos`).set(auth(tokens.tecnica))
      .send({ diurnoDe: '06:30', diurnoAte: '18:30' });
    expect(r.status).toBe(201);
    const g = await request(http).get(`/api/v1/houses/${ids.AI3}/turnos`).set(auth(tokens.coord));
    expect(g.body.amanha.diurno).toEqual({ de: '06:30', ate: '18:30' });
    expect(g.body.historico.length).toBeGreaterThanOrEqual(2);
    expect(g.body.historico[0].diurno).toEqual({ de: '06:30', ate: '18:30' });
    expect(g.body.historico[0].autor).toBeTruthy();
    expect(g.body.historico[1].motivo).toMatch(/Troca de equipe/);

    /* E cada mudança foi à auditoria DA CASA — a coordenação lê quem mudou. */
    const { rows: [{ n }] } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event WHERE action = 'house.shift_hours' AND house_id = $1`,
      [ids.AI3]);
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it('o plantão noturno aberto na madrugada é da noite de ontem pelo horário DA CASA', async () => {
    /* A data do plantão sai do banco com o horário da casa; aqui se confere a
       mesma conta que o serviço faz, nos dois lados da fronteira de amanhã. */
    const conta = async (instante: string) => (await admin.query(
      `SELECT (CASE WHEN ($2::timestamptz AT TIME ZONE app_fuso())::time
                          < app_inicio_do_diurno($1::uuid, ($2::timestamptz AT TIME ZONE app_fuso())::date)
                    THEN ($2::timestamptz AT TIME ZONE app_fuso())::date - 1
                    ELSE ($2::timestamptz AT TIME ZONE app_fuso())::date END)::text AS d`,
      [ids.AI3, instante])).rows[0].d;
    expect(await conta(`${amanha}T06:20:00-03:00`)).toBe(hoje);
    expect(await conta(`${amanha}T06:40:00-03:00`)).toBe(amanha);
  });
});
