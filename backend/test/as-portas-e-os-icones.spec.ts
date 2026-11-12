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
import { porOrdemAlfabetica, colunaCurta, irmaQueAbre } from '../../frontend/src/portas';

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
    const mock = readFileSync(join(FRONT, 'mock-casa.ts'), 'utf8');
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
  /*
   * AS FAMÍLIAS DE TELAS IRMÃS (fase 315). A coluna curta do monitor mostra uma
   * entrada por família, e a faixa do alto da tela oferece as irmãs. Se uma porta
   * nomear uma família que não existe, ela some da coluna curta sem erro nenhum:
   * a tela existe, o cargo a alcança, e não há porta. É a armadilha da fase 150,
   * por outro caminho.
   */
  describe('as famílias de telas irmãs', () => {
    const familias = [...portasTs.slice(portasTs.indexOf('export const FAMILIAS'), portasTs.indexOf('export type EntradaDaColuna'))
      .matchAll(/\{ cod: '([a-z_]+)', titulo: '([^']+)', icone: '([a-z_]+)', grupo: '([a-z]+)', principal: '[a-z_]+' \}/g)]
      .map((m) => ({ cod: m[1], titulo: m[2], icone: m[3], grupo: m[4] }));
    const daPorta = (aba: string) => {
      const corpo = portasTs.slice(portasTs.indexOf('export const PORTAS'));
      const bloco = corpo.split('{ aba:').slice(1).find((b) => b.trimStart().startsWith(`'${aba}'`)) ?? '';
      return /familia: '([a-z_]+)'/.exec(bloco.split('},')[0])?.[1] ?? null;
    };

    it('a leitura acha as famílias', () => {
      expect(familias.length).toBeGreaterThanOrEqual(5);
    });

    it('toda família que uma porta nomeia existe, e toda família tem ao menos duas irmãs', () => {
      const cods = new Set(familias.map((f) => f.cod));
      const nomeadas = lista.map((p) => [p.aba, daPorta(p.aba)] as const).filter(([, f]) => f);
      expect(nomeadas.filter(([, f]) => !cods.has(f!))).toEqual([]);
      for (const f of familias) {
        expect([f.cod, nomeadas.filter(([, g]) => g === f.cod).length >= 2]).toEqual([f.cod, true]);
      }
    });

    it('toda família tem desenho que existe e grupo que a coluna desenha', () => {
      const desenhados = new Set(
        [...iconesTsx.matchAll(/^\s{2}([a-z_]+):\s*\[/gm)].map((m) => m[1]));
      const grupos = new Set([...portasTs.matchAll(/\{ cod: '([a-z]+)', titulo: '[^']+' \}/g)].map((m) => m[1]));
      expect(familias.filter((f) => !desenhados.has(f.icone)).map((f) => f.cod)).toEqual([]);
      expect(familias.filter((f) => !grupos.has(f.grupo)).map((f) => f.cod)).toEqual([]);
    });

    it('o nome de uma família não repete o de uma porta de fora dela', () => {
      /* "Saúde" é família e é porta: vale, porque a porta é irmã da família. O que
         não pode é a coluna ter duas entradas com o mesmo nome levando a lugares
         diferentes. */
      const repetidas = familias.filter((f) => lista.some((p) => p.titulo === f.titulo && daPorta(p.aba) !== f.cod));
      expect(repetidas.map((f) => f.titulo)).toEqual([]);
    });

    it('a tela aberta oferece as irmãs, e a troca da forma da coluna fica fora da nav das portas', () => {
      expect(appTsx).toContain('irmasDe(String(abaEfetiva), ve)');
      expect(appTsx).toContain('className="irmas"');
      /* Os ensaios apertam cada botão de `nav.portas-lateral`: o botão que troca a
         forma da coluna mora depois dela. */
      const nav = appTsx.slice(appTsx.indexOf('<nav className={`portas-lateral'), appTsx.indexOf('<div className="menu-modo">'));
      expect(nav).toContain('</nav>');
      expect(nav).not.toContain('guardarMenu(');
    });
  });

  /*
   * A ORDEM ALFABÉTICA DOS MENUS (pedido de 12/11: "dentro do dia a dia poderia
   * ficar de A a Z, pensando na facilidade"). O que esta cobrança guarda é alguém
   * acrescentar uma lista de telas nova ao `App.tsx` e esquecer de ordená-la: a
   * coluna ficaria em ordem numa parte e fora de ordem na outra.
   */
  describe('os menus em ordem alfabética', () => {
    it('a ordem não diferencia acento nem maiúscula, e não muda a lista que recebeu', () => {
      const nomes = ['Saúde', 'ATA', 'Ocorrências', 'acompanhamentos', 'Água'];
      expect(porOrdemAlfabetica(nomes, (n) => n)).toEqual(['acompanhamentos', 'Água', 'ATA', 'Ocorrências', 'Saúde']);
      expect(nomes[0]).toBe('Saúde');
    });

    it('a coluna, os atalhos, a faixa das irmãs e a folha Mais passam pela ordem', () => {
      /* Quatro listas na coluna (os atalhos, a curta e a completa) e na faixa, e a da
         folha Mais: toda vez que o App percorre portas para desenhar menu. */
      expect((appTsx.match(/porOrdemAlfabetica\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
      expect(appTsx).toMatch(/porOrdemAlfabetica\(daFamilia\.irmas/);
      expect(appTsx).toMatch(/porOrdemAlfabetica\(colunaCurta\(ve\)/);
      /* O Guia continua na frente na folha Mais: é o Comece aqui. */
      expect(appTsx).toMatch(/PORTAS\.filter\(\(porta\) => porta\.grupo === 'comeco'\),\s*\.\.\.porOrdemAlfabetica/);
    });

    it('a família abre na tela principal dela, e não na primeira da lista', () => {
      /* Tocar em Saúde na coluna abre a Saúde, e não a Internação hospitalar, que vem
         antes na tabela e no alfabeto. Era assim na primeira versão da coluna curta. */
      const curta = colunaCurta(() => true);
      const abre = (cod: string, guardada?: string) => {
        const e = curta.find((x) => x.tipo === 'familia' && x.familia.cod === cod);
        return e && e.tipo === 'familia' ? irmaQueAbre(e.familia, e.irmas, guardada).aba : null;
      };
      expect(abre('saude')).toBe('saude');
      expect(abre('equipe')).toBe('equipe');
      expect(abre('plantao')).toBe('plantao');
      /* A irmã em que a pessoa esteve por último nesta sessão vem antes da principal. */
      expect(abre('saude', 'internacao')).toBe('internacao');
      /* Quem não alcança a principal abre a primeira irmã de A a Z. */
      const semEquipe = colunaCurta((aba) => aba !== 'equipe').find((x) => x.tipo === 'familia' && x.familia.cod === 'equipe');
      expect(semEquipe && semEquipe.tipo === 'familia'
        ? irmaQueAbre(semEquipe.familia, semEquipe.irmas).aba : null).toBe('alinhamentos');
    });

    it('a tela principal de toda família é uma irmã dela', () => {
      for (const e of colunaCurta(() => true)) {
        if (e.tipo !== 'familia') continue;
        expect([e.familia.cod, e.irmas.some((irma) => irma.aba === e.familia.principal)]).toEqual([e.familia.cod, true]);
      }
    });
  });

  /*
   * A BARREIRA DE ERRO (fase 315). Sem ela, um erro ao desenhar uma tela deixava a
   * página em branco, sem menu e sem Sair. Esta cobrança é estática de propósito:
   * o defeito que ela guarda é alguém tirar a barreira ao mexer no `App.tsx`.
   */
  it('o conteúdo e a raiz têm barreira de erro, e ela não manda o erro a lugar nenhum', () => {
    const barreira = readFileSync(join(FRONT, 'barreira-de-erro.tsx'), 'utf8');
    const main = readFileSync(join(FRONT, 'main.tsx'), 'utf8');
    expect(appTsx).toMatch(/<BarreiraDeErro key=\{String\(abaEfetiva\)\} alcance="tela"/);
    expect(main).toMatch(/<BarreiraDeErro alcance="sistema">\s*<App \/>/);
    expect(barreira).toContain('getDerivedStateFromError');
    const semComentario = barreira.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(/fetch\(|api\(|sendBeacon|XMLHttpRequest/.test(semComentario)).toBe(false);
  });
});
