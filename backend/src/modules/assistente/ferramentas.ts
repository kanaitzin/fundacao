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
 * TRÊS TIPOS:
 *  - LER (`consultar_sistema`): um GET numa rota do catálogo, executado sem
 *    pedir licença, porque é o que a pessoa já poderia abrir na tela;
 *  - IR (`abrir_tela`): leva a pessoa à tela, quando ela pediu para ir;
 *  - PROPOR (`propor_*`): NUNCA grava. Vira um cartão com o que será feito, e
 *    só a pessoa, apertando Confirmar, faz a gravação, em nome dela.
 */

/** As rotas de leitura que a assistente pode pedir. Prefixo de caminho, só GET. */
export const ROTAS_DE_LEITURA: readonly string[] = [
  '/people', '/houses', '/timeline', '/activities', '/medications', '/nursing',
  '/incidents', '/shifts', '/reports', '/escala', '/notifications', '/alignments',
  '/checks', '/routine', '/staff', '/followups', '/statements', '/transfers',
  '/assistente/sugestoes',
];

/** Arquivos e folhas não são JSON: a assistente não os lê por rota. */
export const LEITURA_PROIBIDA = /\/(folha|export|file|photo|foto|anexo|comprovante)(\/|\?|$)/;

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
