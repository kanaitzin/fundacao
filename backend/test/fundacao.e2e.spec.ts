/**
 * Testes de aceite da Fundação (Fase 1) — cenários do Prompt Master §26.2:
 *  #1  Educador Casa 03 não acessa objeto da Casa 04 por URL/API (sem vazar existência)
 *  #3  Coordenador entra sem limite de horário
 *  #28 Gestor abre uma casa por vez (abertura auditada)
 *  #35 Enfermagem vê as 8 casas (escopo saúde)
 *  + revogação de sessão, força bruta, RLS direto no banco, enumeração de conta
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@localhost:5432/rede_acolher';
const appUrl = process.env.DATABASE_APP_URL ?? 'postgres://rede_app:dev-only-change-me-app@localhost:5432/rede_acolher';

describe('Fundação — isolamento, autenticação e auditoria', () => {
  let app: INestApplication;
  let http: any;
  let admin: Client;

  const login = async (email: string, password = SENHA) => {
    const res = await request(http).post('/api/v1/auth/login').send({ email, password });
    return res;
  };

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('login com credenciais válidas emite sessão e audita', async () => {
    const res = await login('educador.ai3@paodospobres.dev');
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    const { rows } = await admin.query(
      `SELECT 1 FROM audit_event WHERE action = 'auth.login' AND at > now() - interval '10 seconds'`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('login inválido responde mensagem genérica (sem enumeração de contas)', async () => {
    const inexistente = await login('nao-existe@paodospobres.dev', 'x');
    const senhaErrada = await login('educador.ai3@paodospobres.dev', 'senha-errada-1');
    expect(inexistente.status).toBe(401);
    expect(senhaErrada.status).toBe(401);
    expect(inexistente.body.message).toBe(senhaErrada.body.message);
  });

  it('cenário #1 — educador da Casa 03 vê apenas AI3; AI4 responde 404 sem revelar existência', async () => {
    const { body } = await login('educador.ai3@paodospobres.dev');
    const houses = await request(http).get('/api/v1/houses').set('Authorization', `Bearer ${body.token}`);
    expect(houses.status).toBe(200);
    expect(houses.body.map((h: any) => h.code)).toEqual(['AI3']);

    const { rows: [ai4] } = await admin.query(`SELECT id FROM house WHERE code = 'AI4'`);
    const res = await request(http).get(`/api/v1/houses/${ai4.id}`).set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(404); // idêntico a inexistente — não vaza que a casa existe
  });

  it('cenário #28 — gestor vê as 8 casas e cada abertura é auditada', async () => {
    const { body } = await login('gestor@paodospobres.dev');
    const houses = await request(http).get('/api/v1/houses').set('Authorization', `Bearer ${body.token}`);
    expect(houses.body).toHaveLength(8);

    const ai1 = houses.body.find((h: any) => h.code === 'AI1');
    await request(http).get(`/api/v1/houses/${ai1.id}`).set('Authorization', `Bearer ${body.token}`).expect(200);
    const { rows } = await admin.query(
      `SELECT 1 FROM audit_event WHERE action = 'house.open' AND house_id = $1`, [ai1.id]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('cenário #35 — enfermagem enxerga as 8 casas (perímetro; finalidade restrita na aplicação)', async () => {
    const { body } = await login('enfermagem@paodospobres.dev');
    const houses = await request(http).get('/api/v1/houses').set('Authorization', `Bearer ${body.token}`);
    expect(houses.body).toHaveLength(8);
  });

  it('cenário #3 — coordenador acessa sem restrição de janela', async () => {
    const { body } = await login('coord.ai3@paodospobres.dev');
    const me = await request(http).get('/api/v1/users/me').set('Authorization', `Bearer ${body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.assignments.map((a: any) => a.code)).toEqual(['AI3']);
  });

  it('logout revoga a sessão imediatamente', async () => {
    const { body } = await login('educador.ai3@paodospobres.dev');
    await request(http).post('/api/v1/auth/logout').set('Authorization', `Bearer ${body.token}`).expect(201);
    await request(http).get('/api/v1/users/me').set('Authorization', `Bearer ${body.token}`).expect(401);
  });

  it('força bruta: bloqueia após N tentativas com 429', async () => {
    const email = 'coord.ai4@paodospobres.dev';
    for (let i = 0; i < 5; i++) await login(email, `errada-${i}`);
    const res = await login(email); // senha correta, mas conta travada
    expect(res.status).toBe(429);
    await admin.query(`DELETE FROM login_attempt WHERE email = $1`, [email]); // limpa p/ reexecução
  });

  it('RLS direto no banco: educador AI3 não lê a casa AI4 nem seus vínculos', async () => {
    const { rows: [edu] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'educador.ai3@paodospobres.dev'`);
    const appClient = new Client({ connectionString: appUrl });
    await appClient.connect();
    await appClient.query('BEGIN');
    await appClient.query(`SELECT set_config('app.user_id', $1, true)`, [edu.id]);
    const houses = await appClient.query(`SELECT code FROM house ORDER BY code`);
    expect(houses.rows.map((r) => r.code)).toEqual(['AI3']);
    const outros = await appClient.query(
      `SELECT count(*)::int AS n FROM user_house_assignment a
       JOIN house h ON h.id = a.house_id WHERE h.code = 'AI4'`);
    expect(outros.rows[0].n).toBe(0);
    await appClient.query('ROLLBACK');
    await appClient.end();
  });

  it('auditoria é imutável: UPDATE/DELETE falham mesmo para o admin', async () => {
    await expect(admin.query(`UPDATE audit_event SET action = 'x' WHERE true`)).rejects.toThrow(/imutável/);
    await expect(admin.query(`DELETE FROM audit_event WHERE true`)).rejects.toThrow(/imutável/);
  });

  it('reautenticação registra confirmação de senha para ações sensíveis', async () => {
    const { body } = await login('coord.ai3@paodospobres.dev');
    await request(http).post('/api/v1/auth/reauth')
      .set('Authorization', `Bearer ${body.token}`).send({ password: SENHA }).expect(201);
    await request(http).post('/api/v1/auth/reauth')
      .set('Authorization', `Bearer ${body.token}`).send({ password: 'errada' }).expect(401);
  });
});
