/**
 * KERNEL — Tempo na instituição.
 *
 * O sistema armazena em UTC (`timestamptz`) e RACIOCINA em America/Sao_Paulo
 * (§23). A diferença não é cosmética: às 02h UTC ainda é ontem em Porto
 * Alegre, e um registro do plantão noturno cairia no dia errado — justamente
 * o turno que mais atravessa a virada.
 *
 * Toda "data de hoje" do sistema passa por aqui.
 */
export const FUSO_INSTITUICAO = 'America/Sao_Paulo';

/** Data corrente na instituição, no formato YYYY-MM-DD. */
export function hojeNaInstituicao(agora: Date = new Date()): string {
  return dataNaInstituicao(agora);
}

/** Converte um instante para a data (YYYY-MM-DD) vigente na instituição. */
export function dataNaInstituicao(instante: Date): string {
  // en-CA produz YYYY-MM-DD, que é o formato que o banco e a API usam.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_INSTITUICAO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instante);
}

/** Hora local na instituição (HH:mm) — útil para janelas de plantão. */
export function horaNaInstituicao(instante: Date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_INSTITUICAO, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(instante);
}

/**
 * Hora de virada do plantão noturno, na instituição. Preliminar (pendência
 * institucional #4): 19h–7h. Configurável por variável de ambiente para que a
 * confirmação do Marcelo seja uma troca de valor, não de código.
 */
export const FIM_DO_PLANTAO_NOTURNO = Number(process.env.NIGHT_SHIFT_END_HOUR ?? 7);

/**
 * A qual DIA pertence um plantão.
 *
 * O plantão noturno atravessa a meia-noite, e a data é a do dia em que ele
 * COMEÇOU. Sem essa normalização acontecia o seguinte, todo dia:
 *
 *   * a casa abria o plantão noturno às 22h10 do dia 3 → plantão do dia 3;
 *   * o Líder Noturno Geral abria a ATA Geral à 00h40 → ATA do dia 4;
 *   * ao tentar confirmar o fechamento da ATA daquela casa, a busca procurava
 *     a ATA do dia 4 e não achava nada. Ele era obrigado a assinar "com
 *     pendência", documentando por escrito uma falha que não existia.
 *
 * E dois educadores da mesma noite — um que abre às 23h50, outro às 00h10 —
 * criavam DOIS plantões para a mesma noite, cada um com sua ATA, com as
 * passagens divididas entre os dois.
 */
export function dataDoPlantao(turno: string, agora: Date = new Date()): string {
  if (turno !== 'noturno') return dataNaInstituicao(agora);
  const hora = Number(horaNaInstituicao(agora).slice(0, 2));
  if (hora >= FIM_DO_PLANTAO_NOTURNO) return dataNaInstituicao(agora);
  // Ainda é a noite de ontem: 02h do dia 4 pertence ao plantão do dia 3.
  const ontem = new Date(agora.getTime() - 24 * 3600_000);
  return dataNaInstituicao(ontem);
}
