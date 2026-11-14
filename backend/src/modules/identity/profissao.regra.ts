/**
 * A PROFISSÃO DE QUEM É DA EQUIPE TÉCNICA (fase 322, pedido de 14/11).
 *
 * A equipe técnica do Pão é feita de profissionais diferentes, e quem trabalha com elas
 * apontou: o sistema dizia *Equipe técnica* para todas. A profissão é dita por quem
 * administra a conta, junto do cargo, e aparece no lugar do nome do cargo, na etiqueta
 * ao lado do nome. O cargo continua o mesmo, e é ele que decide o que a pessoa faz no
 * sistema: a profissão só diz quem ela é.
 *
 * A forma da palavra (psicóloga ou psicólogo) é escolhida por quem cadastra, e nunca
 * deduzida do nome. Este arquivo não importa nada: o servidor, a tela e o protótipo
 * leem a mesma lista, e o banco repete os códigos no CHECK da `app_user.profissao`
 * (identity/1722), com teste que confere os dois.
 */
export const PROFISSOES = [
  { cod: 'assistente_social', rotulo: 'Assistente social' },
  { cod: 'psicologa', rotulo: 'Psicóloga' },
  { cod: 'psicologo', rotulo: 'Psicólogo' },
  { cod: 'psicopedagoga', rotulo: 'Psicopedagoga' },
  { cod: 'psicopedagogo', rotulo: 'Psicopedagogo' },
] as const;

export type Profissao = (typeof PROFISSOES)[number]['cod'];

/** Só quem é da equipe técnica tem profissão escrita. */
export const CARGO_COM_PROFISSAO = 'equipe_tecnica';

export const ehProfissao = (x: unknown): x is Profissao =>
  typeof x === 'string' && PROFISSOES.some((p) => p.cod === x);

/** O nome que vai na etiqueta: a profissão, quando há, e senão o nome do cargo. */
export function rotuloDaProfissao(cargo: string | null | undefined, profissao: string | null | undefined): string | null {
  if (cargo !== CARGO_COM_PROFISSAO || !profissao) return null;
  return PROFISSOES.find((p) => p.cod === profissao)?.rotulo ?? null;
}
