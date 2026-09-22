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

/*
 * Domingo a sábado — a lista MUDOU DE CASA na fase 142 e mora no kernel
 * (`common/tempo.ts`), porque a folha da portaria passou a precisar dela e a
 * numeração da semana não é um assunto da rotina. Reexportada daqui para quem já
 * a importava: uma cópia com os mesmos nomes seria a maneira de a numeração
 * divergir sem ninguém notar.
 */
export { DIAS_DA_SEMANA } from '../../kernel/common/semana';
