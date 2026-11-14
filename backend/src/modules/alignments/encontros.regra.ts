/**
 * A REGRA DO ENCONTRO DE ALINHAMENTO (fase 322, decidido pelo dono em 14/11).
 *
 * Não importa nada: o servidor, a tela e o protótipo leem a mesma. Quem registra é a
 * coordenação (a da casa e a Coordenação Geral, que é coordenação com a marca de todas as
 * casas); com QUEM cada uma registra é o banco que responde (`app_alinha_com`, 1721), e a
 * suíte confere que a lista daqui é a mesma do banco.
 */
export const PERIODICIDADES = ['mensal', 'trimestral', 'semestral', 'anual'] as const;
export type Periodicidade = typeof PERIODICIDADES[number];

export const ROTULO_DA_PERIODICIDADE: Record<Periodicidade, string> = {
  mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
};

/** O cargo que registra o encontro: a coordenação da casa e a Coordenação Geral. */
export const QUEM_REGISTRA_ALINHAMENTO: string[] = ['coordenador'];
