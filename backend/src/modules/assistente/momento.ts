/**
 * A NOTA DO MOMENTO (fase 223).
 *
 * O que muda durante uma conversa (a hora, o turno, a tela aberta, a casa e a
 * voz escolhida) NÃO pode ir no bloco de instruções do sistema: o raciocínio do
 * modelo fica preso à conversa exata em que nasceu, e um bloco de instruções que
 * muda no meio invalida todo o raciocínio anterior (em conta nova, a pergunta
 * seguinte é recusada). Então a TELA escreve esta nota no começo de cada
 * pergunta da pessoa, e a conversa só cresce: nada do que já foi mandado muda.
 *
 * Não importa nada, como o `ferramentas.ts`: a tela e a suíte leem a mesma.
 */
export interface Momento {
  /** O instante, para a data e a hora de Porto Alegre. */
  agora: Date;
  /** O turno pela hora (o horário da casa pode deslocar a virada). */
  turno: 'diurno' | 'noturno';
  tela?: string | null;
  casa?: { id: string; nome: string } | null;
  voz?: string | null;
  /** A pessoa ligou o modo mãos ocupadas (fase 242): fala e ouve, sem tocar na tela. */
  maosOcupadas?: boolean;
}

export const INICIO_DA_NOTA = '[Nota da tela, não da pessoa.';

export function notaDoMomento(m: Momento): string {
  const fuso = { timeZone: 'America/Sao_Paulo' } as const;
  const dia = m.agora.toLocaleDateString('pt-BR', { ...fuso, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = m.agora.toLocaleTimeString('pt-BR', { ...fuso, hour: '2-digit', minute: '2-digit' });
  return [
    `${INICIO_DA_NOTA} Agora: ${dia}, ${hora}, turno ${m.turno === 'diurno' ? 'do dia' : 'da noite'}.`,
    m.tela ? `Tela aberta: ${m.tela}.` : '',
    m.casa ? `Casa aberta: ${m.casa.nome} (houseId ${m.casa.id}).` : 'Sem casa aberta.',
    m.voz ? `A pessoa escolheu falar com: ${m.voz}.` : '',
    m.maosOcupadas ? 'A pessoa está com as mãos ocupadas e ouve a resposta em voz alta: responda em uma ou duas frases curtas, sem tabela nem lista.' : '',
  ].filter(Boolean).join(' ') + ']';
}
