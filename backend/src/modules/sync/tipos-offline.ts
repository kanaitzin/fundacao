/**
 * OS TIPOS DE OPERAÇÃO QUE A FILA OFFLINE ACEITA.
 *
 * Este arquivo NÃO IMPORTA NADA de propósito, e é lido pelos dois lados: o
 * servidor confere contra ele os `registerHandler` que os módulos declaram, e
 * o aparelho não enfileira o que não está aqui. A regra que o §17 exige é a
 * mesma nas duas pontas — sem uma lista única, o aparelho guardaria a noite
 * inteira uma operação que o servidor recusa por "tipo desconhecido" na
 * primeira barra de sinal, e quem registrou nunca saberia.
 *
 * Quem escreve um handler novo acrescenta a linha aqui. O teste estático
 * `fila-offline.spec.ts` recusa handler sem linha e linha sem handler.
 *
 * `exigeAparelhoInstitucional` não é preferência de segurança: é o §11.7.
 * Offline, só o aparelho registrado da casa confirma medicamento, e quem
 * decide é o servidor contra o cadastro (a fase 43 tirou essa afirmação do
 * cliente). O aparelho usa a marca para RECUSAR NA HORA, com a frase certa,
 * em vez de guardar até a reconexão uma confirmação de dose que vai voltar
 * rejeitada — e que, até voltar, a educadora acredita ter registrado.
 */
export interface TipoOffline {
  /** O `kind` que viaja em `POST /sync/push`. */
  kind: string;
  /** O que a pessoa acabou de fazer, na voz dela. Vai para a tela da fila. */
  rotulo: string;
  /** §11.7 — offline, só o aparelho institucional da casa. */
  exigeAparelhoInstitucional: boolean;
}

export const TIPOS_OFFLINE: readonly TipoOffline[] = [
  { kind: 'activity.record',      rotulo: 'Registro de atividade',        exigeAparelhoInstitucional: false },
  { kind: 'activity.acknowledge', rotulo: 'Ciência de atividade',         exigeAparelhoInstitucional: false },
  { kind: 'check.mark',           rotulo: 'Marcação de chamada',          exigeAparelhoInstitucional: false },
  { kind: 'handover.sign',        rotulo: 'Assinatura da passagem',       exigeAparelhoInstitucional: false },
  { kind: 'handover.receipt',     rotulo: 'Recebimento da passagem',      exigeAparelhoInstitucional: false },
  { kind: 'health.evolution',     rotulo: 'Evolução de saúde',            exigeAparelhoInstitucional: false },
  { kind: 'medication.confirm',   rotulo: 'Confirmação de dose',          exigeAparelhoInstitucional: true  },
] as const;

export const TIPOS_OFFLINE_KINDS: readonly string[] = TIPOS_OFFLINE.map((t) => t.kind);

export function tipoOffline(kind: string): TipoOffline | undefined {
  return TIPOS_OFFLINE.find((t) => t.kind === kind);
}
