/**
 * A PESSOA DA EQUIPE QUE OUTRA TELA PEDIU PARA ABRIR (fase 322).
 *
 * A Equipe leva aos encontros de alinhamento de uma pessoa, e os encontros levam ao
 * trabalho dela. A tela de origem guarda aqui quem foi tocado e para qual tela; a tela de
 * destino, ao abrir, já entra na pessoa. Fica só na memória da página: um toque, uma vez,
 * como a chamada que o Dia pede (`chamada-a-abrir.ts`).
 */
const pedidas = new Map<string, string>();

export function pedirAPessoa(aba: string, pessoaId: string) { pedidas.set(aba, pessoaId); }

export function pessoaPedida(aba: string): string | null {
  const id = pedidas.get(aba) ?? null;
  pedidas.delete(aba);
  return id;
}
