/**
 * O PRAZO DA REAVALIAÇÃO (fase 269, pedido de 03/11).
 *
 * O Estatuto manda reavaliar a situação de toda criança acolhida no máximo a
 * cada três meses, com relatório da equipe técnica ao Juízo (ECA, art. 19,
 * § 1º), e põe dezoito meses como limite do acolhimento, salvo decisão
 * fundamentada do juiz (§ 2º). A casa já guardava a data do acolhimento e o
 * relatório no dossiê; ninguém contava o prazo.
 *
 * A âncora é o último relatório de reavaliação anexado ao dossiê no
 * acolhimento de agora (chave `relatorio_reavaliacao`, com a data do envio).
 * Sem nenhum, conta desde o acolhimento. Os dezoito meses são informação, e
 * nunca alerta sobre o destino da criança: quem decide é o juiz.
 *
 * ESTE ARQUIVO NÃO IMPORTA NADA, como o `alcance.ts`: o servidor, a migração
 * (que repete os números e tem teste que confere) e o protótipo leem a MESMA.
 */

/** No máximo a cada quantos meses (ECA, art. 19, § 1º). */
export const REAVALIACAO_MESES = 3;
/** Com quantos dias de antecedência a técnica e a coordenação são avisadas. */
export const REAVALIACAO_AVISO_DIAS = 15;
/** O limite do acolhimento, salvo decisão fundamentada do juiz (§ 2º). */
export const ACOLHIMENTO_LIMITE_MESES = 18;

export type SituacaoDaReavaliacao = 'em_dia' | 'chegando' | 'passou';

export interface PrazoDaReavaliacao {
  /** AAAA-MM-DD: o dia em que o acolhimento de agora começou. */
  acolhidoDesde: string;
  /** AAAA-MM-DD do último relatório de reavaliação, ou nulo se não há. */
  ultimoRelatorio: string | null;
  /** AAAA-MM-DD: até quando o próximo relatório deveria ir ao Juízo. */
  proximoAte: string;
  situacao: SituacaoDaReavaliacao;
  /** Meses completos de acolhimento, contados do dia do acolhimento. */
  mesesAcolhido: number;
  /** A frase do prazo, para a tela. */
  frase: string;
  /** A frase do tempo de acolhimento, para a tela. */
  fraseDoTempo: string;
}

function partes(d: string) {
  return { a: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)), d: Number(d.slice(8, 10)) };
}

/** Soma meses a uma data, e o dia que não existe no mês vira o último dia dele. */
export function somarMeses(dia: string, meses: number): string {
  const { a, m, d } = partes(dia);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = total % 12 + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ano}-${p(mes)}-${p(Math.min(d, ultimo))}`;
}

function diasEntre(de: string, ate: string): number {
  const ms = (x: string) => { const { a, m, d } = partes(x); return Date.UTC(a, m - 1, d); };
  return Math.round((ms(ate) - ms(de)) / 86_400_000);
}

export function mesesCompletos(de: string, ate: string): number {
  const x = partes(de); const y = partes(ate);
  let meses = (y.a - x.a) * 12 + (y.m - x.m);
  if (y.d < x.d) meses -= 1;
  return Math.max(0, meses);
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function prazoDaReavaliacao(acolhidoDesde: string, ultimoRelatorio: string | null,
                                   hoje: string): PrazoDaReavaliacao {
  const desde = acolhidoDesde.slice(0, 10);
  /* Relatório de antes do acolhimento de agora não conta: é de outro episódio. */
  const ultimo = ultimoRelatorio && ultimoRelatorio.slice(0, 10) >= desde
    ? ultimoRelatorio.slice(0, 10) : null;
  const proximoAte = somarMeses(ultimo ?? desde, REAVALIACAO_MESES);
  const faltam = diasEntre(hoje, proximoAte);
  const situacao: SituacaoDaReavaliacao = faltam < 0 ? 'passou'
    : faltam <= REAVALIACAO_AVISO_DIAS ? 'chegando' : 'em_dia';
  const meses = mesesCompletos(desde, hoje);

  const frase = ultimo
    ? (situacao === 'passou'
        ? `O último relatório de reavaliação foi enviado em ${ddmm(ultimo)}. O próximo era até ${ddmm(proximoAte)}, e não há outro no dossiê.`
        : `O último relatório de reavaliação foi enviado em ${ddmm(ultimo)}. O próximo vai ao Juízo até ${ddmm(proximoAte)}.`)
    : (situacao === 'passou'
        ? `Não há relatório de reavaliação no dossiê desde o acolhimento, em ${ddmm(desde)}. O primeiro era até ${ddmm(proximoAte)}.`
        : `Ainda não há relatório de reavaliação no dossiê. O primeiro vai ao Juízo até ${ddmm(proximoAte)}.`);

  const tempo = meses === 0 ? 'há menos de um mês'
    : meses === 1 ? 'há um mês' : `há ${meses} meses`;
  const fraseDoTempo = `Em acolhimento ${tempo}, desde ${ddmm(desde)}. O limite do acolhimento é de `
    + `${ACOLHIMENTO_LIMITE_MESES} meses, salvo decisão fundamentada do juiz.`;

  return { acolhidoDesde: desde, ultimoRelatorio: ultimo, proximoAte, situacao,
           mesesAcolhido: meses, frase, fraseDoTempo };
}
