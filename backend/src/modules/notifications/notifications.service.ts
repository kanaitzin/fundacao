import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import {
  AuthenticatedUser, DomainEvent, EscalationRequest, DirectNotice,
} from '../../kernel/contracts';

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
    // DOIS eventos genéricos, definidos no kernel. Este módulo não conhece
    // atividade, dose, substituição ou evolução — só o pedido de avisar.
    // Um módulo novo entra no fluxo de notificação sem alterar uma linha aqui.
    this.bus.on('escalation.requested', (e) => this.onEscalation(e));
    this.bus.on('notice.requested', (e) => this.onDirectNotice(e));
  }

  private async onEscalation(e: DomainEvent<EscalationRequest>) {
    if (!e.houseId) return;
    await this.escalate({ houseId: e.houseId, ...e.payload });
  }

  private async onDirectNotice(e: DomainEvent<DirectNotice>) {
    await this.notify({
      userId: e.payload.userId,
      houseId: e.houseId ?? null,
      title: e.payload.title,
      body: e.payload.body,
      priority: e.payload.priority,
      entity: e.payload.entity,
      entityId: e.payload.entityId,
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
      action: 'notification.ack', actorId: user.id,
      houseId: await this.audit.casaDoRegistro(user.id, 'notification', id),
      entity: 'notification', entityId: id,
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
