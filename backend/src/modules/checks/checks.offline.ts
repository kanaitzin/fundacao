import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SyncService } from '../sync';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/** Aplicador das marcações de chamada feitas offline (§17). */
@Injectable()
export class ChecksOfflineHandlers implements OnModuleInit {
  constructor(
    @Inject(SyncService) private readonly sync: SyncService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  onModuleInit() {
    this.sync.registerHandler('check.mark', (u, op) => this.mark(u, op));
  }

  private async mark(user: AuthenticatedUser, op: any) {
    const p = op.payload;
    return this.db.asUser(user.id, async (c) => {
      const { rows: [dup] } = await c.query(
        `SELECT id FROM check_result WHERE client_op_id = $1`, [op.clientOpId]);
      if (dup) return { duplicada: true };

      // A política do banco continua valendo aqui: só entra quem tem
      // permanência ativa na casa da chamada, mesmo vindo do offline.
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
