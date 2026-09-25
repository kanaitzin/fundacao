/**
 * QUEM ADMINISTRA UMA CONTA É QUEM ALCANÇA A CASA DELA (fase 156).
 *
 * A sondagem de alcance de 25/09 chamou toda rota de escrita como a
 * coordenação da Casa 04, sobre registros REAIS da Casa 03, e cobrou recusa. O
 * que ela achou:
 *
 *  1. **A coordenação da Casa 04 redefinia a senha de um educador da Casa 03 —
 *     e recebia a senha nova na resposta.** Com ela, entra-se no sistema como
 *     aquele educador. O convite de primeiro acesso embaralhava a senha dele
 *     do mesmo jeito: tirava do sistema, no meio do plantão, quem não é da
 *     equipe de quem pediu. As duas funções conferiam o CARGO e esqueciam a
 *     CASA; as outras três da equipe conferiam as duas.
 *  2. **A conta de quem SAIU de uma casa era administrável por qualquer
 *     coordenação** — reativar, editar, redefinir a senha —, porque "sem
 *     vínculo atual" era tratado como cargo institucional. E aparecia na lista
 *     da equipe de todas as casas. Hoje ela responde pela ÚLTIMA casa.
 *  3. **O acompanhante da internação** era trocado por quem é de outra casa: a
 *     política conferia só o cargo.
 *  4. **O aviso marcado como ciente** sem existir respondia ok — e gravava a
 *     linha de auditoria de uma ciência que não houve.
 *  5. **O histórico do cofre** de uma criança de fora voltava vazio, que se lê
 *     "ninguém abriu o cofre", e não "não é seu".
 *
 * A ciência no episódio da ATA, o sexto achado, é cobrada na suíte dela
 * (`episodios-do-turno.e2e.spec.ts`), onde o episódio nasce.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Quem administra uma conta é quem alcança a casa dela', () => {
  let app: INestApplication, http: any, admin: Client;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const conta = { email: `conferencia.156.${Date.now()}@paodospobres.dev`, senha: '' };

  const login = async (email: string, senha = SENHA) =>
    request(http).post('/api/v1/auth/login').send({ email, password: senha });
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
      coord: 'coord.ai3@paodospobres.dev',
      deOutraCasa: 'coord.ai4@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) tokens[k] = (await login(email)).body.token;
    ({ rows: [{ id: ids.AI3 }] } = await admin.query(`SELECT id FROM house WHERE code='AI3'`));
    ({ rows: [{ id: ids.coord }] } = await admin.query(
      `SELECT id FROM app_user WHERE email='coord.ai3@paodospobres.dev'`));
    ({ rows: [{ person_id: ids.crianca }] } = await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND status='ativa'
        ORDER BY person_id LIMIT 1`, [ids.AI3]));

    /* Uma conta SÓ desta suíte: redefinir a senha do educador da semente
       derrubaria o login de todas as outras. */
    const r = await request(http).post('/api/v1/staff').set(auth(tokens.coord))
      .send({ nome: 'Educadora da Conferência 156 (fictícia)', email: conta.email,
              cargo: 'educador', casaId: ids.AI3 });
    expect(r.status).toBe(201);
    ids.conta = r.body.id;
    conta.senha = r.body.senhaInicial;
  });

  afterAll(async () => { await app.close(); await admin.end(); });

  // ============ 1. A senha e o convite de quem é de outra casa ============

  it('a coordenação de outra casa NÃO redefine a senha — e não recebe senha nenhuma', async () => {
    const r = await request(http).post(`/api/v1/staff/${ids.conta}/reset-password`)
      .set(auth(tokens.deOutraCasa)).send({});
    expect(r.status).toBe(403);
    expect(r.body.senhaInicial).toBeUndefined();
    /* E a senha da pessoa continua a dela. */
    expect((await login(conta.email, conta.senha)).status).toBe(201);
  });

  it('nem embaralha a senha pelo convite', async () => {
    const r = await request(http).post(`/api/v1/staff/${ids.conta}/convite`)
      .set(auth(tokens.deOutraCasa)).send({});
    expect(r.status).toBe(403);
    expect((await login(conta.email, conta.senha)).status).toBe(201);
  });

  it('nem edita, nem desativa', async () => {
    const e = await request(http).patch(`/api/v1/staff/${ids.conta}`)
      .set(auth(tokens.deOutraCasa)).send({ nome: 'Nome trocado de fora' });
    expect(e.status).toBe(403);
    const d = await request(http).post(`/api/v1/staff/${ids.conta}/deactivate`)
      .set(auth(tokens.deOutraCasa)).send({ motivo: 'Tentativa de fora da casa.' });
    expect(d.status).toBe(403);
  });

  it('a coordenação da própria casa redefine — e a linha de auditoria diz a casa', async () => {
    const r = await request(http).post(`/api/v1/staff/${ids.conta}/reset-password`)
      .set(auth(tokens.coord)).send({});
    expect(r.status).toBe(201);
    conta.senha = r.body.senhaInicial;
    const { rows: [linha] } = await admin.query(
      `SELECT house_id FROM audit_event WHERE action = 'staff.reset_password' AND entity_id = $1
        ORDER BY at DESC LIMIT 1`, [ids.conta]);
    /* Antes da 1570 ela nascia sem casa, e a coordenação não lia quem
       redefiniu a senha da equipe dela (fase 149). */
    expect(linha.house_id).toBe(ids.AI3);
  });

  // ============ 2. A conta de quem saiu da casa ============

  it('quem SAIU da Casa 03 continua sendo da Casa 03 para quem administra', async () => {
    /* O vínculo termina — como termina quando a pessoa deixa a casa. */
    await admin.query(
      `UPDATE user_house_assignment SET valid_to = now() WHERE user_id = $1 AND valid_to IS NULL`,
      [ids.conta]);

    const fora = await request(http).post(`/api/v1/staff/${ids.conta}/reset-password`)
      .set(auth(tokens.deOutraCasa)).send({});
    expect(fora.status).toBe(403);

    const lista4 = await request(http).get('/api/v1/staff').set(auth(tokens.deOutraCasa));
    expect(lista4.status).toBe(200);
    expect(lista4.body.map((p: any) => p.id)).not.toContain(ids.conta);

    const lista3 = await request(http).get('/api/v1/staff').set(auth(tokens.coord));
    expect(lista3.body.map((p: any) => p.id)).toContain(ids.conta);

    const dentro = await request(http).post(`/api/v1/staff/${ids.conta}/deactivate`)
      .set(auth(tokens.coord)).send({ motivo: 'Saiu da casa — conferência da fase 156.' });
    expect(dentro.status).toBe(201);
  });

  // ============ 3. O acompanhante da internação ============

  it('a coordenação de outra casa não troca quem acompanha a criança internada', async () => {
    /* Encerrada e no passado: aberta, ela tiraria a criança da chamada de hoje
       nas outras suítes (127). */
    const { rows: [h] } = await admin.query(
      `INSERT INTO hospitalization (person_id, house_id, hospital, reason, started_at,
                                    ended_at, outcome, status, opened_by)
       VALUES ($1, $2, 'Hospital Fictício da Conferência 156', 'Conferência de alcance.',
               now() - interval '500 days', now() - interval '498 days', 'alta',
               'encerrada', $3)
       RETURNING id`, [ids.crianca, ids.AI3, ids.coord]);
    ids.internacao = h.id;
    const { rows: [u4] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'coord.ai4@paodospobres.dev'`);

    const r = await request(http).post(`/api/v1/nursing/hospitalizations/${h.id}/companion`)
      .set(auth(tokens.deOutraCasa)).send({ userId: u4.id });
    expect(r.status).toBe(404);
    const { rows: [{ n }] } = await admin.query(
      `SELECT count(*)::int AS n FROM hospitalization_companion WHERE hospitalization_id = $1`,
      [h.id]);
    expect(n).toBe(0);
  });

  // ============ 4. O aviso e o cofre ============

  it('o aviso que não existe não fica "ciente" — nem deixa rastro de ciência', async () => {
    const id = randomUUID();
    const r = await request(http).post(`/api/v1/notifications/${id}/acknowledge`)
      .set(auth(tokens.coord)).send({});
    expect(r.status).toBe(404);
    const l = await request(http).post(`/api/v1/notifications/${id}/read`)
      .set(auth(tokens.coord)).send({});
    expect(l.status).toBe(404);
    const { rows: [{ n }] } = await admin.query(
      `SELECT count(*)::int AS n FROM audit_event WHERE action = 'notification.ack' AND entity_id = $1`,
      [id]);
    expect(n).toBe(0);
  });

  it('o histórico do cofre de uma criança de fora é recusado, e não vazio', async () => {
    const fora = await request(http).post(`/api/v1/people/${ids.crianca}/credentials/history`)
      .set(auth(tokens.deOutraCasa)).send({});
    expect(fora.status).toBe(404);
    const dentro = await request(http).post(`/api/v1/people/${ids.crianca}/credentials/history`)
      .set(auth(tokens.coord)).send({});
    expect(dentro.status).toBe(201);
    expect(Array.isArray(dentro.body)).toBe(true);
  });
});
