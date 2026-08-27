import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/** Estados que encerram a atividade — depois deles só cabe adendo. */
const ESTADOS_FINAIS = new Set([
  'concluida_no_horario', 'concluida_com_atraso', 'reagendada',
  'cancelada_externamente', 'recusada_pelo_acolhido', 'nao_aplicavel',
  'nao_realizada_saude', 'nao_realizada_ausencia_profissional',
  'nao_realizada_transporte', 'nao_realizada_decisao_institucional',
]);

/** Exceções exigem justificativa neutra (§8.4). */
const EXIGEM_JUSTIFICATIVA = new Set([
  'reagendada', 'cancelada_externamente', 'recusada_pelo_acolhido',
  'nao_realizada_saude', 'nao_realizada_ausencia_profissional',
  'nao_realizada_transporte', 'nao_realizada_decisao_institucional',
]);

const PODE_URGENTE = ['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica', 'coordenador', 'gestor_geral'];
const PODE_AUTORIZAR_SUB = ['lider_diurno', 'lider_noturno_geral', 'equipe_tecnica', 'coordenador'];

export const ESTADO_LABEL: Record<string, string> = {
  agendada: 'Agendada',
  aguardando_ciencia: 'Aguardando ciência',
  ciente: 'Ciente',
  em_andamento: 'Em andamento',
  concluida_no_horario: 'Concluída no horário',
  concluida_com_atraso: 'Concluída com atraso',
  reagendada: 'Reagendada',
  cancelada_externamente: 'Cancelada externamente',
  recusada_pelo_acolhido: 'Recusada pelo acolhido',
  nao_realizada_saude: 'Não realizada — saúde',
  nao_realizada_ausencia_profissional: 'Não realizada — ausência profissional',
  nao_realizada_transporte: 'Não realizada — transporte',
  nao_realizada_decisao_institucional: 'Não realizada — decisão institucional',
  nao_aplicavel: 'Não aplicável',
  sem_confirmacao: 'Sem confirmação',
  aguardando_substituicao: 'Aguardando substituição',
};

