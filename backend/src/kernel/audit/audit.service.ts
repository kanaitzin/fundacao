import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  institutionId?: string | null;
  houseId?: string | null;
  entity?: string;
  entityId?: string;
  purpose?: string;
  /** Somente METADADOS (ids, estados, contadores). Nunca CPF, relato, receita, diagnóstico. */
  detail?: Record<string, unknown>;
}

/**
 * Auditoria (§20): append-only (trigger no banco impede UPDATE/DELETE),
 * apoia apuração humana e nunca decide culpa.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async log(e: AuditEntry): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_event (action, actor_id, institution_id, house_id, entity, entity_id, purpose, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [e.action, e.actorId ?? null, e.institutionId ?? null, e.houseId ?? null,
       e.entity ?? null, e.entityId ?? null, e.purpose ?? null, JSON.stringify(e.detail ?? {})],
    );
  }
}
