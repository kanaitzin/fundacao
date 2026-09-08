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
 * `foraDaFilaOffline` marca o que NÃO se guarda sem sinal, e hoje é só a
 * confirmação de dose.
 *
 * Até 08/09/2026 a marca se chamava `exigeAparelhoInstitucional` e valia o
 * §11.7: offline, só o aparelho registrado da casa confirmava medicamento — a
 * trava contra a mesma dose confirmada em dois aparelhos que não se enxergam.
 * A Fundação decidiu que o sistema roda no celular de cada pessoa, com o
 * e-mail institucional, e com isso não existe mais "o aparelho da casa" para
 * ser essa trava. Deixar cada celular guardar confirmação de dose devolveria
 * exatamente a duplicidade que a regra evitava, com o agravante de a pessoa só
 * descobrir horas depois.
 *
 * A recusa continua sendo NA HORA, com a frase certa — nunca guardar para
 * devolver rejeitada mais tarde, quando quem deu o remédio já foi para casa.
 */
export interface TipoOffline {
  /** O `kind` que viaja em `POST /sync/push`. */
  kind: string;
  /** O que a pessoa acabou de fazer, na voz dela. Vai para a tela da fila. */
  rotulo: string;
  /** Não se guarda sem sinal: a recusa vem na hora, com a frase (0930). */
  foraDaFilaOffline: boolean;
}

export const TIPOS_OFFLINE: readonly TipoOffline[] = [
  { kind: 'activity.record',      rotulo: 'Registro de atividade',        foraDaFilaOffline: false },
  { kind: 'activity.acknowledge', rotulo: 'Ciência de atividade',         foraDaFilaOffline: false },
  { kind: 'check.mark',           rotulo: 'Marcação de chamada',          foraDaFilaOffline: false },
  { kind: 'handover.sign',        rotulo: 'Assinatura da passagem',       foraDaFilaOffline: false },
  { kind: 'handover.receipt',     rotulo: 'Recebimento da passagem',      foraDaFilaOffline: false },
  { kind: 'health.evolution',     rotulo: 'Evolução de saúde',            foraDaFilaOffline: false },
  { kind: 'medication.confirm',   rotulo: 'Confirmação de dose',          foraDaFilaOffline: true  },
] as const;

export const TIPOS_OFFLINE_KINDS: readonly string[] = TIPOS_OFFLINE.map((t) => t.kind);

export function tipoOffline(kind: string): TipoOffline | undefined {
  return TIPOS_OFFLINE.find((t) => t.kind === kind);
}
