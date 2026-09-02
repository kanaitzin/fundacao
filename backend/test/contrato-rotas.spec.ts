/**
 * CONTRATO DE ROTAS — a tela e o servidor falam a mesma língua.
 *
 * Em 31/08/2026 este teste não existia, e o preço apareceu de uma vez: 28 das
 * 78 chamadas do frontend não tinham par no backend. Sete telas inteiras
 * funcionavam no protótipo e teriam falhado contra o servidor de verdade,
 * porque o `mock.ts` havia sido escrito para a tela, e não para o contrato.
 *
 * Três tipos de erro que só uma máquina pega:
 *
 *  1. a rota simplesmente não existe (`/health/panel`, `/vault`, `/minutes`);
 *  2. a rota existe com OUTRO VERBO — `api('/transfers')` é GET, e o servidor
 *     só tem `POST /transfers`. A leitura devolveria 404 em produção e passa
 *     despercebida em qualquer revisão de olho;
 *  3. a rota casa por CURINGA: `/incidents/categories` bate em
 *     `GET /incidents/:id`, e o servidor tenta ler "categories" como um id.
 *     Essa é a pior, porque não é 404 — é uma falha silenciosa que só aparece
 *     na casa, às onze da noite.
 *
 * O teste não roda o servidor: lê os decoradores dos controllers e as chamadas
 * `api(...)` das telas. É estático de propósito — precisa falhar no `npm test`
 * de quem mexeu, não numa integração que ninguém roda antes de entregar.
 *
 * Quando este teste falhar, a correção é quase sempre na TELA: o servidor é
 * quem tem RLS, auditoria e as recusas por cargo. Mudar a rota do servidor
 * para agradar a tela costuma ser o caminho errado.
 *
 * COROLÁRIO PRÁTICO: escreva a rota por extenso. `/notifications/${id}/${acao}`
 * e `/x${cond ? '?a=1' : ''}` escondem qual rota está sendo chamada — do
 * verificador e de quem lê. Duas linhas explícitas custam menos que um 404 na
 * casa às onze da noite.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');
const FRONT = join(__dirname, '..', '..', 'frontend', 'src');

/** Chamadas do protótipo que não têm — nem devem ter — par no servidor. */
const SO_DO_PROTOTIPO = new Set([
  // Troca de cargo do protótipo navegável: o sistema real não deixa ninguém
  // "ver como" outra pessoa. Vive só no mock.
  'POST /prototipo/cargo',
]);

interface Rota { verbo: string; caminho: string }
interface Chamada extends Rota { arquivo: string }

function arquivos(dir: string, filtro: (f: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...arquivos(p, filtro));
    else if (filtro(entry)) out.push(p);
  }
  return out;
}

/**
 * Rotas servidas. Um arquivo pode ter VÁRIOS `@Controller` — foi assim que a
 * primeira versão desta verificação errou, lendo só o primeiro de
 * `people.controller.ts` e acusando de inexistentes rotas que existiam.
 */
