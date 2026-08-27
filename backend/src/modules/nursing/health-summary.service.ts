import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { maskCpf } from '../../kernel/common/cpf';

/** Finalidades aceitas — declarar a finalidade é obrigatório (§7.4). */
export const FINALIDADES = [
  'consulta', 'exame', 'urgencia', 'internacao', 'transferencia_assistencial',
] as const;
export type Finalidade = (typeof FINALIDADES)[number];

/** Quem pode gerar e baixar (§7.4). */
const PODE_EMITIR = [
  'educador', 'lider_diurno', 'lider_noturno_geral',
  'equipe_tecnica', 'coordenador', 'enfermagem', 'gestor_geral',
];

/**
 * RESUMO DE SAÚDE PARA ATENDIMENTO (§7.4).
 *
 * É o único documento do sistema que SAI da instituição — vai para a mão de um
 * profissional de saúde numa consulta, numa emergência ou numa internação. Por
 * isso ele é construído por subtração: entra só o que serve ao cuidado naquele
 * momento, e tudo o mais fica de fora por construção, não por filtro de tela.
 *
 * Fora, explicitamente: dados bancários, conteúdo judicial, comportamento,
 * narrativas pessoais e informações familiares sem pertinência clínica.
 */
@Injectable()
export class HealthSummaryService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async generate(user: AuthenticatedUser, personId: string, input: {
    finalidade: string; incluirReceita?: boolean; incluirExame?: boolean;
    incluirUltimaEvolucao?: boolean; offline?: boolean; ultimaSincronizacao?: string;
  }) {
    if (!PODE_EMITIR.includes(user.role)) {
      throw new ForbiddenException('Seu cargo não emite Resumo de Saúde.');
    }
    if (!FINALIDADES.includes(input.finalidade as Finalidade)) {
      throw new BadRequestException(
        `Informe a finalidade da emissão: ${FINALIDADES.join(', ')}.`);
    }

    const dados = await this.db.asUser(user.id, async (c) => {
      const { rows: [p] } = await c.query(
        `SELECT p.id, p.full_name, p.social_name, p.birth_date, p.cpf,
                date_part('year', age(p.birth_date))::int AS idade
         FROM person p WHERE p.id = $1`, [personId]);
      if (!p) return null;

      const { rows: [casa] } = await c.query(
        `SELECT h.id, h.code, h.name, h.address
         FROM house_stay s JOIN house h ON h.id = s.house_id
         WHERE s.person_id = $1 AND s.status = 'ativa'`, [personId]);

      const { rows: condicoes } = await c.query(
        `SELECT kind, description, severity FROM health_condition
         WHERE person_id = $1 AND active ORDER BY essential_alert DESC, kind`, [personId]);

      const { rows: restricoes } = await c.query(
        `SELECT restriction, substitution, guidance FROM food_restriction
         WHERE person_id = $1 AND active`, [personId]);

      // Medicamentos ATIVOS: só prescrição assinada pela Enfermagem.
      const { rows: medicamentos } = await c.query(
        `SELECT pr.medication, pr.dose, pr.route, pr.kind, pr.use_condition,
                (SELECT string_agg(to_char(ms.time_of_day,'HH24:MI'), ', ' ORDER BY ms.time_of_day)
                   FROM medication_schedule ms WHERE ms.prescription_id = pr.id) AS horarios,
                (SELECT max(a.administered_at) FROM medication_administration a
                   WHERE a.prescription_id = pr.id AND a.administered_at IS NOT NULL) AS ultima
         FROM prescription pr
         WHERE pr.person_id = $1 AND pr.status = 'ativa'
         ORDER BY pr.medication`, [personId]);

      const { rows: atendimentos } = await c.query(
        `SELECT kind, happened_at, place, specialty, reason, outcome, status, return_on
         FROM health_encounter WHERE person_id = $1
         ORDER BY happened_at DESC LIMIT 5`, [personId]);

      const { rows: [ultimaEvolucao] } = await c.query(
        `SELECT e.kind, e.happened_at, e.state_return, e.guidance, e.restrictions, e.return_deadline
         FROM health_evolution e
         WHERE e.person_id = $1 AND e.status = 'assinada'
         ORDER BY e.happened_at DESC LIMIT 1`, [personId]);

      return { p, casa, condicoes, restricoes, medicamentos, atendimentos, ultimaEvolucao };
    });

    if (!dados) throw new NotFoundException('Acolhido não encontrado');

    // Registro da emissão, com finalidade — antes de devolver o conteúdo.
    const emissaoId = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `INSERT INTO health_summary_issue (person_id, house_id, purpose, issued_by, offline_copy, last_sync_at)
         VALUES ($1,$2,$3,$4,$5,$6::timestamptz) RETURNING id`,
        [personId, dados.casa?.id ?? null, input.finalidade, user.id,
         input.offline ?? false, input.ultimaSincronizacao ?? null]);
      return r.id;
    });

    await this.audit.log({
      action: 'health.summary_issue', actorId: user.id, houseId: dados.casa?.id ?? null,
      entity: 'person', entityId: personId,
      purpose: input.finalidade,
      detail: { emissaoId, offline: input.offline ?? false },
    });

    const agora = new Date();
    return {
      emissaoId,
      classificacao: 'CONFIDENCIAL — USO EM SAÚDE',
      finalidade: input.finalidade,
      geradoEm: agora.toISOString(),
      geradoPor: user.fullName,
      // A versão offline diz de quando são os dados — quem lê precisa saber.
      versaoOffline: input.offline ?? false,
      ultimaSincronizacao: input.offline ? (input.ultimaSincronizacao ?? null) : null,
      avisoOffline: input.offline
        ? 'Documento gerado sem conexão. Os dados refletem a última sincronização indicada.'
        : null,

      identificacao: {
        nome: dados.p.social_name || dados.p.full_name,
        nomeCivil: dados.p.full_name,
        nascimento: dados.p.birth_date,
        idade: dados.p.idade,
        // CPF completo aqui é pertinente: identifica a pessoa no serviço de saúde.
        cpf: dados.p.cpf,
      },
      unidade: dados.casa ? {
        codigo: dados.casa.code, nome: dados.casa.name, endereco: dados.casa.address,
        contatoInstitucional: 'Contato institucional a configurar antes do piloto',
      } : null,

      alergias: dados.condicoes.filter((c: any) => c.kind === 'alergia')
        .map((c: any) => ({ descricao: c.description, gravidade: c.severity })),
      condicoesRelevantes: dados.condicoes.filter((c: any) => c.kind !== 'alergia')
        .map((c: any) => ({ descricao: c.description, gravidade: c.severity })),
      restricoesAlimentares: dados.restricoes.map((r: any) => ({
        evitar: r.restriction, substituicao: r.substitution, orientacao: r.guidance,
      })),

      medicamentosAtivos: dados.medicamentos.map((m: any) => ({
        medicamento: m.medication, dose: m.dose, via: m.route,
        horarios: m.horarios, ultimaAdministracao: m.ultima,
        usoQuandoNecessario: m.kind === 'quando_necessario',
        condicaoDeUso: m.use_condition,
      })),

      atendimentosRecentes: dados.atendimentos.map((a: any) => ({
        tipo: a.kind, quando: a.happened_at, local: a.place,
        especialidade: a.specialty, motivo: a.reason, desfecho: a.outcome,
        situacao: a.status, retornoEm: a.return_on,
      })),

      ultimaEvolucaoAssinada: input.incluirUltimaEvolucao && dados.ultimaEvolucao ? {
        tipo: dados.ultimaEvolucao.kind, quando: dados.ultimaEvolucao.happened_at,
        estadoNoRetorno: dados.ultimaEvolucao.state_return,
        orientacoes: dados.ultimaEvolucao.guidance,
        restricoes: dados.ultimaEvolucao.restrictions,
        prazoRetorno: dados.ultimaEvolucao.return_deadline,
      } : null,

      // Declaração explícita do que NÃO está aqui — para quem recebe o
      // documento e para quem audita o sistema depois.
      naoIncluido: [
        'dados bancários e benefícios',
        'conteúdo judicial',
        'registros de comportamento',
        'narrativas pessoais de profissionais',
        'informações familiares sem pertinência clínica',
      ],
      rodape: 'Documento gerado pela Rede Acolher para uso exclusivo em atendimento de saúde. ' +
              'A geração, a visualização e o download foram registrados em auditoria.',
    };
  }

  /** Registro do download — evento distinto da geração (§7.4). */
  async registerDownload(user: AuthenticatedUser, emissaoId: string) {
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE health_summary_issue SET downloaded_at = now()
         WHERE id = $1 AND issued_by = $2`, [emissaoId, user.id]);
      return (rowCount ?? 0) > 0;
    });
    if (!ok) throw new NotFoundException('Emissão não encontrada.');
    await this.audit.log({
      action: 'health.summary_download', actorId: user.id,
      entity: 'health_summary_issue', entityId: emissaoId,
    });
    return { ok: true };
  }

  /** Histórico de emissões de um acolhido — quem gerou, quando e para quê. */
  async issues(user: AuthenticatedUser, personId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT i.id, i.purpose, i.issued_at, i.downloaded_at, i.offline_copy,
                app_user_display_name(i.issued_by) AS por
         FROM health_summary_issue i
         WHERE i.person_id = $1 ORDER BY i.issued_at DESC LIMIT 50`, [personId]);
      return rows.map((r) => ({
        id: r.id, finalidade: r.purpose, geradoEm: r.issued_at,
        baixadoEm: r.downloaded_at, versaoOffline: r.offline_copy, por: r.por,
      }));
    });
  }
}
