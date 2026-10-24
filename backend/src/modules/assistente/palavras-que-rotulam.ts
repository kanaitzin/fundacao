/**
 * AS PALAVRAS QUE ROTULAM A CRIANÇA (fase 243; ideia de 24/10, pedida pela
 * Fundação com o "faça tudo").
 *
 * O registro acompanha a criança até a audiência, e "agressivo" no papel diz
 * quem ela é, quando o que a equipe viu foi um fato: empurrou o colega na fila
 * do almoço. Enquanto a pessoa escreve num campo de texto longo, a tela sugere
 * escrever o fato no lugar da palavra; a Acolhe+AI, com o modelo, não usa estas
 * palavras no rascunho e faz a mesma sugestão.
 *
 * É SÓ SUGESTÃO: nunca impede de salvar, e nada é guardado nem contado, de
 * ninguém. Não vira nota da educadora nem da criança.
 *
 * Não importa nada: a tela e o guia do modelo leem a mesma lista. Palavra nova
 * entra aqui, com teste; tudo sem acento e em minúsculas, com as variações.
 */
export const PALAVRAS_QUE_ROTULAM: readonly string[] = [
  'agressivo', 'agressiva', 'agressivos', 'agressivas',
  'violento', 'violenta', 'violentos', 'violentas',
  'mentiroso', 'mentirosa', 'mentirosos', 'mentirosas',
  'manipulador', 'manipuladora', 'manipuladores', 'manipuladoras',
  'dissimulado', 'dissimulada',
  'problematico', 'problematica', 'problematicos', 'problematicas',
  'rebelde', 'rebeldes',
  'mal educado', 'mal educada', 'mal-educado', 'mal-educada', 'sem educacao',
  'malcriado', 'malcriada', 'birrento', 'birrenta',
  'sem limites', 'nao tem jeito', 'sem jeito', 'irrecuperavel', 'insuportavel',
  'preguicoso', 'preguicosa', 'safado', 'safada', 'vagabundo', 'vagabunda',
  'marginal', 'delinquente', 'pivete', 'trombadinha',
  'drogado', 'drogada', 'louco', 'louca', 'doido', 'doida', 'maluco', 'maluca', 'surtado', 'surtada',
  'psicopata', 'perverso', 'perversa', 'maldoso', 'maldosa',
  'burro', 'burra', 'lerdo', 'lerda', 'retardado', 'retardada',
  'endiabrado', 'endiabrada', 'encapetado', 'encapetada', 'capeta',
];

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** As palavras que rotulam, na ordem em que aparecem no texto, sem repetir. */
export function palavrasQueRotulam(texto: string): string[] {
  const t = sem(texto);
  const achadas: { palavra: string; onde: number }[] = [];
  for (const p of PALAVRAS_QUE_ROTULAM) {
    const m = new RegExp(`(^|[^a-z])${p.replace(/[-\s]/g, '[-\\s]')}([^a-z]|$)`).exec(t);
    if (m) achadas.push({ palavra: p.replace(/-/g, ' '), onde: m.index });
  }
  const vistas = new Set<string>();
  return achadas.sort((a, b) => a.onde - b.onde).map((a) => a.palavra)
    .filter((p) => (vistas.has(p) ? false : (vistas.add(p), true)));
}

/** A sugestão que a tela mostra, como colega. */
export function sugestaoDoFato(palavra: string): string {
  return `Em vez de ${palavra}, que tal escrever o fato? O que aconteceu, quando, com quem e o que a equipe fez.`;
}
