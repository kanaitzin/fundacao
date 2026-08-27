import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/** Assinatura mínima compartilhada por `Pool` e `PoolClient`. */
type QueryFn = (text: string, params?: unknown[]) => Promise<unknown>;

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

  /**
   * Grava o evento.
   *
   * `client` opcional, e importa: passando o cliente da transação em curso, a
   * auditoria vira parte do MESMO ato — ou os dois existem, ou nenhum dos dois.
   * Sem ele, o INSERT usa outra conexão do pool, e aí duas coisas podem sair
   * torto: uma operação revertida deixa rastro de algo que não aconteceu, e uma
   * falha ao auditar depois do COMMIT devolve erro sobre uma escrita que ficou.
   *
   * Regra prática: **acesso a dado sensível audita dentro da transação.** Quem
   * abre um documento, vê dados bancários ou lê narrativa restrita não pode ter
   * o registro do acesso separado do acesso.
   */
  async log(e: AuditEntry, client?: { query: QueryFn }): Promise<void> {
    const executor = client ?? this.db;
    await executor.query(
      `INSERT INTO audit_event (action, actor_id, institution_id, house_id, entity, entity_id, purpose, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [e.action, e.actorId ?? null, e.institutionId ?? null, e.houseId ?? null,
       e.entity ?? null, e.entityId ?? null, e.purpose ?? null, JSON.stringify(e.detail ?? {})],
    );
  }
}
