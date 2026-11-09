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
import { DatabaseService } from '../src/kernel/database/database.service';
import * as cripto from '../src/kernel/common/crypto';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('Esqueci minha senha', () => {
  let app: INestApplication, http: any, admin: Client;
  const ids: Record<string, string> = {};
  const rodada = Date.now().toString(36);
  const email = `educador.esqueci.${rodada}@paodospobres.dev`;
  const SENHA = 'Senha-antiga-1';
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
      .send({ convite: token, novaSenha: 'Senha-nova-123' });
    expect(concluido.status).toBe(201);
    expect(concluido.body.token).toBeTruthy();

    expect((await entrar(SENHA)).status).toBe(401);
    expect((await entrar('Senha-nova-123')).status).toBe(201);
    expect((await request(http).get('/api/v1/users/me').set({ Authorization: `Bearer ${sessaoAntiga}` })).status).toBe(401);

    /* Gasto, não serve de novo. */
    const outraVez = await request(http).post('/api/v1/auth/convite/concluir')
      .send({ convite: token, novaSenha: 'Senha-outra-123' });
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

  it('convite inventado é recusado antes do scrypt, que pesa no servidor (revisão da 295)', async () => {
    const espia = jest.spyOn(cripto, 'hashPassword');
    try {
      const rs = [];
      for (let i = 0; i < 6; i++) {
        rs.push(await request(http).post('/api/v1/auth/convite/concluir')
          .send({ convite: `inventado-${rodada}-${i}-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`, novaSenha: 'Senha-nova-295!' }));
      }
      expect(rs.map((r) => r.status)).toEqual([410, 410, 410, 410, 410, 410]);
      expect(espia).not.toHaveBeenCalled();
    } finally {
      espia.mockRestore();
    }
  });

  /** O pedido como a rota faz, com o endereço que ela passaria. */
  const pedir = (e: string, ip: string | null) => admin.query(
    `SELECT * FROM auth_pedir_nova_senha($1, $2, 60, $3::inet)`, [e, `h-${rodada}-${Math.random()}`, ip]);
  const doBloco = async (ip: string) => (await admin.query(
    `SELECT count(*) FILTER (WHERE segurado IS NULL)::int AS livres,
            count(*) FILTER (WHERE segurado = 'endereco')::int AS marcas
       FROM reset_request WHERE bloco = app_bloco_do_endereco($1::inet)`, [ip])).rows[0];

  it('o mesmo endereço pede no máximo dez por hora, e o bloco /64 do IPv6 conta como um (fase 296)', async () => {
    for (let i = 0; i < 9; i++) await pedir(`inventado.${i}.${rodada}@paodospobres.dev`, '203.0.113.7');
    /* O IPv4 escrito como IPv6 é o mesmo endereço. */
    await pedir(`inventado.9.${rodada}@paodospobres.dev`, '::ffff:203.0.113.7');
    /* O décimo primeiro, com o e-mail de verdade: segurado pelo endereço, sem link. */
    expect((await pedir(email, '203.0.113.7')).rows).toEqual([]);
    /* E os seguintes não deixam linha nenhuma: uma marca por janela. */
    for (let i = 0; i < 5; i++) await pedir(`mais.${i}.${rodada}@paodospobres.dev`, '203.0.113.7');
    expect(await doBloco('203.0.113.7')).toEqual({ livres: 10, marcas: 1 });
    /* No IPv6, trocar o fim do endereço não abre outra conta. */
    for (let i = 0; i < 10; i++) await pedir(`v6.${i}.${rodada}@paodospobres.dev`, `2001:db8:296::${i + 1}`);
    await pedir(`v6.fim.${rodada}@paodospobres.dev`, '2001:db8:296::ffff');
    expect(await doBloco('2001:db8:296::1')).toEqual({ livres: 10, marcas: 1 });
    /* Outro endereço segue livre. */
    await pedir(`outro.${rodada}@paodospobres.dev`, '203.0.113.8');
    expect(await doBloco('203.0.113.8')).toEqual({ livres: 1, marcas: 0 });
    /* A tabela não guarda o que foi digitado. */
    const { rows: colunas } = await admin.query(
      `SELECT attname FROM pg_attribute WHERE attrelid = 'reset_request'::regclass AND attnum > 0 AND NOT attisdropped`);
    expect(colunas.map((c) => c.attname)).not.toContain('email');
  });

  it('quinze pedidos ao mesmo tempo do mesmo endereço passam só dez (fase 296)', async () => {
    const conexoes = await Promise.all(Array.from({ length: 15 }, async () => {
      const c = new Client({ connectionString: adminUrl }); await c.connect(); return c;
    }));
    try {
      await Promise.all(conexoes.map((c, i) => c.query(
        `SELECT * FROM auth_pedir_nova_senha($1, $2, 60, '203.0.113.20'::inet)`,
        [`rajada.${i}.${rodada}@paodospobres.dev`, `r-${rodada}-${i}`])));
    } finally {
      await Promise.all(conexoes.map((c) => c.end()));
    }
    expect(await doBloco('203.0.113.20')).toEqual({ livres: 10, marcas: 1 });
  });

  it('o teto da instituição segura só a repetição, e o primeiro e-mail de cada conta sai (fase 296)', async () => {
    const ids296 = (await admin.query(
      `SELECT id, email FROM app_user WHERE email IN ('educador2.ai3@paodospobres.dev', 'educador.ai4@paodospobres.dev')`)).rows;
    const repetida = ids296.find((u) => u.email.startsWith('educador2'))!.id;
    await admin.query(`INSERT INTO reset_request (bloco, enviado)
                       SELECT '198.51.100.9', true FROM generate_series(1, 60)`);
    await admin.query(`INSERT INTO reset_request (user_id, bloco, enviado) VALUES ($1, '198.51.100.9', true)`, [repetida]);
    try {
      /* Quem já recebeu um na hora: segurado pelo teto. */
      expect((await pedir('educador2.ai3@paodospobres.dev', '198.51.100.10')).rows).toEqual([]);
      const { rows: [seg] } = await admin.query(
        `SELECT segurado FROM reset_request WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [repetida]);
      expect(seg.segurado).toBe('teto');
      /* Quem não recebeu nenhum: sai, mesmo acima do teto. */
      expect((await pedir('educador.ai4@paodospobres.dev', '198.51.100.11')).rows).toHaveLength(1);
      /* A auditoria anota uma vez, sem autor: é da instituição, não da conta. */
      const { rows: a } = await admin.query(
        `SELECT actor_id FROM audit_event WHERE action = 'auth.reset_teto' AND at > now() - interval '1 hour'`);
      expect(a).toEqual([{ actor_id: null }]);
    } finally {
      await admin.query(`DELETE FROM reset_request WHERE bloco <<= '198.51.100.0/24'`);
    }
  });

  it('a rota manda o endereço como a entrada, e o papel da aplicação não lê os pedidos (fase 296)', async () => {
    /* Pela rota, da própria máquina: não conta por endereço e, sem e-mail, não deixa linha. */
    const antes = (await admin.query(`SELECT count(*)::int n FROM reset_request`)).rows[0].n;
    expect((await esqueci(`pela.rota.${rodada}@paodospobres.dev`)).status).toBe(201);
    expect((await admin.query(`SELECT count(*)::int n FROM reset_request`)).rows[0].n).toBe(antes);
    /* E-mail comprido demais é recusado antes do banco. */
    expect((await esqueci(`${'x'.repeat(260)}@paodospobres.dev`)).status).toBe(400);
    await expect(app.get(DatabaseService).query(`SELECT * FROM reset_request LIMIT 1`))
      .rejects.toThrow(/permission denied/);
  });
});
