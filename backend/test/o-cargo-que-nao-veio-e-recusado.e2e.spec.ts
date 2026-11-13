/**
 * O CARGO QUE NÃO VEIO É RECUSADO (identity/1717 e 1718; a guarda de cargo nulo, anotada desde a 1634).
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
 *
 * E o que a 1718 fechou, achado pelas revisões da própria fase: o cargo convertido antes de
 * comparar (`app_current_role()::text NOT IN`), as funções SQL que respondem sim ou não pelo
 * cargo devolvendo NULL (e `IF NOT f()` não entra no IF com NULL), e a conta DESATIVADA que
 * continuava com a casa pelo vínculo. Os casos de comportamento usam uma conta desativada COM
 * casa: a de Gestor Geral, sem casa, não pegava nenhum dos três.
 */
import { Client } from 'pg';

const adminUrl = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
const appUrl = process.env.DATABASE_APP_URL
  ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher';

/** A comparação do cargo de quem chama que deixa o NULL passar. */
const CARGO_SEM_GUARDA = String.raw`(app_current_role\(\)|\mv_role\M)(?:::\w+)?(?=\s*(?:=|<>|!=|IN\M|NOT\s+IN\M))`;

describe('O cargo que não veio é recusado', () => {
  let admin: Client, semIdentidade: Client;
  let casa = '', desativada = '', educadorDesativado = '', crianca = '';

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
    /* Um educador desativado COM o vínculo da casa aberto: é o caso que a 1718 fechou. */
    educadorDesativado = (await admin.query(
      `INSERT INTO app_user (institution_id, email, full_name, password_hash, role, active)
       VALUES ($1, 'educador.desativado.1718@paodospobres.dev', 'Educador desativado da 1718', 'sem-senha', 'educador', false)
       RETURNING id`, [inst])).rows[0].id;
    await admin.query(
      `INSERT INTO user_house_assignment (user_id, house_id, role, valid_from) VALUES ($1, $2, 'educador', app_hoje() - 30)`,
      [educadorDesativado, casa]);
    crianca = (await admin.query(
      `SELECT person_id FROM house_stay WHERE house_id = $1 AND ended_at IS NULL ORDER BY person_id LIMIT 1`,
      [casa])).rows[0].person_id;
  });

  afterAll(async () => {
    /* O gatilho do cargo da época grava o período no INSERT: ele sai antes, ou a conta fica. */
    for (const id of [desativada, educadorDesativado].filter(Boolean)) {
      await admin.query(`DELETE FROM user_house_assignment WHERE user_id = $1`, [id]);
      await admin.query(`DELETE FROM app_user_role_period WHERE user_id = $1`, [id]);
      await admin.query(`DELETE FROM app_user WHERE id = $1`, [id]);
    }
    await semIdentidade.end(); await admin.end();
  });

  it('nenhuma função compara o cargo de quem chama deixando o cargo nulo passar', async () => {
    const { rows } = await admin.query(
      `SELECT p.proname AS funcao, btrim(m[1]) AS linha
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_language l ON l.oid = p.prolang,
              regexp_matches(p.prosrc, '[^\n]*' || $1 || '[^\n]*', 'gi') AS m
        WHERE n.nspname = 'public' AND l.lanname = 'plpgsql'
        ORDER BY 1`, [CARGO_SEM_GUARDA]);
    expect(rows.map((r) => `${r.funcao}: ${r.linha}`)).toEqual([]);
  });

  it('o cargo de quem chama só mora em app_current_role() ou na variável v_role', async () => {
    /* A cobrança acima procura esses dois nomes. Guardar o cargo noutra variável a deixaria cega. */
    const { rows } = await admin.query(String.raw
      `SELECT p.proname AS funcao, coalesce(m[1], m[2]) AS variavel
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_language l ON l.oid = p.prolang,
              regexp_matches(p.prosrc,
                '(?:(\w+)\s*:=\s*app_current_role\(\)|SELECT\s+app_current_role\(\)\s+INTO\s+(\w+))', 'gi') AS m
        WHERE n.nspname = 'public' AND l.lanname = 'plpgsql' AND coalesce(m[1], m[2]) <> 'v_role'
        ORDER BY 1`);
    expect(rows.map((r) => `${r.funcao}: ${r.variavel}`)).toEqual([]);
  });

  it('a guarda está de pé: o conserto alcançou as funções que comparam o cargo', async () => {
    /* Sem a 1717 esta contagem é zero, e a primeira cobrança é que reprova. Com ela, um número
       baixo aqui diria que a expressão da cobrança deixou de achar o que procura. */
    const { rows } = await admin.query(String.raw
      `SELECT count(*)::int AS n
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosrc ~ 'coalesce\((app_current_role\(\)|v_role)::text, ''''\)'`);
    expect(rows[0].n).toBeGreaterThanOrEqual(60);
  });

  it('toda função SQL que responde sim ou não pelo cargo devolve falso, e nunca NULL', async () => {
    /* `IF NOT f() THEN RAISE` não entra no IF com NULL: sem identidade, a fila do arquivo saía
       inteira e o documento que nunca subiu era dado como guardado (1718). */
    const { rows } = await admin.query(String.raw
      `SELECT p.proname AS funcao
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname = 'public' AND l.lanname = 'sql'
          AND p.prorettype = 'bool'::regtype AND NOT p.proretset
          AND p.prosrc ~ 'app_current_role\(\)'
          AND p.prosrc !~* '^\s*SELECT\s+coalesce\('
        ORDER BY 1`);
    expect(rows.map((r) => r.funcao)).toEqual([]);
  });

  it('sem identidade, a fila do arquivo é recusada', async () => {
    expect(await tenta(null, `SELECT * FROM app_archive_queue(50)`)).toContain('sem_permissao_ver_fila');
  });

  it('a conta desativada não alcança a casa, nem pelo vínculo', async () => {
    await semIdentidade.query('BEGIN');
    try {
      await semIdentidade.query(`SELECT set_config('app.user_id', $1, true)`, [educadorDesativado]);
      const r = (await semIdentidade.query(
        `SELECT app_house_in_scope($1) AS casa, app_person_in_scope($2) AS crianca,
                (SELECT count(*)::int FROM app_user_house_ids()) AS casas,
                (SELECT count(*)::int FROM person WHERE id = $2) AS le`, [casa, crianca])).rows[0];
      expect(r).toEqual({ casa: false, crianca: false, casas: 0, le: 0 });
    } finally {
      await semIdentidade.query('ROLLBACK');
    }
  });

  it('o educador desativado com casa não tria evolução nem corrige o cadastro', async () => {
    const triar = await tenta(educadorDesativado,
      `SELECT app_triar_evolucao(gen_random_uuid(), 'assinar', NULL, NULL, NULL)`);
    expect(triar).toContain('somente_enfermagem_tria');
    const corrigir = await tenta(educadorDesativado,
      `SELECT app_corrigir_pessoa($1, '{"rg":"1234567"}'::jsonb, 'conferência da 1718')`, [crianca]);
    expect(corrigir).toMatch(/pessoa_fora_de_escopo|sem_permissao_para_corrigir/);
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
