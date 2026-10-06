/**
 * QUEM LÊ "O QUE MUDOU DESDE O MEU ÚLTIMO PLANTÃO" (fase 186; uma lista só
 * desde a 190).
 *
 * Quem trabalha no plantão da casa. O gestor fica de fora: não tem plantão, e a
 * folha é a de quem volta para o turno. A lista vivia em DOIS lugares (o
 * serviço e o servidor de mentira), e a tela não a conhecia: pedia a folha para
 * o gestor, recebia a recusa e escondia o cartão. O ensaio contra o servidor de
 * verdade apontou o pedido recusado. Agora o servidor, o protótipo e a tela
 * leem ESTA lista, e a tela não pede o que vai ser recusado.
 *
 * Não importa nada, como o `implantacao.regra.ts`: o protótipo a embute.
 */
export const QUEM_LE_O_QUE_MUDOU: readonly string[] = [
  'educador', 'lider_diurno', 'lider_noturno_geral', 'enfermagem', 'equipe_tecnica', 'coordenador',
];
