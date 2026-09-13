/**
 * TODO ARQUIVO GUARDADO TEM POR ONDE SAIR.
 *
 * A fase 66 encontrou dois armazenamentos write-only: o anexo do diário da
 * internação e o comprovante da conquista guardavam arquivo desde as fases 53
 * e 58, e nenhum dos dois tinha rota de leitura. A equipe digitalizaria o
 * laudo, devolveria o papel ao hospital, e no dia em que ele fosse pedido não
 * haveria nada — nem o arquivo, nem o papel.
 *
 * **Um arquivo que entra e não sai é pior do que arquivo nenhum**, porque a
 * pessoa acredita que guardou. E o defeito é invisível: nada quebra, nenhum
 * teste falha, a tela mostra "📎 anexado". Ele só aparece no dia em que
 * alguém precisa do documento — que é o pior dia para descobrir.
 *
 * Este teste pergunta ao BANCO quais tabelas guardam arquivo, e cobra que cada
 * uma tenha uma rota de leitura declarada aqui, com o caminho conferido contra
 * os controladores. Uma tabela nova com `storage_key` reprova até alguém
 * escrever por onde o arquivo sai.
 *
 * É deliberadamente uma pergunta ao banco, e não uma lista escrita à mão: lista
 * escrita à mão não sabe da tabela que nasceu ontem.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const SRC = join(__dirname, '..', 'src');
const url = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/**
 * Por onde o arquivo de cada tabela sai. A chave é `tabela.coluna`; o valor é
 * o caminho da rota, como ele aparece no controlador.
 *
 * Acrescentar uma linha aqui é declarar "este arquivo tem saída, e é esta".
 * Deixar de acrescentar é o teste reprovando — que é o ponto.
 */
const POR_ONDE_SAI: Record<string, string> = {
  'document_version.storage_key':
    ':id/documents/:docId/file',
  'memory_record.storage_key':
    ':id/memories/:memId/file',
  'person.photo_key':
    ':id/photo',
  /* A foto 3×4 do visitante, que vai para a folha da portaria (fase 92). */
  'person_contact.photo_key':
    'contacts/:contactId/photo',
  'hospitalization_note.storage_key':
    'hospitalizations/:id/notes/:notaId/anexo',
  'life_milestone.storage_key':
    'marcos/:id/comprovante',
};

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) out.push(...arquivos(caminho));
    else if (nome.endsWith('.controller.ts')) out.push(caminho);
  }
  return out;
}

