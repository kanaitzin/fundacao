/**
 * O ATENDIMENTO DA EQUIPE TÉCNICA (fase 218, pedido de 14/10).
 *
 * A regra mora aqui, sem importar nada, para o servidor e o protótipo lerem a
 * MESMA lista: as áreas, quem registra e quem lê.
 */
export const AREAS_DO_ATENDIMENTO = [
  { cod: 'psicologia', label: 'Psicologia' },
  { cod: 'psicopedagogia', label: 'Psicopedagogia' },
  { cod: 'servico_social', label: 'Serviço social' },
  { cod: 'pedagogia', label: 'Pedagogia' },
  { cod: 'outra', label: 'Outra área' },
] as const;

/** Quem registra o atendimento: quem atende. */
export const QUEM_REGISTRA_ATENDIMENTO = ['equipe_tecnica', 'coordenador'];

/**
 * Quem lê. O atendimento e o desenho da criança ficam com quem atende e com a
 * coordenação; o plantão não lê (decisão a confirmar com a Fundação,
 * PARA-A-REUNIAO §4.24).
 */
export const QUEM_LE_ATENDIMENTO = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

/** Quantos arquivos num atendimento: o desenho, a folha da atividade, a foto. */
export const MAXIMO_DE_ANEXOS_DO_ATENDIMENTO = 8;

export function rotuloDaArea(cod: string, outra?: string | null): string {
  if (cod === 'outra' && outra) return outra;
  return AREAS_DO_ATENDIMENTO.find((a) => a.cod === cod)?.label ?? cod;
}
