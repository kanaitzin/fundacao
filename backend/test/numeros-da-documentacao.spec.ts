/**
 * OS NÚMEROS DA DOCUMENTAÇÃO NÃO ENVELHECEM EM SILÊNCIO.
 *
 * O `documentacao.spec` cobra que toda tabela apareça no `der.md`. Este cobra
 * a outra família de dado que apodrece sozinha: os NÚMEROS que os documentos
 * de retomada afirmam — migrações, tabelas, suítes, testes, telas e o tamanho
 * do protótipo.
 *
 * Ele existe por causa de 08/09/2026. Numa leitura dos três documentos vivos
 * contra o código, seis afirmações estavam erradas ao mesmo tempo: o
 * `RETOMAR-AQUI` dizia que o Jest roda 72 migrações (são 78), o
 * `implantacao.md` dizia 76 no mesmo parágrafo em que dizia 78, os dois
 * contavam 32 telas onde há 30, um dizia "quinze rodadas limpas" e o outro
 * "treze", o protótipo estava anunciado com 830 KB num documento e 890 KB no
 * outro (tem ≈900), e ambos diziam "20 rotas sem porta" onde a lista de
 * exceções do `rotas-sem-porta.spec` tem 14.
 *
 * Nenhum deles quebra nada. É pior do que quebrar: quem lê o documento para
 * retomar o projeto começa com seis crenças falsas, e a primeira coisa que
 * aprende é a não confiar no arquivo inteiro — que é exatamente o que o
 * `.env.example` já tinha ensinado sobre chave que não faz nada.
 *
 * O QUE ELE NÃO FAZ: não cobra prosa, não cobra data e não cobra os números
 * que só um ensaio de navegador sabe (quantas telas cada cargo alcança) —
 * esses são medidos rodando, e o documento diz de qual ensaio vieram.
 *
 * Quando falhar, a correção NÃO é ajustar o regex: é corrigir o documento,
 * ou entender por que o código mudou de tamanho sem ninguém contar.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const MODULES = join(__dirname, '..', 'src', 'modules');
const TEST = __dirname;
const DOCS = join(RAIZ, 'docs');

/** Os três documentos VIVOS — os que alguém lê para retomar ou para implantar. */
const DOCUMENTOS = ['RETOMAR-AQUI.md', 'PROMPT-MESTRE.md', 'implantacao.md'];

/*
 * O `CONTINUIDADE.md` e o `backlog.md` ficam de fora de propósito: eles são
 * registro histórico, e a frase "107 telas em 02/09" continua verdadeira
 * depois de a tela 108 nascer. Reescrever história para o teste passar seria
 * apagar o que cada fase encontrou.
 */

function arquivosSql(): string[] {
  const out: string[] = [];
  for (const mod of readdirSync(MODULES)) {
    const dir = join(MODULES, mod, 'migrations');
    if (!existsSync(dir)) continue;
    out.push(...readdirSync(dir).filter((f) => f.endsWith('.sql')));
  }
  return out;
}

function tabelasCriadas(): string[] {
  const out: string[] = [];
  for (const mod of readdirSync(MODULES)) {
    const dir = join(MODULES, mod, 'migrations');
    if (!existsSync(dir)) continue;
    for (const arq of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(dir, arq), 'utf8');
      for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/g)) {
        if (!out.includes(m[1])) out.push(m[1]);
      }
    }
  }
  return out;
}

function suites(): string[] {
  return readdirSync(TEST).filter((f) => f.endsWith('.spec.ts'));
}

/**
 * Conta os testes do mesmo jeito que o Jest os conta hoje: uma linha que abre
 * `it(` ou `test(`. Se alguém trouxer `it.each`, este número passa a divergir
 * do relatório do Jest — e o certo então é ensinar a contagem, não afrouxar a
 * cobrança.
 */
