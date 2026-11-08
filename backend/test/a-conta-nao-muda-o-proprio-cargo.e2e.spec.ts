/**
 * A CONTA NÃO MUDA O PRÓPRIO CARGO, NEM A CASA (fase 288; achado A2 da análise geral de
 * 08/11, e o que a revisão do banco achou ao lado dele).
 *
 * A política `user_update_self` deixa cada um escrever na própria linha de `app_user`,
 * e até a 1679 a aplicação tinha UPDATE em todas as colunas: uma sessão de educador
 * virava coordenação com as oito casas no alcance. E até a 1680 a coordenação inseria
 * em `user_house_assignment` o vínculo de qualquer conta com a casa dela: a educadora da
 * Casa 04 passava a alcançar as crianças da Casa 03, sem auditoria. Esta suíte prova as
 * duas recusas no banco, como o papel da aplicação, e nega por padrão: coluna de
 * `app_user` que a aplicação puder escrever reprova até alguém pôr o nome dela na lista
 * abaixo, com o motivo.
 *
 * E o caminho pelas funções da Equipe (1681): pela API, a técnica virava Enfermagem
 * pedindo a mudança na própria conta, e a coordenação de qualquer casa redefinia a senha
 * da Enfermagem, que não tem casa, e recebia a senha nova. As duas recusas são provadas
 * pela rota e conferidas no banco.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/kernel/database/database.service';

const SENHA = 'senha-dev-123';
const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** O que a aplicação pode escrever na própria conta: a troca da própria senha. */
const COLUNAS_QUE_A_APLICACAO_ESCREVE: Record<string, string> = {
  password_hash: 'a troca da própria senha (auth.service.ts)',
  must_change_password: 'a troca da própria senha apaga o pedido de trocar',
  updated_at: 'a troca da própria senha marca quando',
};

