/**
 * AS FERRAMENTAS DA ACOLHE+AI (fase 192). Não importa nada: o servidor as
 * entrega ao modelo, e a TELA, que é quem as executa, lê a mesma lista
 * (como o `implantacao.regra.ts` e o `o-que-mudou.regra.ts`).
 *
 * POR QUE É A TELA QUE EXECUTA. A assistente age com o acesso de quem fala com
 * ela, e o jeito de garantir isso sem uma segunda conferência de permissão é
 * ela não ter caminho próprio até o dado: toda leitura sai da tela da pessoa,
 * pelas mesmas rotas e com a mesma sessão de qualquer outra tela. O que o cargo
 * não vê, a assistente não vê. O servidor só guarda a chave do modelo.
 *
 * CINCO TIPOS:
 *  - LER (`consultar_sistema`, `ver_tela`): um GET numa rota do catálogo, ou o
 *    que está na tela aberta, sem pedir licença, porque é o que a pessoa já
 *    poderia abrir ou já está vendo;
 *  - IR (`abrir_tela`): leva a pessoa à tela, quando ela pediu para ir;
 *  - MEXER NA TELA (`preencher_campo`, `apertar_botao`, fase 193): só depois de
 *    a pessoa DEIXAR, uma vez por conversa. A Acolhe+AI abre o formulário e
 *    escreve nos campos à vista, e NUNCA salva: o botão de salvar é da pessoa,
 *    que confere, muda o que quiser e salva. Botão só se aperta se a tela o
 *    marcou como de abrir (`data-acolhe-abre`) ou se é uma aba (`role="tab"`):
 *    o nome do botão não diz se ele grava ("Abrir ocorrência e avisar" grava);
 *  - CONTAR (`calcular`, `montar_tabela`, fase 193): a conta exata e a tabela
 *    para apresentar, com a planilha para baixar;
 *  - PROPOR (`propor_*`): NUNCA grava. Vira um cartão com o que será feito, e
 *    só a pessoa, apertando Confirmar, faz a gravação, em nome dela.
 *
 * FERRAMENTA NOVA: escreva aqui, execute no `acolhe.tsx`, explique no
 * `guia.ts` e ponha no teste. O `a-acolhe-conhece-o-sistema.spec.ts` reprova
 * a que faltar num dos três.
 */

/** As rotas de leitura que a assistente pode pedir. Prefixo de caminho, só GET. */
export const ROTAS_DE_LEITURA: readonly string[] = [
  '/people', '/houses', '/timeline', '/activities', '/medications', '/nursing',
  '/incidents', '/shifts', '/reports', '/escala', '/notifications', '/alignments',
  '/checks', '/routine', '/staff', '/followups', '/statements', '/transfers',
  '/impacto', '/implantacao', '/assistente/sugestoes',
];

/** As que mexem na tela: pedem licença à pessoa, uma vez por conversa. */
export const MEXEM_NA_TELA: readonly string[] = ['preencher_campo', 'apertar_botao'];

/** Arquivos e folhas não são JSON: a assistente não os lê por rota. */
export const LEITURA_PROIBIDA = /\/(folha|export|file|photos?|foto|anexo|comprovante)(\/|\?|$)/;

