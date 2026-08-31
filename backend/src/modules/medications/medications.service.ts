import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';

/** Estados que exigem observação obrigatória (§11.4). */
const EXIGEM_NOTA = new Set([
  'administrado_com_atraso', 'recusado', 'nao_administrado',
  'indisponivel', 'acolhido_ausente', 'incidente',
]);

export const ESTADO_DOSE: Record<string, string> = {
  aguardando_confirmacao: 'Aguardando confirmação',
  administrado_no_horario: 'Administrado no horário',
  administrado_com_atraso: 'Administrado com atraso',
  recusado: 'Recusado',
  nao_administrado: 'Não administrado',
  indisponivel: 'Indisponível',
  suspenso_conforme_orientacao: 'Suspenso conforme orientação',
  acolhido_ausente: 'Acolhido ausente',
  incidente: 'Incidente',
};

/** Alertas do §11.3, em minutos relativos ao horário previsto. */
export const ALERTAS_MIN = [-30, -15, 0, 30];

@Injectable()
export class MedicationsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  // ---------- Prescrição (Enfermagem) ----------

  /**
   * Cadastro do esquema. Nasce como RASCUNHO: só entra na grade depois que a
   * Enfermagem assina (§11.1). Uma receita nova nunca altera a grade sozinha.
   */
  async prescribe(user: AuthenticatedUser, input: {
    personId: string; houseId: string; tipo: string; medicamento: string; dose: string;
    via: string; horarios?: string[]; diasSemana?: number[]; finalidade?: string;
    instrucoes?: string; condicaoUso?: string; prescritor?: string; inicio?: string; fim?: string;
  }) {
    if (!['enfermagem', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente a Enfermagem cadastra e assina esquema de medicamentos.');
    }
    if (input.tipo === 'quando_necessario' && !input.condicaoUso?.trim()) {
      // §11.5: o sistema não decide. Exige orientação anterior válida.
      throw new BadRequestException(
        'Medicamento "quando necessário" exige a condição de uso escrita pelo profissional.');
    }

    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [p] } = await c.query(
        `INSERT INTO prescription (person_id, house_id, kind, medication, purpose, dose, route,
           instructions, use_condition, prescriber, starts_on, ends_on, status, created_by)
         VALUES ($1,$2,$3::prescription_kind,$4,$5,$6,$7,$8,$9,$10,
                 coalesce($11::date, app_hoje()), $12::date, 'rascunho', $13)
         RETURNING id`,
        [input.personId, input.houseId, input.tipo, input.medicamento, input.finalidade ?? null,
         input.dose, input.via, input.instrucoes ?? null, input.condicaoUso ?? null,
         input.prescritor ?? null, input.inicio ?? null, input.fim ?? null, user.id]);

      for (const h of input.horarios ?? []) {
        await c.query(
          `INSERT INTO medication_schedule (prescription_id, time_of_day, weekdays)
           VALUES ($1,$2,$3)`, [p.id, h, input.diasSemana ?? [0, 1, 2, 3, 4, 5, 6]]);
      }
      return p.id;
    });

    await this.audit.log({
      action: 'prescription.create', actorId: user.id, houseId: input.houseId,
      entity: 'prescription', entityId: id,
      detail: { tipo: input.tipo, horarios: (input.horarios ?? []).length },
    });
    return {
      id, status: 'rascunho',
      aviso: 'Prescrição registrada como rascunho. Só entra na grade após conferência e assinatura da Enfermagem.',
    };
  }

  /** Assinatura da Enfermagem: é o que torna a prescrição efetiva (§11.1). */
  async sign(user: AuthenticatedUser, prescriptionId: string) {
    if (!['enfermagem', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente a Enfermagem assina o esquema de medicamentos.');
    }
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE prescription SET status='ativa', signed_by=$2, signed_at=now(), version=version+1
         WHERE id=$1 AND status='rascunho'`, [prescriptionId, user.id]);
      return (rowCount ?? 0) > 0;
    });
    if (!ok) throw new NotFoundException('Prescrição não encontrada ou já assinada.');

    await this.audit.log({
      action: 'prescription.sign', actorId: user.id,
      entity: 'prescription', entityId: prescriptionId,
    });
    await this.bus.publish('prescription.signed', { prescriptionId }, { actorId: user.id });
    return { ok: true, status: 'ativa' };
  }

  async suspend(user: AuthenticatedUser, prescriptionId: string, motivo: string) {
    if (!['enfermagem', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente a Enfermagem suspende um esquema.');
    }
    if (!motivo?.trim()) throw new BadRequestException('Informe a orientação que motivou a suspensão.');
    // Antes: `rowCount` ignorado e sem pré-condição de estado. Suspender um id
    // inexistente, um rascunho ou uma prescrição de outra casa devolvia
    // {ok:true} e gravava auditoria de suspensão — a Enfermagem acreditava ter
    // suspendido o medicamento enquanto as doses continuavam sendo geradas.
    const suspensa = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE prescription SET status='suspensa', suspended_reason=$2, version=version+1
          WHERE id=$1 AND status='ativa'`,
        [prescriptionId, motivo]);
      return (rowCount ?? 0) > 0;
    });
    if (!suspensa) {
      const atual = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(`SELECT status FROM prescription WHERE id=$1`, [prescriptionId]);
        return r?.status as string | undefined;
      });
      if (!atual) throw new NotFoundException('Prescrição não encontrada.');
      throw new BadRequestException(
        atual === 'suspensa' ? 'Este esquema já está suspenso.'
        : `Só se suspende um esquema ativo. Este está como "${atual}".`);
    }
    await this.audit.log({
      action: 'prescription.suspend', actorId: user.id,
      entity: 'prescription', entityId: prescriptionId, detail: { motivo },
    });
    return { ok: true, status: 'suspensa' };
  }

  // ---------- Grade do dia ----------

  async generateDoses(user: AuthenticatedUser, houseId: string, date: string) {
    const n = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(`SELECT * FROM app_generate_doses($1,$2)`, [houseId, date]);
      return Number(r.criadas);
    });
    await this.audit.log({
      action: 'medication.generate_doses', actorId: user.id, houseId, detail: { data: date, criadas: n },
    });
    return { criadas: n };
  }

  /**
   * Grade do dia da casa. Mostra TODAS as doses previstas, inclusive as já
   * confirmadas — a leitura completa é o que permite conferir o plantão.
   */
  async dayGrid(user: AuthenticatedUser, houseId: string, date: string, personId?: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT a.id, a.scheduled_at, a.state, a.note, a.administered_at, a.offline,
                a.person_id, coalesce(nullif(p.social_name,''), p.full_name) AS pessoa,
                pr.medication, pr.dose, pr.route, pr.kind, pr.use_condition,
                app_user_display_name(a.administered_by) AS confirmado_por,
                -- Ao lado de uma dose, "Dipirona" sozinha se lê como o que
                -- dar. Aqui sai "Alergia a Dipirona" (§6.4, migração 0600).
                (SELECT string_agg(app_condition_label(h.kind, h.description), ' · ')
                   FROM health_condition h
                  WHERE h.person_id = a.person_id AND h.active AND h.kind='alergia') AS alergias
         FROM medication_administration a
         -- rls-join-ok: adm_select é app_person_in_scope(person_id), a MESMA
         -- política de person e prescription — quem lê a dose lê os dois.
         JOIN prescription pr ON pr.id = a.prescription_id
         JOIN person p ON p.id = a.person_id
         WHERE a.house_id = $1
           AND (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
           AND ($3::uuid IS NULL OR a.person_id = $3)
         ORDER BY a.scheduled_at, pessoa`, [houseId, date, personId ?? null]);
      return rows.map(mapDose);
    });
  }

  /** Pergunta antes de mostrar o botão: este usuário pode confirmar aqui e agora? */
  async canAdminister(user: AuthenticatedUser, houseId: string, periodo: 'diurno' | 'noturno') {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(`SELECT * FROM app_can_administer($1,$2)`, [houseId, periodo]);
      return { pode: r.pode as boolean, motivo: r.motivo as string | null };
    });
  }

  /**
   * Confirmação de uma dose — o ato mais sensível do sistema (§11.2).
   * Uma dose, uma confirmação, em conta individual. Ninguém confirma por outro,
   * e não existe caminho que marque várias de uma vez.
   */
  async confirmDose(user: AuthenticatedUser, administrationId: string, input: {
    estado: string; nota?: string; happenedAt?: string; offline?: boolean;
    device?: string; institutionalDevice?: boolean; clientOpId?: string;
  }) {
    if (!ESTADO_DOSE[input.estado] || input.estado === 'aguardando_confirmacao') {
      throw new BadRequestException('Estado inválido para confirmação.');
    }
    if (EXIGEM_NOTA.has(input.estado) && !input.nota?.trim()) {
      throw new BadRequestException(
        `"${ESTADO_DOSE[input.estado]}" exige observação: descreva o fato de forma objetiva.`);
    }

    let r: { out_id: string; out_state: string };
    try {
      r = await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_confirm_dose($1,$2,$3,$4::timestamptz,$5,$6,$7,$8)`,
          [administrationId, input.estado, input.nota ?? null, input.happenedAt ?? null,
           input.offline ?? false, input.device ?? null,
           input.institutionalDevice ?? false, input.clientOpId ?? null]);
        return row;
      });
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('dose_inexistente')) throw new NotFoundException('Dose não encontrada.');
      if (msg.includes('dose_ja_confirmada')) {
        throw new ConflictException('Esta dose já foi confirmada por outro profissional.');
      }
      if (msg.includes('aparelho_nao_institucional')) {
        throw new ForbiddenException(
          'Offline, somente o aparelho institucional designado confirma medicamento.');
      }
      if (msg.startsWith('protocolo:')) throw new ForbiddenException(msg.replace('protocolo: ', ''));
      throw e;
    }

    await this.audit.log({
      action: 'medication.confirm', actorId: user.id,
      entity: 'medication_administration', entityId: administrationId,
      detail: { estado: input.estado, offline: input.offline ?? false },
    });
    if (input.estado !== 'administrado_no_horario') {
      await this.bus.publish('medication.exception',
        { administrationId, estado: input.estado }, { actorId: user.id });
    }
    return { ok: true, estado: input.estado, rotulo: ESTADO_DOSE[input.estado] };
  }

  /**
   * Doses vencidas: continuam "aguardando confirmação" e são ESCALONADAS.
   * O sistema nunca escreve "não administrado" por conta própria (§11.3) — a
   * diferença entre "não temos registro" e "não foi dado" é a diferença entre
   * apurar e acusar.
   */
  async escalateOverdue(user: AuthenticatedUser, houseId: string, minutos = 30) {
    const pendentes = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT a.id, a.scheduled_at, pr.medication,
                coalesce(nullif(p.social_name,''), p.full_name) AS pessoa
         FROM medication_administration a
         -- rls-join-ok: mesma política (app_person_in_scope) nas três tabelas.
         JOIN prescription pr ON pr.id = a.prescription_id
         JOIN person p ON p.id = a.person_id
         WHERE a.house_id = $1 AND a.state = 'aguardando_confirmacao'
           AND a.scheduled_at < now() - ($2 || ' minutes')::interval`, [houseId, minutos]);
      return rows;
    });

    // O escalonamento é por DOSE, não por casa. Antes o `entityId` era a casa,
    // e como a chave de idempotência de `escalation` é (entity, entity_id,
    // level), o primeiro atraso da Casa 03 gastava a chave: nenhuma outra dose,
    // em nenhum outro dia, gerava aviso — para sempre, e em silêncio.
    //
    // O agrupamento na caixa de entrada continua sendo feito por `groupKey`,
    // que existe exatamente para não inundar o educador (§19).
    for (const dose of pendentes) {
      for (const level of ['enfermagem', 'tecnica_coordenacao']) {
        await this.bus.publish('escalation.requested', {
          level, entity: 'medication_dose', entityId: dose.id,
          reason: `dose sem confirmação há mais de ${minutos} min`,
          title: 'Dose de medicamento sem confirmação',
          body: `${pendentes.length} dose(s) venceram sem registro nesta casa. Permanecem como "aguardando confirmação" — o sistema não conclui que não foram administradas.`,
          priority: 'critica', groupKey: `dose-overdue:${houseId}:${level}`,
        }, { actorId: user.id, houseId });
      }
    }
    return {
      pendentes: pendentes.length,
      doses: pendentes.map((d) => ({
        id: d.id, acolhido: d.pessoa, medicamento: d.medication, previsto: d.scheduled_at,
      })),
      aviso: 'Permanecem como “aguardando confirmação”. O sistema não conclui que a dose não foi administrada.',
    };
  }

  // ---------- Estoque: só quantidade e validade (§11.6) ----------

  async stock(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT s.id, s.medication, s.quantity, s.unit, s.expires_on, s.low_flag, s.updated_at, s.person_id,
                -- Sem LEFT JOIN person: um estoque NOMINAL de quem já saiu
                -- aparecia com acolhido nulo, indistinguível de estoque de uso
                -- comum da casa. Medicamento de alguém não pode virar "de todos".
                app_person_display_name(s.person_id) AS pessoa
         FROM medication_stock s
         WHERE s.house_id = $1 ORDER BY s.expires_on NULLS LAST, s.medication`, [houseId]);
      const hoje = new Date(`${hojeNaInstituicao()}T12:00:00Z`);
      return rows.map((r) => {
        const dias = r.expires_on
          ? Math.ceil((new Date(r.expires_on).getTime() - hoje.getTime()) / 86_400_000) : null;
        return {
          id: r.id, medicamento: r.medication, quantidade: Number(r.quantity), unidade: r.unit,
          // `individual` vem do dado, não do nome: um estoque nominal continua
          // nominal mesmo quando o nome não pode ser exibido a quem consulta.
          individual: r.person_id != null,
          acolhido: r.person_id ? (r.pessoa ?? '(fora do seu alcance)') : null,
          validade: r.expires_on, diasParaVencer: dias,
          // Validade próxima é alerta (§11.6). Estoque baixo é sinalizado por
          // pessoa, não calculado: só a equipe sabe o que é pouco para cada caso.
          validadeProxima: dias !== null && dias <= 30,
          estoqueBaixo: r.low_flag,
          atualizadoEm: r.updated_at,
        };
      });
    });
  }

  /**
   * Estoque: DUAS ações, e a pessoa diz qual (§8.4, decidido em 31/08).
   *
   * Havia uma só, e ela mentia. `SET quantity = EXCLUDED.quantity` substituía
   * a quantidade, mas o movimento era gravado como `'entrada'`: chegaram 10
   * frascos sobre os 30 do armário e o armário passava a ter 10, com o
   * histórico afirmando que uma entrada de 10 tinha acontecido. O número
   * errado e a explicação errada, na mesma linha.
   *
   * Agora quem mexe escolhe o que está fazendo, porque são duas rotinas
   * diferentes da casa:
   *
   * - `entrada`   — chegou remédio. SOMA à quantidade que estava lá, grava
   *                 movimento `'entrada'` com o que chegou. Motivo opcional:
   *                 a nota de compra ou a doação explicam sozinhas.
   * - `contagem`  — conferiram o armário. SUBSTITUI pela quantidade contada,
   *                 grava movimento `'ajuste'` com a DIFERENÇA assinada
   *                 (negativa quando falta), e o motivo é OBRIGATÓRIO: some
   *                 remédio do armário, e sumiço sem explicação escrita é
   *                 exatamente o que não pode virar rotina.
   *
   * O sistema não decide qual é qual pelo tamanho do número. Uma contagem que
   * dá mais do que o registrado é possível (frasco que estava em outra
   * gaveta), e uma entrada não deixa de ser entrada por ser pequena.
   */
  async upsertStock(user: AuthenticatedUser, input: {
    tipo?: 'entrada' | 'contagem';
    houseId: string; medicamento: string; quantidade: number; unidade?: string;
    validade?: string; personId?: string; motivo?: string;
  }) {
    /* alcance:saude — quem movimenta o armário. Conferido contra `alcance.ts`. */
    if (!['enfermagem', 'equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Sem permissão para movimentar estoque.');
    }
    const tipo = input.tipo;
    if (tipo !== 'entrada' && tipo !== 'contagem') {
      // Sem palpite: o padrão silencioso é o que produziu o defeito.
      throw new BadRequestException(
        'Informe tipo: "entrada" (chegou remédio, soma) ou "contagem" (conferência do armário, substitui).');
    }
    const quantidade = Number(input.quantidade);
    if (!Number.isFinite(quantidade) || quantidade < 0) {
      throw new BadRequestException('Quantidade inválida.');
    }
    if (tipo === 'entrada' && quantidade === 0) {
      throw new BadRequestException('Entrada de zero não é entrada.');
    }
    const motivo = (input.motivo ?? '').trim();
    if (tipo === 'contagem' && motivo.length < 3) {
      throw new BadRequestException('A contagem exige motivo: o que foi conferido, e por quê.');
    }

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [antes] } = await c.query(
        `SELECT id, quantity FROM medication_stock
          WHERE house_id=$1 AND medication=$2 AND person_id IS NOT DISTINCT FROM $3::uuid`,
        [input.houseId, input.medicamento, input.personId ?? null]);
      const anterior = antes ? Number(antes.quantity) : 0;

      const { rows: [s] } = await c.query(
        `INSERT INTO medication_stock (house_id, medication, quantity, unit, expires_on, person_id)
         VALUES ($1,$2,$3,coalesce($4,'unidade'),$5::date,$6)
         ON CONFLICT (house_id, medication, person_id) DO UPDATE
           SET quantity = CASE WHEN $7 = 'entrada'
                               THEN medication_stock.quantity + EXCLUDED.quantity
                               ELSE EXCLUDED.quantity END,
               -- Validade: na ENTRADA vale sempre a MAIS PRÓXIMA entre o que
               -- estava e o que chegou, porque é ela que manda descartar. Um
               -- lote novo e longo não pode apagar o lote velho que ainda está
               -- na gaveta. Na CONTAGEM, quem conferiu olhou a caixa: o que
               -- ela informar substitui; se não informar nada, fica o que havia.
               expires_on = CASE
                 WHEN EXCLUDED.expires_on IS NULL THEN medication_stock.expires_on
                 WHEN $7 = 'entrada' THEN least(
                   coalesce(medication_stock.expires_on, EXCLUDED.expires_on), EXCLUDED.expires_on)
                 ELSE EXCLUDED.expires_on END,
               updated_at = now()
         RETURNING id, quantity`,
        [input.houseId, input.medicamento, quantidade, input.unidade ?? null,
         input.validade ?? null, input.personId ?? null, tipo]);

      const depois = Number(s.quantity);
      // O movimento conta o que ACONTECEU: o que chegou, ou a diferença que a
      // conferência encontrou. Nunca o total do armário.
      const delta = tipo === 'entrada' ? quantidade : depois - anterior;
      await c.query(
        `INSERT INTO medication_stock_movement (stock_id, kind, quantity, reason, by_user)
         VALUES ($1,$2,$3,$4,$5)`,
        [s.id, tipo === 'entrada' ? 'entrada' : 'ajuste', delta, motivo || null, user.id]);
      return { id: s.id as string, anterior, depois, delta };
    });

    await this.audit.log({
      action: tipo === 'entrada' ? 'stock.entrada' : 'stock.contagem',
      actorId: user.id, houseId: input.houseId,
      entity: 'medication_stock', entityId: r.id,
      // Metadado, não conteúdo: medicamento, números e autor. Sem acolhido.
      detail: { medicamento: input.medicamento, anterior: r.anterior, depois: r.depois, delta: r.delta },
    });
    return { id: r.id, ok: true, tipo, anterior: r.anterior, quantidade: r.depois, diferenca: r.delta };
  }

  /** Estoque baixo é sinalizado MANUALMENTE (§11.6) — o sistema não adivinha. */
  async flagLow(user: AuthenticatedUser, stockId: string, baixo: boolean) {
    if (!['enfermagem', 'equipe_tecnica', 'coordenador'].includes(user.role)) {
      throw new ForbiddenException('Somente Enfermagem ou equipe técnica sinalizam estoque baixo.');
    }
    await this.db.asUser(user.id, async (c) => {
      await c.query(
        `UPDATE medication_stock SET low_flag=$2, low_flagged_by=$3, updated_at=now() WHERE id=$1`,
        [stockId, baixo, user.id]);
    });
    return { ok: true, estoqueBaixo: baixo };
  }

  // ---------- Protocolo (pendência institucional 33.4.1) ----------

  async getProtocol(user: AuthenticatedUser, houseId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT period, allows_nursing, allows_authorized_educator, note, decided_at
         FROM medication_protocol WHERE house_id = $1 ORDER BY period`, [houseId]);
      return rows;
    });
    return {
      periodos: rows.map((r) => ({
        periodo: r.period, enfermagem: r.allows_nursing,
        educadorAutorizado: r.allows_authorized_educator, nota: r.note, definidoEm: r.decided_at,
      })),
      pendenciaInstitucional:
        'Quem administra medicamentos em cada período (pendência 33.4.1) é decisão da instituição. ' +
        'Enquanto não houver definição formal, vale o padrão mais protetivo: somente Enfermagem.',
    };
  }

  async setProtocol(user: AuthenticatedUser, input: {
    houseId: string; periodo: string; enfermagem: boolean; educadorAutorizado: boolean; nota?: string;
  }) {
    if (!['coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente a coordenação define o protocolo de administração.');
    }
    await this.db.asUser(user.id, async (c) => {
      await c.query(
        `INSERT INTO medication_protocol (house_id, period, allows_nursing, allows_authorized_educator, note, decided_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (house_id, period) DO UPDATE
           SET allows_nursing = EXCLUDED.allows_nursing,
               allows_authorized_educator = EXCLUDED.allows_authorized_educator,
               note = EXCLUDED.note, decided_by = EXCLUDED.decided_by, decided_at = now()`,
        [input.houseId, input.periodo, input.enfermagem, input.educadorAutorizado,
         input.nota ?? null, user.id]);
    });
    await this.audit.log({
      action: 'medication.protocol_set', actorId: user.id, houseId: input.houseId,
      detail: { periodo: input.periodo, educadorAutorizado: input.educadorAutorizado },
    });
    return { ok: true };
  }

  async authorizeEducator(user: AuthenticatedUser, input: {
    userId: string; houseId: string; nota?: string; validoAte?: string;
  }) {
    if (!['coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente a coordenação autoriza educadores nominalmente.');
    }
    await this.db.asUser(user.id, async (c) => {
      await c.query(
        `INSERT INTO medication_authorization (user_id, house_id, valid_to, authorized_by, note)
         VALUES ($1,$2,$3::date,$4,$5)
         ON CONFLICT (user_id, house_id, valid_from) DO UPDATE
           SET valid_to = EXCLUDED.valid_to, note = EXCLUDED.note`,
        [input.userId, input.houseId, input.validoAte ?? null, user.id, input.nota ?? null]);
    });
    await this.audit.log({
      action: 'medication.authorize_educator', actorId: user.id, houseId: input.houseId,
      entity: 'app_user', entityId: input.userId,
    });
    return { ok: true };
  }
}

function mapDose(r: any) {
  return {
    id: r.id,
    horario: r.scheduled_at,
    acolhido: { id: r.person_id, nome: r.pessoa },
    medicamento: r.medication,
    dose: r.dose,
    via: r.route,
    tipo: r.kind,
    condicaoUso: r.use_condition,
    estado: r.state,
    rotulo: ESTADO_DOSE[r.state] ?? r.state,
    confirmadaPor: r.confirmado_por,
    administradaEm: r.administered_at,
    offline: r.offline,
    observacao: r.note,
    alergias: r.alergias,
    pendente: r.state === 'aguardando_confirmacao',
  };
}
