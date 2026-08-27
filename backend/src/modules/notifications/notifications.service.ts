import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser, DomainEvent } from '../../kernel/contracts';

/** Texto neutro para tela bloqueada e push (§19). Nunca revela conteúdo. */
const TITULO_SEGURO = 'Há uma pendência na Rede Acolher';

/**
 * Central de notificações e escalonamento (§19, §8.5).
 *
 * Este módulo REAGE a eventos publicados por outros, sem importá-los. Se
 * `activities` ou `checks` deixarem de existir, aqui nada quebra: os eventos
 * simplesmente param de chegar. Se este módulo for removido, os outros seguem
 * funcionando — apenas ninguém é avisado.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  onModuleInit() {
    // Assinaturas por NOME do evento — nenhuma importação de módulo.
    this.bus.on('activity.unconfirmed', (e) => this.onUnconfirmed(e));
    this.bus.on('substitution.requested', (e) => this.onSubstitution(e));
    this.bus.on('substitution.assigned', (e) => this.onSubstituteAssigned(e));
  }

  // ---------- Reações ----------

  /**
   * Atividade vencida sem confirmação: uma hora depois, avisa equipe técnica
   * e coordenação (§8.5). O escalonamento é idempotente — reprocessar a fila
   * não gera avalanche de avisos repetidos.
   */
  private async onUnconfirmed(e: DomainEvent<{ quantidade: number; minutos: number }>) {
    if (!e.houseId) return;
    await this.escalate({
      houseId: e.houseId,
      entity: 'activity_batch',
      entityId: e.houseId,          // agrupado por casa e nível
      level: 'tecnica_coordenacao',
      reason: `${e.payload.quantidade} atividade(s) sem confirmação há mais de ${e.payload.minutos} min`,
      title: 'Atividades sem confirmação',
      body: `${e.payload.quantidade} atividade(s) venceram sem registro. "Sem confirmação" não significa não realizada — é preciso conferir com a equipe do plantão.`,
      priority: 'alta',
      groupKey: `unconfirmed:${e.houseId}`,
    });
  }

  private async onSubstitution(e: DomainEvent<{ substitutionId: string; titulo: string }>) {
    if (!e.houseId) return;
    await this.escalate({
      houseId: e.houseId,
      entity: 'substitution_request',
      entityId: e.payload.substitutionId,
      level: 'lider',
      reason: 'Pedido de substituição aguardando autorização',
      title: 'Pedido de substituição',
      body: `Atividade "${e.payload.titulo}" aguarda substituto.`,
      priority: 'alta',
    });
    // Também à técnica/coordenação: a escala oficial é responsabilidade delas.
    await this.escalate({
      houseId: e.houseId,
      entity: 'substitution_request',
      entityId: e.payload.substitutionId,
      level: 'tecnica_coordenacao',
      reason: 'Pedido de substituição registrado',
      title: 'Pedido de substituição na casa',
      body: `Atividade "${e.payload.titulo}" aguarda substituto.`,
      priority: 'normal',
    });
  }

  /** O substituto precisa TOMAR CIÊNCIA — ser designado não basta (§8.3). */
  private async onSubstituteAssigned(e: DomainEvent<{ substituteId: string; activityId: string }>) {
    await this.notify({
      userId: e.payload.substituteId,
      houseId: e.houseId ?? null,
      title: 'Você foi designado para uma atividade',
      body: 'Tome ciência para assumir a atividade do plantão.',
      priority: 'alta',
      entity: 'activity',
      entityId: e.payload.activityId,
    });
  }

  // ---------- Núcleo ----------

  /**
   * Escalonamento como COMANDO DE SISTEMA (migração 0130).
   *
   * O aviso nasce de um evento e vai para OUTRAS pessoas — não é a escrita de
   * um usuário na própria caixa. Sob RLS isso não teria autor válido, e
   * afrouxar a política para permitir escrever na caixa alheia seria abrir
   * exatamente o que a política protege. A emissão é privilegiada; a leitura
   * continua estrita (cada um vê só as suas).
   *
   * A idempotência mora na chave (entity, entity_id, level): reprocessar a
   * fila depois de uma queda de internet não gera avalanche de avisos.
   */
  private async escalate(input: {
    houseId: string; entity: string; entityId: string; level: string; reason: string;
    title: string; body: string; priority?: 'normal' | 'alta' | 'critica'; groupKey?: string;
  }) {
    const { rows: [r] } = await this.db.query(
      `SELECT app_emit_escalation($1,$2,$3,$4,$5,$6,$7,$8,$9) AS n`,
      [input.houseId, input.entity, input.entityId, input.level, input.reason,
       input.title, input.body, input.priority ?? 'normal', input.groupKey ?? null]);

    const destinatarios = Number(r.n);
    if (destinatarios === 0) return { escalonado: false };   // já havia sido escalonado

    await this.audit.log({
      action: 'escalation.raise', houseId: input.houseId,
      entity: input.entity, entityId: input.entityId,
      detail: { nivel: input.level, destinatarios, motivo: input.reason },
    });
    return { escalonado: true, destinatarios };
  }

  /** Aviso direto a uma pessoa (ex.: substituto designado). */
  private async notify(input: {
    userId: string; houseId: string | null; title: string; body?: string;
    priority?: string; entity?: string; entityId?: string;
  }) {
    await this.db.query(
      `SELECT app_emit_notification($1,$2,$3,$4,$5,$6,$7)`,
      [input.userId, input.houseId, input.title, input.body ?? null,
       input.priority ?? 'normal', input.entity ?? null, input.entityId ?? null]);
  }

  // ---------- Central (o que o usuário vê) ----------

  async list(user: AuthenticatedUser, apenasNaoLidas = false) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT id, title, body, priority, entity, entity_id, read_at, acknowledged_at, created_at
         FROM notification
         WHERE user_id = $1 ${apenasNaoLidas ? 'AND read_at IS NULL' : ''}
         ORDER BY created_at DESC LIMIT 100`, [user.id]);
      return rows.map((r) => ({
        id: r.id, titulo: r.title, texto: r.body, prioridade: r.priority,
        entidade: r.entity, entidadeId: r.entity_id,
        lida: !!r.read_at, ciente: !!r.acknowledged_at, em: r.created_at,
      }));
    });
  }

  async markRead(user: AuthenticatedUser, id: string) {
    await this.db.asUser(user.id, async (c) => {
      await c.query(`UPDATE notification SET read_at = coalesce(read_at, now()) WHERE id=$1 AND user_id=$2`,
        [id, user.id]);
    });
    return { ok: true };
  }

  /** Ciência explícita — diferente de "li" (§19). */
  async acknowledge(user: AuthenticatedUser, id: string) {
    await this.db.asUser(user.id, async (c) => {
      await c.query(
        `UPDATE notification SET read_at = coalesce(read_at, now()), acknowledged_at = now()
         WHERE id=$1 AND user_id=$2`, [id, user.id]);
    });
    await this.audit.log({
      action: 'notification.ack', actorId: user.id, entity: 'notification', entityId: id,
    });
    return { ok: true };
  }

  async unreadCount(user: AuthenticatedUser) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT count(*)::int AS n FROM notification WHERE user_id=$1 AND read_at IS NULL`, [user.id]);
      return { naoLidas: r.n, tituloSeguro: TITULO_SEGURO };
    });
  }
}
