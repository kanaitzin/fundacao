/**
 * KERNEL — Contratos compartilhados.
 *
 * O único vocabulário que TODOS os módulos podem conhecer. Mantenha mínimo:
 * cada tipo aqui é um acoplamento global. Se algo serve a um só domínio,
 * o lugar dele é dentro do módulo, não aqui.
 */

/** Identidade resolvida da sessão. Produzida pelo módulo `identity`. */
export interface AuthenticatedUser {
  id: string;
  institutionId: string;
  email: string;
  fullName: string;
  role: RoleCode;
  sessionId: string;
  lastReauthAt: Date | null;
  mustChangePassword: boolean;
}

export type RoleCode =
  | 'gestor_geral' | 'coordenador' | 'equipe_tecnica' | 'educador'
  | 'lider_diurno' | 'lider_noturno_geral' | 'enfermagem'
  | 'cozinha'
  /*
   * APOSENTADO em 01/09/2026 (migração 0770). O cargo não existe na Fundação;
   * as funções dele passaram para a equipe técnica e a coordenação. O valor
   * continua no tipo porque continua no enum do banco: contas e registros de
   * auditoria antigos o carregam, e apagá-lo reescreveria o histórico.
   */
  | 'admin_tecnico';

/**
 * Evento da Linha do Tempo Unificada (§9).
 *
 * É o formato comum que qualquer módulo usa para aparecer na linha do tempo,
 * SEM que a timeline precise conhecer o módulo. Rotina, atividades, chamadas,
 * medicamentos (Fase 4) e ocorrências (Fase 5) publicam neste mesmo formato.
 */
export interface TimelineEvent {
  /** Identificador único e estável, prefixado pelo módulo: "activity:<uuid>". */
  id: string;
  /** Módulo de origem — permite filtrar e depurar sem acoplar. */
  source: string;
  /** Momento previsto do evento, no fuso America/Sao_Paulo. */
  at: string;
  kind: TimelineKind;
  title: string;
  /** Nulo quando é evento coletivo da casa. */
  personId: string | null;
  personName: string | null;
  houseId: string;
  /** Estado textual já em linguagem de usuário (§8.4). */
  state: string;
  /** Severidade operacional — cor/destaque na interface, nunca julgamento. */
  severity: 'normal' | 'atencao' | 'critico';
  responsible?: string | null;
  note?: string | null;
  /** Ações que este papel pode executar sobre o evento. */
  actions?: TimelineAction[];
}

export type TimelineKind =
  | 'rotina' | 'refeicao' | 'atividade' | 'saida' | 'medicamento'
  | 'chamada' | 'plantao' | 'ocorrencia' | 'saude';

export interface TimelineAction {
  /** Comando específico, não update genérico (§25). */
  command: string;
  label: string;
}

/**
 * Um módulo que quer aparecer na linha do tempo implementa isto e se registra.
 * A timeline não importa nada do módulo — só esta interface.
 */
export interface TimelineProvider {
  /** Nome do módulo, usado em `TimelineEvent.source`. */
  readonly source: string;
  fetch(query: TimelineQuery): Promise<TimelineEvent[]>;
}

export interface TimelineQuery {
  user: AuthenticatedUser;
  houseId: string;
  /** Dia no formato YYYY-MM-DD (fuso da instituição). */
  date: string;
  /** Quando presente, filtra a um acolhido (modo "Acolhido individual", §9). */
  personId?: string;
  /** Modo "Minhas responsabilidades" (§9). */
  onlyMine?: boolean;
}

/** Evento de domínio publicado no barramento interno. */
export interface DomainEvent<T = Record<string, unknown>> {
  name: string;
  at: Date;
  actorId?: string | null;
  houseId?: string | null;
  payload: T;
}

/**
 * Pedido de escalonamento — o contrato que qualquer módulo usa para pedir que
 * alguém seja avisado, SEM conhecer quem avisa.
 *
 * Antes, o módulo de notificações precisava assinar um evento por domínio
 * ("atividade vencida", "dose atrasada", "substituição pedida") e crescia a
 * cada módulo novo. Com um contrato único, `notifications` ouve UM evento e
 * nunca mais muda; e um módulo novo é avisado sem tocar em nada.
 *
 * Publique com: bus.publish('escalation.requested', payload, { houseId }).
 */
/**
 * DOCUMENTO FECHADO — o gatilho da cópia documental (§16).
 *
 * Publicado por quem fecha: a ATA da casa, a ATA Geral Noturna, a ocorrência
 * validada, o acompanhamento entregue. O módulo `archive` escuta e enfileira.
 *
 * Por que evento, e não chamada direta: `shifts` não pode importar `archive`
 * (partições isoladas, regra 5), e o arquivo é uma CÓPIA — se a partição for
 * removida, fechar a ATA continua funcionando, o evento apenas deixa de ter
 * ouvinte. O contrário — a ATA não fechar porque o Drive está fora do ar — é
 * o desenho errado: o documento vale no sistema, a cópia é conveniência.
 *
 * Carrega IDs e categoria. Nunca o conteúdo (§20).
 */
export interface DocumentClosed extends Record<string, unknown> {
  /** Categoria do acervo: 'ata', 'ocorrencia', 'acompanhamento'… */
  categoria: string;
  /** Módulo de origem: 'ata', 'general_night_ata', 'incident', 'followup'. */
  entidade: string;
  entityId: string;
  houseId?: string | null;
  /** Documento de área restrita vai para outra raiz no Drive (§16.5). */
  restrita?: boolean;
  /** Quando o documento fechou — decide a pasta ano/mês. */
  quando?: string;
  /** V1, V2_ADENDO… */
  versao?: string;
}

export interface EscalationRequest extends Record<string, unknown> {
  /** Quem deve ser avisado: 'equipe' | 'lider' | 'tecnica_coordenacao' | 'enfermagem'. */
  level: string;
  /** Agrupa o escalonamento para não repetir o mesmo aviso (idempotência). */
  entity: string;
  entityId: string;
  reason: string;
  title: string;
  body: string;
  priority?: 'normal' | 'alta' | 'critica';
  /** Notificações com a mesma chave se somam em vez de inundar (§19). */
  groupKey?: string;
}

/** Aviso direto a UMA pessoa (ex.: substituto designado). */
export interface DirectNotice extends Record<string, unknown> {
  userId: string;
  title: string;
  body?: string;
  priority?: 'normal' | 'alta' | 'critica';
  entity?: string;
  entityId?: string;
}
