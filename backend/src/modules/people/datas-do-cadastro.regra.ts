/**
 * AS DATAS DO CADASTRO (fase 319, pedido de 13/11: "revise o resto do cadastro").
 *
 * O cadastro aceitava nascimento no futuro, acolhimento antes do nascimento e
 * guia com data que ainda não chegou: um dia trocado por mês na pressa virava a
 * idade errada em todo relatório, e o tempo de acolhimento errado na audiência.
 *
 * Esta regra não importa nada, como o `alcance.ts`: o servidor, a tela e o
 * protótipo leem a MESMA, e a frase que a tela mostra é a que o servidor
 * devolveria. As datas chegam como AAAA-MM-DD; `hoje` é o dia da instituição.
 */

/** A data existe no calendário (31/02 não existe), no formato AAAA-MM-DD. */
export function ehDataDoCalendario(d: string | undefined | null): boolean {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [a, m, dia] = d.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, dia));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === dia;
}

/** A idade em anos completos, numa data. */
export function idadeEm(nascimento: string, dia: string): number {
  const [a, m, d] = nascimento.split('-').map(Number);
  const [a2, m2, d2] = dia.split('-').map(Number);
  return a2 - a - ((m2 < m || (m2 === m && d2 < d)) ? 1 : 0);
}

export interface DatasDoCadastro {
  nascimento?: string | null;
  acolhimento?: string | null;
  guia?: string | null;
}

/**
 * A recusa, em frase de colega, ou null quando as datas estão certas. As datas
 * que não foram preenchidas não são conferidas aqui: quem diz que são
 * obrigatórias é quem chama.
 */
export function recusaDasDatasDoCadastro(d: DatasDoCadastro, hoje: string): string | null {
  if (d.nascimento) {
    if (!ehDataDoCalendario(d.nascimento)) return 'A data de nascimento não existe no calendário. Confira o dia e o mês.';
    if (d.nascimento > hoje) return 'A data de nascimento está no futuro. Confira o dia, o mês e o ano.';
  }
  if (d.acolhimento) {
    if (!ehDataDoCalendario(d.acolhimento)) return 'A data do acolhimento não existe no calendário. Confira o dia e o mês.';
    if (d.acolhimento > hoje) return 'A data do acolhimento está no futuro. Se a criança ainda não chegou, cadastre no dia em que ela chegar.';
    if (d.nascimento && d.acolhimento < d.nascimento) return 'A data do acolhimento é anterior ao nascimento. Confira as duas datas.';
  }
  if (d.guia) {
    if (!ehDataDoCalendario(d.guia)) return 'A data da guia não existe no calendário. Confira o dia e o mês.';
    if (d.guia > hoje) return 'A data da guia está no futuro. Confira a data escrita na guia.';
  }
  return null;
}

/**
 * O aviso que não trava: a idade calculada fora do que a casa acolhe costuma
 * ser o ano digitado errado. A pessoa confere e segue.
 */
export function avisoDaIdade(nascimento: string | null | undefined, hoje: string): string | null {
  if (!nascimento || !ehDataDoCalendario(nascimento) || nascimento > hoje) return null;
  const idade = idadeEm(nascimento, hoje);
  if (idade > 18) return `Pela data de nascimento, a criança tem ${idade} anos. Confira o ano.`;
  return null;
}
