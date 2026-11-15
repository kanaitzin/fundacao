/**
 * O FUNCIONÁRIO DO MÊS (fase 324, decidido pelo dono em 14/11).
 *
 * Não importa nada: o servidor, a tela e o protótipo leem a mesma. Dois por mês: um por
 * casa, escolhido pela coordenação da casa, e um da Fundação, escolhido pela Coordenação
 * Geral, sempre com o porquê. Quem escolhe e quem lê é o banco que responde
 * (`app_escolhe_o_do_mes`, `app_le_o_do_mes`, alignments/1728).
 */

/** O porquê tem pelo menos isto, e o motivo da troca pelo menos aquilo. A mesma do banco. */
export const PORQUE_MINIMO = 20;
export const MOTIVO_DA_TROCA_MINIMO = 10;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

/** O primeiro dia do mês de uma data AAAA-MM-DD. */
export const primeiroDoMes = (dia: string) => `${dia.slice(0, 7)}-01`;

/** Escolhe-se o mês corrente ou o anterior: os dois, do mais novo para o mais velho. */
export function mesesQueSeEscolhem(hoje: string): string[] {
  const [a, m] = hoje.slice(0, 7).split('-').map(Number);
  const anterior = m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;
  return [primeiroDoMes(hoje), anterior];
}

/** novembro de 2026 */
export function rotuloDoMes(mes: string): string {
  const [a, m] = mes.slice(0, 7).split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

export const FRASE_QUEM_ESCOLHE_O_DO_MES =
  'O funcionário do mês da casa é escolhido pela coordenação da casa, e o da Fundação pela Coordenação Geral.';
