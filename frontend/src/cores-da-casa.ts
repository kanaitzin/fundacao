/**
 * AS CORES DA CASA (fase 211, pedido de 12/10: "escolher numa gama de umas 50 cores").
 *
 * A paleta que a casa usa para dizer QUAL é a chamada (o café, a janta, a ceia).
 * É a quarta pergunta que uma cor responde no sistema, e por isso mora num lugar
 * só e nunca se mistura com as outras três (estado, autor e cargo, ver
 * `cargos.tsx`): a cor da casa aparece só na barra do cartão e no ponto ao lado
 * do nome, nunca numa pílula, e o nome vem sempre escrito.
 *
 * Os tons são médios de propósito: a letra continua a da tela, em cima do fundo
 * da tela, e a cor só pinta a borda. Qualquer uma passa no contraste de
 * elemento gráfico (3:1) contra o fundo claro.
 */
export interface CorDaCasa { codigo: string; nome: string; hex: string }

export const CORES_DA_CASA: CorDaCasa[] = [
  { codigo: 'tomate', nome: 'Tomate', hex: '#D0443A' },
  { codigo: 'morango', nome: 'Morango', hex: '#C2385B' },
  { codigo: 'framboesa', nome: 'Framboesa', hex: '#B03A7A' },
  { codigo: 'rosa', nome: 'Rosa', hex: '#C94F94' },
  { codigo: 'chiclete', nome: 'Chiclete', hex: '#D0559E' },
  { codigo: 'orquidea', nome: 'Orquídea', hex: '#A64CA6' },
  { codigo: 'uva', nome: 'Uva', hex: '#7E4AB0' },
  { codigo: 'lavanda', nome: 'Lavanda', hex: '#8A66C2' },
  { codigo: 'violeta', nome: 'Violeta', hex: '#6B4FC0' },
  { codigo: 'anil', nome: 'Anil', hex: '#4A55B8' },
  { codigo: 'noite', nome: 'Noite', hex: '#3A4A8C' },
  { codigo: 'mar', nome: 'Mar', hex: '#2F67B5' },
  { codigo: 'ceu', nome: 'Céu', hex: '#2E86C1' },
  { codigo: 'piscina', nome: 'Piscina', hex: '#1C8FB0' },
  { codigo: 'agua', nome: 'Água', hex: '#16929B' },
  { codigo: 'turquesa', nome: 'Turquesa', hex: '#13968A' },
  { codigo: 'menta', nome: 'Menta', hex: '#1E9A78' },
  { codigo: 'folha', nome: 'Folha', hex: '#2E8B57' },
  { codigo: 'mata', nome: 'Mata', hex: '#2C7A45' },
  { codigo: 'oliva', nome: 'Oliva', hex: '#6B7F2A' },
  { codigo: 'limao', nome: 'Limão', hex: '#7E9A1C' },
  { codigo: 'abacate', nome: 'Abacate', hex: '#5E8C2F' },
  { codigo: 'pistache', nome: 'Pistache', hex: '#7A9A45' },
  { codigo: 'girassol', nome: 'Girassol', hex: '#C9A21A' },
  { codigo: 'milho', nome: 'Milho', hex: '#C4931A' },
  { codigo: 'mel', nome: 'Mel', hex: '#C08422' },
  { codigo: 'laranja', nome: 'Laranja', hex: '#D97A1C' },
  { codigo: 'tangerina', nome: 'Tangerina', hex: '#E0702A' },
  { codigo: 'abobora', nome: 'Abóbora', hex: '#CC6524' },
  { codigo: 'pessego', nome: 'Pêssego', hex: '#D9774F' },
  { codigo: 'salmao', nome: 'Salmão', hex: '#D86A5C' },
  { codigo: 'coral', nome: 'Coral', hex: '#E0614F' },
  { codigo: 'tijolo', nome: 'Tijolo', hex: '#A84A32' },
  { codigo: 'canela', nome: 'Canela', hex: '#9C5B34' },
  { codigo: 'cafe', nome: 'Café', hex: '#7A5232' },
  { codigo: 'chocolate', nome: 'Chocolate', hex: '#6B4430' },
  { codigo: 'areia', nome: 'Areia', hex: '#A68A5B' },
  { codigo: 'caramelo', nome: 'Caramelo', hex: '#B07A3A' },
  { codigo: 'ameixa', nome: 'Ameixa', hex: '#7A3B5E' },
  { codigo: 'vinho', nome: 'Vinho', hex: '#8C2F45' },
  { codigo: 'cereja', nome: 'Cereja', hex: '#A3283E' },
  { codigo: 'grafite', nome: 'Grafite', hex: '#5A6270' },
  { codigo: 'ardosia', nome: 'Ardósia', hex: '#5E6E82' },
  { codigo: 'aco', nome: 'Aço', hex: '#6F7C8C' },
  { codigo: 'nevoa', nome: 'Névoa', hex: '#7D8B99' },
  { codigo: 'musgo', nome: 'Musgo', hex: '#5F6B3A' },
  { codigo: 'petroleo', nome: 'Petróleo', hex: '#1F6470' },
  { codigo: 'jade', nome: 'Jade', hex: '#2A8068' },
];

export const corDaCasa = (codigo: string | null | undefined): CorDaCasa =>
  CORES_DA_CASA.find((c) => c.codigo === codigo) ?? CORES_DA_CASA[11];
