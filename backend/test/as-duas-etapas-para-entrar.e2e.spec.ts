/**
 * AS DUAS ETAPAS PARA ENTRAR (fase 187, ideia 8 de 30/09; decidido em 05/10:
 * ninguém é obrigado, qualquer pessoa liga para si; quem perde o celular entra
 * com um código de reserva, e sem eles quem administra a conta desliga com
 * motivo).
 *
 * Na Casa 04, com uma conta de educador criada pela suíte e desativada no fim:
 * a equipe da Casa 03 é contada por outras suítes.
 *
 * Cobra-se o percurso de quem usa, pela rota: ligar (com a senha), o primeiro
 * código, os oito códigos de reserva entregues uma vez; a entrada que passa a
 * pedir o código; o mesmo código que não entra duas vezes; o código do
 * intervalo seguinte que entra (o relógio do celular erra); a reserva que
 * entra uma vez só; o desafio que morre em cinco tentativas; e quem administra
 * desligando, com as duas perguntas de sempre: cargo e casa.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/kernel/database/database.service';
import { base32, codigoDoPasso, conferirCodigo, passoDe } from '../src/kernel/common/totp';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('As duas etapas para entrar', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const rodada = Date.now().toString(36);
  const email = `educador.duas.${rodada}@paodospobres.dev`;
  const SENHA = 'senha-duas-1';
  let segredo = '';
  let reservas: string[] = [];

  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` });
  const entrar = (senha = SENHA) => request(http).post('/api/v1/auth/login').send({ email, password: senha });
  const segunda = (desafio: string, codigo: string) =>
    request(http).post('/api/v1/auth/login/segunda-etapa').send({ desafio, codigo });
  const loginSimples = async (e: string, s = 'senha-dev-123') =>
    (await request(http).post('/api/v1/auth/login').send({ email: e, password: s })).body.token as string;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    const { rows } = await admin.query(`SELECT code, id FROM house`);
    for (const r of rows) ids[r.code] = r.id;
    t.coord4 = await loginSimples('coord.ai4@paodospobres.dev');
    t.coord3 = await loginSimples('coord.ai3@paodospobres.dev');
    const r = await request(http).post('/api/v1/staff').set(auth(t.coord4))
      .send({ nome: 'Educador das Duas Etapas (fictício)', email, cargo: 'educador', casaId: ids.AI4, senhaInicial: SENHA });
    expect(r.status).toBe(201);
    ids.educador = r.body.id;
  });

  afterAll(async () => {
    if (ids.educador) {
      await request(http).post(`/api/v1/staff/${ids.educador}/deactivate`).set(auth(t.coord4))
        .send({ motivo: 'Conta fictícia da suíte das duas etapas.' });
    }
    await app.close(); await admin.end();
  });

  it('o código é o da RFC 6238 (os vetores oficiais, em seis dígitos)', () => {
    const s = base32(Buffer.from('12345678901234567890'));
    expect(codigoDoPasso(s, Math.floor(59 / 30))).toBe('287082');
    expect(codigoDoPasso(s, Math.floor(1111111109 / 30))).toBe('081804');
    expect(codigoDoPasso(s, Math.floor(1234567890 / 30))).toBe('005924');
    expect(codigoDoPasso(s, Math.floor(2000000000 / 30))).toBe('279037');
    /* Um intervalo antes e um depois entram; dois, não. */
    const agora = 1234567890_000;
    expect(conferirCodigo(s, codigoDoPasso(s, passoDe(agora) + 1), agora)).toBe(passoDe(agora) + 1);
    expect(conferirCodigo(s, codigoDoPasso(s, passoDe(agora) + 2), agora)).toBeNull();
    expect(conferirCodigo(s, '12345', agora)).toBeNull();
  });

  it('sem as duas etapas, a senha basta; ligar pede a senha de novo', async () => {
    const r = await entrar();
    expect(r.status).toBe(201);
    expect(r.body.token).toBeTruthy();
    t.educador = r.body.token;
    expect((await request(http).get('/api/v1/auth/segunda-etapa').set(auth(t.educador))).body.ligada).toBe(false);

    const errada = await request(http).post('/api/v1/auth/segunda-etapa/iniciar').set(auth(t.educador)).send({ senha: 'outra' });
    expect(errada.status).toBe(401);
    const ini = await request(http).post('/api/v1/auth/segunda-etapa/iniciar').set(auth(t.educador)).send({ senha: SENHA });
    expect(ini.status).toBe(201);
    segredo = ini.body.segredo.replace(/\s/g, '');
    expect(ini.body.endereco).toMatch(/^otpauth:\/\/totp\/.+secret=[A-Z2-7]+&issuer=Rede%20Acolher/);
    /* O segredo vai cifrado para o banco. */
    const { rows: [f] } = await admin.query(
      `SELECT secret_enc FROM user_second_factor WHERE user_id = $1 AND turned_off_at IS NULL`, [ids.educador]);
    expect(f.secret_enc).toMatch(/^v1\./);
    expect(f.secret_enc).not.toContain(segredo);
  });

  it('o primeiro código errado não liga; o certo liga e entrega oito códigos de reserva', async () => {
    const errado = await request(http).post('/api/v1/auth/segunda-etapa/confirmar').set(auth(t.educador)).send({ codigo: '000000' });
    expect(errado.status).toBe(400);
    const ok = await request(http).post('/api/v1/auth/segunda-etapa/confirmar').set(auth(t.educador))
      .send({ codigo: codigoDoPasso(segredo, passoDe(Date.now())) });
    expect(ok.status).toBe(201);
    reservas = ok.body.reservas;
    expect(new Set(reservas).size).toBe(8);
    const estado = (await request(http).get('/api/v1/auth/segunda-etapa').set(auth(t.educador))).body;
    expect(estado).toMatchObject({ ligada: true, reservasRestantes: 8 });
    /* Só o hash dos códigos fica no banco. */
    const { rows } = await admin.query(
      `SELECT code_hash FROM user_recovery_code r JOIN user_second_factor f ON f.id = r.factor_id WHERE f.user_id = $1`,
      [ids.educador]);
    expect(rows).toHaveLength(8);
    for (const r of rows) for (const c of reservas) expect(r.code_hash).not.toContain(c.replace('-', ''));
  });

  it('a senha certa já não abre a sessão: devolve o desafio, e o código abre', async () => {
    const r = await entrar();
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ segundaEtapa: true, desafio: expect.any(String) });
    expect(r.body.token).toBeUndefined();

    /* O código que ligou já foi usado: o mesmo intervalo não entra de novo. O
       passo vem do banco, e não do relógio: a virada dos 30 segundos não muda o teste. */
    const { rows: [f] } = await admin.query(
      `SELECT last_step FROM user_second_factor WHERE user_id = $1 AND turned_off_at IS NULL`, [ids.educador]);
    const repetido = await segunda(r.body.desafio, codigoDoPasso(segredo, Number(f.last_step)));
    expect(repetido.status).toBe(401);
    /* O do intervalo seguinte entra (o relógio do celular adiantado). */
    const ok = await segunda(r.body.desafio, codigoDoPasso(segredo, passoDe(Date.now()) + 1));
    expect(ok.status).toBe(201);
    expect(ok.body.token).toBeTruthy();
    /* E o desafio gasto não abre outra sessão. */
    expect((await segunda(r.body.desafio, reservas[0])).status).toBe(401);
  });

  it('o código de reserva entra uma vez, escrito de qualquer jeito', async () => {
    const d1 = (await entrar()).body.desafio;
    const ok = await segunda(d1, ` ${reservas[0].toUpperCase().replace('-', ' ')} `);
    expect(ok.status).toBe(201);
    const d2 = (await entrar()).body.desafio;
    expect((await segunda(d2, reservas[0])).status).toBe(401);
    const estado = (await request(http).get('/api/v1/auth/segunda-etapa').set(auth(ok.body.token))).body;
    expect(estado.reservasRestantes).toBe(7);
    const { rows } = await admin.query(
      `SELECT action FROM audit_event WHERE actor_id = $1 AND action = 'auth.codigo_reserva_usado'`, [ids.educador]);
    expect(rows).toHaveLength(1);
  });

  it('cinco tentativas erradas matam o desafio, e a sexta não entra nem com a reserva certa', async () => {
    const d = (await entrar()).body.desafio;
    for (let i = 0; i < 5; i++) expect((await segunda(d, '111111')).status).toBe(401);
    const sexta = await segunda(d, reservas[1]);
    expect(sexta.status).toBe(401);
    expect(sexta.body.message).toMatch(/Entre de novo com a senha/);
    /* E os códigos errados contam na trava da senha: a conta para de aceitar entrada. */
    expect((await entrar()).status).toBe(429);
    /* A suíte segue: as tentativas desta rodada saem da janela de 15 minutos. */
    await admin.query(`UPDATE login_attempt SET at = at - interval '1 hour' WHERE email = $1`, [email]);
  });

  it('quem administra vê que está ligada e desliga com motivo; a coordenação de outra casa, não', async () => {
    const lista = (await request(http).get('/api/v1/staff').set(auth(t.coord4))).body as any[];
    expect(lista.find((p) => p.id === ids.educador)?.segundaEtapa).toBe(true);
    const deFora = (await request(http).get('/api/v1/staff').set(auth(t.coord3))).body as any[];
    expect(deFora.find((p) => p.id === ids.educador)?.segundaEtapa ?? false).toBe(false);

    const outraCasa = await request(http).post(`/api/v1/staff/${ids.educador}/segunda-etapa/desligar`)
      .set(auth(t.coord3)).send({ motivo: 'Tentativa de outra casa, que não pode.' });
    expect([403, 404]).toContain(outraCasa.status);
    const curto = await request(http).post(`/api/v1/staff/${ids.educador}/segunda-etapa/desligar`)
      .set(auth(t.coord4)).send({ motivo: 'perdeu' });
    expect(curto.status).toBe(400);
    const ok = await request(http).post(`/api/v1/staff/${ids.educador}/segunda-etapa/desligar`)
      .set(auth(t.coord4)).send({ motivo: 'Perdeu o celular e os códigos de reserva (fictício).' });
    expect(ok.status).toBe(201);
    expect(ok.body.desligada).toBe(true);
    const { rows: [a] } = await admin.query(
      `SELECT house_id FROM audit_event WHERE action = 'staff.segunda_etapa_desligada' AND entity_id = $1`, [ids.educador]);
    expect(a.house_id).toBe(ids.AI4);

    const r = await entrar();
    expect(r.body.token).toBeTruthy();
    t.educador = r.body.token;
  });

  it('a própria pessoa liga de novo e desliga com a senha', async () => {
    const ini = await request(http).post('/api/v1/auth/segunda-etapa/iniciar').set(auth(t.educador)).send({ senha: SENHA });
    const s = ini.body.segredo.replace(/\s/g, '');
    await request(http).post('/api/v1/auth/segunda-etapa/confirmar').set(auth(t.educador))
      .send({ codigo: codigoDoPasso(s, passoDe(Date.now())) });
    expect((await entrar()).body.segundaEtapa).toBe(true);
    const sem = await request(http).post('/api/v1/auth/segunda-etapa/desligar').set(auth(t.educador)).send({ senha: 'outra' });
    expect(sem.status).toBe(401);
    const ok = await request(http).post('/api/v1/auth/segunda-etapa/desligar').set(auth(t.educador)).send({ senha: SENHA });
    expect(ok.body.desligada).toBe(true);
    expect((await entrar()).body.token).toBeTruthy();
    /* Nada se apaga: as duas ligações continuam no banco, desligadas, com quem e por quê. */
    const { rows } = await admin.query(
      `SELECT turned_off_reason FROM user_second_factor WHERE user_id = $1 ORDER BY created_at`, [ids.educador]);
    expect(rows.map((r) => r.turned_off_reason)).toEqual([
      'Perdeu o celular e os códigos de reserva (fictício).', 'desligada pela própria pessoa']);
  });

  it('a aplicação não lê nem escreve as três tabelas direto', async () => {
    const db = app.get(DatabaseService);
    for (const tabela of ['user_second_factor', 'user_recovery_code', 'login_challenge']) {
      await expect(db.query(`SELECT * FROM ${tabela}`)).rejects.toThrow(/permission denied/);
    }
  });
});
