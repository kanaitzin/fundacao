import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { cargoNoDocumento } from '../../kernel/documentos/folha';
import { folhaDaGrade } from './grade-folha';

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
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
  ) {}

  // ---------- Prescrição (Enfermagem) ----------

  /**
   * Cadastro do esquema. Nasce como RASCUNHO: só entra na grade depois que
   * alguém o ativa, com o nome dele registrado. Uma receita nova nunca altera
   * a grade sozinha.
   *
   * QUEM CADASTRA mudou em 08/09/2026 (migração 0930): além da Enfermagem, a
   * coordenação e a equipe técnica. A Enfermagem trabalha das 9h às 17h, e a
   * criança chega da consulta com a receita na mão às 20h — exigir a
   * Enfermagem ali é adiar o tratamento até o dia seguinte, ou dar o remédio
   * sem registro. Quem cadastrou e quem ativou continuam gravados, um a um.
   */
  async prescribe(user: AuthenticatedUser, input: {
    personId: string; houseId: string; tipo: string; medicamento: string; dose: string;
    via: string; horarios?: string[]; diasSemana?: number[]; finalidade?: string;
    instrucoes?: string; condicaoUso?: string; prescritor?: string; inicio?: string; fim?: string;
  }) {
    if (!['enfermagem', 'coordenador', 'equipe_tecnica', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException(
        'Quem cadastra esquema de medicamento é a Enfermagem, a coordenação ou a equipe técnica.');
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
      aviso: 'Esquema registrado como rascunho. Ele só começa a gerar dose quando alguém o ativar — '
        + 'e o nome de quem ativou fica ao lado de cada dose.',
    };
  }

  /**
   * A assinatura é o que torna o esquema efetivo (§11.1) — e passa a ser de
   * quem responde pelo cuidado na casa, não só da Enfermagem (0930). O nome de
   * quem assinou fica na grade, ao lado de cada dose gerada.
   */
  async sign(user: AuthenticatedUser, prescriptionId: string) {
    if (!['enfermagem', 'coordenador', 'equipe_tecnica', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException(
        'Quem ativa o esquema é a Enfermagem, a coordenação ou a equipe técnica.');
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

  /**
   * OS ESQUEMAS DA CASA — rascunho, ativo e suspenso.
   *
   * Não existia rota que LISTASSE prescrições, só a grade de doses. Duas
   * consequências, e as duas apareceram na casa:
   *
   *  * um rascunho salvo hoje e não assinado não era encontrável amanhã por
   *    tela nenhuma. Ficava gravado e invisível — que é o pior dos dois mundos;
   *  * e não havia de onde SUSPENDER: o médico suspendia o remédio, a grade
   *    continuava cobrando a dose todo dia, e a Enfermagem só tinha o caminho
   *    de marcar "não administrada" indefinidamente.
   *
   * A lista é da casa e o RLS filtra; o rascunho aparece primeiro, porque é o
   * que está esperando alguém.
   */
  async listPrescriptions(user: AuthenticatedUser, houseId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows: r } = await c.query(
        // rls-join-ok: a policy de prescription já filtra por casa e pessoa.
        `SELECT p.id, p.medication, p.dose, p.route, p.kind, p.status, p.use_condition,
                p.prescriber, p.starts_on, p.ends_on, p.suspended_reason, p.signed_at,
                p.nurse_only, p.nurse_only_reason,
                p.person_id, app_person_display_name(p.person_id) AS acolhido,
                app_user_display_name(p.signed_by) AS assinada_por,
                (SELECT array_agg(to_char(ms.time_of_day, 'HH24:MI') ORDER BY ms.time_of_day)
                   FROM medication_schedule ms WHERE ms.prescription_id = p.id) AS horarios
           FROM prescription p
          WHERE p.house_id = $1 AND p.status <> 'encerrada'
          ORDER BY (p.status = 'rascunho') DESC, p.status, p.medication`, [houseId]);
      return r;
    });
    const ROTULO: Record<string, string> = {
      rascunho: 'Rascunho — fora da grade', ativa: 'Na grade', suspensa: 'Suspenso',
    };
    return {
      esquemas: rows.map((r: any) => ({
        id: r.id, medicamento: r.medication, dose: r.dose, via: r.route, tipo: r.kind,
        status: r.status, rotulo: ROTULO[r.status] ?? r.status,
        acolhido: { id: r.person_id, nome: r.acolhido ?? '(fora do seu alcance)' },
        condicaoUso: r.use_condition, prescritor: r.prescriber,
        inicio: r.starts_on, fim: r.ends_on,
        horarios: r.horarios ?? [], assinadaPor: r.assinada_por, assinadaEm: r.signed_at,
        motivoDaSuspensao: r.suspended_reason,
        // A exceção (0930): por padrão o educador de plantão pode dar.
        soEnfermagem: r.nurse_only ?? false, motivoSoEnfermagem: r.nurse_only_reason,
      })),
      aviso: 'Rascunho NÃO está na grade: ele só começa a gerar dose quando a Enfermagem '
        + 'confere e assina. Suspender é o contrário — tira da grade a partir de hoje, e o '
        + 'que já foi confirmado continua registrado.',
    };
  }

  /** Quem está nominalmente autorizado a administrar nesta casa (§11.3). */
  async listAuthorizations(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        // `::text` não é enfeite. O driver devolve `date` como Date do
        // JavaScript, e `String(new Date(...))` vira "Mon Sep 01 2026 00:00:00
        // GMT+0000" — que comparado com "2026-09-01" dá sempre falso. A
        // autorização vigente aparecia como VENCIDA na tela da coordenação.
        `SELECT a.id, a.user_id, a.valid_from::text AS valid_from,
                a.valid_to::text AS valid_to, a.note,
                app_user_display_name(a.user_id) AS quem,
                app_user_display_name(a.authorized_by) AS autorizado_por
           FROM medication_authorization a
          WHERE a.house_id = $1 ORDER BY a.valid_from DESC`, [houseId]);
      const hoje = hojeNaInstituicao();
      return rows.map((r: any) => ({
        id: r.id, userId: r.user_id, quem: r.quem,
        de: r.valid_from, ate: r.valid_to, nota: r.note, autorizadoPor: r.autorizado_por,
        // Autorização vencida NÃO some da lista: quem lê precisa saber que
        // existiu, e até quando. Some do alcance, não do papel.
        vigente: r.valid_from <= hoje && (r.valid_to == null || r.valid_to >= hoje),
      }));
    });
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
    //
    // E a segunda metade do mesmo defeito: suspender mudava o status da
    // prescrição e DEIXAVA AS DOSES DE HOJE na grade. `app_generate_doses` só
    // gera para 'ativa', então amanhã ficava limpo — mas o remédio suspenso às
    // 10h continuava cobrando a dose das 16h de HOJE, com o botão "Confirmar"
    // ao lado. Alguém dava. É o pior lugar possível para um silêncio.
    //
    // As duas escritas vão na MESMA transação: ou o esquema sai da grade
    // inteiro, ou não sai.
    const suspensa = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE prescription SET status='suspensa', suspended_reason=$2, version=version+1
          WHERE id=$1 AND status='ativa'`,
        [prescriptionId, motivo]);
      if ((rowCount ?? 0) === 0) return { ok: false, doses: 0 };
      // `scheduled_at > now()`: só o que AINDA NÃO chegou a hora. A dose das
      // 08h que ninguém confirmou não vira "suspensa conforme orientação" —
      // ela não foi suspensa, ela ficou sem confirmação, e continua cobrando
      // essa resposta de alguém. Suspender não é caneta para apagar ontem.
      //
      // Nada é apagado: a linha fica, com estado próprio e a orientação
      // escrita. `administered_by` continua NULO porque ninguém administrou.
      const { rowCount: n } = await c.query(
        `UPDATE medication_administration
            SET state = 'suspenso_conforme_orientacao',
                note = coalesce(note || ' · ', '') || $2
          WHERE prescription_id = $1
            AND state = 'aguardando_confirmacao'
            AND scheduled_at > now()`,
        [prescriptionId, `Esquema suspenso: ${motivo.trim()}`]);
      return { ok: true, doses: n ?? 0 };
    });
    if (!suspensa.ok) {
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
      entity: 'prescription', entityId: prescriptionId,
      detail: { motivo, dosesRetiradasDaGrade: suspensa.doses },
    });
    return {
      ok: true, status: 'suspensa', dosesRetiradasDaGrade: suspensa.doses,
      aviso: suspensa.doses > 0
        ? `${suspensa.doses} dose(s) ainda por vir saíram da grade de hoje, com a orientação `
          + 'escrita ao lado. O que já foi confirmado continua registrado.'
        : 'Não havia dose por vir hoje. O que já foi confirmado continua registrado.',
    };
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
           -- O DIA COMO FAIXA, e não como conversão da coluna.
           --
           -- Escrever '(scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = $2'
           -- é a forma natural de perguntar "o que é de hoje", e ela custou
           -- 8,4 SEGUNDOS com um ano de registros. O motivo não é o volume: sob
           -- RLS, o Postgres só empurra para o índice os predicados
           -- LEAKPROOF, e 'timezone()' e o cast para 'date' não são. O filtro
           -- do dia ficava, então, DEPOIS da política de segurança — e
           -- 'app_person_in_scope()' era chamada uma vez para cada uma das
           -- vinte mil doses do ano daquela casa, para devolver noventa.
           --
           -- Comparação de 'timestamptz' é leakproof. Convertendo o
           -- PARÂMETRO em vez da coluna, a faixa entra no índice, a política
           -- roda só nas linhas do dia, e a resposta cai para milissegundos.
           -- A fronteira é a mesma: meia-noite local, meia-noite local do dia
           -- seguinte.
           AND a.scheduled_at >= ($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
           AND a.scheduled_at <  (($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
           /*
            * A CRIANÇA INTERNADA SAI DA GRADE DA CASA.
            *
            * A dose dela não é dada aqui: quem administra no hospital é o
            * hospital, e isso é registrado no diário da internação, com a
            * marca de origem. Deixá-la na grade produziria, todo dia, quatro
            * doses "aguardando confirmação" que ninguém pode confirmar — e
            * uma tela cheia de pendência impossível é uma tela que a equipe
            * aprende a não olhar.
            *
            * A dose continua existindo no banco. Ela não foi apagada nem
            * marcada como não administrada: o sistema não conclui que ela não
            * aconteceu, porque não sabe.
            */
           AND NOT app_esta_internado(a.person_id, $2::date)
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
      if (msg.includes('dose_sem_sinal')) {
        // A regra mudou em 08/09/2026 (migração 0930): o sistema roda no
        // celular de cada um, e não existe mais "o aparelho da casa" para ser
        // a trava contra a mesma dose confirmada em dois lugares. A recusa
        // chega agora, com o caminho, em vez de a dose voltar rejeitada horas
        // depois — quando ninguém lembra mais do frasco.
        throw new ForbiddenException(
          'Sem internet não dá para confirmar remédio: a mesma dose poderia ser confirmada em dois '
          + 'aparelhos. Dê o medicamento e confirme assim que o sinal voltar — o resto do turno '
          + 'continua funcionando sem sinal.');
      }
      if (msg.includes('aparelho_nao_institucional')) {
        // Recusa da regra antiga (§11.7), mantida para o caso de um banco que
        // ainda não recebeu a 0930.
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
      // A pendência 33.4.1 foi RESPONDIDA pela Fundação em 08/09/2026, e o que
      // esta lista mostra passou a ser história: o que a casa decidiu enquanto
      // ninguém sabia o horário da Enfermagem. Ela não decide mais nada.
      historico: true,
      respostaDaFundacao:
        'A Enfermagem atende das 9h às 17h; fora disso, quem administra é o educador de plantão, '
        + 'conforme a bula do acolhido. O que existe agora é a exceção por MEDICAMENTO — o que só '
        + 'a Enfermagem dá —, marcada no próprio esquema, com motivo escrito.',
    };
  }

  /**
   * MARCAR UM MEDICAMENTO COMO EXCLUSIVO DA ENFERMAGEM (§11.3, migração 0930).
   *
   * Substitui a decisão por PERÍODO, que deixou de fazer sentido quando se
   * soube que a Enfermagem trabalha das 9h às 17h: a dose das 22h é do
   * educador de plantão por definição, e não por autorização. O que sobra —
   * e é real — é o medicamento que exige a Enfermagem: injetável, controlado,
   * de manejo difícil.
   *
   * O motivo é obrigatório e vai para o histórico junto do antes-e-depois: a
   * educadora que for barrada às 22h lê POR QUE aquele frasco não é com ela.
   */
  async setNurseOnly(user: AuthenticatedUser, prescriptionId: string, input: {
    soEnfermagem: boolean; motivo?: string;
  }) {
    const motivo = (input.motivo ?? '').trim();
    let mudou = false;
    try {
      mudou = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT app_definir_so_enfermagem($1,$2,$3) AS mudou`,
          [prescriptionId, input.soEnfermagem, motivo]);
        return !!r?.mudou;
      });
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('prescricao_inexistente')) throw new NotFoundException('Esquema não encontrado.');
      if (m.includes('casa_fora_de_escopo')) {
        throw new ForbiddenException('Este esquema é de uma casa fora do seu alcance.');
      }
      if (m.startsWith('so_enfermagem:')) {
        const frase = m.replace('so_enfermagem: ', '');
        throw m.includes('escreva por que')
          ? new BadRequestException(frase)
          : new ForbiddenException(frase);
      }
      throw e;
    }
    if (!mudou) {
      return { ok: true, mudou: false,
        aviso: 'Este esquema já estava assim. Nada foi registrado — marcar duas vezes o mesmo '
          + 'estado não é decisão.' };
    }
    await this.audit.log({
      action: 'medication.nurse_only', actorId: user.id,
      entity: 'prescription', entityId: prescriptionId,
      detail: { soEnfermagem: input.soEnfermagem },
    });
    return { ok: true, mudou: true,
      aviso: input.soEnfermagem
        ? 'Marcado: só a Enfermagem administra este medicamento. O educador que tentar confirmar '
          + 'lê o motivo que você escreveu.'
        : 'Desmarcado: o educador de plantão volta a poder dar este medicamento. O que valia antes '
          + 'continua registrado.' };
  }

  /** O histórico das exceções deste esquema — quem marcou, quando e por quê. */
  async nurseOnlyHistory(user: AuthenticatedUser, prescriptionId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows: r } = await c.query(
        `SELECT id, was_nurse_only, is_nurse_only, reason, changed_at,
                app_user_display_name(changed_by) AS por
           FROM prescription_restriction_change
          WHERE prescription_id = $1 ORDER BY changed_at DESC LIMIT 50`, [prescriptionId]);
      return r;
    });
    return rows.map((r: any) => ({
      id: r.id, antes: r.was_nurse_only, depois: r.is_nurse_only,
      motivo: r.reason, por: r.por, quando: r.changed_at,
    }));
  }

  /**
   * Cada decisão sobre quem pode administrar, com o que valia antes.
   *
   * Lê quem alcança a casa, e não só quem decide: a educadora que vai — ou não
   * vai — dar o remédio tem o direito de saber quando isso mudou e sob qual
   * decisão, sem precisar pedir à coordenação.
   */
  async protocolHistory(user: AuthenticatedUser, houseId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows: r } = await c.query(
        `SELECT id, period, before_nursing, before_educator, after_nursing, after_educator,
                reason, at, app_user_display_name(decided_by) AS por
           FROM medication_protocol_change WHERE house_id = $1
          ORDER BY at DESC LIMIT 50`, [houseId]);
      return r;
    });
    return rows.map((r: any) => ({
      id: r.id, periodo: r.period,
      // `null` no "antes" não é `false`: significa que não havia definição e
      // valia o padrão protetivo. A tela precisa dizer a diferença.
      antes: r.before_nursing === null
        ? null
        : { enfermagem: r.before_nursing, educadorAutorizado: r.before_educator },
      depois: { enfermagem: r.after_nursing, educadorAutorizado: r.after_educator },
      motivo: r.reason, por: r.por, quando: r.at,
    }));
  }

  /**
   * Coordenador é cargo de UMA casa, e a policy fala em linguagem de banco.
   * Sem isto, escrever o protocolo da casa vizinha devolvia 500 com "new row
   * violates row-level security policy" — que não é uma frase para quem está
   * decidindo quem pode dar remédio.
   */
  private async recusaCasaDeFora<T>(fn: () => Promise<T>, frase: string): Promise<T> {
    try {
      return await fn();
    } catch (e: any) {
      if (String(e?.message ?? '').includes('row-level security')) {
        throw new ForbiddenException(frase);
      }
      throw e;
    }
  }

  // ------------------------------------------------------------------
  // A grade como documento
  // ------------------------------------------------------------------

  /** A folha da grade. Ver não é exportar: não gera arquivo e não registra. */
  async folhaDaGrade(user: AuthenticatedUser, houseId: string, date: string) {
    const doses = await this.dayGrid(user, houseId, date);
    const casa = await this.db.asUser(user.id, async (c) => {
      /*
       * O ESCOPO É CONFERIDO ANTES, e não deduzido do rótulo.
       *
       * `app_house_label` filtra por INSTITUIÇÃO, não por alcance: a
       * coordenação da Casa 03 recebe o código da Casa 04 sem problema
       * nenhum. Quem responde "esta casa é sua?" é `app_house_in_scope`, e
       * sem ela a folha da outra casa saía com título certo e conteúdo
       * vazio — que se lê como "não há nada hoje", e não como "não é sua".
       */
      const { rows: [e] } = await c.query(`SELECT app_house_in_scope($1) AS pode`, [houseId]);
      if (!e?.pode) return null;
      const { rows: [h] } = await c.query(
        `SELECT app_house_label($1) AS code, app_house_name($1) AS name`, [houseId]);
      return [h?.code, h?.name].filter(Boolean).join(' — ');
    });
    /*
     * Casa sem rótulo é casa fora do alcance. Sem esta recusa, a grade de
     * outra unidade sairia com o título vazio — e o RLS teria devolvido lista
     * vazia, que se lê como "casa sem medicação hoje" (a mesma armadilha do
     * "zerar não é recusar").
     */
    if (!casa) throw new NotFoundException('Unidade não encontrada — ou fora do seu alcance.');
    return folhaDaGrade(
      casa,
      doses.map((d: any) => ({
        horario: d.horario, tipo: d.tipo, acolhido: d.acolhido,
        medicamento: d.medicamento, dose: d.dose, via: d.via, rotulo: d.rotulo,
      })),
      { nome: user.fullName, cargo: cargoNoDocumento(user.role) },
    );
  }

  async exportarGrade(user: AuthenticatedUser, houseId: string, date: string, finalidade: string) {
    const folha = await this.folhaDaGrade(user, houseId, date);
    return this.documentos.exportar(user, folha, {
      entidade: 'medication_grid', houseId, finalidade,
    });
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
