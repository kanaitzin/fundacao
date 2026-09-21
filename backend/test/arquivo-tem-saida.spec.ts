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
import { execSync } from 'node:child_process';
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
  /* A ORIGEM HISTÓRICA. Desde a 1320 a foto da vivência vive em
     `memory_photo` — a coluna ficou, porque nada se apaga, e a rota continua
     valendo: ela devolve a PRIMEIRA foto da vivência, para quem chamava antes. */
  'memory_record.storage_key':
    ':id/memories/:memId/file',
  /* Várias fotos numa vivência só (fase 124). A rota nomeia a foto. */
  'memory_photo.storage_key':
    ':id/memories/:memId/photos/:fotoId',
  'person.photo_key':
    ':id/photo',
  /* A foto 3×4 do visitante, que vai para a folha da portaria (fase 92). */
  'person_contact.photo_key':
    'contacts/:contactId/photo',
  'hospitalization_note.storage_key':
    'hospitalizations/:id/notes/:notaId/anexo',
  'life_milestone.storage_key':
    'marcos/:id/comprovante',
  /* Os três que a fase 108 tirou da forma de REFERÊNCIA e passaram a poder
     guardar o papel: o anexo da ocorrência, a receita e a nota fiscal. */
  'incident_attachment.storage_key':
    'attachments/:id/open',
  'prescription_document.storage_key':
    'prescriptions/documents/:docId/file',
  'medication_purchase.storage_key':
    'purchases/:compraId/file',
};

/**
 * A EXCEÇÃO DO @Get, escrita por extenso.
 *
 * A regra abaixo existe porque uma rota de ESCRITA com o mesmo caminho
 * satisfaria a conferência e não devolveria arquivo nenhum. O anexo da
 * ocorrência é a exceção honesta: abrir um anexo restrito EXIGE uma finalidade
 * escrita, que viaja no corpo, e o ato REGISTRA antes de devolver (§13.7). Uma
 * leitura que muda o estado do mundo — porque deixa rastro — não é um @Get.
 *
 * É uma linha só, e ela só vale enquanto for usada: se a rota deixar de
 * existir, a conferência de cima reprova primeiro.
 */
const ABRE_POR_POST = new Set(['incident_attachment.storage_key']);

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
      .filter(([chave]) => !ABRE_POR_POST.has(chave))
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

  /**
   * TABELA QUE O DOCUMENTO CHAMA DE MORTA NÃO TEM LEITOR — E QUEM DIZ É O
   * CATÁLOGO (fase 131).
   *
   * Este teste existe porque eu errei a mesma conta DUAS vezes seguidas.
   *
   * O §9 dizia, desde a varredura de 15/09, que a `work_schedule` tinha "zero
   * leitura e zero escrita desde a fundação". Era falso: ela tinha DOIS
   * leitores. Na fase 129 eu achei um deles, tirei-o, e escrevi na tabela um
   * `COMMENT` dizendo "MORTA desde a 1370" — errando a segunda metade, porque
   * procurei os leitores só nas migrações do módulo em que estava mexendo, e o
   * outro leitor morava noutro módulo.
   *
   * **Um comentário errado no banco é pior do que comentário nenhum:** quem
   * abrir a tabela amanhã acredita nele. Ler migração por migração não serve —
   * `CREATE OR REPLACE` espalha a verdade por vários arquivos, e a única cópia
   * que vale é a que está no catálogo. Então a pergunta passa a ser feita ao
   * `pg_get_functiondef`, que é o que o banco realmente executa.
   *
   * A lista é de tabelas que um `COMMENT` declara MORTAS. Cada linha aqui é uma
   * afirmação do documento que passou a ser conferível.
   */
  it('nenhuma função do banco lê tabela declarada MORTA', async () => {
    const { rows: mortas } = await c.query(
      `SELECT c.relname AS tabela
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        WHERE c.relkind = 'r'
          AND obj_description(c.oid, 'pg_class') LIKE 'MORTA %'
        ORDER BY 1`);
    /* Se nenhuma tabela estiver declarada morta, o teste não olhou nada — e
       hoje há uma, a `work_schedule`. */
    expect(mortas.length).toBeGreaterThan(0);

    const achados: string[] = [];
    for (const { tabela } of mortas) {
      const { rows } = await c.query(
        `SELECT p.oid::regprocedure::text AS funcao
           FROM pg_proc p
           JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname = 'public'
          WHERE p.prokind = 'f'
            AND pg_get_functiondef(p.oid) ~ ('\\m' || $1 || '\\M')
          ORDER BY 1`, [tabela]);
      for (const r of rows) achados.push(`${tabela} é lida por ${r.funcao}`);

      /*
       * O LIMITE QUE ESTE TESTE TINHA, E QUE A FASE 132 FECHOU.
       *
       * A versão de ontem olhava só o `pg_proc` — e função não é o único lugar
       * de onde uma tabela é lida. Uma POLÍTICA de RLS pode consultá-la no
       * `USING`, uma VISÃO pode selecioná-la, e o servidor pode lê-la em
       * TypeScript, que nenhuma consulta ao catálogo alcança. Foi exatamente
       * por TypeScript que a `medication_authorization` sobreviveu à varredura
       * de ontem: a consulta que a lê mora no serviço, não no banco.
       *
       * Declarar uma tabela morta é uma afirmação sobre o repositório inteiro,
       * então é o repositório inteiro que responde.
       */
      const { rows: pols } = await c.query(
        `SELECT schemaname || '.' || tablename || ' / ' || policyname AS politica
           FROM pg_policies
          WHERE schemaname = 'public'
            AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ ('\\m' || $1 || '\\M')
          ORDER BY 1`, [tabela]);
      for (const r of pols) achados.push(`${tabela} é lida pela política ${r.politica}`);

      const { rows: vistas } = await c.query(
        `SELECT c.relname AS visao
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
          WHERE c.relkind IN ('v', 'm')
            AND pg_get_viewdef(c.oid) ~ ('\\m' || $1 || '\\M')
          ORDER BY 1`, [tabela]);
      for (const r of vistas) achados.push(`${tabela} é lida pela visão ${r.visao}`);
    }

    /*
     * E o código do servidor. Linha de comentário não conta — é lá que a
     * história da tabela morta fica escrita de propósito, inclusive por este
     * teste; o que conta é linha que o programa executa.
     */
    const raiz = join(__dirname, '..', '..');
    const fontes = execSync(
      `find ${raiz}/backend/src ${raiz}/frontend/src -name '*.ts' -o -name '*.tsx'`,
      { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const { tabela } of mortas) {
      for (const arq of fontes) {
        const linhas = readFileSync(arq, 'utf8').split('\n');
        linhas.forEach((linha, i) => {
          const limpa = linha.trim();
          if (limpa.startsWith('*') || limpa.startsWith('//') || limpa.startsWith('/*')) return;
          if (new RegExp(`\\b${tabela}\\b`).test(linha)) {
            achados.push(`${tabela} aparece em ${arq.replace(raiz + '/', '')}:${i + 1}`);
          }
        });
      }
    }

    expect(achados).toEqual([]);
  });
});
