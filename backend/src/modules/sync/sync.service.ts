import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { DevicesService } from '../identity';

export interface OfflineOp {
  clientOpId: string;
  kind: string;
  houseId?: string;
  payload: Record<string, unknown>;
  /** Horário REAL do evento no aparelho — nunca substituído (§17.3). */
  happenedAt: string;
  queuedAt: string;
  device?: string;
  /** Código do aparelho institucional (§11.7). O servidor confere; o cliente não afirma. */
  deviceToken?: string;
  /** Preenchido pelo SERVIDOR a partir de `deviceToken`. Ignorado se vier do cliente. */
  institutionalDevice?: boolean;
}

/**
 * Sincronização offline (§17).
 *
 * O que este módulo NÃO faz, deliberadamente:
 *  * não decide qual versão é a verdadeira num conflito — preserva as duas e
 *    encaminha à equipe técnica (§9, §17.4);
 *  * não aceita confirmação de medicamento fora do aparelho institucional
 *    designado (§11.7) — a regra vale já aqui, na porta de entrada;
 *  * não reescreve horários: o horário real e o de sincronização convivem.
 *
 * A execução de cada tipo de operação é registrada por quem sabe executá-la
 * (`registerHandler`), então este módulo não importa `activities` nem `checks`.
 */
type Handler = (user: AuthenticatedUser, op: OfflineOp) => Promise<{ duplicada?: boolean }>;