@Injectable()
export class ActivitiesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  /** Gera as atividades do dia a partir da rotina vigente. Idempotente. */
  async generateDay(user: AuthenticatedUser, houseId: string, date: string) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(`SELECT * FROM app_generate_day($1,$2)`, [houseId, date]);
      return row;
    });
    await this.audit.log({
      action: 'activity.generate_day', actorId: user.id, houseId,
      detail: { data: date, criadas: r.criadas, jaExistiam: r.ja_existiam },
    });
    return { criadas: Number(r.criadas), jaExistiam: Number(r.ja_existiam) };
  }

  async listDay(user: AuthenticatedUser, houseId: string, date: string, opts: { personId?: string; onlyMine?: boolean } = {}) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        // Sem `LEFT JOIN person`: o JOIN não derrubava a atividade, mas
        // devolvia nome NULL para quem já saiu — e o Painel da Casa montava
        // uma linha do "Visão dos 20" chamada "—". Perder identidade sem
        // sinalizar é o mesmo defeito, de terno.
        `SELECT a.*, app_person_display_name(a.person_id) AS pessoa,
                app_person_age(a.person_id) AS idade,
                (SELECT count(*)::int FROM activity_acknowledgement k
                  WHERE k.activity_id = a.id) AS ciencias,
                EXISTS (SELECT 1 FROM activity_acknowledgement k
                         WHERE k.activity_id = a.id AND k.user_id = $3) AS ciente_por_mim,
                EXISTS (SELECT 1 FROM activity_assignment g
                         WHERE g.activity_id = a.id AND (g.user_id = $3 OR g.user_id IS NULL)) AS minha,
                -- Autoria visível (§9) sem abrir o cadastro de funcionários.
                (SELECT app_user_display_name(g.user_id) FROM activity_assignment g
                  WHERE g.activity_id = a.id AND g.user_id IS NOT NULL LIMIT 1) AS responsavel
         FROM activity a
         WHERE a.house_id = $1
           AND (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
           AND ($4::uuid IS NULL OR a.person_id = $4)
         ORDER BY a.scheduled_at, a.title`,
        [houseId, date, user.id, opts.personId ?? null]);

      const lista = rows.map(mapActivity);
      // "Minhas responsabilidades" filtra a visão, mas a visão da casa (§9)
      // continua mostrando TUDO — tarefa individual nunca fica oculta lá.
      return opts.onlyMine ? lista.filter((a) => a.minha || a.exigeCiencia) : lista;
    });
  }

  /** "Estou ciente" — ato pessoal; ciência não é conclusão (§8.2). */
  async acknowledge(user: AuthenticatedUser, activityId: string, ctx: { device?: string; offline?: boolean } = {}) {
    const act = await this.db.asUser(user.id, async (c) => {
      const { rows: [a] } = await c.query(`SELECT id, house_id, state, title FROM activity WHERE id = $1`, [activityId]);
      if (!a) return null;
      try {
        await c.query(
          `INSERT INTO activity_acknowledgement (activity_id, user_id, device, offline)
           VALUES ($1,$2,$3,$4)`, [activityId, user.id, ctx.device ?? null, ctx.offline ?? false]);
      } catch (e: any) {
        if (e?.code === '23505') throw new ConflictException('Você já tomou ciência desta atividade.');
        throw e;
      }
      if (a.state === 'aguardando_ciencia') {
        await c.query(`UPDATE activity SET state='ciente', updated_at=now() WHERE id=$1`, [activityId]);
      }
      return a;
    });
    if (!act) throw new NotFoundException('Atividade não encontrada');

    await this.audit.log({
      action: 'activity.ack', actorId: user.id, houseId: act.house_id,
      entity: 'activity', entityId: activityId, detail: { offline: ctx.offline ?? false },
    });
    return { ok: true, estado: 'ciente', aviso: 'Ciência registrada. Ciência não é conclusão.' };
  }

  /**
   * Registra o resultado da atividade — conclusão ou exceção.
   * Complementos não sobrescrevem: cada registro é uma linha de execução com
   * autor próprio, e a atividade guarda o último estado (§8.2).
   */
  async record(user: AuthenticatedUser, activityId: string, input: {
    estado: string; nota?: string; happenedAt?: string; offline?: boolean;
    device?: string; clientOpId?: string;
  }) {
    if (!ESTADO_LABEL[input.estado]) throw new BadRequestException('Estado inválido.');
    if (EXIGEM_JUSTIFICATIVA.has(input.estado) && !input.nota?.trim()) {
      throw new BadRequestException('Esta exceção exige justificativa objetiva: fato e contexto, sem rótulo.');
    }

    const res = await this.db.asUser(user.id, async (c) => {
      const { rows: [a] } = await c.query(`SELECT id, house_id, person_id, title FROM activity WHERE id = $1`, [activityId]);
      if (!a) return null;

      // Idempotência offline (§17.4): reenvio da mesma operação não duplica.
      if (input.clientOpId) {
        const { rows: [dup] } = await c.query(
          `SELECT id FROM activity_execution WHERE client_op_id = $1`, [input.clientOpId]);
        if (dup) return { a, duplicada: true };
      }

      await c.query(
        `INSERT INTO activity_execution (activity_id, user_id, resulting_state, note,
           happened_at, offline, device, client_op_id, synced_at)
         VALUES ($1,$2,$3::activity_state,$4, coalesce($5::timestamptz, now()), $6,$7,$8,
                 CASE WHEN $6 THEN now() END)`,
        [activityId, user.id, input.estado, input.nota ?? null, input.happenedAt ?? null,
         input.offline ?? false, input.device ?? null, input.clientOpId ?? null]);

      await c.query(
        `UPDATE activity SET state=$2::activity_state, exception_note=$3,
           updated_at=now(), version=version+1 WHERE id=$1`,
        [activityId, input.estado, EXIGEM_JUSTIFICATIVA.has(input.estado) ? (input.nota ?? null) : null]);

      return { a, duplicada: false };
    });
    if (!res) throw new NotFoundException('Atividade não encontrada');
    if (res.duplicada) return { ok: true, duplicada: true, estado: input.estado };

    await this.audit.log({
      action: 'activity.record', actorId: user.id, houseId: res.a.house_id,
      entity: 'activity', entityId: activityId,
      detail: { estado: input.estado, offline: input.offline ?? false },
    });

    // Outros módulos podem reagir sem que este saiba que existem.
    await this.bus.publish('activity.recorded',
      { activityId, personId: res.a.person_id, estado: input.estado, titulo: res.a.title },
      { actorId: user.id, houseId: res.a.house_id });

    return { ok: true, estado: input.estado, rotulo: ESTADO_LABEL[input.estado] };
  }

  /** Atividade urgente e pontual do plantão (§8.2) — não altera a rotina regular. */
  async createUrgent(user: AuthenticatedUser, input: {
    houseId: string; title: string; scheduledAt: string; reason: string;
    personId?: string; kind?: string; instructions?: string;
  }) {
    if (!PODE_URGENTE.includes(user.role)) {
      throw new ForbiddenException('Somente líderes de plantão, equipe técnica e coordenação criam atividade urgente.');
    }
    if (!input.reason?.trim()) throw new BadRequestException('Informe o motivo da atividade urgente.');

    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `INSERT INTO activity (house_id, person_id, kind, title, scheduled_at, urgent, urgent_reason,
           instructions, requires_ack, state, created_by)
         VALUES ($1,$2,$3,$4,$5,true,$6,$7,true,'aguardando_ciencia',$8) RETURNING id`,
        [input.houseId, input.personId ?? null, input.kind ?? 'outro', input.title,
         input.scheduledAt, input.reason, input.instructions ?? null, user.id]);
      return r.id;
    });
    await this.audit.log({
      action: 'activity.create_urgent', actorId: user.id, houseId: input.houseId,
      entity: 'activity', entityId: id, detail: { motivo: input.reason, papel: user.role },
    });
    return {
      id,
      aviso: 'Atividade urgente e pontual registrada com autoria e motivo. O planejamento regular não foi alterado.',
    };
  }

  // ---------- Substituição (§8.3) ----------

  async requestSubstitution(user: AuthenticatedUser, activityId: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('Informe o motivo do pedido de substituição.');
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [a] } = await c.query(`SELECT id, house_id, title FROM activity WHERE id=$1`, [activityId]);
      if (!a) return null;
      const { rows: [s] } = await c.query(
        `INSERT INTO substitution_request (activity_id, house_id, requested_by, reason)
         VALUES ($1,$2,$3,$4) RETURNING id`, [activityId, a.house_id, user.id, reason]);
      await c.query(`UPDATE activity SET state='aguardando_substituicao', updated_at=now() WHERE id=$1`, [activityId]);
      return { s, a };
    });
    if (!r) throw new NotFoundException('Atividade não encontrada');

    await this.audit.log({
      action: 'substitution.request', actorId: user.id, houseId: r.a.house_id,
      entity: 'substitution_request', entityId: r.s.id, detail: { activityId },
    });
    for (const level of ['lider', 'tecnica_coordenacao']) {
      await this.bus.publish('escalation.requested', {
        level, entity: 'substitution_request', entityId: r.s.id,
        reason: 'Pedido de substituição aguardando autorização',
        title: 'Pedido de substituição',
        body: `Atividade "${r.a.title}" aguarda substituto.`,
        priority: level === 'lider' ? 'alta' : 'normal',
      }, { actorId: user.id, houseId: r.a.house_id });
    }

    return { id: r.s.id, status: 'solicitada', aviso: 'Pedido registrado no sistema, com motivo e autoria.' };
  }

  async assignSubstitute(user: AuthenticatedUser, substitutionId: string, substituteId: string, note?: string) {
    if (!PODE_AUTORIZAR_SUB.includes(user.role)) {
      throw new ForbiddenException('Somente o líder do turno, a equipe técnica ou a coordenação autorizam substituição.');
    }
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [s] } = await c.query(
        `UPDATE substitution_request SET status='atribuida', authorized_by=$2, substitute_id=$3,
           decided_at=now(), decision_note=$4
         WHERE id=$1 AND status='solicitada' RETURNING id, activity_id, house_id`,
        [substitutionId, user.id, substituteId, note ?? null]);
      if (!s) return null;
      await c.query(
        `INSERT INTO activity_assignment (activity_id, user_id, assigned_by) VALUES ($1,$2,$3)`,
        [s.activity_id, substituteId, user.id]);
      await c.query(`UPDATE activity SET state='aguardando_ciencia', updated_at=now() WHERE id=$1`, [s.activity_id]);
      return s;
    });
    if (!r) throw new NotFoundException('Pedido não encontrado ou já decidido.');

    await this.audit.log({
      action: 'substitution.assign', actorId: user.id, houseId: r.house_id,
      entity: 'substitution_request', entityId: substitutionId, detail: { substituteId },
    });
    // O substituto precisa TOMAR CIÊNCIA: ser designado não basta (§8.3).
    await this.bus.publish('notice.requested', {
      userId: substituteId,
      title: 'Você foi designado para uma atividade',
      body: 'Tome ciência para assumir a atividade do plantão.',
      priority: 'alta', entity: 'activity', entityId: r.activity_id,
    }, { actorId: user.id, houseId: r.house_id });

    return { ok: true, status: 'atribuida', aviso: 'O substituto precisa tomar ciência para assumir.' };
  }

  async listSubstitutions(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT s.id, s.reason, s.status, s.requested_at, s.decision_note,
                a.title, a.scheduled_at,
                app_user_display_name(s.requested_by) AS pedinte,
                app_user_display_name(s.substitute_id) AS substituto
         FROM substitution_request s
         JOIN activity a ON a.id = s.activity_id
         WHERE s.house_id = $1 ORDER BY s.requested_at DESC LIMIT 50`, [houseId]);
      return rows.map((r) => ({
        id: r.id, atividade: r.title, horario: r.scheduled_at, motivo: r.reason,
        status: r.status, pedidoPor: r.pedinte, substituto: r.substituto,
        decidiuNota: r.decision_note, solicitadoEm: r.requested_at,
      }));
    });
  }

  /** Vencidas sem confirmação (§8.5) — nunca vira "não realizada" sozinha. */
  async markUnconfirmed(user: AuthenticatedUser, houseId: string, minutes = 60) {
    const n = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(`SELECT app_mark_unconfirmed($1,$2) AS n`, [houseId, minutes]);
      return Number(r.n);
    });
    if (n > 0) {
      // Contrato genérico do kernel: pedimos que alguém seja avisado, sem
      // saber quem avisa (§8.5).
      await this.bus.publish('escalation.requested', {
        level: 'tecnica_coordenacao',
        entity: 'activity_batch', entityId: houseId,
        reason: `${n} atividade(s) sem confirmação há mais de ${minutes} min`,
        title: 'Atividades sem confirmação',
        body: `${n} atividade(s) venceram sem registro. "Sem confirmação" não significa não realizada — é preciso conferir com a equipe do plantão.`,
        priority: 'alta', groupKey: `unconfirmed:${houseId}`,
      }, { houseId });
    }
    return { marcadas: n, aviso: 'Marcadas como “sem confirmação”. A equipe analisa; o sistema não conclui omissão.' };
  }
}

export function mapActivity(r: any) {
  return {
    id: r.id,
    titulo: r.title,
    tipo: r.kind,
    horario: r.scheduled_at,
    fim: r.ends_at,
    estado: r.state,
    rotulo: ESTADO_LABEL[r.state] ?? r.state,
    coletiva: r.person_id === null,
    acolhido: r.person_id
      ? { id: r.person_id, nome: r.pessoa ?? '(fora do seu alcance)',
          idade: r.idade, visivel: r.pessoa != null }
      : null,
    exigeCiencia: r.requires_ack,
    cientePorMim: r.ciente_por_mim,
    ciencias: r.ciencias,
    minha: r.minha,
    responsavel: r.responsavel,
    urgente: r.urgent,
    motivoUrgencia: r.urgent_reason,
    instrucoes: r.instructions,
    justificativa: r.exception_note,
    final: ESTADOS_FINAIS.has(r.state),
  };
}
