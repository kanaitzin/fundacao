/**
 * A CHAMADA QUE O DIA PEDIU PARA ABRIR (fase 320).
 *
 * O Abrir chamada da linha do almoço levava à lista das chamadas, e a educadora
 * tocava no almoço de novo. O Dia guarda aqui qual chamada foi tocada, e a tela da
 * Chamada, ao abrir, a abre direto. Fica só na memória da página: um toque, uma vez.
 */
let pedida: string | null = null;

export function pedirAChamada(id: string) { pedida = id; }

export function chamadaPedida(): string | null {
  const id = pedida;
  pedida = null;
  return id;
}
