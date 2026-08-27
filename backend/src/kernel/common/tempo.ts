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
