import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SyncService } from '../sync';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * Evolução de Saúde preenchida OFFLINE (§17.1): o educador acompanha um
 * atendimento fora da casa, muitas vezes sem sinal, e registra ali mesmo.
 * O horário real do atendimento é preservado; a fila sincroniza depois.
 */
@Injectable()
export class NursingOfflineHandlers implements OnModuleInit {
  constructor(
    @Inject(SyncService) private readonly sync: SyncService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  onModuleInit() {
    this.sync.registerHandler('health.evolution', (u, op) => this.evolution(u, op));
  }

  private async evolution(user: AuthenticatedUser, op: any) {
    const p = op.payload;
    return this.db.asUser(user.id, async (c) => {
      const { rows: [dup] } = await c.query(
        `SELECT id FROM health_evolution WHERE client_op_id = $1`, [op.clientOpId]);
      if (dup) return { duplicada: true };

      await c.query(
        `INSERT INTO health_evolution (person_id, house_id, kind, happened_at, place, specialty,
           service_professional, reason, state_departure, state_during, state_return,
           procedures, guidance, restrictions, observations,
           accompanied_by, offline, synced_at, client_op_id)
         VALUES ($1,$2,$3::encounter_kind,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,now(),$17)`,
        [p.personId, op.houseId, p.tipo, op.happenedAt, p.local ?? null, p.especialidade ?? null,
         p.servicoProfissional ?? null, p.motivo ?? null, p.estadoSaida ?? null,
         p.estadoDurante ?? null, p.estadoRetorno ?? null, p.procedimentos ?? null,
         p.orientacoes ?? null, p.restricoes ?? null, p.observacoes ?? null,
         user.id, op.clientOpId]);
      return {};
    });
  }
}