describe('Todo arquivo guardado tem por onde sair', () => {
  let c: Client;
  let guardam: Array<{ tabela: string; coluna: string }> = [];

  beforeAll(async () => {
    c = new Client({ connectionString: url });
    await c.connect();
    const { rows } = await c.query(`
      SELECT table_name AS tabela, column_name AS coluna
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name IN ('storage_key', 'photo_key', 'file_key', 'blob_key')
       ORDER BY table_name`);
    guardam = rows;
  });

  afterAll(async () => { await c.end(); });

  it('encontra as tabelas que guardam arquivo', () => {
    // Guarda contra o teste passar por não ter perguntado nada.
    expect(guardam.length).toBeGreaterThanOrEqual(5);
  });

  it('cada tabela que guarda arquivo tem rota de leitura declarada', () => {
    const semSaida = guardam
      .map((g) => `${g.tabela}.${g.coluna}`)
      .filter((chave) => !POR_ONDE_SAI[chave]);
    expect(semSaida).toEqual([]);
  });

  it('a rota declarada existe mesmo no servidor', () => {
    /*
     * Sem esta conferência, a lista acima viraria uma promessa: alguém
     * escreveria o caminho de uma rota que nunca foi construída, e o teste
     * ficaria verde sobre um arquivo que continua sem saída.
     */
    const controladores = arquivos(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
    const inexistentes = Object.entries(POR_ONDE_SAI)
      .filter(([, rota]) => !controladores.includes(`'${rota}'`))
      .map(([chave, rota]) => `${chave} → ${rota}`);
    expect(inexistentes).toEqual([]);
  });

  it('e a rota é de LEITURA — @Get, e não @Post', () => {
    /*
     * Uma rota de escrita com o mesmo caminho satisfaria a conferência acima e
     * não devolveria arquivo nenhum.
     */
    const controladores = arquivos(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
    const naoSaoLeitura = Object.entries(POR_ONDE_SAI)
      .filter(([, rota]) => !controladores.includes(`@Get('${rota}')`))
      .map(([chave, rota]) => `${chave} → ${rota}`);
    expect(naoSaoLeitura).toEqual([]);
  });

  it('a lista não guarda tabela que não existe mais', () => {
    /* O contrário também envelhece: tabela renomeada ou removida deixa a lista
     * afirmando uma saída para um arquivo que ninguém guarda. */
    const existentes = new Set(guardam.map((g) => `${g.tabela}.${g.coluna}`));
    const sobrando = Object.keys(POR_ONDE_SAI).filter((k) => !existentes.has(k));
    expect(sobrando).toEqual([]);
  });
});

/**
 * NENHUMA COLUNA NASCE COM A DATA DO SERVIDOR (fase 99).
 *
 * `current_date` e `now()::date` devolvem o dia do fuso da SESSÃO. O servidor
 * roda em UTC, e das 21h à meia-noite de Porto Alegre lá já é o dia seguinte —
 * que é justamente quando o sistema é usado. A 0630 criou `app_hoje()` para
 * isso, e mesmo assim duas colunas continuavam nascendo com a data errada:
 * `house_statute.since`, que fazia uma regra escrita às 22h valer só amanhã e
 * sumir da folha da parede, e `work_schedule.valid_from`.
 *
 * Pergunta ao CATÁLOGO, e não ao texto das migrações: um `DEFAULT` antigo
 * corrigido por `ALTER` depois some de `pg_attrdef` e não some do `grep`. É a
 * diferença entre conferir o que o banco faz e conferir o que está escrito.
 */
describe('A data que nasce no banco é a do fuso da instituição', () => {
  let c: Client;

  beforeAll(async () => {
    c = new Client({ connectionString: url });
    await c.connect();
  });
  afterAll(async () => { await c.end(); });

  it('nenhuma coluna tem DEFAULT com a data do servidor', async () => {
    const { rows } = await c.query(
      `SELECT cl.relname || '.' || a.attname AS coluna,
              pg_get_expr(d.adbin, d.adrelid) AS padrao
         FROM pg_attrdef d
         JOIN pg_class cl ON cl.oid = d.adrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
         JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = d.adnum
        WHERE pg_get_expr(d.adbin, d.adrelid) ~* '(current_date|now\\(\\)::date)'`);
    expect(rows.map((r: any) => `${r.coluna} → ${r.padrao}`)).toEqual([]);
  });

  /**
   * TODA TABELA TEM RLS, OU ESTÁ AQUI COM O MOTIVO (fase 100).
   *
   * O RLS é a garantia central deste sistema: a casa 03 não lê a 04 porque o
   * BANCO recusa, não porque o serviço lembrou de filtrar. Uma tabela sem RLS
   * é um buraco nessa garantia, e ninguém notaria — nada quebra.
   *
   * Sobrou UMA exceção. `user_session` e `login_attempt` estavam aqui até a
   * fase 101, quando a autenticação passou a falar com o banco por funções
   * `SECURITY DEFINER` e as duas foram fechadas — e foi esta conferência que
   * exigiu que saíssem da lista, porque exceção que deixa de ser usada
   * reprova. Lista de exceção que só cresce vira documento morto.
   */
  const SEM_RLS_COM_MOTIVO: Record<string, string> = {
    schema_migration:
      'metadado do migrador, que roda como dono do banco. Desde a 1180 a aplicação não escreve '
      + 'nela, e não há dado de pessoa',
  };

  it('toda tabela tem RLS, ou está declarada com o motivo', async () => {
    const { rows } = await c.query(
      `SELECT cl.relname AS tabela
         FROM pg_class cl
         JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
        WHERE cl.relkind = 'r' AND NOT cl.relrowsecurity
        ORDER BY 1`);
    const semRls = rows.map((r: any) => r.tabela as string);
    /* Um conferidor que não viu tabela nenhuma passaria dizendo "sim". */
    const { rows: [{ n: total }] } = await c.query(
      `SELECT count(*)::int AS n FROM pg_class cl
         JOIN pg_namespace ns ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
        WHERE cl.relkind = 'r'`);
    expect(total).toBeGreaterThan(100);

    const violacoes = semRls.filter((t) => !SEM_RLS_COM_MOTIVO[t])
      .map((t) => `${t}: sem RLS e sem motivo declarado`);
    for (const t of Object.keys(SEM_RLS_COM_MOTIVO)) {
      if (!semRls.includes(t)) violacoes.push(`${t}: já tem RLS — retire da lista`);
    }
    expect(violacoes).toEqual([]);
  });

  /*
   * RLS ligado sem política nega TUDO. Isso é defeito quando a aplicação tem
   * privilégio na tabela — a tela fica vazia e ninguém entende por quê — e é
   * desenho deliberado quando ela NÃO tem: aí a tabela só é alcançada por
   * função `SECURITY DEFINER`, que é mais fechado ainda. É o caso de
   * `user_invite`, e foi ele que corrigiu este teste: a primeira versão o
   * acusava, e o errado era o teste.
   */
  it('nenhuma tabela nega tudo em silêncio para a aplicação', async () => {
    const { rows } = await c.query(
      `SELECT cl.relname AS tabela
         FROM pg_class cl
         JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
        WHERE cl.relkind = 'r' AND cl.relrowsecurity
          AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = cl.oid)
          AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                       WHERE g.grantee = 'rede_app' AND g.table_name = cl.relname)
        ORDER BY 1`);
    expect(rows.map((r: any) => r.tabela)).toEqual([]);
  });

  it('e app_hoje() e current_date discordam quando devem — o teste tem valor', async () => {
    /* Sem esta conferência, a de cima passaria num banco onde os dois são
       iguais por acaso, e ninguém saberia que ela não prova nada. */
    const { rows: [r] } = await c.query(
      `SELECT app_hoje() AS instituicao,
              (timezone('America/Sao_Paulo', now()))::date AS esperado`);
    expect(String(r.instituicao)).toBe(String(r.esperado));
  });
});

/**
 * A CONEXÃO DA APLICAÇÃO NÃO ALCANÇA A SESSÃO (fase 101).
 *
 * Até a fase 100, `user_session` e `login_attempt` eram as duas tabelas com
 * dado de pessoa sem RLS, e a aplicação lia e escrevia nelas direto: uma
 * consulta sem `WHERE user_id` lia o hash de sessão e o IP de todo mundo.
 * Ligar RLS não bastava — o login acontece antes de existir identidade na
 * sessão —, então as operações viraram funções `SECURITY DEFINER` e o acesso
 * direto foi revogado.
 *
 * Este teste usa a MESMA conexão que o serviço usa (`rede_app`), e não a de
 * dono: é a única forma de provar o que a aplicação pode. Com a de dono, tudo
 * passaria e o teste diria o contrário do que se quer saber.
 */
describe('A conexão da aplicação não alcança as tabelas de sessão', () => {
  const appUrl = process.env.DATABASE_APP_URL
    ?? 'postgres://rede_app:dev-only-change-me-app@127.0.0.1:5432/rede_acolher';
  let app: Client;

  beforeAll(async () => { app = new Client({ connectionString: appUrl }); await app.connect(); });
  afterAll(async () => { await app.end(); });

  it('não lê nem escreve user_session e login_attempt direto', async () => {
    for (const tabela of ['user_session', 'login_attempt']) {
      await expect(app.query(`SELECT * FROM ${tabela} LIMIT 1`))
        .rejects.toThrow(/permission denied|permissão negada/i);
    }
    await expect(app.query(
      `UPDATE user_session SET revoked_at = now()`))
      .rejects.toThrow(/permission denied|permissão negada/i);
  });

  /*
   * E NÃO PODE CRIAR NADA (fase 102).
   *
   * É isto que faz o `search_path` das funções `SECURITY DEFINER` ser um risco
   * teórico e não uma porta aberta: sem poder criar schema nem objeto, não há
   * o que sombrear. Fica conferido porque é uma condição, não uma verdade
   * permanente — um `GRANT` concedido numa pressa a derruba, e aí 151 funções
   * que rodam como dona do banco passam a depender dela.
   */
  it('não pode criar schema nem objeto — a condição que segura o search_path', async () => {
    await expect(app.query('CREATE SCHEMA sombra_de_teste'))
      .rejects.toThrow(/permission denied|permissão negada/i);
    await expect(app.query('CREATE TABLE public.sombra_de_teste (id int)'))
      .rejects.toThrow(/permission denied|permissão negada/i);
  });

  it('mas alcança as funções de que precisa — e elas trazem o WHERE junto', async () => {
    /* Se as funções também estivessem fechadas, o login não funcionaria e o
       teste de cima passaria por motivo errado. */
    const { rows: [r] } = await app.query(
      `SELECT auth_tentativas_recentes('ninguem@exemplo.invalido', 15) AS n`);
    expect(Number(r.n)).toBe(0);

    /* Token que não existe não valida — o WHERE mora na função. */
    const { rows } = await app.query(`SELECT * FROM auth_validar_sessao($1)`, ['hash-que-nao-existe']);
    expect(rows).toHaveLength(0);
  });
});

/**
 * TODA FUNÇÃO QUE RODA COMO DONA DIZ ONDE PROCURAR (fase 102).
 *
 * `SECURITY DEFINER` roda com os privilégios da dona do banco. Sem
 * `search_path` fixo, um objeto de mesmo nome num schema procurado antes de
 * `public` seria executado no lugar do certo — com esses privilégios.
 *
 * A conferência é aqui e não numa varredura de texto porque `CREATE OR REPLACE
 * FUNCTION` APAGA o `SET` de uma função que já o tinha: quem só olhasse a
 * migração que fixou não veria a que redefiniu depois. O catálogo vê.
 */
describe('As funções privilegiadas dizem onde procurar', () => {
  let c: Client;

  beforeAll(async () => { c = new Client({ connectionString: url }); await c.connect(); });
  afterAll(async () => { await c.end(); });

  it('nenhuma função SECURITY DEFINER fica sem search_path', async () => {
    const { rows } = await c.query(
      `SELECT p.oid::regprocedure::text AS funcao
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.prosecdef
          AND (p.proconfig IS NULL
               OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg
                               WHERE cfg LIKE 'search\\_path=%'))
        ORDER BY 1`);
    expect(rows.map((r: any) => r.funcao)).toEqual([]);

    /* E precisa haver função SECURITY DEFINER para conferir: se um dia não
       houver, o teste acima passaria sem ter olhado nada. */
    const { rows: [{ n }] } = await c.query(
      `SELECT count(*)::int AS n FROM pg_proc p
         JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname = 'public'
        WHERE p.prosecdef`);
    expect(n).toBeGreaterThan(100);
  });
});
