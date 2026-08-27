import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SyncService } from '../sync';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * Aplicador das operações offline DE ATIVIDADES.
 *
 * Mora aqui, e não dentro de `sync`, por uma razão de fronteira: quem conhece
 * as regras e as tabelas de uma atividade é este módulo. O `sync` cuida da
 * fila, da idempotência e dos conflitos — e não precisa saber o que é uma
 * atividade. Remover `activities` faz suas operações offline serem recusadas
 * com motivo, em vez de quebrar a sincronização.
 */
@Injectable()
export class ActivitiesOfflineHandlers implements OnModuleInit {
  constructor(
    @Inject(SyncService) private readonly sync: SyncService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  onModuleInit() {
    this.sync.registerHandler('activity.record', (u, op) => this.record(u, op));
    this.sync.registerHandler('activity.acknowledge', (u, op) => this.acknowledge(u, op));
  }

  /** Conclusão ou exceção registrada sem internet. Horário real preservado. */
  private async record(user: AuthenticatedUser, op: any) {
    const p = op.payload;
    return this.db.asUser(user.id, async (c) => {
      const { rows: [dup] } = await c.query(
        `SELECT id FROM activity_execution WHERE client_op_id = $1`, [op.clientOpId]);
      if (dup) return { duplicada: true };

      await c.query(
        `INSERT INTO activity_execution (activity_id, user_id, resulting_state, note,
           happened_at, offline, device, client_op_id, synced_at)
         VALUES ($1,$2,$3::activity_state,$4,$5,true,$6,$7,now())`,
        [p.activityId, user.id, p.estado, p.nota ?? null, op.happenedAt, op.device ?? null, op.clientOpId]);
      await c.query(
        `UPDATE activity SET state=$2::activity_state, updated_at=now(), version=version+1 WHERE id=$1`,
        [p.activityId, p.estado]);
      return {};
    });
  }

  private async acknowledge(user: AuthenticatedUser, op: any) {
    const p = op.payload;
    return this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `INSERT INTO activity_acknowledgement (activity_id, user_id, device, offline, at)
         VALUES ($1,$2,$3,true,$4) ON CONFLICT (activity_id, user_id) DO NOTHING`,
        [p.activityId, user.id, op.device ?? null, op.happenedAt]);
      return { duplicada: (rowCount ?? 0) === 0 };
    });
  }
}
