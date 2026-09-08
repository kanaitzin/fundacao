/**
 * O ALCANCE COMO CONJUNTO — e a prova de que ele diz a mesma coisa.
 *
 * A migração 0920 trocou, na política da auditoria, a pergunta por linha
 * (`app_house_in_scope(house_id)`) por um teste de pertinência a um conjunto
 * calculado uma vez (`house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))`).
 * A coordenação lendo a auditoria da própria casa passou de **1 096 ms para
 * 122 ms**, com 173 mil linhas na tabela.
 *
 * Ganho de desempenho que muda regra de alcance é vazamento, não otimização.
 * Por isso esta suíte não mede tempo nenhum: ela pergunta, **para cada cargo e
 * cada casa da instituição**, se as duas formas respondem a mesma coisa. Uma
 * divergência aqui significa que alguém passou a ver — ou deixou de ver — uma
 * casa.
 */
import { Client } from 'pg';

const url = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

describe('app_casas_no_alcance diz o mesmo que app_house_in_scope', () => {
  let c: Client;
  let usuarios: Array<{ id: string; email: string; role: string }> = [];
  let casas: Array<{ id: string; code: string }> = [];

  beforeAll(async () => {
    c = new Client({ connectionString: url });
    await c.connect();
    ({ rows: usuarios } = await c.query(
      `SELECT id, email, role::text AS role FROM app_user WHERE active ORDER BY role, email`));
    ({ rows: casas } = await c.query(`SELECT id, code FROM house ORDER BY code`));
  });

  afterAll(async () => { await c.end(); });

  it('há gente e casas para comparar', () => {
    // Sem esta guarda, um banco vazio faria a suíte passar sem comparar nada.
    expect(usuarios.length).toBeGreaterThanOrEqual(8);
    expect(casas.length).toBeGreaterThanOrEqual(8);
  });

  it('para TODO cargo e TODA casa, as duas formas concordam', async () => {
    const divergencias: string[] = [];

    for (const u of usuarios) {
      /*
       * A comparação roda como `rede_app`, com a identidade de cada pessoa —
       * é assim que as duas funções são usadas de verdade. Como dono do banco,
       * o resultado poderia ser outro.
       */
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE rede_app');
      await c.query(`SELECT set_config('app.user_id', $1, true)`, [u.id]);

      const { rows: [r] } = await c.query(`
        SELECT array_agg(h.code ORDER BY h.code) FILTER (
                 WHERE app_house_in_scope(h.id)) AS pela_funcao,
               array_agg(h.code ORDER BY h.code) FILTER (
                 WHERE h.id = ANY (ARRAY(SELECT app_casas_no_alcance()))) AS pelo_conjunto
          FROM house h`);
      await c.query('ROLLBACK');

      const pela = (r.pela_funcao ?? []).join(',');
      const pelo = (r.pelo_conjunto ?? []).join(',');
      if (pela !== pelo) {
        divergencias.push(`${u.role} (${u.email}): função=[${pela}] conjunto=[${pelo}]`);
      }
    }

    expect(divergencias).toEqual([]);
  });

  it('a política da auditoria usa o conjunto, e pergunta o papel primeiro', async () => {
    /*
     * Guarda a FORMA, e não o comportamento: quem voltar para
     * `app_house_in_scope` por linha não vê nada quebrar — só a coordenação
     * esperando um segundo, que é o tipo de coisa que se atribui à internet
     * da casa.
     */
    const { rows: [p] } = await c.query(
      `SELECT pg_get_expr(polqual, polrelid) AS regra
         FROM pg_policy WHERE polrelid = 'audit_event'::regclass AND polname = 'audit_select'`);
    expect(p.regra).toMatch(/CASE/);
    expect(p.regra).toMatch(/app_casas_no_alcance/);
    expect(p.regra.indexOf('app_current_role'))
      .toBeLessThan(p.regra.indexOf('app_casas_no_alcance'));
  });

  it('quem não é coordenação nem gestão não lê auditoria nenhuma', async () => {
    /* A parte da regra que o desempenho não pode ter afrouxado. */
    const educador = usuarios.find((u) => u.role === 'educador')!;
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE rede_app');
    await c.query(`SELECT set_config('app.user_id', $1, true)`, [educador.id]);
    const { rows: [r] } = await c.query(`SELECT count(*)::int AS n FROM audit_event`);
    await c.query('ROLLBACK');
    expect(r.n).toBe(0);
  });
});
