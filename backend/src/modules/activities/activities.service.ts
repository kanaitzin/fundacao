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
                  WHERE g.activity_id = a.id AND g.user_id IS NOT NULL
                  ORDER BY g.assigned_at DESC LIMIT 1) AS responsavel,
                -- Autoria dupla (§8.2): quando o registro foi feito por outra
                -- pessoa, os DOIS nomes saem daqui, com o motivo. A tela não
                -- tem escolha de esconder um deles.
                (SELECT app_user_display_name(x.performed_by) FROM activity_execution x
                  WHERE x.activity_id = a.id AND x.performed_by IS NOT NULL
                  ORDER BY x.recorded_at DESC LIMIT 1) AS realizado_por,
                (SELECT app_user_display_name(x.user_id) FROM activity_execution x
                  WHERE x.activity_id = a.id AND x.performed_by IS NOT NULL
                  ORDER BY x.recorded_at DESC LIMIT 1) AS registrado_por,
                (SELECT x.proxy_reason FROM activity_execution x
                  WHERE x.activity_id = a.id AND x.performed_by IS NOT NULL
                  ORDER BY x.recorded_at DESC LIMIT 1) AS motivo_registro
         FROM activity a
         WHERE a.house_id = $1
           -- O DIA COMO FAIXA, e não como conversão da coluna.
           --
           -- Escrever '(scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = $2'
           -- é a forma natural de perguntar "o que é de hoje", e ela custou
           -- 8,4 SEGUNDOS com um ano de registros. O motivo não é o volume: sob
           -- RLS, o Postgres só empurra para o índice os predicados
           -- LEAKPROOF, e 'timezone()' e o cast para 'date' não são. O filtro
           -- do dia ficava, então, DEPOIS da política de segurança — e
           -- 'app_person_in_scope()' era chamada uma vez para cada uma das
           -- vinte mil atividades do ano daquela casa.
           --
           -- Comparação de 'timestamptz' é leakproof. Convertendo o
           -- PARÂMETRO em vez da coluna, a faixa entra no índice, a política
           -- roda só nas linhas do dia, e a resposta cai para milissegundos.
           -- A fronteira é a mesma: meia-noite local, meia-noite local do dia
           -- seguinte.
           AND a.scheduled_at >= ($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
           AND a.scheduled_at <  (($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
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
    /** Quem REALIZOU, quando não foi quem está registrando (§8.2). */
    realizadoPor?: string; motivoRegistroPorOutro?: string;
  }) {
    if (!ESTADO_LABEL[input.estado]) throw new BadRequestException('Estado inválido.');

    // Autoria dupla, nunca autoria trocada. O líder registra pelo educador que
    // realizou a atividade e não conseguiu registrar — aparelho da casa sem
    // sinal, e ele não usa o próprio celular. O nome de quem operou o sistema
    // continua sendo o dele; o de quem realizou entra ao lado, com o motivo.
    // Sem os dois juntos não passa: nome sem motivo é assinatura em branco.
    if (input.realizadoPor && !input.motivoRegistroPorOutro?.trim()) {
      throw new BadRequestException(
        'Registrar pelo colega exige o motivo — por exemplo, "aparelho da casa sem sinal".');
    }
    if (input.realizadoPor === user.id) {
      throw new BadRequestException('Para registrar por si mesmo, não informe "realizado por".');
    }
    if (EXIGEM_JUSTIFICATIVA.has(input.estado) && !input.nota?.trim()) {
      throw new BadRequestException('Esta exceção exige justificativa objetiva: fato e contexto, sem rótulo.');
    }

    const res = await this.db.asUser(user.id, async (c) => {
      // FOR UPDATE + leitura do estado: a atividade já encerrada não é
      // reescrita. Antes, `ESTADOS_FINAIS` só escondia o botão na tela — quem
      // chamasse a rota às 17h sobrescrevia o "compareceu" registrado às 08h,
      // e todo consumidor lê `activity.state` (painel, visão dos 20, relatório).
      const { rows: [a] } = await c.query(
        `SELECT id, house_id, person_id, title, state FROM activity WHERE id = $1 FOR UPDATE`,
        [activityId]);
      if (!a) return null;

      // A ordem importa. Primeiro a idempotência (§17.4): se ESTA operação já
      // foi gravada, o reenvio responde "duplicada" e nada acontece — inclusive
      // quando ela mesma foi quem encerrou a atividade.
      if (input.clientOpId) {
        const { rows: [dup] } = await c.query(
          `SELECT id FROM activity_execution WHERE client_op_id = $1`, [input.clientOpId]);
        if (dup) return { a, duplicada: true, encerrada: false };
      }

      // Só depois a trava de estado final, e agora ela vale para TODO MUNDO.
      // Antes, `&& !input.clientOpId` abria a porta: uma operação offline nova
      // (id que o servidor nunca viu) passava direto por cima da atividade já
      // encerrada. O caso real: a educadora do turno da manhã registra o
      // "compareceu" às 08h; o aparelho que ficou sem rede à noite sobe a fila
      // às 23h e apaga o registro dela sem deixar rastro na tela de ninguém.
      // Agora a operação atrasada vira CONFLITO — a sync abre a divergência
      // para revisão humana e o aparelho não limpa o dado local (§17.2).
      if (ESTADOS_FINAIS.has(a.state)) {
        return { a, encerrada: true, duplicada: false };
      }

      await c.query(
        `INSERT INTO activity_execution (activity_id, user_id, resulting_state, note,
           happened_at, offline, device, client_op_id, synced_at,
           performed_by, proxy_reason)
         VALUES ($1,$2,$3::activity_state,$4, coalesce($5::timestamptz, now()), $6,$7,$8,
                 CASE WHEN $6 THEN now() END, $9, $10)`,
        [activityId, user.id, input.estado, input.nota ?? null, input.happenedAt ?? null,
         input.offline ?? false, input.device ?? null, input.clientOpId ?? null,
         input.realizadoPor ?? null,
         input.realizadoPor ? (input.motivoRegistroPorOutro ?? '').trim() : null]);

      await c.query(
        `UPDATE activity SET state=$2::activity_state, exception_note=$3,
           updated_at=now(), version=version+1 WHERE id=$1`,
        [activityId, input.estado, EXIGEM_JUSTIFICATIVA.has(input.estado) ? (input.nota ?? null) : null]);

      return { a, duplicada: false, encerrada: false };
    });
    if (!res) throw new NotFoundException('Atividade não encontrada');
    if ((res as any).encerrada) {
      throw new BadRequestException(
        `Esta atividade já foi encerrada como "${ESTADO_LABEL[(res.a as any).state] ?? (res.a as any).state}". `
        + 'Uma correção entra como adendo pela equipe técnica — o registro original não é sobrescrito.');
    }
    if (res.duplicada) return { ok: true, duplicada: true, estado: input.estado };

    await this.audit.log({
      action: input.realizadoPor ? 'activity.record_for_other' : 'activity.record',
      actorId: user.id, houseId: res.a.house_id,
      entity: 'activity', entityId: activityId,
      detail: {
        estado: input.estado, offline: input.offline ?? false,
        ...(input.realizadoPor ? { realizadoPor: input.realizadoPor } : {}),
      },
    });

    // Outros módulos podem reagir sem que este saiba que existem.
    await this.bus.publish('activity.recorded',
      { activityId, personId: res.a.person_id, estado: input.estado, titulo: res.a.title },
      { actorId: user.id, houseId: res.a.house_id });

    if (input.realizadoPor) {
      return {
        ok: true, estado: input.estado, rotulo: ESTADO_LABEL[input.estado],
        aviso: 'Registrado em nome do colega. A atividade mostra os dois nomes — '
             + 'quem realizou e quem registrou — com o motivo, em toda tela onde aparecer.',
      };
    }
    return { ok: true, estado: input.estado, rotulo: ESTADO_LABEL[input.estado] };
  }

  /**
   * Delegar atividade em aberto (§8.3). Caminho de cima para baixo: quem
   * faltou não pede substituição, então o líder passa a atividade adiante.
   */
  async delegate(user: AuthenticatedUser, activityId: string, paraId: string, motivo: string) {
    if (!motivo?.trim()) throw new BadRequestException('Informe o motivo da delegação.');

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_delegate_activity($1,$2,$3)`, [activityId, paraId, motivo.trim()]);
      return row;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('atividade_inexistente')) throw new NotFoundException('Atividade não encontrada.');
      if (m.includes('sem_permissao_delegar')) {
        throw new ForbiddenException('Somente o líder do turno e a coordenação delegam atividade.');
      }
      if (m.includes('atividade_encerrada')) {
        throw new BadRequestException('Esta atividade já foi encerrada — o que já aconteceu não troca de dono.');
      }
      if (m.includes('pessoa_nao_e_da_casa')) {
        throw new BadRequestException('Esta pessoa não está na equipe desta unidade hoje.');
      }
      throw e;
    });

    await this.audit.log({
      action: 'activity.delegate', actorId: user.id,
      entity: 'activity', entityId: activityId, detail: { para: paraId },
    });
    await this.bus.publish('notice.requested', {
      userId: paraId,
      title: 'Uma atividade passou para você',
      body: `"${r.out_titulo}" — tome ciência para assumir.`,
      priority: 'alta', entity: 'activity', entityId: activityId,
    }, { actorId: user.id });

    return {
      ok: true,
      aviso: 'Atividade delegada. Ela volta a aguardar ciência: designado não é o mesmo que avisado. '
           + 'A designação anterior continua no histórico.',
    };
  }

  /** Painel do plantão: quem está em quê agora. Sem contagem, sem ranking. */
  async shiftBoard(user: AuthenticatedUser, houseId: string, date?: string) {
    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM app_shift_board($1,$2::date)`, [houseId, date ?? null]);
      return rows;
    });
    return {
      linhas: linhas.map((l) => ({
        atividadeId: l.activity_id, titulo: l.titulo, horario: l.horario,
        estado: l.estado, rotulo: ESTADO_LABEL[l.estado] ?? l.estado,
        responsavel: l.responsavel, acolhido: l.acolhido,
      })),
      nota: 'Quem está em quê neste turno. Não é medição de ninguém: não há contagem '
          + 'por pessoa, ordenação por desempenho nem histórico de deslocamento (§3.3).',
    };
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
      // Defeito 8: o pedido de substituição REABRIA atividade já encerrada.
      // A atividade concluída às 08h voltava para 'aguardando_substituicao' e
      // ressurgia como pendência no painel do plantão seguinte — e o registro
      // de conclusão, com autor e horário, deixava de valer sem que ninguém
      // tivesse decidido isso. Substituição é para o que ainda vai acontecer.
      const { rows: [a] } = await c.query(
        `SELECT id, house_id, title, state FROM activity WHERE id=$1 FOR UPDATE`, [activityId]);
      if (!a) return null;
      if (ESTADOS_FINAIS.has(a.state)) return { encerrada: true, a };
      const { rows: [s] } = await c.query(
        `INSERT INTO substitution_request (activity_id, house_id, requested_by, reason)
         VALUES ($1,$2,$3,$4) RETURNING id`, [activityId, a.house_id, user.id, reason]);
      await c.query(`UPDATE activity SET state='aguardando_substituicao', updated_at=now() WHERE id=$1`, [activityId]);
      return { s, a };
    });
    if (!r) throw new NotFoundException('Atividade não encontrada');
    if ((r as any).encerrada) {
      throw new BadRequestException(
        `Esta atividade já foi encerrada como "${ESTADO_LABEL[(r.a as any).state] ?? (r.a as any).state}". `
        + 'Não cabe substituição no que já aconteceu — uma correção entra como adendo pela equipe técnica.');
    }

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
    /*
     * Encontrado no ensaio de uso, e é o defeito que mais dói no plantão.
     *
     * O corpo chegava sem o substituto — nome de campo errado no cliente,
     * campo esquecido, qualquer coisa — e a rota respondia 201 "o substituto
     * precisa tomar ciência". O pedido virava 'atribuida' com `substitute_id`
     * NULO, a atividade voltava para 'aguardando_ciencia' esperando alguém que
     * não existe, e o aviso morria no barramento sem ninguém saber. O líder
     * achava que tinha resolvido o plantão. Não tinha.
     *
     * Designar sem dizer quem não é designação incompleta: é nenhuma.
     */
    if (!substituteId || !/^[0-9a-f-]{36}$/i.test(String(substituteId))) {
      throw new BadRequestException('Escolha quem vai substituir.');
    }
    if (!PODE_AUTORIZAR_SUB.includes(user.role)) {
      throw new ForbiddenException('Somente o líder do turno, a equipe técnica ou a coordenação autorizam substituição.');
    }
    const r = await this.db.asUser(user.id, async (c) => {
      // A ordem importa: o estado da atividade é conferido ANTES de decidir o
      // pedido. Entre o pedido e a autorização, alguém pode ter concluído a
      // atividade — designar substituto agora devolveria a atividade para
      // 'aguardando_ciencia' e apagaria a conclusão (defeito 8).
      const { rows: [ped] } = await c.query(
        `SELECT id, activity_id, house_id, status FROM substitution_request
          WHERE id=$1 FOR UPDATE`, [substitutionId]);
      if (!ped || ped.status !== 'solicitada') return null;

      const { rows: [at] } = await c.query(
        `SELECT state FROM activity WHERE id=$1 FOR UPDATE`, [ped.activity_id]);
      if (at && ESTADOS_FINAIS.has(at.state)) {
        // Lançar aqui desfaz a transação inteira: o pedido continua
        // 'solicitada' e ninguém fica com um pedido decidido sem efeito.
        throw new BadRequestException(
          `A atividade foi encerrada como "${ESTADO_LABEL[at.state] ?? at.state}" enquanto o pedido aguardava. `
          + 'O pedido segue aberto para você recusar com o motivo — o sistema não decide isso sozinho.');
      }

      // Quem substitui precisa ser da equipe daquela casa hoje — mesma regra da
      // delegação. Sem isto, um uuid qualquer entraria como substituto e o
      // nome na escala deixaria de significar alguma coisa.
      const { rows: [naCasa] } = await c.query(
        `SELECT 1 AS ok FROM user_house_assignment a
          WHERE a.user_id = $1 AND a.house_id = $2
            AND a.valid_from <= app_hoje()
            AND (a.valid_to IS NULL OR a.valid_to >= app_hoje())`,
        [substituteId, ped.house_id]);
      if (!naCasa) {
        throw new BadRequestException('Esta pessoa não está na equipe desta unidade hoje.');
      }

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
    // E se o aviso falhar, quem autorizou tem de saber AGORA: a designação
    // valeu, mas a pessoa não foi chamada — e é ela quem cobre o turno.
    const { falhas } = await this.bus.publish('notice.requested', {
      userId: substituteId,
      title: 'Você foi designado para uma atividade',
      body: 'Tome ciência para assumir a atividade do plantão.',
      priority: 'alta', entity: 'activity', entityId: r.activity_id,
    }, { actorId: user.id, houseId: r.house_id });

    return {
      ok: true, status: 'atribuida',
      avisoEntregue: falhas.length === 0,
      aviso: falhas.length === 0
        ? 'O substituto precisa tomar ciência para assumir.'
        : 'Substituto designado, mas o aviso NÃO chegou até ele. Fale com a pessoa '
          + 'diretamente e confira se ela tomou ciência antes do fim do turno.',
    };
  }

  async listSubstitutions(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        // rls-join-ok: a policy de substitution_request já filtra por casa; o
        // JOIN com activity só traz o título e o estado do que ela alcança.
        `SELECT s.id, s.reason, s.status, s.requested_at, s.decision_note,
                a.title, a.scheduled_at, a.state,
                app_user_display_name(s.requested_by) AS pedinte,
                app_user_display_name(s.substitute_id) AS substituto
         FROM substitution_request s
         JOIN activity a ON a.id = s.activity_id
         WHERE s.house_id = $1 ORDER BY s.requested_at DESC LIMIT 50`, [houseId]);
      return rows.map((r) => {
        /*
         * O pedido ficou sem sentido enquanto esperava.
         *
         * A educadora pede substituição às 19h porque vai sair mais cedo; às
         * 19h20 outro educador assume e conclui a atividade; às 19h40 o líder
         * abre o celular e o pedido continua lá, porque ninguém o tirou. A
         * autorização é recusada (o sistema não reabre atividade encerrada),
         * mas antes desta marca o líder só descobria isso ao clicar e tomar
         * um erro — e erro sem explicação, às 19h40, vira pedido esquecido.
         *
         * O sistema NÃO fecha o pedido sozinho: recusar é decisão de quem
         * lidera, com motivo. O que ele faz é dizer o que houve.
         */
        const semEfeito = r.status === 'solicitada' && ESTADOS_FINAIS.has(r.state);
        return {
          id: r.id, atividade: r.title, horario: r.scheduled_at, motivo: r.reason,
          status: r.status, pedidoPor: r.pedinte, substituto: r.substituto,
          decidiuNota: r.decision_note, solicitadoEm: r.requested_at,
          semEfeito,
          aviso: semEfeito
            ? `A atividade já foi encerrada como "${ESTADO_LABEL[r.state] ?? r.state}" `
              + 'enquanto o pedido aguardava. Não cabe substituir o que já aconteceu — '
              + 'recuse o pedido com o motivo.'
            : null,
        };
      });
    });
  }

  /**
   * Recusar o pedido de substituição (§8.3).
   *
   * Faltava a outra metade da decisão: havia como autorizar e não havia como
   * recusar. Sem isto, o pedido que não cabe mais — porque a atividade já foi
   * concluída, ou porque não há quem substitua — ficava aberto para sempre na
   * tela do líder, e uma lista que só cresce é uma lista que ninguém lê.
   *
   * O motivo é obrigatório porque quem pediu vai ler: "recusado" sozinho, no
   * meio do plantão, é a resposta que faz a pessoa procurar o líder no
   * corredor — ou desistir de pedir da próxima vez.
   */
  async declineSubstitution(user: AuthenticatedUser, substitutionId: string, motivo: string) {
    if (!PODE_AUTORIZAR_SUB.includes(user.role)) {
      throw new ForbiddenException('Somente o líder do turno, a equipe técnica ou a coordenação decidem substituição.');
    }
    if (!motivo?.trim()) {
      throw new BadRequestException('Informe o motivo da recusa — quem pediu vai ler.');
    }

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `UPDATE substitution_request
            SET status='recusada', authorized_by=$2, decided_at=now(), decision_note=$3
          WHERE id=$1 AND status='solicitada'
          RETURNING id, activity_id, house_id, requested_by`,
        [substitutionId, user.id, motivo.trim()]);
      return row;
    });
    if (!r) throw new NotFoundException('Pedido não encontrado ou já decidido.');

    await this.audit.log({
      action: 'substitution.decline', actorId: user.id, houseId: r.house_id,
      entity: 'substitution_request', entityId: substitutionId, detail: {},
    });
    // Quem pediu precisa saber, e pelo sistema — é o que substitui o recado
    // no corredor e o grupo de mensagens (§3.3).
    await this.bus.publish('notice.requested', {
      userId: r.requested_by,
      title: 'Seu pedido de substituição foi recusado',
      body: motivo.trim(),
      priority: 'alta', entity: 'activity', entityId: r.activity_id,
    }, { actorId: user.id, houseId: r.house_id });

    return { ok: true, status: 'recusada', aviso: 'Pedido recusado, com motivo e autoria. Quem pediu foi avisado.' };
  }

  /** Vencidas sem confirmação (§8.5) — nunca vira "não realizada" sozinha. */
  async markUnconfirmed(user: AuthenticatedUser, houseId: string, minutes = 60) {
    /*
     * As atividades que ESTA CHAMADA marcou — e não "as de hoje".
     *
     * A busca por `hojeNaInstituicao()` que existia aqui calava o aviso depois
     * da meia-noite: a atividade das 21h vencia, era marcada e não avisava
     * ninguém, porque já pertencia a ontem. Todas as noites, em silêncio, no
     * turno em que há uma pessoa sozinha com vinte crianças (migração 0790).
     */
    const vencidas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT id FROM app_mark_unconfirmed_ids($1,$2)`, [houseId, minutes]);
      return rows.map((r) => r.id as string);
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      // A casa fora do escopo não é "proibida": para quem pergunta, ela não
      // existe. Responder 403 já contaria que aquele uuid é de uma casa real.
      if (m.includes('fora_de_escopo')) throw new NotFoundException('Casa não encontrada.');
      if (m.includes('casa_obrigatoria')) throw new BadRequestException('Informe a casa.');
      throw e;
    });
    const n = vencidas.length;
    if (n > 0) {
      // Contrato genérico do kernel: pedimos que alguém seja avisado, sem
      // saber quem avisa (§8.5). O escalonamento é por ATIVIDADE — usar a casa
      // como entidade gastava a chave de idempotência no primeiro dia e calava
      // o aviso para sempre. `groupKey` continua juntando tudo numa
      // notificação só na caixa de entrada.
      for (const id of vencidas) {
        await this.bus.publish('escalation.requested', {
          level: 'tecnica_coordenacao',
          entity: 'activity_unconfirmed', entityId: id,
          reason: `atividade sem confirmação há mais de ${minutes} min`,
          title: 'Atividades sem confirmação',
          body: `${n} atividade(s) venceram sem registro nesta casa. "Sem confirmação" não significa não realizada — é preciso conferir com a equipe do plantão.`,
          priority: 'alta', groupKey: `unconfirmed:${houseId}`,
        }, { houseId });
      }
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
    /*
     * Registro feito por outra pessoa. Sai como bloco único, com os dois nomes
     * e o motivo: a tela não recebe "realizado por" sem receber "registrado
     * por" junto. Separar os campos abriria a porta para uma tela mostrar só
     * um deles — e é exatamente isso que não pode acontecer (§8.2).
     */
    registroPorOutro: r.realizado_por
      ? { realizadoPor: r.realizado_por, registradoPor: r.registrado_por,
          motivo: r.motivo_registro }
      : null,
  };
}
