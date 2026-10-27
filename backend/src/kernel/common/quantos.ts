/**
 * A QUANTIDADE ESCRITA COMO GENTE ESCREVE (fase 248).
 *
 * "1 passagem(ns) assinada(s)" estava na tela do plantão, nos avisos e nas folhas
 * que vão para o juiz e para a rede. Quem lê às 23h tropeça nos parênteses, e o
 * papel parece formulário de máquina. Aqui o número leva a palavra certa: uma,
 * no singular; zero ou mais de uma, no plural.
 *
 * Não importa nada: o servidor, a tela e o protótipo leem a MESMA.
 */
export function quantos(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}
