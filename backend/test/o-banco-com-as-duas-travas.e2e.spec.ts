/**
 * O BANCO COM AS DUAS TRAVAS (fase 219, pedido de 14/10: "deixar nossos bancos
 * de dados mais robustos e fortes").
 *
 * Cada cobrança aqui nega por padrão: tabela, política, permissão ou chave nova
 * que não cumpra a regra reprova até alguém escrever, na lista, por que ela é a
 * exceção.
 *
 *  1. toda tabela tem chave primária e RLS ligado;
 *  2. nenhuma política de INSERT ou UPDATE confere só a linha de antes;
 *  3. a aplicação não tem permissão de UPDATE onde nenhuma política deixa
 *     linha passar;
 *  4. toda chave estrangeira que se usa para filtrar tem índice;
 *  5. a conexão da aplicação tem limite de tempo, e a linha travada por outra
 *     transação vira recusa em vez de espera sem fim;
 *  6. a segunda trava funciona onde a leitura não protegia: a autoria da
 *     operação feita sem sinal não passa para um colega;
 *  7. a migração já aplicada cujo arquivo mudou faz a migração parar.
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/kernel/database/database.service';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/** As exceções, cada uma com o motivo. */
const SEM_RLS: Record<string, string> = {
  schema_migration: 'é do dono do banco; a aplicação só lê, e não guarda dado de ninguém',
};
const CHECK_ABERTO: Record<string, string> = {
  'audit_event.audit_insert':
    'a auditoria é escrita também sem identidade (entrada, recusa de senha), e a linha nunca se altera (audit_no_update)',
  'notification.notif_insert':
    'o aviso é escrito PARA outra pessoa; quem o lê é conferido na leitura (notif_select)',
};
const FK_SEM_INDICE_PERMITIDA = new Set(['app_user', 'institution', 'witness_option']);