function rotasDoServidor(): Rota[] {
  const out: Rota[] = [];
  for (const arq of arquivos(SRC, (f) => f.endsWith('.controller.ts'))) {
    const src = readFileSync(arq, 'utf8');
    const blocos = [...src.matchAll(/@Controller\(\s*'([^']*)'/g)]
      .map((m) => ({ pos: m.index ?? 0, base: m[1] }));
    blocos.forEach((b, i) => {
      const fim = i + 1 < blocos.length ? blocos[i + 1].pos : src.length;
      const trecho = src.slice(b.pos, fim);
      for (const m of trecho.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
        const sub = m[2] ?? '';
        out.push({
          verbo: m[1].toUpperCase(),
          caminho: '/' + [b.base, sub].filter(Boolean).join('/'),
        });
      }
    });
  }
  return out;
}

/**
 * Chamadas das telas. O `mock.ts` fica de fora: ele é o servidor de mentira, e
 * quem precisa casar com o servidor de verdade é a TELA. O método vem do
 * `init` da chamada; sem `method`, é GET.
 */
function chamadasDoFrontend(): Chamada[] {
  const out: Chamada[] = [];
  const alvos = arquivos(FRONT, (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && f !== 'mock.ts');
  for (const arq of alvos) {
    const src = readFileSync(arq, 'utf8');
    // O trecho seguinte entra por LOOKAHEAD, de propósito: capturando-o de
    // verdade, o `matchAll` avançava por cima das chamadas vizinhas e três
    // rotas erradas viravam uma só encontrada. A janela também para na próxima
    // chamada `api(`, para não herdar o método dela.
    for (const m of src.matchAll(/api(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)[`'"](?=([\s\S]{0,300}))/g)) {
      // A ordem importa: o `${...}` vira `:x` ANTES de cortar a query string.
      // Ao contrário, `/shifts/ata/${ata?.id}/close` era cortado no `?` do
      // encadeamento opcional e virava `/shifts/ata/${ata` — uma rota que não
      // existe em lugar nenhum, acusada por um teste que estava errado.
      const bruto = m[1].replace(/\$\{[^}]*\}/g, ':x').split('?')[0];
      if (!bruto.startsWith('/')) continue;
      const janela = m[2].split(/\bapi[<(]/)[0].split(';')[0];
      const verbo = /method:\s*'(\w+)'/.exec(janela)?.[1]?.toUpperCase() ?? 'GET';
      out.push({
        verbo,
        caminho: bruto,
        arquivo: arq.slice(arq.indexOf('frontend')),
      });
    }
  }
  return out;
}

const partes = (r: string) => r.replace(/^\/|\/$/g, '').split('/');

/** Casa a chamada com uma rota do servidor, dizendo COMO casou. */
function conferir(chamada: Chamada, rotas: Rota[]): 'ok' | 'verbo' | 'curinga' | 'inexistente' {
  const c = partes(chamada.caminho);
  let melhor: 'verbo' | 'curinga' | 'inexistente' = 'inexistente';
  for (const rota of rotas) {
    const r = partes(rota.caminho);
    if (r.length !== c.length) continue;
    if (!r.every((seg, i) => seg.startsWith(':') || seg === c[i])) continue;
    // Curinga sobre palavra literal: `/incidents/categories` caindo em
    // `/incidents/:id`. O servidor responde, e responde errado.
    const engoliu = r.some((seg, i) => seg.startsWith(':') && !c[i].startsWith(':'));
    if (!engoliu && rota.verbo === chamada.verbo) return 'ok';
    if (!engoliu) melhor = melhor === 'inexistente' ? 'verbo' : melhor;
    else if (melhor === 'inexistente') melhor = 'curinga';
  }
  return melhor;
}

describe('Contrato de rotas entre a tela e o servidor', () => {
  const rotas = rotasDoServidor();
  const chamadas = chamadasDoFrontend();

  it('encontra os dois lados do contrato', () => {
    // Guarda contra o próprio teste passar por não ter lido nada.
    expect(rotas.length).toBeGreaterThan(100);
    expect(chamadas.length).toBeGreaterThan(50);
  });

  it('toda chamada da tela existe no servidor, com o mesmo verbo', () => {
    const problemas = chamadas
      .filter((c) => !SO_DO_PROTOTIPO.has(`${c.verbo} ${c.caminho}`))
      .map((c) => ({ c, r: conferir(c, rotas) }))
      .filter((x) => x.r !== 'ok')
      .map(({ c, r }) => {
        const porque = r === 'verbo'
          ? 'existe com OUTRO verbo'
          : r === 'curinga'
            ? 'casa com um :param do servidor — a palavra viraria um id, e a falha é silenciosa'
            : 'não existe';
        return `${c.verbo} ${c.caminho} — ${porque} (${c.arquivo})`;
      });

    expect(problemas).toEqual([]);
  });

  it('nenhuma rota entra no api() escondida dentro de uma variável', () => {
    /*
     * O corolário do cabeçalho deixou de ser conselho e virou verificação, no
     * dia em que ele se provou sozinho: `api(rota, ...)`, com `rota` escolhida
     * num ternário acima, escondia quatro rotas do conferidor —
     * `/transfers/:id/accept` e `/decline` (aceitar ou recusar a mudança de
     * casa de uma criança) e o fechamento das duas ATAs. Estavam certas; o
     * ponto é que ninguém estava conferindo, e o teste passava dizendo que
     * sim. Duas linhas explícitas custam menos que isso.
     */
    const suspeitas: string[] = [];
    /*
     * O `api.ts` fica de fora, e só ele: é o cliente HTTP, onde a rota é
     * variável POR DEFINIÇÃO — `api(path, init)` recebendo o `path` de quem
     * chamou. Incluí-lo faria o teste acusar exatamente o lugar onde a rota
     * não pode estar escrita por extenso, e a saída seria desligar a regra
     * para todo mundo. Quem esconde rota do conferidor é a TELA, e as telas
     * continuam todas aqui dentro.
     */
    const alvos = arquivos(FRONT, (f) =>
      (f.endsWith('.ts') || f.endsWith('.tsx')) && f !== 'mock.ts' && f !== 'api.ts');
    /*
     * O COMENTÁRIO NÃO É CÓDIGO — e este conferidor já acusou um.
     *
     * Um comentário que explicava por que `api(rotaExport)` era errado foi
     * lido como a própria chamada, e o teste reprovou a documentação da
     * correção que ele mesmo tinha exigido. Comentário some antes da varredura:
     * um conferidor que pune quem escreve sobre o defeito ensina a não
     * escrever sobre o defeito.
     */
    const semComentarios = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

    for (const arq of alvos) {
      const src = semComentarios(readFileSync(arq, 'utf8'));
      for (const m of src.matchAll(/\bapi(?:<[^>]*>)?\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g)) {
        suspeitas.push(`${m[0].trim()} — rota em variável (${arq.slice(arq.indexOf('frontend'))})`);
      }
    }
    expect(suspeitas).toEqual([]);
  });

  it('o servidor de mentira responde às mesmas rotas que a tela chama', () => {
    // O protótipo é o aplicativo com outra fonte de dados. Se a tela chama uma
    // rota que o mock não conhece, a demonstração quebra na frente da equipe —
    // e, pior, uma rota que só o mock atende esconde uma tela sem servidor.
    const mock = readFileSync(join(FRONT, 'mock.ts'), 'utf8');
    const semResposta = chamadas
      .map((c) => c.caminho)
      .filter((caminho, i, todos) => todos.indexOf(caminho) === i)
      .filter((caminho) => {
        const segs = partes(caminho);
        // Basta o mock citar o primeiro segmento fixo e o último não-parâmetro:
        // o roteador dele decide por segmento, não pela rota inteira.
        const fixos = segs.filter((s) => !s.startsWith(':'));
        return !fixos.every((f) => mock.includes(`'${f}'`) || mock.includes(`/${f}`));
      });

    expect(semResposta).toEqual([]);
  });
});
