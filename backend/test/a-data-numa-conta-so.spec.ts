/**
 * A DATA, NUMA CONTA SÓ — e o dia que a tela mostrava errado.
 *
 * O DEFEITO, medido em 21/09/2026. A conta de escrever um dia em português
 * estava em **TREZE telas**, uma cópia por arquivo. O problema não era a
 * repetição: era que as cópias **não eram iguais**.
 *
 *   * a de `Ocorrencias.tsx` fazia `new Date(iso)` sem ancorar a hora. Um dia
 *     puro do banco (`deadline` é `date`) nasce à MEIA-NOITE UTC, que em Porto
 *     Alegre é 21h do dia ANTERIOR — então *"Pendência até 30/09"* aparecia na
 *     tela como **29/09**, e um prazo de 01/01 aparecia como **31/12**, com o
 *     ano errado. Um dia a menos em toda pendência de ocorrência;
 *   * duas formatavam **sem `timeZone`**, isto é, no fuso de quem abre a página;
 *   * uma montava o meio-dia **sem informar o deslocamento**, o que dá no mesmo.
 *
 * E ninguém desconfiaria olhando: todas as treze devolviam uma data com cara de
 * certa. É a lição do mapa `VINCULO` e do hash da cor de autor (fase 123) —
 * correção numa cópia não alcança as outras.
 *
 * Este arquivo prega a conta no chão pelos casos que a quebravam, e cobra que
 * nenhuma tela volte a escrever a sua.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dia, diaCurto } from '../../frontend/src/rotulos';

const TELAS = join(__dirname, '..', '..', 'frontend', 'src', 'screens');

describe('A data, numa conta só', () => {
  /*
   * O CASO QUE ESTAVA ERRADO NA TELA. Não é teste de biblioteca: é o prazo da
   * ocorrência, que é `date` no banco e chega como dia puro.
   */
  it('dia puro do banco não perde um dia — era o prazo da ocorrência', () => {
    expect(dia('2026-09-30')).toBe('30/09/2026');
    expect(diaCurto('2026-09-30')).toBe('30/09');
  });

  it('e na virada do ano não perde o ano', () => {
    expect(dia('2026-01-01')).toBe('01/01/2026');
    expect(diaCurto('2026-01-01')).toBe('01/01');
  });

  /*
   * A OUTRA PONTA: instante depois das 21h de Porto Alegre, quando o UTC já
   * virou o dia e a instituição não. É a mesma condição que o segundo relógio da
   * suíte exercita, e é onde uma conta sem `timeZone` erra.
   */
  it('instante das 22h de Porto Alegre é do dia de Porto Alegre, não do UTC', () => {
    /* 22h30 do dia 20 em Porto Alegre é 01h30 do dia 21 em UTC. */
    expect(dia('2026-09-20T22:30:00-03:00')).toBe('20/09/2026');
    expect(dia('2026-09-21T01:30:00Z')).toBe('20/09/2026');
  });

  it('vazio e data impossível viram travessão, e não "Invalid Date"', () => {
    expect(dia(null)).toBe('—');
    expect(dia('')).toBe('—');
    expect(dia('não é data')).toBe('—');
    expect(diaCurto(undefined)).toBe('—');
  });

  /**
   * E A REGRESSÃO: nenhuma tela declara a sua própria conta.
   *
   * A cobrança é pela DECLARAÇÃO (`const dia =`), e não pelo uso: usar é o que
   * se quer. Uma tela nova que escreva a sua reprova aqui, e a mensagem diz onde
   * a conta mora.
   */
  it('nenhuma tela declara a sua própria conta de data', () => {
    const achados: string[] = [];
    for (const arquivo of readdirSync(TELAS).filter((f) => f.endsWith('.tsx'))) {
      const linhas = readFileSync(join(TELAS, arquivo), 'utf8').split('\n');
      linhas.forEach((linha, i) => {
        if (/^\s*const\s+(dia|diaCurto)\s*=/.test(linha)) {
          achados.push(`${arquivo}:${i + 1} declara a própria conta de data — `
            + `importe { dia } de '../rotulos'`);
        }
      });
    }
    expect(achados).toEqual([]);
  });
});
