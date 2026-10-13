/**
 * AS CATEGORIAS DO DIA, num lugar só (fase 210).
 *
 * Moravam dentro da tela do Dia, e o "O dia, em ordem" das unidades não tinha
 * cor nenhuma: era uma lista cinza onde não se sabia o que era remédio, o que
 * era refeição, nem o que era de uma criança e o que era da casa toda (pedido de
 * 12/10). As duas telas leem daqui.
 */
/*
 * O DESENHO DE CADA CATEGORIA (fase 150) — e antes eram emoji.
 *
 * Os emoji tinham um problema além do visual: o 🛏️ da rotina virava uma cama
 * de hotel num aparelho e um travesseiro noutro, e o 🎯 de "lazer e atividade"
 * é um alvo — a coisa mais distante do que uma tarde de futebol significa para
 * um adolescente desta casa. Desenho de traço não carrega piada nem cultura de
 * outro lugar: é a forma mínima que diz "isto é remédio", "isto é comida".
 *
 * A COR CONTINUA SENDO A CATEGORIA, na borda do cartão, e o desenho a repete —
 * quem não distingue as cores lê o mesmo pela forma, e é para isso que ele
 * existe (a §6 diz que cor nunca é o único canal).
 */
export const ICONE: Record<string, string> = {
  rotina: 'cama', refeicao: 'refeicao', atividade: 'atividade', saida: 'saida',
  medicamento: 'medicamento', chamada: 'chamada', plantao: 'passagem',
  ocorrencia: 'alerta', saude: 'saude_ic',
};

/**
 * A CATEGORIA do evento — pedido da Fundação em 09/09.
 *
 * O dia inteiro numa lista cinza obriga a ler título por título para saber se
 * a tarde foi de escola ou de consulta. A categoria pinta a borda esquerda e
 * dá a leitura de relance: "hoje teve muita saúde".
 *
 * O ESTADO continua na pílula, e não muda de canal. São duas perguntas
 * diferentes — "isto é o quê" e "isto ainda exige alguma coisa de mim" — e
 * quem faz a segunda às 23h não pode ter de desempatar um matiz só.
 *
 * Oito categorias para os oito matizes da paleta. As quatro que o Marcelo
 * nomeou (saúde, educação, lazer, atendimento médico) estão separadas; o resto
 * da rotina da casa fica junto em ardósia, porque colorir 'acordar' e 'banho'
 * com tons próprios gastaria a distinção onde ela não decide nada.
 *
 * Categoria desconhecida cai em rotina — nunca em branco. Uma borda sem cor no
 * meio de uma lista colorida se lê como "esta não importa".
 */
export const CATEGORIA: { classe: string; rotulo: string; kinds: string[] }[] = [
  { classe: 'cat-saude', rotulo: 'Saúde',
    kinds: ['saude', 'consulta', 'tratamento', 'internacao'] },
  { classe: 'cat-medicamento', rotulo: 'Medicamento', kinds: ['medicamento'] },
  { classe: 'cat-educacao', rotulo: 'Educação',
    kinds: ['escola', 'curso', 'contraturno', 'educacao', 'documentacao'] },
  { classe: 'cat-lazer', rotulo: 'Lazer e atividade',
    kinds: ['lazer', 'esporte', 'atividade', 'visita'] },
  { classe: 'cat-alimentacao', rotulo: 'Alimentação', kinds: ['refeicao'] },
  { classe: 'cat-saida', rotulo: 'Saída', kinds: ['saida'] },
  { classe: 'cat-ocorrencia', rotulo: 'Ocorrência', kinds: ['ocorrencia'] },
  { classe: 'cat-rotina', rotulo: 'Rotina da casa',
    kinds: ['rotina', 'acordar', 'higiene', 'banho', 'sono', 'chamada', 'plantao', 'outro'] },
];
const POR_KIND = new Map(
  CATEGORIA.flatMap((c) => c.kinds.map((k) => [k, c] as const)));
const ROTINA = CATEGORIA[CATEGORIA.length - 1];
export const categoriaDe = (kind: string) => POR_KIND.get(kind) ?? ROTINA;

