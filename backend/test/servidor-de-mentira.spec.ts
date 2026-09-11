/**
 * O SERVIDOR DE MENTIRA NÃO PODE APONTAR PARA QUEM NÃO EXISTE.
 *
 * O `mock.ts` é o servidor do protótipo — o único sistema que o Marcelo abre.
 * A regra 14 já dizia metade disto: "o mock precisa responder o que o servidor
 * responde, não o que a tela quer". Esta suíte cobra a OUTRA metade, que custou
 * seis defeitos de uma vez em 10/09/2026 e é pior porque é silenciosa nos dois
 * sentidos — não quebra nada, e ainda ESCONDE entregas que existem:
 *
 *   * `SAIDAS_SOZINHO` indexava por `p3`, e os ids são `p01`…`p20`. O `find`
 *     não achava ninguém, caía no `?? '—'`, e a casa abria com "— · sai
 *     acompanhado · Medida disciplinar combinada com ele na quinta". Um
 *     travessão no lugar do nome, com uma medida disciplinar ao lado;
 *   * o pedido de cesta básica apontava para `p3` com o nome 'Ana Paula
 *     (fictícia)', que não é nenhuma das vinte — e `paraQuem` sai IMPRESSO na
 *     folha que vai para a cozinha;
 *   * o pedido de lanche dizia 'Bruno' com o id do Enzo;
 *   * o histórico do cofre registrava uma abertura excepcional por 'João Gestor
 *     (fictício)', onde o Gestor da casa é o Gilberto;
 *   * a autorização de sair sozinho era decidida por 'Fernanda Alves
 *     (fictícia)', que não está no quadro de ninguém.
 *
 * Nada disso dá erro. `tsc` está feliz: são strings. A suíte está feliz: não
 * toca no frontend. O `ensaio` está feliz: a tela renderiza, escreve coisas, e
 * "—" não é `undefined`. Só a pessoa que abre o protótipo vê.
 *
 * O QUE ESTE CONFERIDOR NÃO FAZ: não sabe se um nome está BONITO, e não cobra
 * quem é de fora. A coordenadora da outra casa numa transferência não pertence
 * ao quadro desta casa de propósito — por isso a cobrança de nome se limita
 * aos campos em que o autor é, necessariamente, gente desta casa.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const MOCK = join(RAIZ, 'frontend', 'src', 'mock.ts');
const APP = join(RAIZ, 'frontend', 'src', 'App.tsx');
const ENSAIOS = ['ensaio-roteiro.mjs', 'ensaio-uso.mjs'];

/**
 * O CÓDIGO SEM OS COMENTÁRIOS — e com os offsets intactos.
 *
 * Cada comentário vira espaço do MESMO tamanho, com as quebras de linha
 * preservadas: as posições e os números de linha continuam sendo os do arquivo
 * de verdade, e a mensagem de erro continua apontando para o lugar certo.
 *
 * Sem isto, a primeira coisa que este conferidor fez foi acusar o comentário
 * que explica o defeito que ele existe para pegar — o texto "estava
 * `personId: 'p3'`" é uma referência a um id que não existe, e é exatamente o
 * que a suíte procura. Um conferidor que proíbe escrever a lição ao lado do
 * conserto ensina a apagar a lição.
 */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, ' '));
}

const mock = semComentarios(readFileSync(MOCK, 'utf8'));

/** Os acolhidos declarados: `id: 'pNN'`. */
function idsDeAcolhido(): Set<string> {
  return new Set([...mock.matchAll(/id: '(p\d+)'/g)].map((m) => m[1]));
}

/** As contas declaradas: `id: 'uNN'`. */
function idsDeUsuario(): Set<string> {
  return new Set([...mock.matchAll(/id: '(u\d+)'/g)].map((m) => m[1]));
}

/**
 * Todo lugar que APONTA para um id, seja como valor (`personId: 'p03'`) ou
 * como CHAVE de um mapa (`p03: [...]`) — que é a forma que escapou, porque
 * chave não parece referência.
 */
