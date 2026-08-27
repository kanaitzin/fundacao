import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser, EscalationRequest } from '../../kernel/contracts';
import { StatementsService } from '../statements';

/** Situações que abrem fluxo especial (§13.1). */
export const CATEGORIAS = [
  { code: 'violencia_ou_suspeita', label: 'Violência ou suspeita de violação', revisaoTecnica: true, restrito: true },
  { code: 'conflito_agressao', label: 'Conflito ou agressão', revisaoTecnica: false, restrito: false },
  { code: 'saida_nao_autorizada', label: 'Saída não autorizada', revisaoTecnica: false, restrito: false },
  { code: 'erro_medicamento', label: 'Erro de medicamento', revisaoTecnica: true, restrito: false },
  { code: 'emergencia_saude', label: 'Emergência de saúde', revisaoTecnica: true, restrito: false },
  { code: 'contencao', label: 'Contenção', revisaoTecnica: true, restrito: true },
  { code: 'desorganizacao_relevante', label: 'Desorganização com repercussão relevante', revisaoTecnica: false, restrito: false },
  { code: 'dano_recusa_critica', label: 'Dano, recusa crítica ou fato que exija acompanhamento', revisaoTecnica: false, restrito: false },
  { code: 'outro', label: 'Outro', revisaoTecnica: false, restrito: false },
];

const ORGAOS = ['judiciario', 'conselho_tutelar', 'ministerio_publico', 'saude', 'escola', 'rede', 'outro'];
const CANAIS = ['oficio', 'email_institucional', 'presencial', 'telefone', 'sistema_externo'];

/** Termos que não podem aparecer em nome de arquivo (§3.3). */
const PROIBIDO_NO_NOME = [
  /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,                       // CPF, com ou sem máscara
  /\b\d{11}\b/,
  /\b(hiv|aids|soropositiv|cid[\s-]?\d|f\d{2}\.\d|autis|esquizo|depress|transtorn|psiquiatr)/i,
  /\b(judicial|processo|autos|vara|promotoria|mandado)\b/i,
];

/**
 * OCORRÊNCIAS ESPECIAIS E PROTEÇÃO (§13).
 *
 * O que este serviço nunca faz: julgar se a contenção foi adequada, classificar
 * gravidade sozinho, decidir destino, punição ou responsabilidade, ou enviar
 * qualquer coisa para fora da instituição. Ele registra, avisa quem tem função
 * de agir e mantém o que foi escrito exatamente como foi escrito.
 */
