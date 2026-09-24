/**
 * AS PORTAS DO SISTEMA, E OS DESENHOS DELAS (fase 150).
 *
 * A fase 150 juntou numa tabela só (`frontend/src/portas.ts`) o que existia em
 * DOIS lugares: um vetor de chaves dizia quais telas o cargo alcança, e vinte e
 * cinco blocos escritos à mão diziam como cada uma se chama. *Medido ao juntar:
 * as duas discordavam* — a rotina da casa e a escala de plantão estavam na
 * folha e fora da contagem.
 *
 * Uma tabela só resolve a divergência de HOJE. Este conferidor é o que impede a
 * de amanhã, e ele cobra quatro coisas que só se percebem quando já quebraram:
 *
 *  1. **toda porta tem desenho.** Nome de ícone errado não dá erro nenhum — o
 *     `Icone` devolve nada de propósito, para uma tela não cair por causa de um
 *     desenho —, e a porta fica com a palavra e um buraco ao lado. Num menu de
 *     vinte e cinco linhas, ninguém nota a que está sem;
 *  2. **toda porta tem título e uma frase.** A frase é o que distingue "Painel
 *     do plantão" de "Painel das unidades" para quem abre o menu com pressa;
 *  3. **nenhuma porta aponta para tela que não existe.** A chave é a mesma do
 *     `setAba` e do `alcanca()`: errar aqui é um item de menu que não abre nada;
 *  4. **nenhum grupo da barra lateral fica órfão.** Porta num grupo que a barra
 *     não desenha é porta que só existe no celular, e ninguém descobriria.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FRONT = join(__dirname, '..', '..', 'frontend', 'src');
const portasTs = readFileSync(join(FRONT, 'portas.ts'), 'utf8');
const iconesTsx = readFileSync(join(FRONT, 'icones.tsx'), 'utf8');
const appTsx = readFileSync(join(FRONT, 'App.tsx'), 'utf8');

interface Porta { aba: string; icone: string; grupo: string; titulo: string; descricao: string }

/** Lê a tabela do arquivo, e não de um `import`: o teste é do BACKEND, e o
    `tsconfig` dele não alcança o `frontend/`. É a mesma leitura que o
    `contrato-rotas.spec.ts` faz das telas desde a fase 100. */
function portas(): Porta[] {
  const corpo = portasTs.slice(portasTs.indexOf('export const PORTAS'));
  const campo = (bloco: string, nome: string) =>
    new RegExp(`${nome}: '((?:[^'\\\\]|\\\\.)*)'`).exec(bloco)?.[1] ?? '';
  return corpo.split('{ aba:').slice(1).map((bruto) => {
    const bloco = `{ aba:${bruto.split('},')[0]}`;
    return {
      aba: campo(bloco, 'aba'), icone: campo(bloco, 'icone'), grupo: campo(bloco, 'grupo'),
      titulo: campo(bloco, 'titulo'), descricao: campo(bloco, 'descricao'),
    };
  });
}

