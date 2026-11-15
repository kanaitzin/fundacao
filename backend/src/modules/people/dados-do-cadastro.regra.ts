/**
 * OS DADOS DO CADASTRO DO ACOLHIDO (fase 326, pedido do dono em 15/11).
 *
 * Não importa nada: o servidor, a tela e o protótipo leem a mesma regra.
 *
 * A raça/cor é a autodeclarada, nas categorias do IBGE, que são as dos formulários da rede
 * (SUAS, SUS e escola); quem não declarou fica como não declarada, e nunca é preenchida por
 * quem cadastra a partir da aparência. O cartão SUS (CNS) tem 15 números; o RG e a filiação
 * são o que o papel diz.
 */
export const RACAS_IBGE: { cod: string; label: string }[] = [
  { cod: 'branca', label: 'Branca' },
  { cod: 'preta', label: 'Preta' },
  { cod: 'parda', label: 'Parda' },
  { cod: 'amarela', label: 'Amarela' },
  { cod: 'indigena', label: 'Indígena' },
  { cod: 'nao_declarada', label: 'Não declarada' },
];

export const rotuloDaRaca = (cod: string | null | undefined) =>
  RACAS_IBGE.find((r) => r.cod === cod)?.label ?? cod ?? null;

/** Só os números do cartão SUS. */
export const numerosDoCns = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');

/** A frase quando o dado não confere, ou nulo. A mesma no servidor e na tela. */
export function recusaDosDadosDoCadastro(d: { race?: string | null; cns?: string | null;
  rg?: string | null; filiation?: string | null }): string | null {
  if (d.race && !RACAS_IBGE.some((r) => r.cod === d.race)) {
    return 'Escolha a raça/cor numa das opções, ou deixe como não declarada.';
  }
  const cns = numerosDoCns(d.cns);
  if (cns && cns.length !== 15) return 'O cartão SUS tem 15 números. Confira, ou deixe em branco por enquanto.';
  if ((d.rg ?? '').trim().length > 30) return 'O RG cabe em até 30 caracteres.';
  if ((d.filiation ?? '').trim().length > 300) return 'A filiação cabe em até 300 letras.';
  return null;
}
