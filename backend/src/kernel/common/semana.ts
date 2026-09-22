/**
 * A SEMANA — nomes e numeração, num lugar só (fase 142).
 *
 * Arquivo próprio, e não dentro do `tempo.ts`, por um motivo medido: o servidor
 * de mentira do protótipo IMPORTA este vocabulário do backend de propósito
 * (regra 14 — a demonstração e o produto dizem a mesma coisa ou uma das duas
 * mente), e o `tempo.ts` lê `process.env`, que não existe no navegador. Pôr a
 * semana lá dentro fez o `tsc` do frontend reprovar na primeira compilação.
 */
/**
 * OS DIAS DA SEMANA, na numeração do `dow` do Postgres — 0 é domingo.
 *
 * Moram no kernel, e não na partição da rotina, por um motivo medido: a folha da
 * portaria passou a precisar deles (1500) e importá-los de `routine` faria
 * `people` depender de uma partição vizinha para saber o nome de uma
 * terça-feira. Uma segunda cópia seria pior — é a lição do mapa `VINCULO`: duas
 * listas com a mesma verdade divergem na primeira correção, e aqui a divergência
 * que importa não é o nome, é a NUMERAÇÃO. Um lugar que contasse a semana a
 * partir da segunda faria a folha impressa trocar terça por quarta.
 */
export const DIAS_DA_SEMANA = [
  { n: 0, curto: 'dom', label: 'Domingo' },
  { n: 1, curto: 'seg', label: 'Segunda' },
  { n: 2, curto: 'ter', label: 'Terça' },
  { n: 3, curto: 'qua', label: 'Quarta' },
  { n: 4, curto: 'qui', label: 'Quinta' },
  { n: 5, curto: 'sex', label: 'Sexta' },
  { n: 6, curto: 'sáb', label: 'Sábado' },
];

/** "seg, ter e qui" — como a folha da parede escreve um conjunto de dias. */
export function diasEmPortugues(dias: number[] | null | undefined): string | null {
  if (!dias || dias.length === 0) return null;
  const ordenados = [...new Set(dias)].sort((a, b) => a - b);
  if (ordenados.length === 7) return 'todos os dias';
  const nomes = ordenados.map((n) => DIAS_DA_SEMANA.find((d) => d.n === n)?.curto ?? String(n));
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}
