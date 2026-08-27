import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * Opções por tipo de chamada (§10). "Normal/Compareceu/Participou" é o curso
 * esperado; as demais são exceções que exigem justificativa objetiva.
 *
 * Cada opção descreve o FATO, nunca a criança. Não há opção que classifique
 * a pessoa — só o que aconteceu naquela refeição, aula ou atividade.
 */
export const OPCOES: Record<string, { code: string; label: string; excecao: boolean }[]> = {
  alimentacao: [
    { code: 'normal', label: 'Normal', excecao: false },
    { code: 'parcial', label: 'Parcial', excecao: true },
    { code: 'recusou', label: 'Recusou', excecao: true },
    { code: 'ausente_externa', label: 'Ausente / atividade externa', excecao: true },
    { code: 'dieta_adaptada', label: 'Dieta adaptada', excecao: false },
    { code: 'desconforto', label: 'Desconforto', excecao: true },
    { code: 'nao_aplicavel', label: 'Não aplicável', excecao: false },
    { code: 'outro', label: 'Outro', excecao: true },
  ],
  escola: [
    { code: 'compareceu', label: 'Compareceu', excecao: false },
    { code: 'atraso', label: 'Atraso', excecao: true },
    { code: 'ausencia_saude', label: 'Ausência por saúde', excecao: true },
    { code: 'transporte', label: 'Transporte', excecao: true },
    { code: 'cancelamento', label: 'Cancelamento', excecao: true },
    { code: 'decisao_institucional', label: 'Decisão institucional', excecao: true },
    { code: 'outro', label: 'Outro', excecao: true },
  ],
  lazer: [
    { code: 'participou', label: 'Participou', excecao: false },
    { code: 'preferiu_nao', label: 'Preferiu não participar', excecao: false },
    { code: 'outra_atividade', label: 'Estava em outra atividade', excecao: false },
    { code: 'doenca', label: 'Doença', excecao: true },
    { code: 'restricao_saude', label: 'Restrição de saúde', excecao: true },
    { code: 'transporte_indisponivel', label: 'Transporte indisponível', excecao: true },
    { code: 'decisao_institucional', label: 'Decisão institucional', excecao: true },
    { code: 'outro', label: 'Outro', excecao: true },
  ],
  chamada_final: [
    { code: 'sem_alteracao', label: 'Sem alteração relevante', excecao: false },
    { code: 'com_registro', label: 'Com registro no plantão', excecao: true },
  ],
};
const PADRAO = OPCOES.alimentacao;

