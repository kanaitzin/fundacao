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

/**
 * GÊMEO NO BANCO: `app_hoje()`.
 *
 * O mesmo raciocínio precisa existir dos dois lados, porque metade das datas
 * nasce no serviço e a outra metade dentro de função SQL. Em SQL, `current_date`
 * e `now()::date` devolvem o dia do FUSO DO SERVIDOR — em UTC, depois das 21h
 * de Porto Alegre já é amanhã. Por isso nenhuma migração nova deve usar
 * `current_date`: use `app_hoje()` (identity/0630).
 */

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

/**
 * O INSTANTE em que um dia da instituição começa, em UTC.
 *
 * Existe para as consultas que comparam uma DATA com uma coluna `timestamptz`.
 * Escrever `happened_at >= '2026-08-01'` parece inofensivo e não é: o Postgres
 * promove a data usando o fuso do SERVIDOR. Com o servidor em UTC, o mês de
 * agosto passa a começar às 21h do dia 31 de julho em Porto Alegre — e a
 * ocorrência registrada naquela noite entra na contagem do mês seguinte.
 *
 * O deslocamento é medido, não assumido: o Brasil não tem horário de verão
 * desde 2019, mas isso já mudou duas vezes e voltaria a mudar por decreto.
 */
export function inicioDoDiaNaInstituicao(data: string): Date {
  const ingenuo = Date.parse(`${data}T00:00:00Z`);
  if (Number.isNaN(ingenuo)) throw new Error(`Data inválida: ${data}`);
  // Duas passadas: a primeira estima o deslocamento, a segunda o confirma no
  // instante já corrigido — o que importa nas viradas de horário de verão.
  let instante = new Date(ingenuo);
  for (let i = 0; i < 2; i++) {
    instante = new Date(ingenuo - deslocamentoEmMinutos(instante) * 60_000);
  }
  return instante;
}

/** Deslocamento do fuso da instituição, em minutos, no instante dado. */
function deslocamentoEmMinutos(instante: Date): number {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_INSTITUICAO, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(instante);
  const p = (t: string) => Number(partes.find((x) => x.type === t)!.value);
  const comoSeFosseUtc = Date.UTC(
    p('year'), p('month') - 1, p('day'), p('hour') % 24, p('minute'), p('second'));
  return Math.round((comoSeFosseUtc - instante.getTime()) / 60_000);
}

/**
 * Janela de um mês (YYYY-MM) da instituição, em instantes UTC.
 * Meio aberta: `[inicio, fim)` — o último dia do mês entra inteiro, e nenhum
 * registro é contado duas vezes na fronteira entre dois meses.
 */
export function janelaDoMes(mes: string): { inicio: Date; fim: Date; primeiroDia: string } {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error(`Mês inválido: ${mes} (use YYYY-MM)`);
  const [ano, m] = mes.split('-').map(Number);
  const primeiroDia = `${mes}-01`;
  const proximo = m === 12
    ? `${ano + 1}-01-01`
    : `${ano}-${String(m + 1).padStart(2, '0')}-01`;
  return {
    inicio: inicioDoDiaNaInstituicao(primeiroDia),
    fim: inicioDoDiaNaInstituicao(proximo),
    primeiroDia,
  };
}
