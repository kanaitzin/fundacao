import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/** Prazo esperado de triagem — pendência institucional 33.4.2, configurável. */
const SLA_TRIAGEM_HORAS = Number(process.env.NURSING_TRIAGE_SLA_HOURS ?? 24);

@Injectable()
export class NursingService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  // ---------- Painel (§7.1) ----------

  /**
   * Painel da Enfermagem por casa: TODOS os acolhidos, inclusive quem não tem
   * medicação prevista. A ausência de medicação é informação — não motivo para
   * a pessoa sumir da tela.
   */
  async panel(user: AuthenticatedUser, houseId: string, date: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_nursing_panel($1,$2::date)`, [houseId, date]);
      return rows;
    });

    const acolhidos = rows.map((r) => ({
      acolhidoId: r.person_id,
      nome: r.nome,
      nomeCivil: r.nome_civil,
      idade: r.idade,
      alergias: r.alergias,
      restricoes: r.restricoes,
      condicoes: r.condicoes,
      dosesPrevistas: r.doses_previstas,
      proximaDose: r.proxima_dose,
      ultimaDose: r.ultima_dose,
      dosesPendentes: r.pendentes,
      evolucoesAguardandoTriagem: r.evolucoes_pendentes,
      internacaoEmAndamento: r.internacao,
      retornoPendente: r.retorno_pendente,
      receitaVencendo: r.receita_vencendo,
      semMedicacaoPrevista: r.doses_previstas === 0,
    }));

    return {
      data: date,
      total: acolhidos.length,
      resumo: {
        comMedicacao: acolhidos.filter((a) => !a.semMedicacaoPrevista).length,
        semMedicacao: acolhidos.filter((a) => a.semMedicacaoPrevista).length,
        dosesPendentes: acolhidos.reduce((s, a) => s + a.dosesPendentes, 0),
        triagensPendentes: acolhidos.reduce((s, a) => s + a.evolucoesAguardandoTriagem, 0),
        internacoes: acolhidos.filter((a) => a.internacaoEmAndamento).length,
      },
      acolhidos,
      aviso: 'Indicadores operacionais. Não constituem diagnóstico nem prioridade clínica automática.',
    };
  }

  // ---------- Evolução de Saúde (§7.2) ----------

  /**
   * Preenchida por quem ACOMPANHOU o atendimento. O envio cria pendência para
   * a Enfermagem — e a receita citada aqui não altera a grade de medicamentos
   * antes da revisão dela.
   */
  async submitEvolution(user: AuthenticatedUser, input: {
    personId: string; houseId: string; tipo: string; quandoAconteceu: string;
    local?: string; especialidade?: string; servicoProfissional?: string; motivo?: string;
    estadoSaida?: string; estadoDurante?: string; estadoRetorno?: string;
    procedimentos?: string; examesSolicitados?: string; examesResultados?: string;
    receita?: string; orientacoes?: string; restricoes?: string; prazoRetorno?: string;
    encaminhamentos?: string; intercorrenciasDeslocamento?: string; observacoes?: string;
    offline?: boolean; clientOpId?: string;
  }) {
    if (!input.quandoAconteceu) {
      throw new BadRequestException('Informe o horário real do atendimento.');
    }
    if (!input.estadoRetorno?.trim()) {
      // O estado no retorno é o que o próximo plantão mais precisa saber.
      throw new BadRequestException('Descreva o estado observado no retorno.');
    }

    // Comando de sistema (migração 0210): a evolução e o atendimento nascem
    // juntos. O educador RELATA o que acompanhou — não ganha permissão de
    // editar o histórico de saúde, que continua sendo ato da Enfermagem.
    let ids: { out_evolution_id: string };
    try {
      ids = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT * FROM app_submit_evolution($1,$2,$3,$4::timestamptz,$5,$6,$7,$8,$9,$10,$11,
             $12,$13,$14,$15,$16,$17,$18::date,$19,$20,$21,$22,$23)`,
          [input.personId, input.houseId, input.tipo, input.quandoAconteceu,
           input.local ?? null, input.especialidade ?? null, input.servicoProfissional ?? null,
           input.motivo ?? null, input.estadoSaida ?? null, input.estadoDurante ?? null,
           input.estadoRetorno, input.procedimentos ?? null, input.examesSolicitados ?? null,
           input.examesResultados ?? null, input.receita ?? null, input.orientacoes ?? null,
           input.restricoes ?? null, input.prazoRetorno ?? null, input.encaminhamentos ?? null,
           input.intercorrenciasDeslocamento ?? null, input.observacoes ?? null,
           input.offline ?? false, input.clientOpId ?? null]);
        return r;
      });
    } catch (e: any) {
      if (e?.message?.includes('acolhido_fora_de_escopo')) {
        throw new NotFoundException('Acolhido não encontrado.');
      }
      throw e;
    }
    const id = ids.out_evolution_id;

    await this.audit.log({
      action: 'health.evolution_submit', actorId: user.id, houseId: input.houseId,
      entity: 'health_evolution', entityId: id,
      detail: { tipo: input.tipo, offline: input.offline ?? false },
    });
    // A Enfermagem é avisada pelo contrato genérico do kernel: quem publica
    // não sabe quem ouve, e o módulo de notificações não sabe o que é uma
    // Evolução de Saúde.
    await this.bus.publish('escalation.requested', {
      level: 'enfermagem', entity: 'health_evolution', entityId: id,
      reason: 'Evolução de Saúde aguardando triagem',
      title: 'Evolução de Saúde aguardando triagem',
      body: `Atendimento acompanhado por ${user.fullName} aguarda conferência e assinatura. Prazo combinado: ${SLA_TRIAGEM_HORAS}h.`,
      priority: 'alta',
    }, { actorId: user.id, houseId: input.houseId });

    return {
      id,
      status: 'aguardando_triagem',
      aviso: 'Evolução enviada à Enfermagem para triagem, conferência e assinatura. ' +
             'Receita nova só altera a grade de medicamentos após essa revisão.',
      prazoEsperadoHoras: SLA_TRIAGEM_HORAS,
    };
  }

  /** Fila de triagem da Enfermagem — transversal às casas em escopo. */
  async triageQueue(user: AuthenticatedUser, houseId?: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT e.id, e.kind, e.happened_at, e.place, e.specialty, e.status, e.created_at,
                e.state_return, e.prescription_note, e.guidance, e.restrictions, e.return_deadline,
                e.offline, e.house_id,
                -- e.house_id é a casa do ATENDIMENTO, congelada. Com JOIN
                -- house, a evolução pendente de uma criança recém-transferida
                -- sumia para a técnica que acabou de recebê-la — justamente
                -- quem o §7.2 encarrega de cobrar a pendência.
                app_house_label(e.house_id) AS casa,
                app_person_display_name(e.person_id) AS pessoa, e.person_id,
                app_user_display_name(e.accompanied_by) AS acompanhante,
                (SELECT t.request_note FROM nursing_triage t
                  WHERE t.evolution_id = e.id ORDER BY t.at DESC LIMIT 1) AS pedido_complemento
         FROM health_evolution e
         WHERE e.status <> 'assinada' AND ($1::uuid IS NULL OR e.house_id = $1)
         ORDER BY e.created_at`, [houseId ?? null]);
      return rows;
    });

    const agora = Date.now();
    return rows.map((r) => {
      const horas = (agora - new Date(r.created_at).getTime()) / 3_600_000;
      return {
        id: r.id, acolhidoId: r.person_id, acolhido: r.pessoa, casa: r.casa,
        tipo: r.kind, quando: r.happened_at, local: r.place, especialidade: r.specialty,
        acompanhante: r.acompanhante, estadoRetorno: r.state_return,
        receita: r.prescription_note, orientacoes: r.guidance, restricoes: r.restrictions,
        prazoRetorno: r.return_deadline, offline: r.offline,
        status: r.status, pedidoComplemento: r.pedido_complemento,
        horasNaFila: Math.floor(horas),
        // Prazo é acompanhamento, não punição: sinaliza o que passou do combinado.
        foraDoPrazo: horas > SLA_TRIAGEM_HORAS,
      };
    });
  }

  /**
   * Triagem: complementa, confere e ASSINA — ou devolve pedindo complemento.
   * Só a Enfermagem. A coordenação cobra a pendência, mas não assina por ela.
   */
  async triage(user: AuthenticatedUser, evolutionId: string, input: {
    acao: 'assinar' | 'pedir_complemento'; complemento?: string;
    notaClinica?: string; pedido?: string;
  }) {
    if (!['enfermagem', 'gestor_geral'].includes(user.role)) {
      await this.audit.log({
        action: 'health.triage_denied', actorId: user.id,
        entity: 'health_evolution', entityId: evolutionId, detail: { papel: user.role },
      });
      throw new ForbiddenException(
        'Somente a Enfermagem tria e assina Evoluções de Saúde. A coordenação acompanha e cobra a pendência.');
    }
    if (input.acao === 'pedir_complemento' && !input.pedido?.trim()) {
      throw new BadRequestException('Descreva o que falta para o acompanhante complementar.');
    }

    const ok = await this.db.asUser(user.id, async (c) => {
      const { rows: [e] } = await c.query(
        `SELECT id, person_id, house_id, status FROM health_evolution WHERE id = $1`, [evolutionId]);
      if (!e) return null;
      if (e.status === 'assinada') return { ja: true, e };

      await c.query(
        `INSERT INTO nursing_triage (evolution_id, nurse_id, complement, clinical_note, action, request_note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [evolutionId, user.id, input.complemento ?? null, input.notaClinica ?? null,
         input.acao === 'assinar' ? 'assinada' : 'complemento_solicitado', input.pedido ?? null]);

      await c.query(
        `UPDATE health_evolution SET status = $2 WHERE id = $1`,
        [evolutionId, input.acao === 'assinar' ? 'assinada' : 'complemento_solicitado']);
      return { ja: false, e };
    });
    if (!ok) throw new NotFoundException('Evolução não encontrada.');
    if (ok.ja) throw new BadRequestException('Esta evolução já foi triada e assinada.');

    await this.audit.log({
      action: input.acao === 'assinar' ? 'health.triage_sign' : 'health.triage_request',
      actorId: user.id, houseId: ok.e.house_id,
      entity: 'health_evolution', entityId: evolutionId,
    });
    await this.bus.publish(
      input.acao === 'assinar' ? 'health.evolution_signed' : 'health.evolution_complement_requested',
      { evolutionId, personId: ok.e.person_id }, { actorId: user.id, houseId: ok.e.house_id });

    return input.acao === 'assinar'
      ? {
          ok: true, status: 'assinada',
          aviso: 'Evolução conferida e assinada. Agora a grade de medicamentos pode ser atualizada, se for o caso.',
        }
      : { ok: true, status: 'complemento_solicitado', aviso: 'Devolvida ao acompanhante com o pedido registrado.' };
  }

  /** Histórico de saúde do acolhido — linha única (§7.3). */
  async history(user: AuthenticatedUser, personId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: encontros } = await c.query(
        `SELECT kind, happened_at, place, specialty, professional, reason, outcome, status, return_on
         FROM health_encounter WHERE person_id = $1 ORDER BY happened_at DESC LIMIT 100`, [personId]);
      const { rows: evolucoes } = await c.query(
        `SELECT e.id, e.kind, e.happened_at, e.state_return, e.guidance, e.status,
                app_user_display_name(e.accompanied_by) AS acompanhante,
                (SELECT t.complement FROM nursing_triage t
                  WHERE t.evolution_id = e.id AND t.action = 'assinada' ORDER BY t.at DESC LIMIT 1) AS complemento
         FROM health_evolution e
         WHERE e.person_id = $1 ORDER BY e.happened_at DESC LIMIT 100`, [personId]);
      const { rows: doses } = await c.query(
        `SELECT a.scheduled_at, a.state, a.administered_at, a.note, pr.medication, pr.dose,
                app_user_display_name(a.administered_by) AS por
         FROM medication_administration a
         -- rls-join-ok: prescription e medication_administration usam a mesma
         -- política (app_person_in_scope).
         JOIN prescription pr ON pr.id = a.prescription_id
         WHERE a.person_id = $1 AND a.state <> 'aguardando_confirmacao'
         ORDER BY a.scheduled_at DESC LIMIT 100`, [personId]);

      return {
        atendimentos: encontros,
        evolucoes: evolucoes.map((e) => ({
          id: e.id, tipo: e.kind, quando: e.happened_at, estadoRetorno: e.state_return,
          orientacoes: e.guidance, acompanhante: e.acompanhante, status: e.status,
          complementoEnfermagem: e.complemento,
        })),
        administracoes: doses.map((d) => ({
          previsto: d.scheduled_at, estado: d.state, realizado: d.administered_at,
          medicamento: d.medication, dose: d.dose, por: d.por, observacao: d.note,
        })),
      };
    });
  }
}

export { SLA_TRIAGEM_HORAS };
