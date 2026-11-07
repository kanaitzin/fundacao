/**
 * O SIGILO POR REGISTRO DE SAÚDE (fase 287, decidido em 07/11). A mesma regra no servidor,
 * na tela e no protótipo; no banco, `app_le_sigilo_de_saude` e `app_marcar_sigilo_de_saude`
 * (nursing/1678). Não importa nada.
 */
/** Quem lê o conteúdo de um registro sigiloso. */
export const LEEM_O_SIGILO = ['enfermagem', 'equipe_tecnica', 'coordenador'];
/** Quem marca qualquer registro como sigiloso (além de quem o registrou). */
export const MARCAM_O_SIGILO = ['enfermagem', 'equipe_tecnica', 'coordenador'];
/** Quem tira o sigilo, sempre com o motivo. */
export const TIRAM_O_SIGILO = ['equipe_tecnica', 'coordenador'];

/** O registro sigiloso para quem não lê: fica o que diz que existe, sai o conteúdo. */
export function semOConteudo<T extends Record<string, unknown>>(linha: T, manter: string[]): T {
  const fora: Record<string, unknown> = {};
  for (const k of Object.keys(linha)) fora[k] = manter.includes(k) ? linha[k] : null;
  return { ...fora, sigiloso: true, conteudoOculto: true } as unknown as T;
}
