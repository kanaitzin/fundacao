/**
 * O CARGO QUE NÃO VEIO É RECUSADO (identity/1717; a guarda de cargo nulo, anotada desde a 1634).
 *
 * O `app_current_role()` devolve NULL quando a transação chega sem identidade ou quando a conta
 * está desativada. NULL comparado com qualquer coisa não é verdadeiro nem falso, e o
 * `IF app_current_role() NOT IN (…) THEN RAISE` não entrava no IF: a função seguia, e quem a
 * segurava era a casa, o RLS ou uma restrição da tabela, por acaso.
 *
 * Esta suíte cobra duas coisas:
 *  1. NEGA POR PADRÃO, pelo catálogo: nenhuma função plpgsql compara o cargo de quem chama sem
 *     tratar o cargo que não veio como cargo nenhum (`coalesce(…::text, '')`), e o cargo de quem
 *     chama só mora em `app_current_role()` ou na variável `v_role`;
 *  2. as três tentativas medidas antes do conserto, como o papel da aplicação, sem identidade e
 *     com a identidade de uma conta desativada: a recusa é a do cargo, e não a que vinha depois.
 */
import { Client } from 'pg';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const appUrl = process.env.DATABASE_APP_URL
  ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher';

/** A comparação do cargo de quem chama que deixa o NULL passar. */
const CARGO_SEM_GUARDA = String.raw`(app_current_role\(\)|\mv_role\M)(?=\s*(?:=|<>|!=|IN\M|NOT\s+IN\M))`;

describe('O cargo que não veio é recusado', () => {
  let admin: Client, semIdentidade: Client;
  let casa = '', desativada = '';

  /** Tenta como o papel da aplicação e desfaz sempre. Devolve 'passou' ou a recusa. */
  const tenta = async (identidade: string | null, sql: string, p: unknown[] = []) => {
    await semIdentidade.query('BEGIN');
    try {
      if (identidade) await semIdentidade.query(`SELECT set_config('app.user_id', $1, true)`, [identidade]);
      await semIdentidade.query(sql, p);
      return 'passou';
    } catch (e: any) {
      return String(e?.message ?? e);
    } finally {
      await semIdentidade.query('ROLLBACK');
    }
  };

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    semIdentidade = new Client({ connectionString: appUrl });
    await admin.connect(); await semIdentidade.connect();
    casa = (await admin.query(`SELECT id FROM house WHERE code = 'AI3'`)).rows[0].id;
    /* Uma conta de Gestor Geral desativada: o cargo dela é o que mais pode, e ela não pode nada. */
    const inst = (await admin.query(`SELECT institution_id FROM house WHERE id = $1`, [casa])).rows[0].institution_id;
    desativada = (await admin.query(
      `INSERT INTO app_user (institution_id, email, full_name, password_hash, role, active)
       VALUES ($1, 'desativada.1717@paodospobres.dev', 'Conta desativada da 1717', 'sem-senha', 'gestor_geral', false)
       RETURNING id`, [inst])).rows[0].id;
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM app_user WHERE id = $1`, [desativada]).catch(() => undefined);
    await semIdentidade.end(); await admin.end();
  });

  it('nenhuma função compara o cargo de quem chama deixando o cargo nulo passar', async () => {
    const { rows } = await admin.query(
      `SELECT p.proname AS funcao, btrim(m[1]) AS linha
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_language l ON l.oid = p.prolang,
              regexp_matches(p.prosrc, '[^\n]*' || $1 || '[^\n]*', 'g') AS m
        WHERE n.nspname = 'public' AND l.lanname = 'plpgsql'
        ORDER BY 1`, [CARGO_SEM_GUARDA]);
    expect(rows.map((r) => `${r.funcao}: ${r.linha}`)).toEqual([]);
  });

  it('o cargo de quem chama só mora em app_current_role() ou na variável v_role', async () => {
    /* A cobrança acima procura esses dois nomes. Guardar o cargo noutra variável a deixaria cega. */
    const { rows } = await admin.query(
      `SELECT p.proname AS funcao, m[1] AS variavel
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_language l ON l.oid = p.prolang,
              regexp_matches(p.prosrc, '(\w+)\s*:=\s*app_current_role\(\)', 'g') AS m
        WHERE n.nspname = 'public' AND l.lanname = 'plpgsql' AND m[1] <> 'v_role'
        ORDER BY 1`);
    expect(rows.map((r) => `${r.funcao}: ${r.variavel}`)).toEqual([]);
  });

  it('a guarda está de pé: o conserto alcançou as funções que comparam o cargo', async () => {
    /* Sem a 1717 esta contagem é zero, e a primeira cobrança é que reprova. Com ela, um número
       baixo aqui diria que a expressão da cobrança deixou de achar o que procura. */
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosrc ~ 'coalesce\((app_current_role\(\)|v_role)::text, ''''\)'`);
    expect(rows[0].n).toBeGreaterThanOrEqual(60);
  });

  for (const [quem, identidade] of [['sem identidade', null], ['com a conta desativada', 'desativada']] as const) {
    const id = () => (identidade ? desativada : null);

    it(`${quem}, registrar aparelho é recusado pelo cargo`, async () => {
      const r = await tenta(id(), `SELECT app_register_device($1, 'tablet da sala', repeat('ab', 32))`, [casa]);
      expect(r).toContain('cargo_nao_registra_aparelho');
    });

    it(`${quem}, criar a Coordenação Geral é recusado pelo cargo`, async () => {
      const r = await tenta(id(),
        `SELECT app_create_coordenacao_geral('ninguem.1717@paodospobres.dev', 'Fulano de Tal', 'sem-senha')`);
      expect(r).toContain('so_o_gestor_marca_coordenacao_geral');
    });

    it(`${quem}, as métricas do trabalho são recusadas pelo cargo`, async () => {
      const r = await tenta(id(),
        `SELECT * FROM app_metricas_do_trabalho(app_hoje() - 30, app_hoje(), 'conferência da 1717')`);
      expect(r).toContain('metricas_fora_do_alcance');
    });
  }
});