function testes(): number {
  let n = 0;
  for (const arq of suites()) {
    const src = readFileSync(join(TEST, arq), 'utf8');
    n += (src.match(/^\s*(?:it|test)\(/gm) ?? []).length;
  }
  return n;
}

function telas(): string[] {
  return readdirSync(join(RAIZ, 'frontend', 'src', 'screens')).filter((f) => f.endsWith('.tsx'));
}

/** As rotas declaradas como "de máquina" — é a lista que diz quantas ficaram sem porta. */
function rotasSemPorta(): number {
  const src = readFileSync(join(TEST, 'rotas-sem-porta.spec.ts'), 'utf8');
  const bloco = src.slice(src.indexOf('SEM_TELA_DE_PROPOSITO'), src.indexOf('describe('));
  return (bloco.match(/^\s*'(?:GET|POST|PUT|PATCH|DELETE) [^']+':/gm) ?? []).length;
}

function protótipoEmKB(): number {
  const arq = join(RAIZ, 'prototipo', 'rede-acolher-prototipo.html');
  return Math.round(statSync(arq).size / 1024);
}

/** Cada afirmação numérica dos documentos vivos, e de onde sai a verdade dela. */
function conferir(padrao: RegExp, esperado: number): string[] {
  const erros: string[] = [];
  for (const doc of DOCUMENTOS) {
    const texto = readFileSync(join(DOCS, doc), 'utf8');
    for (const m of texto.matchAll(padrao)) {
      const dito = Number(m[1].replace(/[^\d]/g, ''));
      if (dito !== esperado) {
        erros.push(`${doc}: diz "${m[0].trim()}" — são ${esperado}`);
      }
    }
  }
  return erros;
}

describe('Os números da documentação', () => {
  it('encontra o código de onde os números saem', () => {
    // Sem isto, o teste passaria por não ter lido nada.
    expect(arquivosSql().length).toBeGreaterThan(70);
    expect(tabelasCriadas().length).toBeGreaterThan(70);
    expect(suites().length).toBeGreaterThan(40);
    expect(telas().length).toBeGreaterThan(20);
    expect(rotasSemPorta()).toBeGreaterThan(5);
  });

  it('as migrações', () => {
    expect(conferir(/(\d+) migrações/g, arquivosSql().length)).toEqual([]);
  });

  it('as tabelas', () => {
    expect(conferir(/(\d+) tabelas/g, tabelasCriadas().length)).toEqual([]);
  });

  it('as suítes', () => {
    expect(conferir(/(\d+) suítes/g, suites().length)).toEqual([]);
  });

  it('os testes', () => {
    expect(conferir(/(\d+) testes/g, testes())).toEqual([]);
  });

  it('as telas', () => {
    // "telas React" e não "telas": o ensaio conta VISITAS por cargo, que é
    // outro número e vive na mesma página.
    expect(conferir(/(\d+) telas React/g, telas().length)).toEqual([]);
  });

  it('as rotas sem porta', () => {
    expect(conferir(/(\d+) rotas sem porta/g, rotasSemPorta())).toEqual([]);
  });

  it('o tamanho do protótipo', () => {
    /*
     * O til e o ≈ são o marcador: o documento escreve "≈900 KB" para o
     * protótipo, e "+300 KB" para o custo das fontes — que não é tamanho de
     * arquivo nenhum e por isso não entra aqui.
     */
    const real = protótipoEmKB();
    const erros: string[] = [];
    for (const doc of DOCUMENTOS) {
      const texto = readFileSync(join(DOCS, doc), 'utf8');
      for (const m of texto.matchAll(/[~≈] ?(\d{3,4}) KB/g)) {
        const dito = Number(m[1]);
        // 40 KB de folga: o número é redondo de propósito, e uma tela nova
        // não deve obrigar a reescrever dois documentos.
        if (Math.abs(dito - real) > 40) {
          erros.push(`${doc}: diz "${m[0]}" — o arquivo tem ${real} KB`);
        }
      }
    }
    expect(erros).toEqual([]);
  });

  it('o protótipo entregue é o que o repositório gera', () => {
    /*
     * O arquivo do `prototipo/` é o que vai para a mão do Marcelo. Se ele
     * ficar para trás do código, a demonstração ensaia um sistema que não
     * existe — que é a regra 14 em outra forma. Aqui só se cobra que ele
     * exista e não esteja vazio; provar que está em dia é `npm run prototipo`.
     */
    expect(protótipoEmKB()).toBeGreaterThan(500);
  });
});
