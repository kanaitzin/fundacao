/**
 * AS CHAMADAS DA CASA (fase 211, pedido de 12/10).
 *
 * O café, o almoço, a janta e a ceia definidos uma vez, com nome, horário,
 * quantas pessoas e uma cor. O que esta suíte cobra:
 *
 *  1. a coordenação, a técnica e o Líder Diurno criam; o educador lê e não cria;
 *  2. mudar encerra a de antes e abre outra, que aponta para ela;
 *  3. tirar da lista deixa a linha no banco, encerrada, com quem tirou;
 *  4. a outra casa não lê, não cria e não muda;
 *  5. o que vem errado volta em português, e a auditoria tem a casa.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('As chamadas da casa', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const login = async (email: string) =>
    (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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
      educador: 'educador.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
    })) tokens[k] = await login(email);
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.AI4 }] } = await admin.query(`SELECT id FROM house WHERE code='AI4'`));
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  const ceia = () => ({
    houseId: ids.AI3, tipo: 'alimentacao', titulo: 'Ceia da conferência 211', hora: '21:00', pessoas: 22, cor: 'ameixa',
  });

  it('a coordenação cria, e o educador lê sem poder criar', async () => {
    const r = await request(http).post('/api/v1/checks/models').set(auth(tokens.coord)).send(ceia()).expect(201);
    ids.ceia = r.body.id;
    const lido = await request(http).get(`/api/v1/checks/models?houseId=${ids.AI3}`).set(auth(tokens.educador)).expect(200);
    expect(lido.body.podeEditar).toBe(false);
    const m = lido.body.modelos.find((x: any) => x.id === ids.ceia);
    expect(m).toMatchObject({ tipo: 'alimentacao', titulo: 'Ceia da conferência 211', hora: '21:00', pessoas: 22, cor: 'ameixa' });
    expect(m.por).toBeTruthy();
    expect((await request(http).post('/api/v1/checks/models').set(auth(tokens.educador)).send(ceia())).status).toBe(403);
    const daCoord = await request(http).get(`/api/v1/checks/models?houseId=${ids.AI3}`).set(auth(tokens.coord)).expect(200);
    expect(daCoord.body.podeEditar).toBe(true);
    const { rows: [a] } = await admin.query(
      `SELECT house_id FROM audit_event WHERE action='check.model.create' AND entity_id=$1`, [ids.ceia]);
    expect(a.house_id).toBe(ids.AI3);
  });

  it('mudar encerra a de antes e abre outra, que aponta para ela', async () => {
    const r = await request(http).post('/api/v1/checks/models').set(auth(tokens.tecnica))
      .send({ ...ceia(), substitui: ids.ceia, hora: '21:30', cor: 'mar' }).expect(201);
    ids.ceiaNova = r.body.id;
    const { rows: [antes] } = await admin.query(`SELECT ended_at, ended_by FROM house_check_model WHERE id=$1`, [ids.ceia]);
    expect(antes.ended_at).not.toBeNull();
    const { rows: [nova] } = await admin.query(`SELECT replaces, at_time::text, color FROM house_check_model WHERE id=$1`, [ids.ceiaNova]);
    expect(nova).toMatchObject({ replaces: ids.ceia, at_time: '21:30:00', color: 'mar' });
    const lido = await request(http).get(`/api/v1/checks/models?houseId=${ids.AI3}`).set(auth(tokens.educador)).expect(200);
    expect(lido.body.modelos.map((x: any) => x.id)).not.toContain(ids.ceia);
    /* A que já saiu não se muda de novo. */
    expect((await request(http).post('/api/v1/checks/models').set(auth(tokens.coord))
      .send({ ...ceia(), substitui: ids.ceia })).status).toBe(409);
  });

  it('a outra casa não lê, não cria e não muda', async () => {
    expect((await request(http).get(`/api/v1/checks/models?houseId=${ids.AI3}`).set(auth(tokens.coord4))).status).toBe(404);
    const antes = (await admin.query(`SELECT count(*)::int n FROM house_check_model WHERE house_id=$1`, [ids.AI3])).rows[0].n;
    expect((await request(http).post('/api/v1/checks/models').set(auth(tokens.coord4)).send(ceia())).status).toBe(404);
    expect((await request(http).post('/api/v1/checks/models').set(auth(tokens.coord4))
      .send({ ...ceia(), houseId: ids.AI4, substitui: ids.ceiaNova })).status).toBe(404);
    expect((await request(http).post(`/api/v1/checks/models/${ids.ceiaNova}/encerrar`).set(auth(tokens.coord4))).status).toBe(404);
    const depois = (await admin.query(`SELECT count(*)::int n FROM house_check_model WHERE house_id=$1`, [ids.AI3])).rows[0].n;
    expect(depois).toBe(antes);
    const { rows: [m] } = await admin.query(`SELECT ended_at FROM house_check_model WHERE id=$1`, [ids.ceiaNova]);
    expect(m.ended_at).toBeNull();
  });

  it('o que vem errado volta em português', async () => {
    const tenta = (b: any) => request(http).post('/api/v1/checks/models').set(auth(tokens.coord)).send({ ...ceia(), ...b });
    expect((await tenta({ tipo: 'jantar' })).body.message).toMatch(/tipo da chamada/);
    expect((await tenta({ hora: '25:00' })).body.message).toMatch(/HH:MM/);
    expect((await tenta({ titulo: 'ok' })).body.message).toMatch(/nome/);
    expect((await tenta({ pessoas: 0 })).body.message).toMatch(/1 a 200/);
    expect((await tenta({ cor: 'Vermelho!' })).body.message).toMatch(/cor/);
    expect((await request(http).post('/api/v1/checks/models').set(auth(tokens.coord)).send({})).status).toBe(400);
  });

  it('tirar da lista deixa a linha no banco, com quem tirou', async () => {
    const r = await request(http).post('/api/v1/checks/models').set(auth(tokens.coord))
      .send({ ...ceia(), titulo: 'Lanche da conferência 211', hora: '15:30', pessoas: null, cor: 'laranja' }).expect(201);
    expect((await request(http).post(`/api/v1/checks/models/${r.body.id}/encerrar`).set(auth(tokens.educador))).status).toBe(403);
    await request(http).post(`/api/v1/checks/models/${r.body.id}/encerrar`).set(auth(tokens.coord)).expect(201);
    const { rows: [m] } = await admin.query(`SELECT ended_at, ended_by FROM house_check_model WHERE id=$1`, [r.body.id]);
    expect(m.ended_at).not.toBeNull();
    expect(m.ended_by).toBeTruthy();
    expect((await request(http).post(`/api/v1/checks/models/${r.body.id}/encerrar`).set(auth(tokens.coord))).status).toBe(409);
    const { rows: [a] } = await admin.query(
      `SELECT house_id FROM audit_event WHERE action='check.model.end' AND entity_id=$1`, [r.body.id]);
    expect(a.house_id).toBe(ids.AI3);
  });
});
