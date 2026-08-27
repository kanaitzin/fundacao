import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SyncService } from './sync.service';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * Aplicadores de operações offline.
 *
 * Ficam aqui, e não dentro de cada módulo, por uma razão de fronteira: se
 * `activities` registrasse seu próprio aplicador, `sync` teria de importá-lo
 * (ou o contrário). Como a aplicação é feita por COMANDO no banco — os mesmos
 * comandos que as rotas online usam —, `sync` continua sem depender de módulo
 * de domínio algum, e remover `activities` apenas faz suas operações offline
 * serem recusadas com motivo claro, em vez de quebrar a sincronização.
 */
@Injectable()
export class SyncHandlers implements OnModuleInit {
  constructor(
    @Inject(SyncService) private readonly sync: SyncService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  onModuleInit() {
    this.sync.registerHandler('activity.record', (u, op) => this.activityRecord(u, op));
    this.sync.registerHandler('activity.acknowledge', (u, op) => this.activityAck(u, op));
    this.sync.registerHandler('check.mark', (u, op) => this.checkMark(u, op));
  }

  /** Conclusão/exceção de atividade feita offline. Horário real preservado. */
  private async activityRecord(user: AuthenticatedUser, op: any) {
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

  private async activityAck(user: AuthenticatedUser, op: any) {
    const p = op.payload;
    return this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `INSERT INTO activity_acknowledgement (activity_id, user_id, device, offline, at)
         VALUES ($1,$2,$3,true,$4) ON CONFLICT (activity_id, user_id) DO NOTHING`,
        [p.activityId, user.id, op.device ?? null, op.happenedAt]);
      return { duplicada: rowCount === 0 };
    });
  }

  private async checkMark(user: AuthenticatedUser, op: any) {
    const p = op.payload;
    return this.db.asUser(user.id, async (c) => {
      const { rows: [dup] } = await c.query(
        `SELECT id FROM check_result WHERE client_op_id = $1`, [op.clientOpId]);
      if (dup) return { duplicada: true };

      await c.query(
        `INSERT INTO check_result (check_id, person_id, option_code, note, recorded_by,
           happened_at, offline, client_op_id)
         VALUES ($1,$2,$3,$4,$5,$6,true,$7)
         ON CONFLICT (check_id, person_id) DO UPDATE
           SET option_code = EXCLUDED.option_code, note = EXCLUDED.note, recorded_at = now()`,
        [p.checkId, p.personId, p.opcao, p.nota ?? null, user.id, op.happenedAt, op.clientOpId]);
      return {};
    });
  }
}
