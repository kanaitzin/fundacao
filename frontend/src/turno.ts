/**
 * A REGRA DA ATA, do lado da tela — decisão da Fundação em 25/09/2026 (fase 157).
 *
 * ATA diurna das 08:00 às 20:00; noturna das 20:01 às 07:59 do dia seguinte,
 * da data em que começou. A regra mora no banco (`app_turno_de`, identity/1573)
 * e no servidor (`tempo.ts`); estes dois horários são o espelho dela aqui, e
 * `a-ata-das-oito-as-oito.e2e.spec.ts` reprova se os três lados discordarem.
 *
 * Antes disso a hipótese 7h–19h estava escrita à mão na passagem, na escala e
 * duas vezes no servidor de mentira.
 */
export const INICIO_DO_DIURNO = '08:00';
export const INICIO_DO_NOTURNO = '20:01';

/** Como a tela escreve cada turno para quem lê. */
export const HORAS_DO_TURNO = { diurno: '08:00–20:00', noturno: '20:01–07:59' } as const;

/** Hora e minuto (HH:mm) no fuso da instituição — nunca no do aparelho. */
export function horaNaInstituicao(instante: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(instante);
}

/** O turno de uma hora do relógio (HH:mm). */
export function periodoDaHora(hhmm: string): 'diurno' | 'noturno' {
  return hhmm >= INICIO_DO_DIURNO && hhmm < INICIO_DO_NOTURNO ? 'diurno' : 'noturno';
}

/** O turno de agora, pela hora da instituição. */
export function turnoAgora(): 'diurno' | 'noturno' {
  return periodoDaHora(horaNaInstituicao());
}
