/**
 * O VOCABULÁRIO DA ROTINA.
 *
 * ESTE ARQUIVO NÃO IMPORTA NADA, de propósito — a mesma razão de
 * `ata-secoes.ts` e de `alcance.ts`: o protótipo o lê direto, para que a lista
 * mostrada na demonstração seja a MESMA que o servidor aplica. Uma segunda
 * cópia escrita na tela divergiria na primeira correção, e o enum
 * `routine_kind` é do banco.
 */
/** Os tipos de item, com o nome que a casa usa — espelho de `routine_kind`. */
export const TIPOS_ROTINA = [
  { code: 'acordar', label: 'Acordar' },
  { code: 'higiene', label: 'Higiene' },
  { code: 'refeicao', label: 'Refeição' },
  { code: 'escola', label: 'Escola' },
  { code: 'curso', label: 'Curso' },
  { code: 'contraturno', label: 'Contraturno' },
  { code: 'esporte', label: 'Esporte' },
  { code: 'lazer', label: 'Lazer' },
  { code: 'educacao', label: 'Educação' },
  { code: 'medicamento', label: 'Medicamento' },
  { code: 'banho', label: 'Banho' },
  { code: 'sono', label: 'Sono' },
  { code: 'saude', label: 'Saúde' },
  { code: 'outro', label: 'Outro' },
];

/** Domingo a sábado, na ordem em que o `weekdays` do banco os numera. */
export const DIAS_DA_SEMANA = [
  { n: 0, curto: 'dom', label: 'Domingo' },
  { n: 1, curto: 'seg', label: 'Segunda' },
  { n: 2, curto: 'ter', label: 'Terça' },
  { n: 3, curto: 'qua', label: 'Quarta' },
  { n: 4, curto: 'qui', label: 'Quinta' },
  { n: 5, curto: 'sex', label: 'Sexta' },
  { n: 6, curto: 'sáb', label: 'Sábado' },
];