@Injectable()
export class ChecksService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  opcoes(kind: string) {
    return OPCOES[kind] ?? PADRAO;
  }

  async open(user: AuthenticatedUser, input: { houseId: string; kind: string; titulo: string; referenceAt?: string }) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_open_check($1,$2,$3, coalesce($4::timestamptz, now()))`,
        [input.houseId, input.kind, input.titulo, input.referenceAt ?? null]);
      return row;
    });
    await this.audit.log({
      action: 'check.open', actorId: user.id, houseId: input.houseId,
      entity: 'collective_check', entityId: r.check_id,
      detail: { tipo: input.kind, esperados: r.esperados },
    });
    return { id: r.check_id, esperados: Number(r.esperados), opcoes: this.opcoes(input.kind) };
  }

  /** Estado da chamada: quem já foi conferido e quem falta. */
  async get(user: AuthenticatedUser, checkId: string) {
    const data = await this.db.asUser(user.id, async (c) => {
      const { rows: [k] } = await c.query(
        `SELECT * FROM collective_check WHERE id = $1`, [checkId]);
      if (!k) return null;
      const { rows } = await c.query(
        `SELECT p.id AS person_id,
                coalesce(nullif(p.social_name,''), p.full_name) AS nome,
                date_part('year', age(p.birth_date))::int AS idade,
                r.option_code, r.note, r.happened_at,
                app_user_display_name(r.recorded_by) AS por,
                (SELECT string_agg(h.description, ' · ') FROM health_condition h
                  WHERE h.person_id = p.id AND h.active AND h.essential_alert) AS alertas,
                (SELECT string_agg(f.restriction, ' · ') FROM food_restriction f
                  WHERE f.person_id = p.id AND f.active) AS restricoes
         FROM person p
         JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa' AND s.house_id = $2
         LEFT JOIN check_result r ON r.check_id = $1 AND r.person_id = p.id
         ORDER BY coalesce(nullif(p.social_name,''), p.full_name)`, [checkId, k.house_id]);
      return { k, rows };
    });
    if (!data) throw new NotFoundException('Chamada não encontrada');

    const linhas = data.rows.map((r: any) => ({
      acolhidoId: r.person_id, nome: r.nome, idade: r.idade,
      // Alertas essenciais aparecem na hora de marcar — é onde eles importam.
      alertas: r.alertas, restricoes: r.restricoes,
      resultado: r.option_code, justificativa: r.note,
      registradoPor: r.por, registradoEm: r.happened_at,
    }));
    const conferidos = linhas.filter((l: any) => l.resultado).length;
    return {
      id: data.k.id, tipo: data.k.kind, titulo: data.k.title,
      status: data.k.status, esperados: data.k.expected, conferidos,
      faltam: data.k.expected - conferidos,
      opcoes: this.opcoes(data.k.kind),
      linhas,
    };
  }

  /**
   * Marca UM acolhido. Não existe endpoint que marque vários de uma vez:
   * a conferência é individual por definição (§10, §11.2).
   */
  async mark(user: AuthenticatedUser, checkId: string, input: {
    personId: string; opcao: string; nota?: string; offline?: boolean;
    clientOpId?: string; happenedAt?: string;
  }) {
    const kind = await this.db.asUser(user.id, async (c) => {
      const { rows: [k] } = await c.query(`SELECT kind, house_id, status FROM collective_check WHERE id=$1`, [checkId]);
      return k;
    });
    if (!kind) throw new NotFoundException('Chamada não encontrada');
    if (kind.status === 'confirmada') {
      throw new BadRequestException('Chamada já confirmada. Correções entram como adendo pela equipe técnica.');
    }

    const opcao = this.opcoes(kind.kind).find((o) => o.code === input.opcao);
    if (!opcao) throw new BadRequestException('Opção inválida para este tipo de chamada.');
    if (opcao.excecao && !input.nota?.trim()) {
      throw new BadRequestException(
        `"${opcao.label}" exige justificativa objetiva: descreva o fato e o contexto, sem rótulo.`);
    }

    try {
      const dup = await this.db.asUser(user.id, async (c) => {
        if (!input.clientOpId) return false;
        const { rows: [d] } = await c.query(
          `SELECT id FROM check_result WHERE client_op_id = $1`, [input.clientOpId]);
        return !!d;
      });
      if (dup) return { ok: true, duplicada: true, opcao: opcao.label };

      await this.db.asUser(user.id, async (c) => {
        await c.query(
          `INSERT INTO check_result (check_id, person_id, option_code, note, recorded_by, offline, client_op_id, happened_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7, coalesce($8::timestamptz, now()))
           ON CONFLICT (check_id, person_id) DO UPDATE
             SET option_code = EXCLUDED.option_code, note = EXCLUDED.note,
                 recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
          [checkId, input.personId, input.opcao, input.nota ?? null, user.id,
           input.offline ?? false, input.clientOpId ?? null, input.happenedAt ?? null]);
      });
    } catch (e: any) {
      // A política do banco (migração 0150) só aceita acolhido com permanência
      // ativa na casa da chamada — inclusive depois de uma transferência.
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        throw new BadRequestException(
          'Este acolhido não está ativo nesta casa. A conferência alcança apenas quem está na unidade.');
      }
      throw e;
    }
    return { ok: true, opcao: opcao.label };
  }

  /** Confirmação final: só passa com todos conferidos individualmente. */
  async confirm(user: AuthenticatedUser, checkId: string) {
    try {
      const r = await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(`SELECT * FROM app_confirm_check($1)`, [checkId]);
        return row;
      });
      await this.audit.log({
        action: 'check.confirm', actorId: user.id, entity: 'collective_check', entityId: checkId,
        detail: { conferidos: r.conferidos, esperados: r.esperados },
      });
      await this.bus.publish('check.confirmed',
        { checkId, conferidos: Number(r.conferidos) }, { actorId: user.id });
      return {
        ok: true, conferidos: Number(r.conferidos), esperados: Number(r.esperados),
        aviso: `${r.conferidos} registros individuais criados no perfil de cada acolhido.`,
      };
    } catch (e: any) {
      if (e?.message?.includes('conferencia_incompleta')) {
        throw new BadRequestException(
          'Ainda há acolhidos sem conferência. Todos os ativos precisam ser conferidos individualmente.');
      }
      if (e?.message?.includes('chamada_inexistente')) throw new NotFoundException('Chamada não encontrada');
      throw e;
    }
  }

  async listDay(user: AuthenticatedUser, houseId: string, date: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT k.id, k.kind, k.title, k.reference_at, k.status, k.expected,
                (SELECT count(*)::int FROM check_result r WHERE r.check_id = k.id) AS conferidos
         FROM collective_check k
         WHERE k.house_id = $1
           AND (k.reference_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
         ORDER BY k.reference_at`, [houseId, date]);
      return rows.map((r) => ({
        id: r.id, tipo: r.kind, titulo: r.title, horario: r.reference_at,
        status: r.status, esperados: r.expected, conferidos: r.conferidos,
      }));
    });
  }
}
