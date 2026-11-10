/**
 * O ATENDIMENTO DA EQUIPE TÉCNICA (fase 218, pedido de 14/10).
 *
 * A regra mora aqui, sem importar nada, para o servidor e o protótipo lerem a
 * MESMA lista: as áreas, quem registra e quem lê.
 */
export const AREAS_DO_ATENDIMENTO = [
  { cod: 'psicologia', label: 'Psicologia' },
  { cod: 'psicopedagogia', label: 'Psicopedagogia' },
  { cod: 'servico_social', label: 'Assistência Social' },
  { cod: 'pedagogia', label: 'Pedagogia' },
  /* Fase 306 (pedido de 10/11): a conversa de quem cuida com a criança sobre o que aconteceu e o
     combinado dali para frente. Era a advertência; o nome diz que é educar, e não punir. */
  { cod: 'comportamental', label: 'Atendimento comportamental da casa' },
  { cod: 'outra', label: 'Outra área' },
] as const;

/** Quem registra o atendimento: quem atende. */
export const QUEM_REGISTRA_ATENDIMENTO = ['equipe_tecnica', 'coordenador'];

/**
 * Quem registra o atendimento comportamental da casa (fase 307, decidido em 10/11): também
 * quem estava no plantão e conversou com a criança. Só esse tipo; ler continua com quem lê.
 */
export const QUEM_REGISTRA_COMPORTAMENTAL = ['equipe_tecnica', 'coordenador', 'educador', 'lider_diurno', 'lider_noturno_geral'];

/** Pode registrar este atendimento? A técnica e a coordenação, qualquer área; o plantão, o comportamental. */
export function podeRegistrarAtendimento(papel: string, area?: string): boolean {
  return QUEM_REGISTRA_ATENDIMENTO.includes(papel)
    || (area === 'comportamental' && QUEM_REGISTRA_COMPORTAMENTAL.includes(papel));
}

/**
 * Quem lê. O atendimento e o desenho da criança ficam com quem atende e com a
 * coordenação; o plantão não lê (decisão a confirmar com a Fundação,
 * PARA-A-REUNIAO §4.24).
 */
export const QUEM_LE_ATENDIMENTO = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

/**
 * Quantos arquivos num atendimento: o desenho, a folha da atividade, a foto.
 * Eram oito; desde a fase 233 é o mesmo número de toda mensagem com anexo
 * (`anexos-da-mensagem.regra.ts`), dito numa linha só.
 */
export { MAXIMO_DE_ANEXOS_POR_MENSAGEM as MAXIMO_DE_ANEXOS_DO_ATENDIMENTO } from '../../kernel/arquivos/anexos-da-mensagem.regra';

/** Onde foi (fase 284): na casa ou fora dela. */
export const ONDE_FOI_O_ATENDIMENTO = [
  { cod: 'interno', label: 'Interno, na casa' },
  { cod: 'externo', label: 'Externo, fora da casa' },
] as const;

/** Quem baixa os atendimentos de um período (fase 284): quem atende e a coordenação. */
export const QUEM_BAIXA_ATENDIMENTOS = ['equipe_tecnica', 'coordenador'];

export function rotuloDaArea(cod: string, outra?: string | null): string {
  if (cod === 'outra' && outra) return outra;
  return AREAS_DO_ATENDIMENTO.find((a) => a.cod === cod)?.label ?? cod;
}