export function rotaDeLeituraPermitida(rota: string): boolean {
  if (typeof rota !== 'string' || !rota.startsWith('/') || rota.length > 400) return false;
  if (rota.includes('..') || /\s/.test(rota)) return false;
  if (LEITURA_PROIBIDA.test(rota)) return false;
  const caminho = rota.split('?')[0];
  return ROTAS_DE_LEITURA.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

/** As chaves do dossiê que a assistente pode propor ao anexar (as do catálogo). */
export const FERRAMENTAS = [
  {
    name: 'consultar_sistema',
    description:
      'Lê dados do sistema com o acesso de quem está conversando, por uma rota GET do catálogo '
      + '(veja "As rotas que você pode ler" no sistema). Devolve o JSON da resposta, ou o erro que a '
      + 'tela receberia (403 quando o cargo não alcança, 404 quando não existe). Use antes de afirmar '
      + 'qualquer coisa sobre crianças, doses, plantões ou registros. Nunca invente dado.',
    input_schema: {
      type: 'object',
      properties: {
        rota: { type: 'string', description: 'Caminho começando por /, com a consulta. Ex.: /people?houseId=...' },
        motivo: { type: 'string', description: 'Em poucas palavras, para que você está lendo (aparece para a pessoa).' },
      },
      required: ['rota', 'motivo'],
      additionalProperties: false,
    },
  },
  {
    name: 'abrir_tela',
    description:
      'Leva a pessoa a uma tela do sistema, AGORA. Use só quando ela pediu para ir ("me leva", "abre", '
      + '"vai para"). Para só mostrar o caminho, escreva um link [texto](tela:chave) na resposta. '
      + 'A chave tem de ser uma das telas que a pessoa alcança (lista no contexto).',
    input_schema: {
      type: 'object',
      properties: {
        tela: { type: 'string', description: 'A chave da tela, da lista de telas que a pessoa alcança.' },
        pessoaId: { type: 'string', description: 'Opcional: abre o perfil desta criança (tela acolhidos).' },
      },
      required: ['tela'],
      additionalProperties: false,
    },
  },
  {
    name: 'ver_tela',
    description:
      'Mostra o que está na tela aberta agora: o texto, os campos do formulário (com o nome, o tipo, o '
      + 'valor de agora e as opções) e os botões, dizendo quais você pode apertar. Use antes de preencher '
      + 'qualquer coisa e depois de apertar um botão, para ver o formulário que abriu.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'preencher_campo',
    description:
      'Escreve num campo da tela aberta, à vista da pessoa, como ela escreveria. NÃO salva: depois de '
      + 'preencher, diga o que preencheu e peça para ela conferir, mudar o que quiser e salvar. Na primeira '
      + 'vez da conversa a tela pergunta se a pessoa deixa você mexer; se ela não deixar, explique o passo a '
      + 'passo. Campo de senha nunca se preenche. Data em AAAA-MM-DD, hora em HH:MM, caixa de marcar com '
      + '"sim" ou "não", lista de escolha com o texto da opção.',
    input_schema: {
      type: 'object',
      properties: {
        campo: { type: 'string', description: 'O nome do campo como ver_tela mostrou, ou o número dele.' },
        valor: { type: 'string' },
      },
      required: ['campo', 'valor'],
      additionalProperties: false,
    },
  },
  {
    name: 'apertar_botao',
    description:
      'Aperta um botão da tela aberta que ABRE algo (um formulário, uma aba, uma folha). Só funciona nos '
      + 'botões que ver_tela marcou como "pode apertar": botão que salva, registra ou envia é sempre da '
      + 'pessoa. Pede licença como preencher_campo.',
    input_schema: {
      type: 'object',
      properties: { botao: { type: 'string', description: 'O nome do botão como ver_tela mostrou.' } },
      required: ['botao'],
      additionalProperties: false,
    },
  },
  {
    name: 'calcular',
    description:
      'Faz uma conta exata. Use SEMPRE que houver número a somar, subtrair, dividir ou comparar: total '
      + 'de nota, saldo do armário, doses no mês, média de refeições, porcentagem. Escreva a conta com '
      + 'ponto como separador decimal e sem separador de milhar. Conhece + - * / ^ %, parênteses e as '
      + 'funções soma(...), media(...), min(...), max(...), arred(x, casas), pct(parte, total), abs(x), '
      + 'raiz(x). A conta e o resultado aparecem para a pessoa.',
    input_schema: {
      type: 'object',
      properties: {
        conta: { type: 'string', description: 'Ex.: soma(12.5, 7.9, 30) ou pct(18, 20)' },
        rotulo: { type: 'string', description: 'O que a conta é, em poucas palavras (aparece para a pessoa).' },
      },
      required: ['conta', 'rotulo'],
      additionalProperties: false,
    },
  },
  {
    name: 'montar_tabela',
    description:
      'Mostra uma tabela na conversa, para apresentar dados, com o botão de baixar como planilha. Use '
      + 'para relatório de gestão, notas de compra, armário, remédios, refeições, visitas. Cada linha é '
      + 'um registro, nunca crianças lado a lado comparadas ou ordenadas por total. Diga de onde vieram '
      + 'os dados e o período em "fonte".',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        colunas: { type: 'array', items: { type: 'string' }, description: 'Até 12 colunas.' },
        linhas: {
          type: 'array',
          items: { type: 'array', items: { type: ['string', 'number', 'null'] } },
          description: 'Até 500 linhas, cada uma com um valor por coluna.',
        },
        fonte: { type: 'string', description: 'De onde vieram os dados e o período.' },
      },
      required: ['titulo', 'colunas', 'linhas', 'fonte'],
      additionalProperties: false,
    },
  },
  {
    name: 'propor_linha_na_ata',
    description:
      'PROPÕE escrever uma linha na ATA do plantão. Não grava: mostra um cartão, e a pessoa confirma. '
      + 'A linha sai no nome de quem confirmar. Descreva fatos, sem rótulo sobre a criança. '
      + 'O ataId vem de /shifts?houseId=... (o plantão aberto traz a ata).',
    input_schema: {
      type: 'object',
      properties: {
        ataId: { type: 'string' },
        texto: { type: 'string', description: 'A linha, como a equipe escreveria. Mínimo 3 caracteres.' },
        restrita: { type: 'boolean', description: 'Só para coordenação, técnica e líderes.' },
      },
      required: ['ataId', 'texto'],
      additionalProperties: false,
    },
  },
  {
    name: 'propor_anexo_no_dossie',
    description:
      'PROPÕE guardar um arquivo que a pessoa anexou nesta conversa no dossiê de uma criança. Não grava: '
      + 'a pessoa confere e confirma. Use a chave do catálogo do dossiê (/people/dossie/catalogo). '
      + 'O título é neutro: nunca diagnóstico, CPF nem nome de remédio no título.',
    input_schema: {
      type: 'object',
      properties: {
        pessoaId: { type: 'string' },
        anexo: { type: 'integer', description: 'O número do anexo nesta conversa (1 é o primeiro).' },
        chave: { type: 'string', description: 'A chave do item no catálogo do dossiê (ex.: receita, caderneta_vacinacao).' },
        titulo: { type: 'string' },
        validoAte: { type: 'string', description: 'AAAA-MM-DD, quando o documento vence (receita, caderneta, PIA).' },
      },
      required: ['pessoaId', 'anexo', 'chave', 'titulo'],
      additionalProperties: false,
    },
  },
  {
    name: 'propor_sugestao',
    description:
      'PROPÕE registrar uma sugestão de melhoria do sistema, com o nome de quem sugeriu. Use quando a '
      + 'pessoa reclamar de algo, pedir uma coisa que o sistema não faz, ou disser "seria bom se". '
      + 'Escreva a sugestão com as palavras dela, curta, e diga em que tela estava.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'A sugestão, de 10 a 4000 caracteres.' },
        tela: { type: 'string', description: 'A tela em que a pessoa estava, se fizer sentido.' },
      },
      required: ['texto'],
      additionalProperties: false,
    },
  },
] as const;

export type NomeDaFerramenta = (typeof FERRAMENTAS)[number]['name'];
export const NOMES_DAS_FERRAMENTAS = FERRAMENTAS.map((f) => f.name) as readonly string[];
