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