describe('As portas do sistema e os desenhos delas', () => {
  const lista = portas();

  it('a leitura acha a tabela — senão o conferidor passa por não olhar', () => {
    expect(lista.length).toBeGreaterThan(20);
    expect(lista.every((p) => p.aba)).toBe(true);
  });

  it('toda porta tem um desenho que existe', () => {
    const desenhados = new Set(
      [...iconesTsx.matchAll(/^\s{2}([a-z_]+):\s*\[/gm)].map((m) => m[1]));
    expect(desenhados.size).toBeGreaterThan(25);
    const sem = lista.filter((p) => !desenhados.has(p.icone))
      .map((p) => `${p.aba} pede o ícone "${p.icone}", que não existe`);
    expect(sem).toEqual([]);
  });

  it('as cinco abas do turno também têm desenho', () => {
    const desenhados = new Set(
      [...iconesTsx.matchAll(/^\s{2}([a-z_]+):\s*\[/gm)].map((m) => m[1]));
    const doTurno = [...appTsx.matchAll(/\{ aba: '[a-z_]+', icone: '([a-z_]+)'/g)].map((m) => m[1]);
    expect(doTurno.length).toBe(5);
    expect(doTurno.filter((i) => !desenhados.has(i))).toEqual([]);
  });

  it('toda porta tem título e a frase que a distingue da vizinha', () => {
    const magras = lista
      .filter((p) => p.titulo.length < 3 || p.descricao.length < 15)
      .map((p) => p.aba);
    expect(magras).toEqual([]);
    /* E nenhum título repetido: duas linhas com o mesmo nome no menu é o
       usuário escolhendo no par ou ímpar. */
    const vistos = lista.map((p) => p.titulo);
    expect(vistos.length).toBe(new Set(vistos).size);
  });

  it('nenhuma porta aponta para tela que o App não conhece', () => {
    /*
     * A CHAVE TEM DE ESTAR NO TIPO DA ABA, e não num `setAba('x')` escrito.
     *
     * Era o `setAba` na primeira versão desta conferência, e ela reprovou nas
     * vinte e cinco: depois da fase 150 o clique é `setAba(porta.aba)`, uma
     * linha só para todas — que é justamente o ponto de haver uma tabela. O que
     * continua nomeando cada tela é a união de tipos do `useState`, e é ela que
     * o TypeScript cobra quando alguém escreve uma chave que não existe.
     */
    const uniao = appTsx.slice(appTsx.indexOf('const [aba, setAba] = useState<'));
    const abas = new Set(
      [...uniao.slice(0, uniao.indexOf('>(null)')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    expect(abas.size).toBeGreaterThan(25);
    const orfas = lista.filter((p) => !abas.has(p.aba)).map((p) => p.aba);
    expect(orfas).toEqual([]);
  });

  it('todo grupo usado existe na barra lateral', () => {
    const grupos = new Set(
      [...portasTs.matchAll(/\{ cod: '([a-z]+)', titulo:/g)].map((m) => m[1]));
    expect(grupos.size).toBeGreaterThan(2);
    const fora = [...new Set(lista.map((p) => p.grupo))].filter((g) => !grupos.has(g));
    expect(fora).toEqual([]);
  });

  it('NENHUMA tela tem emoji — o desenho é o padrão do sistema inteiro (fase 151)', () => {
    /*
     * A 150 guardou a MOLDURA; esta guarda as TELAS, e a diferença é 107
     * ocorrências em vinte arquivos: o remédio do botão "Remédios", o lápis do
     * "Relato", o cadeado do cofre, a bandeja da cozinha.
     *
     * A razão é a mesma e não é gosto: emoji muda de desenho conforme o
     * aparelho, não herda a cor do tema e diz coisas que ninguém escolheu. E a
     * razão de ser CONFERIDOR é que a volta é fácil — escrever um emoji custa
     * um toque, e ninguém repara numa tela entre trinta e seis.
     *
     * Os COMENTÁRIOS ficam de fora (a lição da 150: proibir a palavra no texto
     * que explica a proibição é como se apaga a explicação), e o `mock.ts`
     * também é conferido: ele é dado que a tela desenha.
     */
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    const semComentario = (fonte: string) => fonte
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const cheio = join(dir, e.name);
        if (e.isDirectory()) varrer(cheio);
        else if (/\.tsx?$/.test(e.name)) arquivos.push(cheio);
      }
    };
    varrer(FRONT);
    expect(arquivos.length).toBeGreaterThan(30);
    const comEmoji = arquivos
      .filter((a) => emoji.test(semComentario(readFileSync(a, 'utf8'))))
      .map((a) => a.slice(FRONT.length + 1));
    expect(comEmoji).toEqual([]);
  });

  it('o ícone do marco de vida é o MESMO no servidor e no protótipo', () => {
    /*
     * REGRA 14, e ela pegou esta fase no flagrante: o ícone de cada conquista
     * (passou de ano, primeiro emprego) vem do SERVIDOR, e o `mock.ts` o
     * espelha. Trocar emoji por desenho num lado só faria a tela desenhar certo
     * no protótipo que o Marcelo abre e errado no sistema de verdade — que é o
     * pior jeito de errar, porque a demonstração fica bonita.
     */
    const doServidor = readFileSync(
      join(__dirname, '..', 'src', 'modules', 'reports', 'impacto.service.ts'), 'utf8');
    const mock = readFileSync(join(FRONT, 'mock.ts'), 'utf8');
    const marcos = (fonte: string) =>
      [...fonte.matchAll(/cod: '([a-z_]+)', label: '[^']*', icone: '([a-z_]+)'/g)]
        .map((m) => `${m[1]}=${m[2]}`);
    const dele = marcos(doServidor);
    expect(dele.length).toBeGreaterThan(10);
    expect(marcos(mock)).toEqual(dele);
  });

  it('a navegação não voltou a ter emoji — o desenho é o padrão agora', () => {
    /* Faixas de emoji. A tela pode ter emoji em CONTEÚDO escrito por gente; o
       que esta cobrança impede é o emoji voltar para a MOLDURA, que é onde ele
       muda de cara conforme o aparelho de quem abre. */
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    /*
     * SEM OS COMENTÁRIOS, e isto foi a própria conferência me corrigindo: ela
     * reprovou na primeira rodada por causa do comentário do `icones.tsx` que
     * EXPLICA por que os emoji saíram — ele cita o 🧒 e o 🚨 para dizer o que
     * cada um significava de errado. Proibir a palavra no texto que explica a
     * proibição é a forma mais boba de um conferidor virar estorvo: quem
     * tropeçasse nele apagaria a explicação, que é a parte que vale.
     */
    const semComentario = (fonte: string) => fonte
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    for (const [nome, fonte] of [['portas.ts', portasTs], ['icones.tsx', iconesTsx],
                                 ['App.tsx', appTsx]] as [string, string][]) {
      expect([nome, emoji.test(semComentario(fonte))]).toEqual([nome, false]);
    }
  });
});