describe('A conta não muda o próprio cargo, nem a casa', () => {
  let app: INestApplication, admin: Client, db: DatabaseService, http: any;
  let educador = '', coordAi3 = '', educadorAi4 = '', casaAi3 = '';
  let tecnica = '', enfermagem = '', gestor = '', casaAi4 = '';
  const tokens: Record<string, string> = {};
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
    db = app.get(DatabaseService);
    const id = async (email: string): Promise<string> =>
      (await admin.query(`SELECT id FROM app_user WHERE email = $1`, [email])).rows[0].id;
    educador = await id('educador.ai3@paodospobres.dev');
    coordAi3 = await id('coord.ai3@paodospobres.dev');
    educadorAi4 = await id('educador.ai4@paodospobres.dev');
    tecnica = await id('tecnica.ai3@paodospobres.dev');
    enfermagem = await id('enfermagem@paodospobres.dev');
    gestor = await id('gestor@paodospobres.dev');
    ({ rows: [{ id: casaAi4 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI4'`));
    for (const [k, email] of Object.entries({
      tecnica: 'tecnica.ai3@paodospobres.dev',
      coord4: 'coord.ai4@paodospobres.dev',
      gestor: 'gestor@paodospobres.dev',
    })) {
      tokens[k] = (await request(http).post('/api/v1/auth/login')
        .send({ email, password: SENHA })).body.token;
    }
    ({ rows: [{ id: casaAi3 }] } = await admin.query(`SELECT id FROM house WHERE code = 'AI3'`));
  });

  afterAll(async () => {
    await app.close(); await admin.end();
  });

  it('a aplicação só escreve em app_user as colunas da troca de senha, e não cria conta', async () => {
    // `has_column_privilege` responde pelo que vale de fato, somando o que veio a PUBLIC.
    const { rows } = await admin.query(`
      SELECT a.attname AS coluna,
             has_column_privilege('rede_app', 'public.app_user', a.attname, 'UPDATE') AS atualiza,
             has_column_privilege('rede_app', 'public.app_user', a.attname, 'INSERT') AS insere
        FROM pg_attribute a
       WHERE a.attrelid = 'public.app_user'::regclass AND a.attnum > 0 AND NOT a.attisdropped`);
    expect(rows.filter((r) => r.insere).map((r) => r.coluna)).toEqual([]);
    const escreve = rows.filter((r) => r.atualiza).map((r) => r.coluna).sort();
    expect(escreve).toEqual(Object.keys(COLUNAS_QUE_A_APLICACAO_ESCREVE).sort());
    // E nenhum outro papel além do dono e da aplicação escreve na tabela.
    const { rows: outros } = await admin.query(`
      SELECT DISTINCT grantee FROM information_schema.column_privileges
       WHERE table_schema = 'public' AND table_name = 'app_user'
         AND privilege_type IN ('INSERT', 'UPDATE')
         AND grantee NOT IN ('rede_app', (SELECT tableowner FROM pg_tables
                                           WHERE schemaname = 'public' AND tablename = 'app_user'))`);
    expect(outros).toEqual([]);
  });

  /** Um `it(` por coluna, e não `it.each`: o `numeros-da-documentacao` conta linha que abre `it(`. */
  async function recusa(conjunto: string): Promise<void> {
    await expect(db.asUser(educador, (c) => c.query(
      `UPDATE app_user SET ${conjunto} WHERE id = $1`, [educador])))
      .rejects.toThrow(/permission denied/);
    const { rows: [u] } = await admin.query(
      `SELECT role, todas_as_casas, active, email FROM app_user WHERE id = $1`, [educador]);
    expect(u).toEqual({ role: 'educador', todas_as_casas: false, active: true,
      email: 'educador.ai3@paodospobres.dev' });
  }

  it('a educadora não muda o cargo da própria conta', () => recusa(`role = 'coordenador'`));
  it('a educadora não se marca com todas as casas', () => recusa(`todas_as_casas = true`));
  it('a educadora não desativa a própria conta', () => recusa(`active = false`));
  it('a educadora não troca o próprio e-mail', () => recusa(`email = 'outro@paodospobres.dev'`));

  it('a troca da própria senha continua passando pelo papel da aplicação', async () => {
    const r = await db.asUser(educador, (c) => c.query(
      `UPDATE app_user SET updated_at = now() WHERE id = $1`, [educador]));
    expect(r.rowCount).toBe(1);
  });

  it('a aplicação não escreve vínculo de casa nem casa', async () => {
    const { rows } = await admin.query(`
      SELECT t.nome, p.priv FROM unnest(ARRAY['user_house_assignment', 'house']) AS t(nome)
       CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS p(priv)
       WHERE has_table_privilege('rede_app', 'public.' || t.nome, p.priv)
          OR EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = ('public.' || t.nome)::regclass AND a.attnum > 0
                        AND NOT a.attisdropped AND p.priv <> 'DELETE'
                        AND has_column_privilege('rede_app', 'public.' || t.nome, a.attname, p.priv))`);
    expect(rows).toEqual([]);
  });

  it('a coordenação da Casa 03 não vincula a educadora da Casa 04 à casa dela', async () => {
    await expect(db.asUser(coordAi3, (c) => c.query(
      `INSERT INTO user_house_assignment (user_id, house_id, role, created_by)
       VALUES ($1, $2, 'educador', $3)`, [educadorAi4, casaAi3, coordAi3])))
      .rejects.toThrow(/permission denied/);
    // E a educadora da Casa 04 continua alcançando só a casa dela.
    const casas = await db.asUser(educadorAi4, (c) => c.query(
      `SELECT h.code FROM house h WHERE h.id = ANY (ARRAY(SELECT app_casas_no_alcance()))
        ORDER BY h.code`));
    expect(casas.rows.map((r) => r.code)).toEqual(['AI4']);
  });

  it('a técnica não troca o próprio cargo pela Equipe', async () => {
    const res = await request(http).patch(`/api/v1/staff/${tecnica}`)
      .set(auth(tokens.tecnica)).send({ cargo: 'enfermagem' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/própria conta/);
    const { rows: [u] } = await admin.query(`SELECT role FROM app_user WHERE id = $1`, [tecnica]);
    expect(u.role).toBe('equipe_tecnica');
    const casas = await db.asUser(tecnica, (c) => c.query(
      `SELECT count(*)::int AS n FROM app_casas_no_alcance()`));
    expect(casas.rows[0].n).toBe(1);
  });

  it('a coordenação de uma casa não redefine a senha nem desativa a Enfermagem', async () => {
    const { rows: [antes] } = await admin.query(
      `SELECT password_hash, active FROM app_user WHERE id = $1`, [enfermagem]);
    const senha = await request(http).post(`/api/v1/staff/${enfermagem}/reset-password`)
      .set(auth(tokens.coord4)).send({});
    expect(senha.status).toBe(403);
    expect(senha.body.message).toMatch(/todas as casas/);
    expect(senha.body.senhaInicial).toBeUndefined();
    const desativa = await request(http).post(`/api/v1/staff/${enfermagem}/deactivate`)
      .set(auth(tokens.coord4)).send({ motivo: 'tentativa de teste da suíte' });
    expect(desativa.status).toBe(403);
    const { rows: [depois] } = await admin.query(
      `SELECT password_hash, active FROM app_user WHERE id = $1`, [enfermagem]);
    expect(depois).toEqual(antes);
  });

  it('quem alcança todas as casas continua administrando a conta da Enfermagem', async () => {
    // Dentro de uma transação desfeita: a senha da Enfermagem é usada por outras suítes.
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [gestor]);
      const { rows: [r] } = await admin.query(
        `SELECT * FROM app_reset_staff_password($1, 'hash-da-suite')`, [enfermagem]);
      expect(r.out_ok).toBe(true);
    } finally {
      await admin.query('ROLLBACK');
    }
  });

  it('a coordenação de uma casa não vincula a Enfermagem à casa dela nem troca o nome dela', async () => {
    const { rows: [antes] } = await admin.query(
      `SELECT full_name FROM app_user WHERE id = $1`, [enfermagem]);
    const res = await request(http).patch(`/api/v1/staff/${enfermagem}`)
      .set(auth(tokens.coord4)).send({ nome: 'Nome Trocado Pela Casa 04', casaId: casaAi4 });
    expect(res.status).toBe(403);
    const { rows: [depois] } = await admin.query(
      `SELECT full_name, (SELECT count(*)::int FROM user_house_assignment
                           WHERE user_id = $1 AND valid_to IS NULL) AS vinculos
         FROM app_user WHERE id = $1`, [enfermagem]);
    expect(depois).toEqual({ full_name: antes.full_name, vinculos: 0 });
  });

  it('a lista da Equipe só oferece a conta da Enfermagem a quem alcança todas as casas', async () => {
    const daCoordenacao = await request(http).get('/api/v1/staff').set(auth(tokens.coord4));
    const vistaPelaCasa = daCoordenacao.body.find((u: any) => u.id === enfermagem);
    expect(vistaPelaCasa?.editavel ?? false).toBe(false);
    const doGestor = await request(http).get('/api/v1/staff').set(auth(tokens.gestor));
    expect(doGestor.body.find((u: any) => u.id === enfermagem)?.editavel).toBe(true);
  });

  it('a Coordenação Geral também administra a conta da Enfermagem', async () => {
    // Dentro de uma transação desfeita: a coordenação da Casa 03 vira Coordenação Geral só aqui.
    await admin.query('BEGIN');
    try {
      await admin.query(`UPDATE app_user SET todas_as_casas = true WHERE id = $1`, [coordAi3]);
      await admin.query('SET LOCAL ROLE rede_app');
      await admin.query(`SELECT set_config('app.user_id', $1, true)`, [coordAi3]);
      const { rows: [r] } = await admin.query(
        `SELECT * FROM app_reset_staff_password($1, 'hash-da-suite')`, [enfermagem]);
      expect(r.out_ok).toBe(true);
    } finally {
      await admin.query('ROLLBACK');
    }
  });
});