function referencias(prefixo: 'p' | 'u'): { id: string; linha: number }[] {
  const out: { id: string; linha: number }[] = [];
  const padroes = [
    new RegExp(`'(${prefixo}\\d+)'`, 'g'),
    new RegExp(`^\\s{2,}(${prefixo}\\d+):`, 'gm'),
  ];
  for (const p of padroes) {
    for (const m of mock.matchAll(p)) {
      out.push({ id: m[1], linha: mock.slice(0, m.index ?? 0).split('\n').length });
    }
  }
  return out;
}

/**
 * Os nomes das pessoas desta casa: as contas (`fullName`) e o quadro
 * (`EQUIPE_CASA`). São as únicas que podem assinar um ato desta casa.
 */
function gentedaCasa(): Set<string> {
  const nomes = new Set([...mock.matchAll(/fullName: '([^']+)'/g)].map((m) => m[1]));
  for (const m of mock.matchAll(/nome: '([^']+)', cargo: '/g)) nomes.add(m[1]);
  return nomes;
}

/**
 * Os campos em que o autor é, por força da regra, gente DESTA casa.
 *
 * `autor` e `pedidaPor` ficam FORA: são as mensagens e os pedidos de
 * transferência, em que a outra ponta é a coordenação da outra casa.
 */
const CAMPOS_DE_AUTORIA_DA_CASA = ['pedidoPor', 'confirmadaPor', 'registradoPor', 'escritoPor',
  /*
   * `quem` entrou depois de a prova mostrar que ele faltava.
   *
   * O histórico do cofre guarda o autor em `quem`, e era LÁ que estava o
   * Gestor fantasma — no único lugar da tela cujo assunto inteiro é quem abriu
   * e para quê. Com a lista sem `quem`, o conferidor passava dizendo "sim"
   * diante do defeito que motivou escrevê-lo. Ele foi visto FALHANDO em cada
   * um dos quatro antes de entrar.
   *
   * `paraQuem` não colide: a inicial é maiúscula, e a busca é sensível a caixa.
   */
  'quem',
  /* `recebidaPor`: quem recebeu a criança na volta da família (fase 89). É
     o nome que a passagem e a ATA mostram ao lado do retorno. */
  'recebidaPor'];

