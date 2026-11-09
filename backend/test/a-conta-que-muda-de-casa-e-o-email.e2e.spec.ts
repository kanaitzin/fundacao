/**
 * A CONTA QUE MUDA DE CASA, E O E-MAIL DA PROMOÇÃO (fase 292; o resto do A4 da análise
 * geral de 08/11, a segunda parte decidida pelo dono do projeto em 09/11).
 *
 * Esta suíte cobra:
 *  1. a conta que muda de casa não leva a senha que a casa de antes sabia: a senha e as
 *     sessões de antes deixam de valer, e a senha nova vai só a quem fez a mudança;
 *  2. a edição que não muda a casa nem o cargo não mexe na senha;
 *  3. a conta promovida para todas as casas fica com o e-mail a confirmar: o esqueci
 *     minha senha não manda nada (com a mesma resposta) e o convite é recusado;
 *  4. só o Gestor Geral e a Coordenação Geral confirmam ou trocam, nunca o próprio, e
 *     depois o esqueci volta a mandar;
 *  5. a marca da Coordenação Geral também deixa o e-mail a confirmar.
 *
 * As contas desta suíte são fictícias e ficam desativadas no fim: nada se apaga.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { entrarPelaPrimeiraVez } from './setup/a-senha-dela';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A conta que muda de casa, e o e-mail da promoção', () => {
  let app: INestApplication, http: any, admin: Client;
  const t: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const criados: string[] = [];
  const rodada = Date.now().toString(36);

  const auth = (k: string) => ({ Authorization: `Bearer ${k}` });
  const post = (tk: string, url: string, body: any = {}) =>
    request(http).post(`/api/v1${url}`).set(auth(tk)).send(body);
  const patch = (tk: string, url: string, body: any = {}) =>
    request(http).patch(`/api/v1${url}`).set(auth(tk)).send(body);
  const entrar = (email: string, password: string) =>
    request(http).post('/api/v1/auth/login').send({ email, password });
  const pedidosDeSenha = async (id: string) => (await admin.query(
    `SELECT count(*)::int n FROM user_invite WHERE user_id = $1 AND motivo = 'esqueci'`, [id])).rows[0].n;
  const naLista = async (id: string) =>
    (await request(http).get('/api/v1/staff').set(auth(t.gestor))).body.find((p: any) => p.id === id);

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
      gestor: 'gestor@paodospobres.dev', coord: 'coord.ai3@paodospobres.dev',
    })) t[k] = (await entrar(email, SENHA)).body.token;
    for (const code of ['AI3', 'AI4']) {
      ({ rows: [{ id: ids[code] }] } = await admin.query(`SELECT id FROM house WHERE code = $1`, [code]));
    }
  });

  afterAll(async () => {
    for (const id of criados) {
      await post(t.gestor, `/staff/${id}/deactivate`, { motivo: 'Conta fictícia da suíte da fase 292.' });
    }
    await app.close(); await admin.end();
  });

  it('a conta que muda de casa não leva a senha que a casa de antes sabia', async () => {
    const email = `troca.de.casa.${rodada}@paodospobres.dev`;
    const r = await post(t.gestor, '/staff', { nome: 'Educadora que muda de casa (fictício)',
      email, cargo: 'educador', casaId: ids.AI3, senhaInicial: 'Senha-da-casa-3!' });
    expect(r.status).toBe(201);
    ids.troca = r.body.id;
    criados.push(ids.troca);
    const tk = await entrarPelaPrimeiraVez(http, email, 'Senha-da-casa-3!', 'Senha-que-a-casa-sabia-1!');

    const mudar = await patch(t.gestor, `/staff/${ids.troca}`, { casaId: ids.AI4 });
    expect(mudar.status).toBe(200);
    expect(mudar.body.senhaInicial).toBeTruthy();
    expect(mudar.body.aviso).toMatch(/deixou de valer/);

    /* A sessão aberta e a senha de antes não entram mais. */
    expect((await request(http).get('/api/v1/users/me').set(auth(tk))).status).toBe(401);
    expect((await entrar(email, 'Senha-que-a-casa-sabia-1!')).status).toBe(401);
    /* A senha nova, que só o gestor viu, entra, e pede a troca. */
    const nova = await entrar(email, mudar.body.senhaInicial);
    expect(nova.status).toBe(201);
    expect(nova.body.user.mustChangePassword).toBe(true);

    const { rows: [s] } = await admin.query(
      `SELECT count(*)::int n FROM user_session WHERE user_id = $1 AND revoked_reason = 'troca_de_casa'`, [ids.troca]);
    expect(s.n).toBeGreaterThan(0);
    const { rows: [a] } = await admin.query(
      `SELECT detail, house_id FROM audit_event WHERE action = 'staff.update' AND entity_id = $1
        ORDER BY at DESC LIMIT 1`, [ids.troca]);
    expect(a.detail.mudou_de_casa).toBe(true);
    expect(a.house_id).toBe(ids.AI4);
  });

  it('a edição que não muda a casa nem o cargo não mexe na senha', async () => {
    const email = `so.o.nome.${rodada}@paodospobres.dev`;
    const r = await post(t.coord, '/staff', { nome: 'Educadora que só corrige o nome (fictício)',
      email, cargo: 'educador', casaId: ids.AI3, senhaInicial: 'Senha-do-nome-1!' });
    expect(r.status).toBe(201);
    criados.push(r.body.id);
    await entrarPelaPrimeiraVez(http, email, 'Senha-do-nome-1!', 'Senha-dela-mesma-1!');
    const mudar = await patch(t.coord, `/staff/${r.body.id}`,
      { nome: 'Educadora que corrigiu o nome (fictício)', casaId: ids.AI3 });
    expect(mudar.status).toBe(200);
    expect(mudar.body.senhaInicial).toBeUndefined();
    expect((await entrar(email, 'Senha-dela-mesma-1!')).status).toBe(201);
  });

  it('a promoção para todas as casas deixa o e-mail a confirmar, e o esqueci e o convite esperam', async () => {
    const email = `promovida.${rodada}@paodospobres.dev`;
    const r = await post(t.coord, '/staff', { nome: 'Educadora promovida à Enfermagem (fictício)',
      email, cargo: 'educador', casaId: ids.AI3, senhaInicial: 'Senha-da-promovida-1!' });
    expect(r.status).toBe(201);
    ids.promovida = r.body.id;
    criados.push(ids.promovida);

    const promover = await patch(t.gestor, `/staff/${ids.promovida}`, { cargo: 'enfermagem' });
    expect(promover.status).toBe(200);
    expect(promover.body.emailAConfirmar).toBe(email);
    expect(promover.body.aviso).toMatch(/Confirmar o e-mail/);
    expect((await naLista(ids.promovida)).emailAConfirmar).toBe(true);

    /* O esqueci responde igual, e não manda nada. */
    const antes = await pedidosDeSenha(ids.promovida);
    const esqueci = await request(http).post('/api/v1/auth/esqueci-a-senha').send({ email });
    const inventado = await request(http).post('/api/v1/auth/esqueci-a-senha')
      .send({ email: `ninguem.${rodada}@paodospobres.dev` });
    expect(esqueci.status).toBe(inventado.status);
    expect(esqueci.body).toEqual(inventado.body);
    expect(await pedidosDeSenha(ids.promovida)).toBe(antes);
    const { rows: [aud] } = await admin.query(
      `SELECT count(*)::int n FROM audit_event WHERE action = 'auth.reset_email_a_confirmar' AND entity_id = $1`,
      [ids.promovida]);
    expect(aud.n).toBe(1);

    /* E o convite é recusado, em português. */
    const convite = await post(t.gestor, `/staff/${ids.promovida}/convite`);
    expect(convite.status).toBe(400);
    expect(convite.body.message).toMatch(/Confirme o e-mail/);
  });

  it('só o Gestor Geral e a Coordenação Geral confirmam, nunca o próprio, e o esqueci volta a mandar', async () => {
    /* A coordenação da casa de onde ela veio não confirma. */
    expect((await post(t.coord, `/staff/${ids.promovida}/confirm-email`,
      { email: `outro.${rodada}@paodospobres.dev` })).status).toBe(404);
    /* Ninguém confirma o próprio e-mail. */
    const { rows: [{ id: gestorId }] } = await admin.query(`SELECT id FROM app_user WHERE email = 'gestor@paodospobres.dev'`);
    expect((await post(t.gestor, `/staff/${gestorId}/confirm-email`,
      { email: 'gestor@paodospobres.dev' })).status).toBe(403);
    /* E-mail que não é e-mail, e e-mail de outra conta. */
    expect((await post(t.gestor, `/staff/${ids.promovida}/confirm-email`, { email: 'sem-arroba' })).status).toBe(400);
    expect((await post(t.gestor, `/staff/${ids.promovida}/confirm-email`,
      { email: 'coord.ai3@paodospobres.dev' })).status).toBe(409);

    const novo = `enfermagem.${rodada}@paodospobres.dev`;
    const ok = await post(t.gestor, `/staff/${ids.promovida}/confirm-email`, { email: novo });
    expect(ok.status).toBe(201);
    expect(ok.body.aviso).toMatch(/trocado e confirmado/);
    const linha = await naLista(ids.promovida);
    expect(linha.emailAConfirmar).toBe(false);
    expect(linha.email).toBe(novo);
    const { rows: [aud] } = await admin.query(
      `SELECT detail FROM audit_event WHERE action = 'staff.email_confirmado' AND entity_id = $1`, [ids.promovida]);
    expect(aud.detail).toEqual({ trocou: true });

    const antes = await pedidosDeSenha(ids.promovida);
    await request(http).post('/api/v1/auth/esqueci-a-senha').send({ email: novo });
    expect(await pedidosDeSenha(ids.promovida)).toBe(antes + 1);
  });

  it('a marca da Coordenação Geral também deixa o e-mail a confirmar', async () => {
    const email = `coord.promovida.${rodada}@paodospobres.dev`;
    const r = await post(t.gestor, '/staff', { nome: 'Coordenação promovida às oito (fictício)',
      email, cargo: 'coordenador', casaId: ids.AI4, senhaInicial: 'Senha-da-coord-4!' });
    expect(r.status).toBe(201);
    criados.push(r.body.id);
    const marcar = await post(t.gestor, `/staff/${r.body.id}/coordenacao-geral`, { todas: true });
    expect(marcar.status).toBe(201);
    expect(marcar.body.emailAConfirmar).toBe(email);
    expect((await naLista(r.body.id)).emailAConfirmar).toBe(true);
    /* Desmarcada, volta a ser de uma casa e não há o que confirmar. */
    const tirar = await post(t.gestor, `/staff/${r.body.id}/coordenacao-geral`, { todas: false });
    expect(tirar.status).toBe(201);
    expect((await naLista(r.body.id)).emailAConfirmar).toBe(false);
  });
});
