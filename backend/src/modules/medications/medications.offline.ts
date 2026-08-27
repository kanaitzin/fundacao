import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SyncService } from '../sync';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * Aplicador das confirmações de dose feitas OFFLINE (§11.7).
 *
 * O `sync` já recusa `medication.*` fora do aparelho institucional na porta de
 * entrada. Aqui a mesma regra é verificada de novo, dentro do comando de
 * confirmação — porque numa operação que envolve medicação, uma única camada
 * de verificação é pouco.
 */
@Injectable()
export class MedicationsOfflineHandlers implements OnModuleInit {
  constructor(
    @Inject(SyncService) private readonly sync: SyncService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  onModuleInit() {
    this.sync.registerHandler('medication.confirm', (u, op) => this.confirm(u, op));
  }

  private async confirm(user: AuthenticatedUser, op: any) {
    const p = op.payload;
    return this.db.asUser(user.id, async (c) => {
      const { rows: [dup] } = await c.query(
        `SELECT id FROM medication_administration WHERE client_op_id = $1`, [op.clientOpId]);
      if (dup) return { duplicada: true };

      // O horário REAL da administração é o do aparelho, não o da sincronização.
      await c.query(
        `SELECT * FROM app_confirm_dose($1,$2,$3,$4::timestamptz,true,$5,$6,$7)`,
        [p.administrationId, p.estado, p.nota ?? null, op.happenedAt,
         op.device ?? null, op.institutionalDevice ?? false, op.clientOpId]);
      return {};
    });
  }
}