describe('O servidor de mentira do protótipo', () => {
  it('encontra o mock e as declarações de onde a verdade sai', () => {
    // Sem isto o conferidor passaria por não ter lido nada — que é o defeito
    // que ele existe para pegar, na sua própria forma.
    expect(idsDeAcolhido().size).toBeGreaterThan(15);
    expect(idsDeUsuario().size).toBeGreaterThan(5);
    expect(gentedaCasa().size).toBeGreaterThan(5);
    expect(referencias('p').length).toBeGreaterThan(20);
  });

  it('todo id de acolhido que o mock aponta encontra um acolhido', () => {
    const existem = idsDeAcolhido();
    const orfaos = referencias('p')
      .filter((r) => !existem.has(r.id))
      .map((r) => `linha ${r.linha}: '${r.id}' não é de ninguém`);
    expect([...new Set(orfaos)]).toEqual([]);
  });

  it('todo id de conta que o mock aponta encontra uma pessoa', () => {
    const existem = idsDeUsuario();
    const orfaos = referencias('u')
      .filter((r) => !existem.has(r.id))
      .map((r) => `linha ${r.linha}: '${r.id}' não é de ninguém`);
    expect([...new Set(orfaos)]).toEqual([]);
  });

  it('quem assina um ato desta casa é gente desta casa', () => {
    const daCasa = gentedaCasa();
    const erros: string[] = [];
    for (const campo of CAMPOS_DE_AUTORIA_DA_CASA) {
      for (const m of mock.matchAll(new RegExp(`${campo}: '([^']+)'`, 'g'))) {
        const nome = m[1];
        /* Só nomes de PESSOA fictícia: 'Casa toda', 'Educador do plantão
           diurno' e afins são papéis, não gente com conta. */
        if (!/\(fict/.test(nome)) continue;
        if (daCasa.has(nome)) continue;
        const linha = mock.slice(0, m.index ?? 0).split('\n').length;
        erros.push(`linha ${linha}: ${campo} '${nome}' não está no quadro da casa`);
      }
    }
    expect(erros).toEqual([]);
  });

  /**
   * O PROTÓTIPO ABRE COM O RETORNO DA FAMÍLIA À VISTA.
   *
   * A fase 88 entregou o bloco "Experiência familiar neste turno" na Passagem
   * e na ATA, e o bloco some quando não há nada a mostrar — o que está certo
   * no sistema. No servidor de mentira a lista nascia VAZIA: o `ensaio` e o
   * `ensaio:acessibilidade` passaram verdes sem nunca desenhar o bloco, e o
   * Marcelo abria o arquivo sem ver a entrega. Foi a verificação da fase 88
   * que achou, na fase 89.
   *
   * A regra geral — bloco que some quando vazio precisa de dado no servidor
   * de mentira — não cabe numa expressão regular. Esta cobra o caso que
   * aconteceu, e fica como o exemplo a copiar no próximo bloco assim.
   */
  it('o protótipo abre com um retorno da família para a passagem mostrar', () => {
    const inicio = mock.indexOf('const CONVIVENCIAS');
    expect(inicio).toBeGreaterThan(0);
    const declaracao = mock.slice(inicio, mock.indexOf('];', inicio) + 2);
    expect(declaracao).not.toMatch(/\}\[\]\s*=\s*\[\s*\];$/);
    expect(declaracao).toMatch(/=\s*\[\s*\S/);
  });

  /**
   * OS ENSAIOS NÃO PODEM ESCOLHER UM CARGO QUE O SELETOR NÃO OFERECE.
   *
   * A fase 83 tirou a Cozinha do "Ver como" e ninguém tirou dos roteiros. O
   * `selectOption('cozinha')` passou a estourar, e os DOIS ensaios que apertam
   * botão morreram: o `ensaio:uso` no bloco 7 de 13 — 59 das 114 cobranças
   * deixaram de rodar, e as fases 84, 85 e 86 foram construídas assim —, e o
   * `ensaio:roteiro` na sua última tarefa.
   *
   * Eles morreram com EXCEÇÃO DO NODE, não com achado. Um ensaio que estoura
   * não é ouvido do mesmo jeito que um que reclama: no terminal parece
   * problema de ambiente, e o `npx jest` continuava verde ao lado.
   *
   * O `numeros-da-documentacao.spec` guarda QUANTAS tarefas o roteiro tem. Não
   * guardava se elas ainda alcançam alguém.
   */
  it('todo cargo que os ensaios escolhem existe no seletor do protótipo', () => {
    /* Sem comentários também aqui: o bloco do seletor guarda, comentada, a
       explicação de que a Cozinha saiu — e a palavra `cozinha` aparece lá
       dentro. Um conferidor que lesse o comentário concluiria que o cargo
       continua oferecido, e passaria justamente no caso que ele existe para
       pegar. */
    const app = semComentarios(readFileSync(APP, 'utf8'));
    const bloco = app.slice(app.indexOf('const CARGOS_DEMO'), app.indexOf('function TrocaCargo'));
    const oferecidos = new Set([...bloco.matchAll(/value: '([a-z_]+)'/g)].map((m) => m[1]));
    expect(oferecidos.size).toBeGreaterThan(5);

    const erros: string[] = [];
    for (const arq of ENSAIOS) {
      const src = readFileSync(join(RAIZ, 'frontend', arq), 'utf8');
      const pedidos = [
        ...[...src.matchAll(/^\s{4}cargo: '([a-z_]+)'/gm)].map((m) => m[1]),
        ...[...src.matchAll(/(?:trocar|trocarCargo)\('([a-z_]+)'\)/g)].map((m) => m[1]),
      ];
      expect(pedidos.length).toBeGreaterThan(3);
      for (const cargo of new Set(pedidos)) {
        if (!oferecidos.has(cargo)) erros.push(`${arq}: escolhe '${cargo}', que saiu do seletor`);
      }
    }
    expect(erros).toEqual([]);
  });
});
