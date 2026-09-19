/**
 * ROTULOS DE CARGO.
 *
 * O nome do cargo aparecia escrito de três jeitos: "Líder Diurno" no chip da
 * barra, `lider_diurno` na lista de passagens e "lider_noturno_geral" na
 * equipe. O código do cargo é do banco; quem lê a tela lê o nome.
 *
 * Fica num arquivo só para que nenhuma tela precise importar a App — importar
 * a App de dentro de uma tela fecha um ciclo, e o ciclo quebra o empacotamento.
 */
export const ROTULO_CARGO: Record<string, string> = {
  gestor_geral: 'Gestor Geral',
  coordenador: 'Coordenação',
  equipe_tecnica: 'Equipe técnica',
  educador: 'Educador social',
  lider_diurno: 'Líder Diurno',
  lider_noturno_geral: 'Líder Noturno Geral',
  enfermagem: 'Enfermagem',
  cozinha: 'Cozinha',
};

/** O código cru só aparece quando o cargo é desconhecido — e aí ele é a pista. */
export const cargo = (code: string | null | undefined): string =>
  (code ? ROTULO_CARGO[code] ?? code : '—');

/**
 * A COR DE CADA AUTOR.
 *
 * Vive AQUI, e não na tela da ATA, desde a fase 123: a escala passou a pintar
 * a linha de cada pessoa com a MESMA cor, e uma segunda cópia deste hash
 * divergiria na primeira correção — a mesma educadora sairia de um tom na ATA
 * e de outro na escala, que é pior do que não ter cor nenhuma. É a lição do
 * mapa `VINCULO`, que já teve duas cópias e sete dos dez valores numa delas.
 *
 * Estável (sai do id, e não da ordem em que a pessoa escreveu) e limitada a
 * seis tons do próprio design system. Ela pinta a BORDA e a etiqueta do nome —
 * nunca o texto —, porque tinta sobre texto é onde o contraste quebra, e a ATA
 * é lida no corredor. Quem imprime em preto e branco continua sabendo quem
 * escreveu: o nome está escrito ao lado.
 */
export const TONS_DE_AUTOR = ['c-brand', 'c-move', 'c-ok', 'c-warn', 'c-info', 'c-other'];
/**
 * O tom do autor.
 *
 * Desde 09/09 a cor pode ser ESCOLHIDA pela coordenação, e aí ela não repete
 * na casa. Sem escolha, cai no hash de antes — que colide: dois educadores do
 * mesmo plantão podiam receber o mesmo tom, e a cor parava de distinguir
 * exatamente onde precisava. Ninguém percebia porque o NOME está escrito ao
 * lado; era a cor que deixava de ajudar.
 */
export function tomDoAutor(id: string, escolhida?: string | null): string {
  if (escolhida) return escolhida;
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) % 997;
  return TONS_DE_AUTOR[n % TONS_DE_AUTOR.length];
}
