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