@Injectable()
export class SyncService {
  private readonly handlers = new Map<string, Handler>();

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(DevicesService) private readonly devices: DevicesService,
  ) {}

  /** Um módulo declara que sabe aplicar um tipo de operação offline. */
  registerHandler(kind: string, handler: Handler): void {
    this.handlers.set(kind, handler);
  }

  get tiposSuportados(): string[] {
    return [...this.handlers.keys()];
  }

  /**
   * Recebe um lote da fila local. Processa uma a uma e devolve o destino de
   * cada operação, para que o aparelho saiba o que pode limpar (§17.2: dados
   * locais só são apagados depois de sincronização VERIFICADA).
   */
  async push(user: AuthenticatedUser, ops: OfflineOp[]) {
    if (!Array.isArray(ops) || !ops.length) throw new BadRequestException('Nada a sincronizar.');
    if (ops.length > 500) throw new BadRequestException('Lote grande demais. Envie em partes.');

    const resultados: Array<{ clientOpId: string; status: string; motivo?: string }> = [];

    for (const op of ops) {
      if (!op.clientOpId || !op.kind || !op.happenedAt) {
        resultados.push({ clientOpId: op.clientOpId ?? '?', status: 'rejeitada', motivo: 'operação incompleta' });
        continue;
      }

      // 1) Idempotência: a mesma operação reenviada não é aplicada duas vezes.
      const jaVista = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT status FROM offline_operation WHERE client_op_id = $1`, [op.clientOpId]);
        return r?.status as string | undefined;
      });
      // Só o que FOI APLICADO é duplicata. Uma operação que falhou (conflito)
      // ou foi recusada continua pendente, e o reenvio é uma NOVA tentativa.
      //
      // Antes, qualquer estado gravado respondia "duplicada" e o clientOpId
      // voltava em `podeLimpar` — o aparelho apagava o registro local de uma
      // operação que nunca chegou a existir no servidor. Uma confirmação de
      // dose podia deixar de existir em qualquer lugar. É o oposto do §17.2,
      // que só autoriza apagar depois de sincronização VERIFICADA.
      if (jaVista === 'aplicada' || jaVista === 'duplicada') {
        resultados.push({ clientOpId: op.clientOpId, status: 'duplicada', motivo: `já ${jaVista}` });
        continue;
      }
      const retentativa = jaVista != null;   // conflito/rejeitada anteriores

      // 2) Regra do aparelho institucional para medicamento (§11.7).
      //
      // Quem decide é o SERVIDOR, contra o registro de aparelhos da casa.
      // Antes, `op.institutionalDevice` vinha no corpo da requisição: quem
      // enviasse `true` passava, e o cenário de aceite #15 se apoiava na
      // palavra do próprio aparelho.
      const aparelhoId = await this.devices.verificar(user, op.houseId, op.deviceToken);
      op.institutionalDevice = aparelhoId != null;

      if (op.kind.startsWith('medication.') && !op.institutionalDevice) {
        await this.registrar(user, op, 'rejeitada', 'aparelho não institucional');
        resultados.push({
          clientOpId: op.clientOpId, status: 'rejeitada',
          motivo: 'Offline, somente o aparelho institucional designado confirma medicamento.',
        });
        continue;
      }

      const handler = this.handlers.get(op.kind);
      if (!handler) {
        await this.registrar(user, op, 'rejeitada', 'tipo não suportado');
        resultados.push({ clientOpId: op.clientOpId, status: 'rejeitada', motivo: 'tipo de operação desconhecido' });
        continue;
      }

      try {
        const r = await handler(user, op);
        await this.registrar(user, op, r.duplicada ? 'duplicada' : 'aplicada');
        resultados.push({
          clientOpId: op.clientOpId,
          status: r.duplicada ? 'duplicada' : 'aplicada',
          motivo: retentativa ? 'aplicada em nova tentativa' : undefined,
        });
      } catch (e: any) {
        // Falha de aplicação vira conflito para revisão humana, não descarte.
        await this.registrar(user, op, 'conflito', e?.message ?? 'erro ao aplicar');
        if (op.houseId) {
          await this.abrirConflito(user, {
            houseId: op.houseId, entity: op.kind, kind: 'estado_divergente',
            description: `Operação offline não pôde ser aplicada: ${e?.message ?? 'erro'}`,
            versionA: { origem: 'aparelho', ...op },
            versionB: { origem: 'servidor', observacao: 'estado atual no servidor difere do esperado' },
          });
        }
        resultados.push({ clientOpId: op.clientOpId, status: 'conflito', motivo: e?.message });
      }
    }

    const aplicadas = resultados.filter((r) => r.status === 'aplicada').length;
    await this.audit.log({
      action: 'sync.push', actorId: user.id,
      detail: {
        total: ops.length, aplicadas,
        duplicadas: resultados.filter((r) => r.status === 'duplicada').length,
        conflitos: resultados.filter((r) => r.status === 'conflito').length,
        rejeitadas: resultados.filter((r) => r.status === 'rejeitada').length,
      },
    });

    return {
      recebidas: ops.length,
      resultados,
      // Só o que foi confirmado pode ser apagado do aparelho (§17.2).
      podeLimpar: resultados.filter((r) => ['aplicada', 'duplicada'].includes(r.status)).map((r) => r.clientOpId),
      sincronizadoEm: new Date().toISOString(),
    };
  }

  private async registrar(user: AuthenticatedUser, op: OfflineOp, status: string, error?: string) {
    await this.db.asUser(user.id, async (c) => {
      await c.query(
        `INSERT INTO offline_operation (client_op_id, user_id, house_id, kind, payload,
           happened_at, queued_at, applied_at, status, device, institutional_device, error)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7, CASE WHEN $8='aplicada' THEN now() END, $8,$9,$10,$11)
         -- Na RETENTATIVA a linha já existe com status 'conflito': o resultado
         -- novo precisa substituir o antigo, senão a operação aplicada com
         -- sucesso continuaria marcada como falha para sempre.
         ON CONFLICT (client_op_id) DO UPDATE
           SET status = EXCLUDED.status,
               applied_at = EXCLUDED.applied_at,
               error = EXCLUDED.error,
               payload = EXCLUDED.payload`,
        [op.clientOpId, user.id, op.houseId ?? null, op.kind, JSON.stringify(op.payload ?? {}),
         op.happenedAt, op.queuedAt ?? op.happenedAt, status, op.device ?? null,
         op.institutionalDevice ?? false, error ?? null]);
    });
  }

  // ---------- Conflitos ----------

  async abrirConflito(user: AuthenticatedUser, input: {
    houseId: string; entity: string; entityId?: string; kind: string;
    description: string; versionA: unknown; versionB: unknown;
  }) {
    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `INSERT INTO sync_conflict (house_id, entity, entity_id, kind, description, version_a, version_b)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) RETURNING id`,
        [input.houseId, input.entity, input.entityId ?? null, input.kind, input.description,
         JSON.stringify(input.versionA), JSON.stringify(input.versionB)]);
      return r.id;
    });
    await this.bus.publish('sync.conflict', { conflitoId: id, tipo: input.kind }, { houseId: input.houseId });
    return { id };
  }

  async listConflicts(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT id, entity, entity_id, kind, description, version_a, version_b,
                status, resolution, created_at
         FROM sync_conflict WHERE house_id = $1 AND status = 'aberto'
         ORDER BY created_at DESC`, [houseId]);
      return rows.map((r) => ({
        id: r.id, entidade: r.entity, entidadeId: r.entity_id, tipo: r.kind,
        descricao: r.description,
        // As duas versões vão íntegras para a tela: quem decide é a equipe.
        versaoA: r.version_a, versaoB: r.version_b,
        criadoEm: r.created_at,
        aviso: 'O sistema não escolhe a versão correta. Ambas permanecem registradas.',
      }));
    });
  }

  /** Resolver = registrar a decisão humana. Nenhuma versão é apagada (§17.4). */
  async resolveConflict(user: AuthenticatedUser, conflictId: string, resolution: string) {
    /* alcance:sincronizacao — quem registra a decisão. Conferido contra `alcance.ts`. */
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação resolvem conflitos de sincronização.');
    }
    if (!resolution?.trim()) throw new BadRequestException('Descreva a decisão e o motivo.');

    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE sync_conflict SET status='resolvido', resolved_by=$2, resolved_at=now(), resolution=$3
         WHERE id=$1 AND status='aberto'`, [conflictId, user.id, resolution]);
      return (rowCount ?? 0) > 0;
    });
    if (!ok) throw new NotFoundException('Conflito não encontrado ou já resolvido.');

    await this.audit.log({
      action: 'sync.conflict_resolve', actorId: user.id,
      entity: 'sync_conflict', entityId: conflictId, detail: { decisao: resolution },
    });
    return { ok: true, aviso: 'Decisão registrada. As versões originais permanecem preservadas.' };
  }

  /** O que o aparelho precisa saber ao reconectar. */
  async status(user: AuthenticatedUser) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT count(*) FILTER (WHERE status='aplicada')::int AS aplicadas,
                count(*) FILTER (WHERE status='conflito')::int AS conflitos,
                max(received_at) AS ultima
         FROM offline_operation WHERE user_id = $1`, [user.id]);
      return {
        aplicadas: r.aplicadas, conflitos: r.conflitos,
        ultimaSincronizacao: r.ultima,
        tiposSuportados: this.tiposSuportados,
      };
    });
  }
}