describe('O banco com as duas travas', () => {
  let app: INestApplication, admin: Client, db: DatabaseService;
  let coord = '';

  beforeAll(async () => {
    // A trava curta, só nesta suíte: o padrão é de quinze segundos.
    process.env.BANCO_LIMITE_TRAVA_MS = '800';
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    db = app.get(DatabaseService);
    ({ rows: [{ id: coord }] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'coord.ai3@paodospobres.dev'`));
  });

  afterAll(async () => {
    delete process.env.BANCO_LIMITE_TRAVA_MS;
    await app.close(); await admin.end();
  });

  it('toda tabela tem chave primária e RLS ligado', async () => {
    const { rows } = await admin.query(`
      SELECT c.relname,
             EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p') AS pk,
             c.relrowsecurity AS rls
        FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'`);
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.filter((r) => !r.pk).map((r) => r.relname)).toEqual([]);
    expect(rows.filter((r) => !r.rls && !(r.relname in SEM_RLS)).map((r) => r.relname)).toEqual([]);
  });

  it('nenhuma política de escrita confere só a linha de antes', async () => {
    const { rows } = await admin.query(`
      SELECT tablename || '.' || policyname AS nome FROM pg_policies
       WHERE schemaname = 'public' AND cmd IN ('INSERT', 'UPDATE', 'ALL') AND with_check = 'true'`);
    expect(rows.map((r) => r.nome).filter((n) => !(n in CHECK_ABERTO)).sort()).toEqual([]);
    // A lista de exceções não guarda o que deixou de ser exceção.
    const abertas = new Set(rows.map((r) => r.nome));
    expect(Object.keys(CHECK_ABERTO).filter((n) => !abertas.has(n))).toEqual([]);
  });

  it('a aplicação não tem UPDATE onde nenhuma política deixa linha passar', async () => {
    const { rows } = await admin.query(`
      SELECT g.table_name FROM information_schema.role_table_grants g
       WHERE g.grantee = 'rede_app' AND g.privilege_type = 'UPDATE' AND g.table_schema = 'public'
         AND NOT EXISTS (SELECT 1 FROM pg_policies p
                          WHERE p.tablename = g.table_name AND p.cmd IN ('UPDATE', 'ALL'))`);
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it('toda chave estrangeira que se usa para filtrar tem índice', async () => {
    const { rows } = await admin.query(`
      SELECT c.conrelid::regclass::text AS tabela, c.confrelid::regclass::text AS alvo,
             (SELECT string_agg(a.attname, ',') FROM pg_attribute a
               WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) AS colunas
        FROM pg_constraint c
       WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
         AND NOT EXISTS (
           SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid
              AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
              AND c.conkey @> (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1])`);
    expect(rows.filter((r) => !FK_SEM_INDICE_PERMITIDA.has(r.alvo))
      .map((r) => `${r.tabela}(${r.colunas}) -> ${r.alvo}`)).toEqual([]);
  });

  it('a conexão da aplicação tem limite de tempo', async () => {
    const v = await db.asUser(coord, async (c) => {
      const lim = async (n: string) => (await c.query(`SHOW ${n}`)).rows[0][n];
      return {
        consulta: await lim('statement_timeout'),
        parada: await lim('idle_in_transaction_session_timeout'),
        nome: await lim('application_name'),
      };
    });
    expect(v).toEqual({ consulta: '1min', parada: '2min', nome: 'rede-acolher-api' });
  });

  /*
   * SOB O RELÓGIO ADIANTADO, O BANCO NÃO TEM TEMPORIZADOR. O `faketime` desloca
   * a hora, e com ele o Postgres deixa de disparar os limites de tempo (medido:
   * `SET statement_timeout='1s'; SELECT pg_sleep(4)` não é cortado). Em produção
   * não há `faketime`, e o limite vale. Nessa rodada, a espera não se mede, e
   * a configuração continua conferida acima. E em qualquer rodada, se o banco
   * não cortar, o guarda cancela a consulta presa: a primeira versão deste teste
   * ficou esperando para sempre, segurou a trava, e a suíte inteira parou.
   */
  const comTemporizador = !process.env.FAKETIME;
  it(comTemporizador
    ? 'a linha travada por outra transação vira recusa, em vez de espera sem fim'
    : 'a linha travada por outra transação: não medido sob o relógio adiantado, sem temporizador no banco',
  async () => {
    if (!comTemporizador) return;
    const { rows: [p] } = await admin.query(
      `SELECT d.person_id FROM profile_detail d JOIN house_stay s ON s.person_id = d.person_id
        JOIN house h ON h.id = s.house_id AND h.code = 'AI3' WHERE s.status = 'ativa' LIMIT 1`);
    const guarda = new Client({ connectionString: adminUrl });
    await guarda.connect();
    await admin.query('BEGIN');
    let cancelar: NodeJS.Timeout | undefined;
    try {
      await admin.query(`SELECT 1 FROM profile_detail WHERE person_id = $1 FOR UPDATE`, [p.person_id]);
      cancelar = setTimeout(() => {
        void guarda.query(`SELECT pg_cancel_backend(pid) FROM pg_stat_activity
                            WHERE application_name = 'rede-acolher-api' AND wait_event_type = 'Lock'`);
      }, 5000);
      const inicio = Date.now();
      await expect(db.asUser(coord, (c) => c.query(
        `UPDATE profile_detail SET notes = notes WHERE person_id = $1`, [p.person_id])))
        .rejects.toMatchObject({ code: '55P03' });
      expect(Date.now() - inicio).toBeLessThan(5000);
    } finally {
      clearTimeout(cancelar);
      await admin.query('ROLLBACK');
      await guarda.end();
    }
  }, 20000);

  it('a recusa por espera fala português', () => {
    const filtro = readFileSync(join(__dirname, '..', 'src', 'kernel', 'common', 'falhas-em-portugues.ts'), 'utf8');
    for (const codigo of ['57014', '55P03', '40001', '40P01', '25P03']) {
      expect([codigo, filtro.includes(`'${codigo}': { status: HttpStatus.SERVICE_UNAVAILABLE, frase: ESPERA }`)])
        .toEqual([codigo, true]);
    }
  });

  /*
   * O QUE A SEGUNDA TRAVA FECHA DE VERDADE: a autoria. Levar o registro para
   * outra casa o Postgres já recusava, porque o UPDATE que lê colunas no WHERE
   * passa a linha nova pela política de LEITURA. Trocar o AUTOR, não: a leitura
   * da operação feita sem sinal é da casa inteira, e a linha com o nome de outra
   * pessoa da casa continuava legível. Sem a trava, quem enviou podia passar a
   * operação para o nome de um colega.
   */
  it('a segunda trava: a operação feita sem sinal não passa para o nome de um colega', async () => {
    const { rows: [outro] } = await admin.query(
      `SELECT id FROM app_user WHERE email = 'educador.ai3@paodospobres.dev'`);
    const { rows: [op] } = await admin.query(
      `INSERT INTO offline_operation (client_op_id, user_id, house_id, kind, payload, happened_at, queued_at)
       SELECT 'suite-duas-travas-' || gen_random_uuid(), $1, id, 'nota', '{}'::jsonb,
              '2001-01-01 14:00-03', '2001-01-01 14:00-03'
         FROM house WHERE code = 'AI3' RETURNING id`, [coord]);
    await expect(db.asUser(coord, (c) => c.query(
      `UPDATE offline_operation SET user_id = $2 WHERE id = $1`, [op.id, outro.id])))
      .rejects.toMatchObject({ code: '42501' });
    try {
      const { rows: [depois] } = await admin.query(
        `SELECT user_id FROM offline_operation WHERE id = $1`, [op.id]);
      expect(depois.user_id).toBe(coord);
    } finally {
      /* A operação de mentira sai: o estado da sincronização da coordenação é
         lido por outra suíte, e uma operação a mais muda o que ela vê. */
      await admin.query(`DELETE FROM offline_operation WHERE id = $1`, [op.id]);
    }
  });

  it('e levar uma atividade para outra casa continua recusado', async () => {
    // Uma atividade da suíte, em 2001: fora de toda janela que outra suíte consulta (145).
    const { rows: [a] } = await admin.query(
      `INSERT INTO activity (house_id, kind, title, scheduled_at)
       SELECT id, 'saude', 'Atividade fictícia da suíte das duas travas', '2001-01-01 14:00-03'
         FROM house WHERE code = 'AI3' RETURNING id`);
    const { rows: [h4] } = await admin.query(`SELECT id FROM house WHERE code = 'AI4'`);
    await expect(db.asUser(coord, (c) => c.query(
      `UPDATE activity SET house_id = $2 WHERE id = $1`, [a.id, h4.id])))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('a migração já aplicada cujo arquivo mudou faz a migração parar', async () => {
    const { rows: [m] } = await admin.query(
      `SELECT name, sha256 FROM schema_migration ORDER BY name LIMIT 1`);
    expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
    await admin.query(`UPDATE schema_migration SET sha256 = repeat('0', 64) WHERE name = $1`, [m.name]);
    try {
      // Com limite: o `spawnSync` para a suíte inteira enquanto espera.
      const r = spawnSync('npx', ['tsx', 'scripts/migrate.ts'],
        { cwd: join(__dirname, '..'), env: process.env, encoding: 'utf8', timeout: 90_000 });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(m.name);
      expect(r.stderr).toMatch(/mudou depois de aplicado/);
    } finally {
      await admin.query(`UPDATE schema_migration SET sha256 = $2 WHERE name = $1`, [m.name, m.sha256]);
    }
  }, 120_000);
});
