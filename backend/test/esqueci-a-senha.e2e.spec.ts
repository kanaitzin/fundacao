/**
 * ESQUECI MINHA SENHA (fase 188, decidido em 05/10: o link vai para o e-mail
 * cadastrado, vale uma hora e serve uma vez).
 *
 * O link é lido DO E-MAIL, na caixa local do servidor, e não do banco: é o que
 * a pessoa recebe. Na Casa 04, com conta criada e desativada pela suíte.
 *
 * Cobra-se: a mesma resposta para e-mail cadastrado e inventado; a senha
 * atual valendo até a nova ser criada; o segundo pedido em dois minutos que
 * não manda outro e-mail; o link que diz que é senha nova (e não primeiro
 * acesso); a senha nova que entra, a antiga que não entra mais e a sessão
 * antiga encerrada; o link gasto e o vencido recusados; e a auditoria.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AppModule } from '../src/app.module';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Esqueci minha senha', () => {
  let app: INestApplication, http: any, admin: Client;
  const ids: Record<string, string> = {};
  const rodada = Date.now().toString(36);
  const email = `educador.esqueci.${rodada}@paodospobres.dev`;
  const SENHA = 'senha-antiga-1';
  const caixa = mkdtempSync(join(tmpdir(), 'caixa-esqueci-'));
  const emailDirAntes = process.env.EMAIL_DIR;
  let coord4 = '';

  const esqueci = (e: string) => request(http).post('/api/v1/auth/esqueci-a-senha').send({ email: e });
  const entrar = (senha: string) => request(http).post('/api/v1/auth/login').send({ email, password: senha });
  /** Os links que chegaram para esta pessoa, na ordem. */
  const links = () => {
    const arq = join(caixa, 'caixa-de-saida.txt');
    if (!existsSync(arq)) return [] as string[];
    return readFileSync(arq, 'utf8').split('\n=== ').filter((m) => m.includes(`Para: ${email}`))
      .map((m) => /convite=([A-Za-z0-9_-]+)/.exec(m)?.[1] ?? '');
  };

  beforeAll(async () => {
    process.env.EMAIL_DIR = caixa;
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    ids.AI4 = (await admin.query(`SELECT id FROM house WHERE code = 'AI4'`)).rows[0].id;
    coord4 = (await request(http).post('/api/v1/auth/login')
      .send({ email: 'coord.ai4@paodospobres.dev', password: 'senha-dev-123' })).body.token;
    const r = await request(http).post('/api/v1/staff').set({ Authorization: `Bearer ${coord4}` })
      .send({ nome: 'Educador que Esqueceu a Senha (fictício)', email, cargo: 'educador', casaId: ids.AI4, senhaInicial: SENHA });
    expect(r.status).toBe(201);
    ids.educador = r.body.id;
  });

  afterAll(async () => {
    if (emailDirAntes === undefined) delete process.env.EMAIL_DIR; else process.env.EMAIL_DIR = emailDirAntes;
    if (ids.educador) {
      await request(http).post(`/api/v1/staff/${ids.educador}/deactivate`).set({ Authorization: `Bearer ${coord4}` })
        .send({ motivo: 'Conta fictícia da suíte do esqueci a senha.' });
    }
    await app.close(); await admin.end();
  });

  it('a resposta é a mesma para e-mail cadastrado e inventado', async () => {
    const inventado = await esqueci(`ninguem.${rodada}@paodospobres.dev`);
    const deVerdade = await esqueci(email);
    expect(inventado.status).toBe(201);
    expect(deVerdade.status).toBe(201);
    expect(inventado.body).toEqual(deVerdade.body);
    expect(deVerdade.body.aviso).toMatch(/vale uma hora e serve uma vez/);
    expect(links()).toHaveLength(1);
    /* O link não volta pela tela: só existe no e-mail. */
    expect(JSON.stringify(deVerdade.body)).not.toMatch(/convite=/);
  });

  it('pedir não troca a senha atual, e o segundo pedido em dois minutos não manda outro e-mail', async () => {
    expect((await entrar(SENHA)).status).toBe(201);
    await esqueci(email);
    expect(links()).toHaveLength(1);
  });

  it('o link diz que é senha nova, a senha nova entra, a antiga não, e a sessão antiga termina', async () => {
    const sessaoAntiga = (await entrar(SENHA)).body.token;
    const [token] = links();
    const conferido = await request(http).post('/api/v1/auth/convite/conferir').send({ convite: token });
    expect(conferido.body).toMatchObject({ valido: true, email, motivo: 'esqueci' });

    const concluido = await request(http).post('/api/v1/auth/convite/concluir')
      .send({ convite: token, novaSenha: 'senha-nova-123' });
    expect(concluido.status).toBe(201);
    expect(concluido.body.token).toBeTruthy();

    expect((await entrar(SENHA)).status).toBe(401);
    expect((await entrar('senha-nova-123')).status).toBe(201);
    expect((await request(http).get('/api/v1/users/me').set({ Authorization: `Bearer ${sessaoAntiga}` })).status).toBe(401);

    /* Gasto, não serve de novo. */
    const outraVez = await request(http).post('/api/v1/auth/convite/concluir')
      .send({ convite: token, novaSenha: 'senha-outra-123' });
    expect(outraVez.status).toBe(410);

    const { rows } = await admin.query(
      `SELECT action FROM audit_event WHERE entity_id = $1 AND action IN ('auth.reset_requested', 'auth.password_reset')
        ORDER BY at`, [ids.educador]);
    expect(rows.map((r) => r.action)).toEqual(['auth.reset_requested', 'auth.password_reset']);
  });

  it('o link vale uma hora: vencido, é recusado como inventado', async () => {
    await admin.query(`UPDATE user_invite SET created_at = created_at - interval '5 minutes'
                        WHERE user_id = $1 AND motivo = 'esqueci'`, [ids.educador]);
    await esqueci(email);
    const novo = links().at(-1)!;
    const { rows: [i] } = await admin.query(
      `SELECT expires_at - created_at AS prazo FROM user_invite
        WHERE user_id = $1 AND motivo = 'esqueci' AND used_at IS NULL AND revoked_at IS NULL`, [ids.educador]);
    expect(i.prazo.hours ?? 0).toBe(1);
    await admin.query(`UPDATE user_invite SET expires_at = now() - interval '1 minute'
                        WHERE user_id = $1 AND motivo = 'esqueci' AND used_at IS NULL`, [ids.educador]);
    expect((await request(http).post('/api/v1/auth/convite/conferir').send({ convite: novo })).status).toBe(410);
  });
});