@Injectable()
export class IncidentsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(StatementsService) private readonly statements: StatementsService,
  ) {}

  catalogo() {
    return {
      categorias: CATEGORIAS,
      orgaos: ORGAOS, canais: CANAIS,
      aviso: 'O registro nunca deve atrasar proteção imediata, atendimento de saúde ou o protocolo institucional. '
           + 'Abra a ocorrência com o mínimo e complete depois.',
    };
  }

  // ------------------------------------------------------------------

  async open(user: AuthenticatedUser, input: {
    houseId: string; categoria: string; quando: string; fato: string;
    acolhidos?: string[]; atividade?: string; presentes?: string;
    medidasImediatas?: string; saude?: boolean; medicamento?: boolean;
    contatos?: string; pendencias?: string; prazo?: string;
    falaEspontanea?: string; sinaisObservados?: string;
    offline?: boolean; clientOpId?: string;
  }) {
    const cat = CATEGORIAS.find((c) => c.code === input.categoria);
    if (!cat) throw new BadRequestException('Categoria inválida.');
    if ((input.fato ?? '').trim().length < 15) {
      throw new BadRequestException(
        'Descreva o fato objetivamente: o que aconteceu, onde e quando. Sem interpretação e sem juízo sobre a pessoa.');
    }
    if (!input.quando) throw new BadRequestException('Informe a data e a hora do fato.');

    const id = await this.db.asUser(user.id, async (c) => {
      if (input.clientOpId) {
        const { rows: [dup] } = await c.query(`SELECT id FROM incident WHERE client_op_id = $1`, [input.clientOpId]);
        if (dup) return dup.id as string;
      }
      const { rows: [r] } = await c.query(
        `INSERT INTO incident (house_id, category, happened_at, activity_ref, objective_fact,
           people_present, immediate_measures, health_related, medication_related,
           contacts, pendencies, deadline, opened_by, offline, client_op_id)
         VALUES ($1,$2,$3::timestamptz,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13,$14,$15)
         RETURNING id`,
        [input.houseId, input.categoria, input.quando, input.atividade ?? null,
         input.fato.trim(), input.presentes ?? null, input.medidasImediatas ?? null,
         input.saude ?? false, input.medicamento ?? false, input.contatos ?? null,
         input.pendencias ?? null, input.prazo ?? null, user.id,
         input.offline ?? false, input.clientOpId ?? null]);
      const novoId = r.id as string;

      for (const p of input.acolhidos ?? []) {
        await c.query(
          `INSERT INTO incident_person (incident_id, person_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`, [novoId, p]);
      }
      if (input.falaEspontanea || input.sinaisObservados) {
        await c.query(
          `INSERT INTO incident_protected (incident_id, house_id, spontaneous_speech,
             observed_signs, author_id, health_related)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [novoId, input.houseId, input.falaEspontanea ?? null,
           input.sinaisObservados ?? null, user.id, input.saude ?? false]);
      }
      return novoId;
    }).catch((e: any) => {
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        throw new ForbiddenException('Você não tem função para abrir ocorrência nesta casa.');
      }
      throw e;
    });

    await this.audit.log({
      action: 'incident.open', actorId: user.id, houseId: input.houseId,
      entity: 'incident', entityId: id,
      // Metadados. O fato em si nunca vai para o log (§20).
      detail: { categoria: input.categoria, acolhidos: (input.acolhidos ?? []).length,
                saude: input.saude ?? false, medicamento: input.medicamento ?? false },
    });

    // §13.2 — avisar IMEDIATAMENTE líder, equipe técnica e coordenação; e a
    // Enfermagem quando há saúde ou medicamento. O Gestor Geral NÃO entra
    // automaticamente: quem escalona a ele é gente, conforme gravidade.
    const alvos = ['lider', 'tecnica_coordenacao'];
    if (input.saude || input.medicamento || cat.code === 'emergencia_saude' || cat.code === 'erro_medicamento') {
      alvos.push('enfermagem');
    }
    for (const level of alvos) {
      const pedido: EscalationRequest = {
        level, entity: 'incident', entityId: id, reason: `ocorrencia:${input.categoria}`,
        title: `Ocorrência aberta — ${cat.label}`,
        // O corpo da notificação não carrega o fato: quem precisa saber, abre.
        body: 'Uma ocorrência foi registrada e aguarda acompanhamento. Abra na Rede Acolher para ver os detalhes.',
        priority: cat.revisaoTecnica ? 'critica' : 'alta',
        groupKey: `incident:${id}:${level}`,
      };
      await this.bus.publish('escalation.requested', pedido, { actorId: user.id, houseId: input.houseId });
    }

    return {
      id, categoria: cat.label,
      revisaoTecnicaObrigatoria: cat.revisaoTecnica,
      nivelAcesso: cat.restrito ? 'restrito' : 'equipe',
      avisados: alvos,
      aviso: cat.revisaoTecnica
        ? 'Registrada. Esta categoria não se encerra sem validação da equipe técnica ou da coordenação.'
        : 'Registrada. Líder, equipe técnica e coordenação foram avisados.',
    };
  }

  async list(user: AuthenticatedUser, houseId: string, apenasAbertas = false) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT i.id, i.category, i.happened_at, i.status, i.access_level,
                i.requires_technical_review, i.deadline,
                app_user_display_name(i.opened_by) AS aberta_por,
                (SELECT count(*)::int FROM incident_person p WHERE p.incident_id = i.id) AS acolhidos,
                (SELECT count(*)::int FROM incident_attachment a WHERE a.incident_id = i.id) AS anexos
         FROM incident i
         WHERE i.house_id = $1 AND ($2::boolean IS NOT TRUE OR i.status <> 'fechada')
         ORDER BY i.happened_at DESC LIMIT 200`, [houseId, apenasAbertas]);
      return rows.map((r) => ({
        id: r.id,
        categoria: CATEGORIAS.find((c) => c.code === r.category)?.label ?? r.category,
        codigoCategoria: r.category,
        quando: r.happened_at, status: r.status, nivelAcesso: r.access_level,
        revisaoTecnicaObrigatoria: r.requires_technical_review,
        prazo: r.deadline, abertaPor: r.aberta_por,
        acolhidos: r.acolhidos, anexos: r.anexos,
      }));
    });
  }

  async get(user: AuthenticatedUser, id: string) {
    const dados = await this.db.asUser(user.id, async (c) => {
      const { rows: [i] } = await c.query(`SELECT * FROM incident WHERE id = $1`, [id]);
      if (!i) return null;
      // Sem `JOIN person`: a ocorrência pertence à CASA, a pessoa é visível
      // pela permanência ATIVA. Numa ocorrência de violência — categoria em
      // que a transferência é frequente — a equipe técnica que PRECISA fazer
      // a revisão abria o caso e não via mais criança nenhuma associada.
      const { rows: pessoas } = await c.query(
        `SELECT ip.person_id AS id, app_person_display_name(ip.person_id) AS nome
         FROM incident_person ip WHERE ip.incident_id = $1`, [id]);
      const { rows: [prot] } = await c.query(
        `SELECT spontaneous_speech, observed_signs, at FROM incident_protected WHERE incident_id = $1`, [id]);
      const { rows: [cont] } = await c.query(
        `SELECT * FROM incident_restraint WHERE incident_id = $1`, [id]);
      const { rows: sinteses } = await c.query(
        `SELECT s.id, s.body, s.at, app_user_display_name(s.author_id) AS autor
         FROM incident_synthesis s WHERE s.incident_id = $1 ORDER BY s.at`, [id]);
      // `storage_ref` nem é pedido: o papel da aplicação não tem privilégio
      // de leitura nessa coluna (migração 0320).
      const { rows: anexos } = await c.query(
        `SELECT a.id, a.kind, a.display_name, a.justification, a.restricted, a.at,
                app_user_display_name(a.author_id) AS autor
         FROM incident_attachment a WHERE a.incident_id = $1 ORDER BY a.at`, [id]);
      const { rows: comunicacoes } = await c.query(
        `SELECT e.id, e.organ, e.recipient_role, e.channel, e.status, e.occurred_at,
                e.approved_at, e.delivered_at
         FROM external_communication e WHERE e.incident_id = $1 ORDER BY e.created_at`, [id]);
      return { i, pessoas, prot, cont, sinteses, anexos, comunicacoes };
    });
    if (!dados) throw new NotFoundException('Ocorrência não encontrada — ou fora do seu alcance.');

    const relatos = await this.statements.listFor(user, 'incident', id);
    const i = dados.i;

    return {
      id: i.id, casaId: i.house_id,
      categoria: CATEGORIAS.find((c) => c.code === i.category)?.label ?? i.category,
      codigoCategoria: i.category,
      quando: i.happened_at, atividade: i.activity_ref,
      fato: i.objective_fact, presentes: i.people_present,
      medidasImediatas: i.immediate_measures,
      saude: i.health_related, medicamento: i.medication_related,
      contatos: i.contacts, pendencias: i.pendencies, prazo: i.deadline,
      status: i.status, nivelAcesso: i.access_level,
      revisaoTecnicaObrigatoria: i.requires_technical_review,
      acolhidos: dados.pessoas.map((p: any) => ({
        id: p.id,
        // Nome nulo aqui significa uma coisa só: a criança nunca esteve numa
        // casa do seu alcance. Dizer isso é melhor do que exibir um vazio.
        nome: p.nome ?? '(fora do seu alcance)',
        visivel: p.nome != null,
      })),
      // Vem nulo para quem a política não autoriza — e a tela diz por quê.
      protegido: dados.prot
        ? { falaEspontanea: dados.prot.spontaneous_speech,
            sinaisObservados: dados.prot.observed_signs, registradoEm: dados.prot.at }
        : null,
      avisoProtegido: dados.prot ? null
        : 'Fala espontânea e sinais observados, quando existem, são acessíveis à equipe técnica e à coordenação.',
      contencao: dados.cont ? {
        antecedentes: dados.cont.antecedents, local: dados.cont.place,
        presentes: dados.cont.people_present, tentativasAnteriores: dados.cont.previous_attempts,
        metodo: dados.cont.method, duracaoMinutos: dados.cont.duration_minutes,
        possivelLesao: dados.cont.possible_injury, avaliacaoSaude: dados.cont.health_evaluation,
        acaoPosterior: dados.cont.later_action,
        nota: 'O sistema não avalia se a medida foi adequada. Essa análise é humana e técnica.',
      } : null,
      sinteses: dados.sinteses.map((s: any) => ({ id: s.id, texto: s.body, autor: s.autor, quando: s.at })),
      relatos,
      // Listas vazias por política não são "não existe": são "não posso ver".
      // O líder encerra a etapa operacional sem navegar pela análise técnica,
      // mas precisa saber que ela pode existir (§13.5).
      avisoAnaliseTecnica: ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)
        ? null
        : 'Sínteses técnicas e comunicações externas, quando existem, são acessíveis à equipe técnica e à coordenação.',
      anexos: dados.anexos.map((a: any) => ({
        id: a.id, tipo: a.kind, nome: a.display_name, justificativa: a.justification,
        restrito: a.restricted, autor: a.autor, quando: a.at,
        // O líder vê que existe; abrir é outro ato, com finalidade.
        podeAbrirDireto: !a.restricted,
      })),
      comunicacoesExternas: dados.comunicacoes.map((e: any) => ({
        id: e.id, orgao: e.organ, destinatarioFuncional: e.recipient_role,
        canal: e.channel, status: e.status, quando: e.occurred_at,
        aprovadaEm: e.approved_at, entregueEm: e.delivered_at,
      })),
    };
  }

  // ------------------------------------------------------------------

  async addProtected(user: AuthenticatedUser, id: string, input: {
    falaEspontanea?: string; sinaisObservados?: string;
  }) {
    const casa = await this.casa(user, id);
    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(
          `INSERT INTO incident_protected (incident_id, house_id, spontaneous_speech, observed_signs, author_id, health_related)
           SELECT $1,$2,$3,$4,$5, i.health_related FROM incident i WHERE i.id = $1`,
          [id, casa, input.falaEspontanea ?? null, input.sinaisObservados ?? null, user.id]);
      });
    } catch (e: any) {
      if (e?.code === '23505') {
        throw new BadRequestException(
          'Já existe registro protegido nesta ocorrência, e ele não é reescrito. '
          + 'Acrescente um relato complementar em seu nome.');
      }
      throw e;
    }
    await this.audit.log({ action: 'incident.protected', actorId: user.id, houseId: casa,
      entity: 'incident', entityId: id, detail: { fala: !!input.falaEspontanea, sinais: !!input.sinaisObservados } });
    return { ok: true, aviso: 'Registrado. Este conteúdo não aparece para colegas do plantão.' };
  }

  /** Contenção: campos próprios exigidos pelo §13.3. */
  async addRestraint(user: AuthenticatedUser, id: string, input: any) {
    const obrigatorios: Array<[string, string]> = [
      ['antecedentes', 'fatos antecedentes'], ['local', 'local'],
      ['presentes', 'pessoas presentes'], ['tentativasAnteriores', 'tentativas anteriores'],
      ['metodo', 'método utilizado'],
    ];
    const faltando = obrigatorios.filter(([k]) => !(input?.[k] ?? '').toString().trim());
    if (faltando.length) {
      throw new BadRequestException(
        `Registro de contenção exige: ${faltando.map(([, l]) => l).join(', ')}.`);
    }
    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(
          `INSERT INTO incident_restraint (incident_id, antecedents, place, people_present,
             previous_attempts, method, duration_minutes, possible_injury, health_evaluation,
             later_action, followup_by, recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [id, input.antecedentes, input.local, input.presentes, input.tentativasAnteriores,
           input.metodo, input.duracaoMinutos ?? null, input.possivelLesao ?? null,
           input.avaliacaoSaude ?? null, input.acaoPosterior ?? null,
           input.responsavelAcompanhamentoId ?? null, user.id]);
      });
    } catch (e: any) {
      if (e?.code === '23505') throw new BadRequestException('Esta contenção já foi registrada e não é reescrita.');
      throw e;
    }
    await this.audit.log({ action: 'incident.restraint', actorId: user.id,
      entity: 'incident', entityId: id, detail: { duracao: input.duracaoMinutos ?? null } });
    return {
      ok: true,
      aviso: 'Registrado. O sistema não avalia se a medida foi adequada — a análise é da equipe técnica.',
    };
  }

  /** Síntese técnica: registro NOVO, ao lado dos originais (§13.4). */
  async addSynthesis(user: AuthenticatedUser, id: string, texto: string) {
    if ((texto ?? '').trim().length < 20) {
      throw new BadRequestException('A síntese precisa de conteúdo (mínimo 20 caracteres).');
    }
    const casa = await this.casa(user, id);
    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(
          `INSERT INTO incident_synthesis (incident_id, house_id, body, author_id)
           VALUES ($1,$2,$3,$4)`, [id, casa, texto.trim(), user.id]);
      });
    } catch (e: any) {
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        throw new ForbiddenException('A síntese cabe à equipe técnica e à coordenação.');
      }
      throw e;
    }
    await this.audit.log({ action: 'incident.synthesis', actorId: user.id, houseId: casa,
      entity: 'incident', entityId: id });
    return { ok: true, aviso: 'Síntese gravada. Nenhum relato original foi alterado ou apagado.' };
  }

  /** §26.2 #22 — ocorrência crítica fechada pelo líder AGUARDA revisão técnica. */
  async closeOperational(user: AuthenticatedUser, id: string, nota?: string) {
    const r = await this.comando(user, 'app_close_incident_operational($1,$2)', [id, nota ?? null], {
      cargo_nao_encerra_ocorrencia: () => new ForbiddenException(
        'O encerramento da etapa operacional cabe ao líder responsável, à equipe técnica ou à coordenação.'),
      ocorrencia_ja_fechada: () => new BadRequestException('Esta ocorrência já está fechada.'),
      etapa_operacional_ja_encerrada: () => new BadRequestException(
        'A etapa operacional desta ocorrência já foi encerrada.'),
      ocorrencia_inexistente: () => new NotFoundException('Ocorrência não encontrada.'),
    });

    if (r.out_needs_review) {
      const casa = await this.casa(user, id);
      const pedido: EscalationRequest = {
        level: 'tecnica_coordenacao', entity: 'incident_review', entityId: id,
        reason: 'aguardando_revisao_tecnica',
        title: 'Ocorrência aguardando revisão técnica',
        body: 'A etapa operacional foi encerrada. A validação técnica ainda é necessária para fechar.',
        priority: 'critica', groupKey: `incident-review:${id}`,
      };
      await this.bus.publish('escalation.requested', pedido, { actorId: user.id, houseId: casa });
    }

    return {
      status: r.out_status,
      aviso: r.out_needs_review
        ? 'Etapa operacional encerrada. A ocorrência permanece AGUARDANDO REVISÃO TÉCNICA — ela não está fechada.'
        : 'Etapa operacional encerrada.',
    };
  }

  async review(user: AuthenticatedUser, id: string, decisao: string, nota?: string) {
    const r = await this.comando(user, 'app_review_incident($1,$2,$3)', [id, decisao, nota ?? null], {
      cargo_nao_revisa: () => new ForbiddenException(
        'A validação técnica cabe à equipe técnica e à coordenação.'),
      sintese_ausente: () => new BadRequestException(
        'Registre a síntese técnica antes de fechar. Em caso de saúde, medicamento, contenção ou '
        + 'violência, o fechamento precisa dizer a que se chegou.'),
      etapa_operacional_em_aberto: () => new BadRequestException(
        'A revisão técnica vem depois do encerramento da etapa operacional. '
        + 'O líder responsável precisa encerrá-la primeiro.'),
      ocorrencia_ja_fechada: () => new BadRequestException(
        'Esta ocorrência já está fechada. Reabra com histórico se for preciso rever.'),
      ocorrencia_nao_esta_encerrada: () => new BadRequestException(
        'Só se reabre uma ocorrência encerrada ou fechada.'),
      decisao_invalida: () => new BadRequestException('Decisão deve ser "validar" ou "reabrir".'),
      ocorrencia_inexistente: () => new NotFoundException('Ocorrência não encontrada.'),
    });
    return {
      status: r.out_status,
      aviso: r.out_status === 'fechada'
        ? 'Fechada após validação técnica. O histórico permanece consultável e pode ser reaberto.'
        : 'Reaberta, com histórico preservado.',
    };
  }

  // ------------------------------------------------------------------
  // Anexos (§13.7)
  // ------------------------------------------------------------------

  async addAttachment(user: AuthenticatedUser, id: string, input: {
    tipo: string; nome: string; referencia: string; justificativa?: string;
    restrito?: boolean; checksum?: string;
  }) {
    const tipos = ['documento_medico', 'comunicacao_oficial', 'foto_autorizada', 'documento_escolar', 'documento_tecnico'];
    if (!tipos.includes(input.tipo)) throw new BadRequestException('Tipo de anexo inválido.');
    // §13.7: foto exige justificativa. Sem ela, não entra.
    if (input.tipo === 'foto_autorizada' && (input.justificativa ?? '').trim().length < 15) {
      throw new BadRequestException(
        'Foto exige justificativa: para que ela é necessária e qual autorização a ampara.');
    }
    const nome = (input.nome ?? '').trim();
    if (!nome) throw new BadRequestException('Informe um nome de exibição para o anexo.');
    if (PROIBIDO_NO_NOME.some((re) => re.test(nome))) {
      // §3.3 — CPF, diagnóstico e conteúdo judicial nunca em nome de arquivo.
      throw new BadRequestException(
        'O nome do arquivo não pode conter CPF, diagnóstico ou referência judicial. '
        + 'Use um nome neutro; o conteúdo fica protegido dentro do anexo.');
    }

    const casa = await this.casa(user, id);
    const attId = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `INSERT INTO incident_attachment (incident_id, house_id, kind, display_name,
           justification, restricted, storage_ref, checksum, author_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [id, casa, input.tipo, nome, input.justificativa ?? null,
         input.restrito ?? (input.tipo === 'foto_autorizada'),
         input.referencia, input.checksum ?? null, user.id]);
      return r.id as string;
    });

    await this.audit.log({ action: 'incident.attachment_add', actorId: user.id, houseId: casa,
      entity: 'incident_attachment', entityId: attId, detail: { tipo: input.tipo } });
    return { id: attId, aviso: 'Anexo registrado. Fotos não aparecem na linha do tempo.' };
  }

  async openAttachment(user: AuthenticatedUser, attachmentId: string, finalidade?: string) {
    try {
      const r = await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_open_attachment($1,$2)`, [attachmentId, finalidade ?? '']);
        return row;
      });
      return { referencia: r.out_ref, tipo: r.out_kind, nome: r.out_name,
               aviso: 'Abertura registrada em auditoria.' };
    } catch (e: any) {
      const m = e?.message ?? '';
      if (m.includes('anexo_restrito')) {
        throw new ForbiddenException(
          'Anexo restrito. Você pode ver que ele existe; abri-lo cabe à equipe técnica e à coordenação.');
      }
      if (m.includes('finalidade_insuficiente')) {
        throw new BadRequestException('Descreva a finalidade da abertura (mínimo 15 caracteres).');
      }
      if (m.includes('anexo_inexistente')) throw new NotFoundException('Anexo não encontrado.');
      throw e;
    }
  }

  // ------------------------------------------------------------------
  // Comunicação externa (§13.6) — registrar, gerar, aprovar. NUNCA enviar.
  // ------------------------------------------------------------------

  async createCommunication(user: AuthenticatedUser, input: {
    houseId: string; incidentId?: string; acolhidoId?: string;
    orgao: string; destinatarioFuncional: string; canal: string;
    quando?: string; resumo: string; documentos?: unknown[];
    orientacao?: string; acompanhamento?: string;
  }) {
    if (!ORGAOS.includes(input.orgao)) throw new BadRequestException('Órgão inválido.');
    if (!CANAIS.includes(input.canal)) throw new BadRequestException('Canal inválido.');
    if ((input.resumo ?? '').trim().length < 20) {
      throw new BadRequestException('Descreva o teor da comunicação (mínimo 20 caracteres).');
    }
    if (!(input.destinatarioFuncional ?? '').trim()) {
      throw new BadRequestException(
        'Informe o destinatário funcional (o cargo ou setor), não o nome de uma pessoa.');
    }

    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `INSERT INTO external_communication (house_id, incident_id, person_id, organ,
           recipient_role, channel, occurred_at, summary, documents, guidance, followup,
           responsible_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9::jsonb,$10,$11,$12,$13) RETURNING id`,
        [input.houseId, input.incidentId ?? null, input.acolhidoId ?? null, input.orgao,
         input.destinatarioFuncional.trim(), input.canal, input.quando ?? null,
         input.resumo.trim(), JSON.stringify(input.documentos ?? []),
         input.orientacao ?? null, input.acompanhamento ?? null, user.id, user.id]);
      return r.id as string;
    }).catch((e: any) => {
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        throw new ForbiddenException('A comunicação externa é registrada pela equipe técnica ou pela coordenação.');
      }
      throw e;
    });

    await this.audit.log({ action: 'external_comm.create', actorId: user.id, houseId: input.houseId,
      entity: 'external_communication', entityId: id, detail: { orgao: input.orgao, canal: input.canal } });

    return {
      id, status: 'rascunho',
      // A frase é a regra: não há botão de enviar, em lugar nenhum.
      aviso: 'Registrada como rascunho. O sistema NÃO envia nada para fora: depois de revisada e aprovada, '
           + 'a entrega é feita por uma pessoa e registrada aqui.',
    };
  }

  async submitCommunication(user: AuthenticatedUser, id: string) {
    return this.mudarStatus(user, id, 'em_revisao', 'external_comm.submit',
      'Enviada para revisão interna.');
  }

  async approveCommunication(user: AuthenticatedUser, id: string) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('A aprovação cabe à equipe técnica, à coordenação ou ao Gestor Geral.');
    }
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE external_communication SET status = 'aprovado', approved_by = $2, approved_at = now()
         WHERE id = $1 AND status IN ('rascunho','em_revisao')`, [id, user.id]);
      return (rowCount ?? 0) > 0;
    }).catch((e: any) => {
      // Padrão protetivo (reversível): quem redige não aprova. O §13.6 trata
      // "registrar", "revisar" e "aprovar" como etapas distintas — e uma
      // comunicação ao Judiciário ou ao Conselho Tutelar aprovada pelo próprio
      // autor não passou por revisão nenhuma.
      if ((e?.message ?? '').includes('aprovador_igual_ao_autor')) {
        throw new BadRequestException(
          'Quem redigiu a comunicação não pode aprová-la. A aprovação é de outra pessoa da equipe técnica, '
          + 'da coordenação ou do Gestor Geral.');
      }
      throw e;
    });
    if (!ok) throw new BadRequestException('Só se aprova comunicação em rascunho ou em revisão.');
    await this.audit.log({ action: 'external_comm.approve', actorId: user.id,
      entity: 'external_communication', entityId: id });
    return {
      status: 'aprovado',
      aviso: 'Aprovada. O documento pode ser gerado e entregue por uma pessoa — o sistema não realiza o envio.',
    };
  }

  /** Registro da entrega feita por um humano (§13.6). */
  async registerDelivery(user: AuthenticatedUser, id: string, input: { quando?: string; nota?: string }) {
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE external_communication
            SET status = 'entregue_manualmente', delivered_by = $2,
                delivered_at = coalesce($3::timestamptz, now()), delivery_note = $4
          WHERE id = $1 AND status = 'aprovado'`,
        [id, user.id, input.quando ?? null, input.nota ?? null]);
      return (rowCount ?? 0) > 0;
    }).catch((e: any) => {
      if ((e?.message ?? '').includes('entrega_sem_aprovacao')) {
        throw new BadRequestException('A entrega só é registrada depois da aprovação.');
      }
      throw e;
    });
    if (!ok) throw new BadRequestException('A entrega só é registrada depois da aprovação.');
    await this.audit.log({ action: 'external_comm.delivered', actorId: user.id,
      entity: 'external_communication', entityId: id });
    return { status: 'entregue_manualmente', aviso: 'Entrega registrada, com responsável e horário.' };
  }

  async listCommunications(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT e.id, e.organ, e.recipient_role, e.channel, e.status, e.summary,
                e.occurred_at, e.approved_at, e.delivered_at, e.incident_id,
                app_user_display_name(e.responsible_id) AS responsavel
         FROM external_communication e WHERE e.house_id = $1
         ORDER BY e.created_at DESC LIMIT 200`, [houseId]);
      return rows.map((r) => ({
        id: r.id, orgao: r.organ, destinatarioFuncional: r.recipient_role,
        canal: r.channel, status: r.status, resumo: r.summary,
        quando: r.occurred_at, aprovadaEm: r.approved_at, entregueEm: r.delivered_at,
        ocorrenciaId: r.incident_id, responsavel: r.responsavel,
      }));
    });
  }

  // ------------------------------------------------------------------

  private async mudarStatus(user: AuthenticatedUser, id: string, novo: string, acao: string, aviso: string) {
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE external_communication SET status = $2 WHERE id = $1 AND status = 'rascunho'`,
        [id, novo]);
      return (rowCount ?? 0) > 0;
    });
    if (!ok) throw new BadRequestException('Transição não permitida a partir do estado atual.');
    await this.audit.log({ action: acao, actorId: user.id, entity: 'external_communication', entityId: id });
    return { status: novo, aviso };
  }

  private async casa(user: AuthenticatedUser, incidentId: string): Promise<string> {
    const casa = await this.db.asUser(user.id, async (c) => {
      const { rows: [i] } = await c.query(`SELECT house_id FROM incident WHERE id = $1`, [incidentId]);
      return i?.house_id;
    });
    if (!casa) throw new NotFoundException('Ocorrência não encontrada — ou fora do seu alcance.');
    return casa;
  }

  private async comando(
    user: AuthenticatedUser, sql: string, params: unknown[],
    mapa: Record<string, () => Error> = {},
  ): Promise<any> {
    try {
      return await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(`SELECT * FROM ${sql}`, params);
        return row;
      });
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      for (const [chave, fabrica] of Object.entries(mapa)) {
        if (msg.includes(chave)) throw fabrica();
      }
      if (msg.includes('fora_de_escopo')) {
        throw new ForbiddenException('Esta ocorrência pertence a outra casa.');
      }
      throw e;
    }
  }
}
