/**
 * A SENHA CONFERIDA DENTRO DO BANCO (fase 293; a última do A4 da análise geral de 08/11).
 *
 * Esta suíte cobra:
 *  1. o papel da aplicação não lê o hash da senha, não escreve na conta e não chama as funções
 *     de antes (a que devolvia o hash de qualquer e-mail e a que abria sessão para qualquer um);
 *  2. o sal de e-mail sem conta é fixo e tem os mesmos parâmetros do de uma conta: a resposta
 *     não conta quais e-mails existem;
 *  3. uma rajada de entradas erradas em paralelo não passa do limite da trava;
 *  4. a entrada, a troca da própria senha e a reautenticação continuam funcionando.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/kernel/database/database.service';
import { entrarPelaPrimeiraVez } from './setup/a-senha-dela';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('A senha conferida dentro do banco', () => {
  let app: INestApplication, http: any, admin: Client, db: DatabaseService;
  const rodada = Date.now().toString(36);
  let gestor = '';
  const criados: string[] = [];

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = app.getHttpServer();
    db = app.get(DatabaseService);
    gestor = (await request(http).post('/api/v1/auth/login')
      .send({ email: 'gestor@paodospobres.dev', password: SENHA })).body.token;
  });

  afterAll(async () => {
    for (const id of criados) {
      await request(http).post(`/api/v1/staff/${id}/deactivate`).set('Authorization', `Bearer ${gestor}`)
        .send({ motivo: 'Conta fictícia da suíte da fase 293.' });
    }
    await app.close(); await admin.end();
  });

  it('a aplicação não lê o hash, não escreve na conta e não chama as funções de antes', async () => {
    const { rows: [c] } = await admin.query(`
      SELECT has_column_privilege('rede_app', 'app_user', 'password_hash', 'SELECT') AS le_hash,
             has_table_privilege('rede_app', 'app_user', 'UPDATE') AS atualiza,
             has_function_privilege('rede_app', 'auth_find_user(text)', 'EXECUTE') AS acha,
             has_function_privilege('rede_app', 'auth_criar_sessao(uuid, text, integer, text, inet)', 'EXECUTE') AS sessao,
             has_function_privilege('rede_app', 'app_consume_invite(text, text, text)', 'EXECUTE') AS convite,
             has_function_privilege('rede_app', 'auth_registrar_tentativa(text, inet, boolean)', 'EXECUTE') AS anota,
             has_table_privilege('rede_app', 'auth_segredo', 'SELECT') AS segredo`);
    expect(c).toEqual({ le_hash: false, atualiza: false, acha: false, sessao: false,
                        convite: false, anota: false, segredo: false });
    /* E pela conexão da aplicação, de verdade. */
    await expect(db.query(`SELECT * FROM auth_find_user('gestor@paodospobres.dev')`))
      .rejects.toThrow(/permission denied/);
    /* Toda outra coluna da conta continua legível: coluna nova entra no GRANT da 1687. */
    const { rows: semLeitura } = await admin.query(`
      SELECT attname FROM pg_attribute
       WHERE attrelid = 'app_user'::regclass AND attnum > 0 AND NOT attisdropped
         AND attname <> 'password_hash'
         AND NOT has_column_privilege('rede_app', 'app_user', attname, 'SELECT')`);
    expect(semLeitura).toEqual([]);
  });

  it('o sal de e-mail sem conta é fixo e tem os parâmetros do de uma conta', async () => {
    const sal = async (email: string) => (await db.query(`SELECT * FROM auth_sal($1)`, [email])).rows[0];
    const ninguem = `ninguem.do.sal.${rodada}@paodospobres.dev`;
    const a = await sal(ninguem), b = await sal(ninguem), outro = await sal(`outro.${ninguem}`);
    const real = await sal('gestor@paodospobres.dev');
    expect(a).toEqual(b);
    expect(a.out_sal).not.toBe(outro.out_sal);
    expect([a.out_n, a.out_r, a.out_p, a.out_tamanho]).toEqual([real.out_n, real.out_r, real.out_p, real.out_tamanho]);
    expect(Buffer.from(a.out_sal, 'base64')).toHaveLength(Buffer.from(real.out_sal, 'base64').length);
  });

  it('uma rajada de entradas erradas em paralelo não passa do limite da trava', async () => {
    const email = `rajada.${rodada}@paodospobres.dev`;
    const respostas = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      request(http).post('/api/v1/auth/login').send({ email, password: `Errada-${i}!` })));
    const status = respostas.map((r) => r.status).sort();
    expect(status.filter((s) => s === 401)).toHaveLength(5);
    expect(status.filter((s) => s === 429)).toHaveLength(7);
    const { rows: [n] } = await admin.query(
      `SELECT count(*)::int n FROM login_attempt WHERE email = $1 AND NOT success`, [email]);
    expect(n.n).toBe(5);
  });

  it('a entrada, a troca da própria senha e a reautenticação continuam funcionando', async () => {
    const email = `entra.pelo.banco.${rodada}@paodospobres.dev`;
    const { rows: [{ id: ai3 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI3'`);
    const r = await request(http).post('/api/v1/staff').set('Authorization', `Bearer ${gestor}`)
      .send({ nome: 'Educadora da fase 293 (fictício)', email, cargo: 'educador', casaId: ai3,
              senhaInicial: 'Senha-inicial-293!' });
    expect(r.status).toBe(201);
    criados.push(r.body.id);
    /* O primeiro acesso troca a senha pela rota, que agora confere a atual no banco. */
    const tk = await entrarPelaPrimeiraVez(http, email, 'Senha-inicial-293!', 'Senha-dela-293!');
    expect((await request(http).post('/api/v1/auth/login').send({ email, password: 'Senha-inicial-293!' })).status).toBe(401);
    expect((await request(http).post('/api/v1/auth/login').send({ email, password: 'Senha-dela-293!' })).status).toBe(201);

    const reauth = (password: string) => request(http).post('/api/v1/auth/reauth')
      .set('Authorization', `Bearer ${tk}`).send({ password });
    expect((await reauth('Errada-293!')).status).toBe(401);
    expect((await reauth('Senha-dela-293!')).status).toBe(201);
    const { rows: [s] } = await admin.query(
      `SELECT count(*)::int n FROM user_session WHERE user_id = $1 AND last_reauth_at IS NOT NULL`, [r.body.id]);
    expect(s.n).toBe(1);
  });

  it('o e-mail com espaço ou em maiúsculas conta para a mesma trava (1688)', async () => {
    /* O caminho que as revisões provaram na 1687: com um espaço antes do e-mail, a contagem
       era zero e a senha podia ser tentada sem limite. */
    const email = `espaco.${rodada}@paodospobres.dev`;
    const formas = [` ${email}`, `${email} `, email.toUpperCase(), email];
    const status: number[] = [];
    for (let i = 0; i < 8; i++) {
      status.push((await request(http).post('/api/v1/auth/login')
        .send({ email: formas[i % formas.length], password: `Errada-${i}!` })).status);
    }
    expect(status.filter((s) => s === 401)).toHaveLength(5);
    expect(status.slice(5)).toEqual([429, 429, 429]);
  });

  it('o limite da trava não vem de quem chama: o banco segura num teto (1688)', async () => {
    const email = `teto.${rodada}@paodospobres.dev`;
    const tentar = async () => (await db.query(
      `SELECT out_status FROM auth_entrar($1, 'chave-errada', NULL, false, 1000000, 1000000, 1, 'h-${rodada}', 100000, NULL)`,
      [email])).rows[0].out_status;
    const vistos: string[] = [];
    for (let i = 0; i < 12; i++) vistos.push(await tentar());
    expect(vistos.filter((s) => s === 'falhou')).toHaveLength(10);
    expect(vistos.slice(10)).toEqual(['conta_travada', 'conta_travada']);
  });

  it('o hash guardado não vale como senha: o banco guarda o resumo da chave (1688)', async () => {
    const { rows } = await admin.query(
      `SELECT count(*) FILTER (WHERE password_hash LIKE 'scrypt$%')::int AS antigos,
              count(*) FILTER (WHERE password_hash LIKE 'scrypt2$%')::int AS novos
         FROM app_user`);
    expect(rows[0].antigos).toBe(0);
    expect(rows[0].novos).toBeGreaterThan(0);
    const { rows: [g] } = await admin.query(
      `SELECT split_part(password_hash, '$', 7) AS guardado FROM app_user WHERE email = 'gestor@paodospobres.dev'`);
    const { rows: [r] } = await db.query(
      `SELECT out_status FROM auth_entrar('gestor@paodospobres.dev', $1, NULL, false, 5, 20, 15, $2, 1, NULL)`,
      [g.guardado, `h2-${rodada}`]);
    expect(r.out_status).toBe('falhou');
    /* E hash fora do formato não é gravado na troca da própria senha. */
    await expect(db.query(
      `SELECT auth_trocar_minha_senha(gen_random_uuid(), 'x', 'scrypt$1$1$1$$', NULL, 5, 15)`))
      .rejects.toThrow(/hash_invalido/);
  });
});
