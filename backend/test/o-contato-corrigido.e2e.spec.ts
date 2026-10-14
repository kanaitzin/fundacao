/**
 * O CONTATO CORRIGIDO (fase 215, pedido de 14/10).
 *
 * "Tava tentando mexer nos familiares deles": acrescentar e encerrar existiam,
 * corrigir não. O que esta suíte cobra:
 *
 *  1. a coordenação corrige o telefone e o vínculo, e o antes fica guardado;
 *  2. a correção lida por outro cargo traz quem corrigiu e o motivo;
 *  3. sem motivo, ou sem mudar nada, não entra;
 *  4. o educador lê e não corrige; a outra casa não alcança;
 *  5. a auditoria tem a casa, e encerrar também deixa rastro.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('O contato corrigido', () => {
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
    ({ rows: [{ person_id: ids.crianca }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status = 'ativa' ORDER BY person_id LIMIT 1`, [ids.AI3]));
    const r = await request(http).post(`/api/v1/people/${ids.crianca}/contacts`).set(auth(tokens.coord))
      .send({ nome: 'Tia da conferência 215 (fictícia)', vinculo: 'tio', telefone: '(51) 90000-0001' }).expect(201);
    ids.contato = r.body.id;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  it('a coordenação corrige o telefone e o vínculo, e o antes fica guardado', async () => {
    const r = await request(http).post(`/api/v1/people/contacts/${ids.contato}/corrigir`).set(auth(tokens.coord))
      .send({ telefone: '(51) 90000-0002', vinculo: 'madrinha', motivo: 'A tia trocou de número e é madrinha.' })
      .expect(201);
    expect(r.body.aviso).toMatch(/histórico/);
    const { rows: [c] } = await admin.query(`SELECT phone, bond FROM person_contact WHERE id = $1`, [ids.contato]);
    expect(c).toEqual({ phone: '(51) 90000-0002', bond: 'madrinha' });
    const { rows: [h] } = await admin.query(
      `SELECT before, after, reason FROM person_contact_change WHERE contact_id = $1`, [ids.contato]);
    expect(h.before).toEqual({ phone: '(51) 90000-0001', bond: 'tio' });
    expect(h.after).toEqual({ phone: '(51) 90000-0002', bond: 'madrinha' });
    expect(h.reason).toMatch(/trocou de número/);
  });

  it('a correção lida pela técnica traz quem corrigiu e o motivo', async () => {
    const r = await request(http).get(`/api/v1/people/contacts/${ids.contato}/correcoes`).set(auth(tokens.tecnica)).expect(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].por).toBeTruthy();
    expect(r.body[0].motivo).toMatch(/madrinha/);
  });

  it('sem motivo, ou sem mudar nada, não entra', async () => {
    expect((await request(http).post(`/api/v1/people/contacts/${ids.contato}/corrigir`).set(auth(tokens.coord))
      .send({ telefone: '(51) 90000-0003' })).status).toBe(400);
    const nada = await request(http).post(`/api/v1/people/contacts/${ids.contato}/corrigir`).set(auth(tokens.coord))
      .send({ telefone: '(51) 90000-0002', motivo: 'Conferindo o telefone.' });
    expect(nada.status).toBe(400);
    expect(nada.body.message).toMatch(/Nada mudou/);
  });

  it('o educador não corrige, e a outra casa não alcança', async () => {
    expect((await request(http).post(`/api/v1/people/contacts/${ids.contato}/corrigir`).set(auth(tokens.educador))
      .send({ telefone: '(51) 90000-0004', motivo: 'Tentando corrigir.' })).status).toBe(403);
    expect([403, 404]).toContain((await request(http).post(`/api/v1/people/contacts/${ids.contato}/corrigir`)
      .set(auth(tokens.coord4)).send({ telefone: '(51) 90000-0005', motivo: 'De outra casa.' })).status);
    expect([403, 404]).toContain((await request(http).get(`/api/v1/people/contacts/${ids.contato}/correcoes`)
      .set(auth(tokens.coord4))).status);
    const { rows: [c] } = await admin.query(`SELECT phone FROM person_contact WHERE id = $1`, [ids.contato]);
    expect(c.phone).toBe('(51) 90000-0002');
  });

  it('a auditoria tem a casa, e encerrar também deixa rastro', async () => {
    await request(http).post(`/api/v1/people/contacts/${ids.contato}/end`).set(auth(tokens.coord))
      .send({ motivo: 'Fim da conferência 215.' }).expect(201);
    const { rows } = await admin.query(
      `SELECT action, house_id FROM audit_event WHERE entity_id = $1 AND action IN ('contato.corrigido','contato.encerrado')
        ORDER BY at`, [ids.contato]);
    expect(rows.map((r) => r.action)).toEqual(['contato.corrigido', 'contato.encerrado']);
    expect(rows.every((r) => r.house_id === ids.AI3)).toBe(true);
  });
});
