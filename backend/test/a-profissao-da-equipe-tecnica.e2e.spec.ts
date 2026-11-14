/**
 * A PROFISSÃO DE QUEM É DA EQUIPE TÉCNICA (fase 322, pedido de 14/11).
 *
 * A equipe técnica do Pão tem assistente social e psicóloga, e o sistema dizia *Equipe
 * técnica* para todas. A profissão é dita por quem administra a conta, aparece ao lado
 * do nome no lugar do cargo, e não muda o que a pessoa faz: o cargo continua decidindo.
 * O que estes testes protegem: a lista do banco é a da regra, quem não administra a
 * conta não a muda, e a profissão não sobra em quem deixou a equipe técnica.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PROFISSOES } from '../src/modules/identity/profissao.regra';
import { entrarPelaPrimeiraVez } from './setup/a-senha-dela';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A profissão de quem é da equipe técnica', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  let AI3 = '';
  let tecnica = '', emailDaTecnica = '', senhaDaTecnica = '';
  const auth = (k: string) => ({ Authorization: `Bearer ${t[k]}` });

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
      coord3: 'coord.ai3@paodospobres.dev', coord4: 'coord.ai4@paodospobres.dev',
      educador: 'educador.ai3@paodospobres.dev',
    })) t[k] = (await request(http).post('/api/v1/auth/login').send({ email, password: SENHA })).body.token;
    ({ rows: [{ id: AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));

    emailDaTecnica = `psicologa.${randomUUID().slice(0, 8)}@paodospobres.dev`;
    const r = await request(http).post('/api/v1/staff').set(auth('coord3')).send({
      nome: 'Beatriz Fagundes', email: emailDaTecnica, cargo: 'equipe_tecnica', casaId: AI3,
      profissao: 'psicologa',
    });
    expect(r.status).toBe(201);
    tecnica = r.body.id;
    senhaDaTecnica = r.body.senhaInicial;
  });

  afterAll(async () => {
    /* Desativar, e não apagar: a auditoria da conta continua. */
    if (tecnica) {
      await request(http).post(`/api/v1/staff/${tecnica}/deactivate`).set(auth('coord3'))
        .send({ motivo: 'Fim da suíte da profissão' });
    }
    await app.close(); await admin.end();
  });

  it('a lista do banco é a da regra', async () => {
    const { rows: [{ def }] } = await admin.query(`
      SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
       WHERE c.conrelid = 'app_user'::regclass AND pg_get_constraintdef(c.oid) LIKE '%profissao = ANY%'`);
    const doBanco = [...def.matchAll(/'(\w+)'::text/g)].map((m) => m[1]).sort();
    expect(doBanco).toEqual(PROFISSOES.map((p) => p.cod).sort());
  });

  it('a profissão nasce com o cadastro e aparece na lista da Equipe e na própria conta', async () => {
    const lista = await request(http).get('/api/v1/staff').set(auth('coord3'));
    expect(lista.body.find((m: any) => m.id === tecnica)?.profissao).toBe('psicologa');
    const token = await entrarPelaPrimeiraVez(http, emailDaTecnica, senhaDaTecnica);
    const eu = await request(http).get('/api/v1/users/me').set({ Authorization: `Bearer ${token}` });
    expect(eu.body.profissao).toBe('psicologa');
    const { rows: [a] } = await admin.query(
      `SELECT detail FROM audit_event WHERE action = 'staff.profissao' AND entity_id = $1 ORDER BY at DESC LIMIT 1`,
      [tecnica]);
    expect(a?.detail?.depois).toBe('psicologa');
  });

  it('a coordenação da casa troca a profissão, e outra casa não alcança a conta', async () => {
    const outra = await request(http).patch(`/api/v1/staff/${tecnica}`).set(auth('coord4'))
      .send({ profissao: 'assistente_social' });
    expect([403, 404]).toContain(outra.status);
    const r = await request(http).patch(`/api/v1/staff/${tecnica}`).set(auth('coord3'))
      .send({ profissao: 'assistente_social' });
    expect(r.status).toBe(200);
    const { rows: [u] } = await admin.query(`SELECT profissao FROM app_user WHERE id = $1`, [tecnica]);
    expect(u.profissao).toBe('assistente_social');
  });

  it('profissão fora da lista é recusada com a lista, e o educador não muda profissão de ninguém', async () => {
    const r = await request(http).patch(`/api/v1/staff/${tecnica}`).set(auth('coord3'))
      .send({ profissao: 'fisioterapeuta' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Assistente social/);
    const e = await request(http).patch(`/api/v1/staff/${tecnica}`).set(auth('educador'))
      .send({ profissao: 'psicologa' });
    expect(e.status).toBe(403);
    const { rows: [u] } = await admin.query(`SELECT profissao FROM app_user WHERE id = $1`, [tecnica]);
    expect(u.profissao).toBe('assistente_social');
  });

  it('quem deixa a equipe técnica deixa a profissão, e o banco não a aceita em outro cargo', async () => {
    const r = await request(http).patch(`/api/v1/staff/${tecnica}`).set(auth('coord3'))
      .send({ cargo: 'educador' });
    expect(r.status).toBe(200);
    const { rows: [u] } = await admin.query(`SELECT role::text, profissao FROM app_user WHERE id = $1`, [tecnica]);
    expect(u).toEqual({ role: 'educador', profissao: null });
    await expect(admin.query(`UPDATE app_user SET profissao = 'psicologa' WHERE id = $1`, [tecnica]))
      .resolves.toBeTruthy();
    const { rows: [d] } = await admin.query(`SELECT profissao FROM app_user WHERE id = $1`, [tecnica]);
    expect(d.profissao).toBeNull();
  });

  it('a aplicação lê a profissão e não a escreve direto', async () => {
    const { rows: [p] } = await admin.query(`
      SELECT has_column_privilege('rede_app', 'app_user', 'profissao', 'SELECT') AS le,
             has_column_privilege('rede_app', 'app_user', 'profissao', 'UPDATE') AS escreve`);
    expect(p).toEqual({ le: true, escreve: false });
  });
});
