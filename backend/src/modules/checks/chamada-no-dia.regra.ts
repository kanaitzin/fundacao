import { quantos } from '../../kernel/common/quantos';

/**
 * A CHAMADA NA LINHA DO DIA, ESCRITA UMA VEZ (fase 320).
 *
 * A linha dizia *Faltam 1 acolhidos para conferir*, e no protótipo a linha do
 * almoço era escrita à mão, com outro horário e outros números que a tela da
 * Chamada. O servidor (`checks.timeline.ts`) e o protótipo leem estas duas frases.
 *
 * Não importa nada além do `quantos`: a tela e o protótipo leem a MESMA.
 */
export function textoDaChamadaAberta(conferidos: number, esperados: number): string {
  return `Chamada aberta, ${conferidos} de ${esperados} conferidos`;
}

export function textoDoQueFaltaNaChamada(faltam: number): string {
  return faltam === 1
    ? 'Falta 1 acolhido para conferir'
    : `Faltam ${quantos(faltam, 'acolhido', 'acolhidos')} para conferir`;
}
