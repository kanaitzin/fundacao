import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { cargoNoDocumento } from '../../kernel/documentos/folha';
import { folhaDosCombinados } from './combinados-folha';
import { folhaDoEstatuto } from './estatuto-folha';

/**
 * REUNIÕES DE EQUIPE E COMBINADOS (§9.4).
 *
 * A pergunta que este módulo responde é uma só, e ela é feita toda semana na
 * casa: *"o que foi que ficou combinado?"*. Hoje a resposta depende de quem
 * estava na reunião — e quem mais precisa dela, a educadora da noite, quase
 * nunca estava.
 *
 * Escrever é de quem conduz a reunião: equipe técnica e coordenação. LER é de
 * todo mundo com alcance na casa, inclusive o educador e a cozinha. Um
 * combinado que o turno não pode ler não é combinado: é recado que ninguém
 * recebeu.
 */

export const TIPOS_DE_REUNIAO = [
  { code: 'equipe', label: 'Reunião de equipe' },
  { code: 'tecnica', label: 'Reunião técnica' },
  { code: 'extraordinaria', label: 'Reunião extraordinária' },
  { code: 'capacitacao', label: 'Capacitação' },
  { code: 'supervisao', label: 'Supervisão' },
] as const;

const SITUACOES: Record<string, string> = {
  vigente: 'Vigente', cumprido: 'Cumprido',
  revogado: 'Revogado', substituido: 'Substituído por outro',
};

const ESCREVE = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

/**
 * Quem RESPONDE uma proposta de pauta (fase 94, migração 1140).
 *
 * A técnica, a coordenação — e a liderança de turno, que é o que o Marcelo
 * pediu. O líder conduz o turno, e é a ele que o educador da noite chega.
 */
const RESPONDE_PAUTA = [...ESCREVE, 'lider_diurno', 'lider_noturno_geral'];

/** Quem escreve o estatuto da casa (fase 95). A instituição é só do gestor. */
const ESCREVE_ESTATUTO = ['coordenador', 'gestor_geral'];

const PUBLICO: Record<string, string> = {
  todos: 'Todos', equipe: 'Equipe', acolhidos: 'Crianças e adolescentes',
};

/** O que cada desfecho de uma proposta significa para quem propôs. */
const DESFECHO: Record<string, { rotulo: string; aviso: string }> = {
  aceita: { rotulo: 'entra na pauta',
            aviso: 'Aceita. Ela entra na pauta da próxima reunião, e quem propôs vê isso.' },
  recusada: { rotulo: 'não entra',
              aviso: 'Recusada, com a sua resposta. Quem propôs vai ler o motivo.' },
  adiada: { rotulo: 'fica para depois',
            aviso: 'Adiada, com a sua resposta. Quem propôs vai ler por que ficou para depois.' },
};

@Injectable()
export class AlignmentsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  vocabulario() {
    return {
      tipos: TIPOS_DE_REUNIAO,
      aviso: 'A reunião e os combinados são escritos pela equipe técnica e pela coordenação, '
        + 'e lidos por todo mundo da casa — inclusive por quem não estava na reunião, que é '
        + 'justamente quem mais precisa deles.',
    };
  }

  /**
   * O que a casa combinou.
   *
   * A resposta traz o ÚLTIMO combinado vigente separado do resto, porque é a
   * pergunta que se faz com mais frequência e a que menos merece rolagem: quem
   * chega para o turno quer saber o que mudou desde a última vez.
   */
  async list(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: reunioes } = await c.query(
        `SELECT m.id, m.happened_on::text AS happened_on, m.kind, m.title, m.attendees,
                m.agenda, m.notes, m.recorded_at,
                app_user_display_name(m.recorded_by) AS por
           FROM team_meeting m WHERE m.house_id = $1
          ORDER BY m.happened_on DESC, m.recorded_at DESC LIMIT 100`, [houseId]);

      const { rows: combinados } = await c.query(
        `SELECT a.id, a.meeting_id, a.body, a.responsible, a.due_on::text AS due_on,
                a.status, a.status_reason, a.status_at, a.created_at, a.replaces_id,
                app_user_display_name(a.created_by) AS por,
                app_user_display_name(a.status_by) AS mudado_por
           FROM team_agreement a WHERE a.house_id = $1
          ORDER BY (a.status = 'vigente') DESC, a.created_at DESC LIMIT 200`, [houseId]);

      const { rows: mudancas } = await c.query(
        // rls-join-ok: agchange_select é app_house_in_scope, a MESMA política
        // de team_agreement — quem lê o combinado lê a mudança dele.
        `SELECT h.agreement_id, h.before_status, h.after_status, h.reason, h.at,
                app_user_display_name(h.changed_by) AS quem
           FROM agreement_change h
           JOIN team_agreement a ON a.id = h.agreement_id
          WHERE a.house_id = $1 ORDER BY h.at DESC LIMIT 200`, [houseId]);

      const mapa = (id: string) => mudancas.filter((h: any) => h.agreement_id === id)
        .map((h: any) => ({
          de: SITUACOES[h.before_status] ?? h.before_status,
          para: SITUACOES[h.after_status] ?? h.after_status,
          motivo: h.reason, quem: h.quem, quando: h.at,
        }));

      const emPortugues = (a: any) => ({
        id: a.id, reuniaoId: a.meeting_id, texto: a.body,
        responsavel: a.responsible, prazo: a.due_on,
        situacao: a.status, situacaoRotulo: SITUACOES[a.status] ?? a.status,
        motivoDaSituacao: a.status_reason, mudadoPor: a.mudado_por, mudadoEm: a.status_at,
        por: a.por, criadoEm: a.created_at, substitui: a.replaces_id,
        historico: mapa(a.id),
      });

      const todos = combinados.map(emPortugues);
      const vigentes = todos.filter((a) => a.situacao === 'vigente');

      return {
        reunioes: reunioes.map((m: any) => ({
          id: m.id, data: m.happened_on, tipo: m.kind,
          tipoRotulo: TIPOS_DE_REUNIAO.find((t) => t.code === m.kind)?.label ?? m.kind,
          titulo: m.title, participantes: m.attendees, pauta: m.agenda, notas: m.notes,
          por: m.por, registradaEm: m.recorded_at,
          combinados: todos.filter((a) => a.reuniaoId === m.id),
        })),
        combinados: todos,
        // A pergunta mais frequente da casa, respondida sem rolagem.
        ultimo: vigentes[0] ?? null,
        vigentes: vigentes.length,
        podeEscrever: ESCREVE.includes(user.role),
        aviso: ESCREVE.includes(user.role)
          ? 'O texto de um combinado não se reescreve. Mudou de ideia? Registre outro, '
            + 'dizendo que substitui o anterior — é assim que a equipe muda de acordo sem '
            + 'apagar o que todo mundo cumpriu até ontem.'
          : 'Aqui está o que a equipe combinou. Quem registra é a equipe técnica e a '
            + 'coordenação; ler é de todo mundo da casa, e é para isso que existe.',
      };
    });
  }

  async registrarReuniao(user: AuthenticatedUser, input: {
    houseId: string; data: string; tipo?: string; titulo: string;
    participantes?: string; pauta?: string; notas?: string;
    combinados?: { texto: string; responsavel?: string; prazo?: string }[];
  }) {
    if (!ESCREVE.includes(user.role)) {
      throw new ForbiddenException(
        'Registrar reunião é da equipe técnica e da coordenação. Ler é de todo mundo da casa.');
    }
    if (!input.data) throw new BadRequestException('Informe o dia da reunião.');
    if ((input.titulo ?? '').trim().length < 4) {
      throw new BadRequestException('Dê um assunto à reunião — é como ela vai ser achada depois.');
    }
    const tipo = input.tipo ?? 'equipe';
    if (!TIPOS_DE_REUNIAO.some((t) => t.code === tipo)) {
      throw new BadRequestException('Tipo de reunião desconhecido.');
    }
    for (const cmb of input.combinados ?? []) {
      if ((cmb.texto ?? '').trim().length < 10) {
        throw new BadRequestException(
          'Cada combinado precisa estar escrito por inteiro. Uma linha de três palavras não '
          + 'diz a quem não estava na reunião o que foi que ficou acertado.');
      }
    }

    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [m] } = await c.query(
        `INSERT INTO team_meeting (house_id, happened_on, kind, title, attendees, agenda,
                                   notes, recorded_by)
         VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [input.houseId, input.data, tipo, input.titulo.trim(),
         input.participantes ?? null, input.pauta ?? null, input.notas ?? null, user.id]);
      for (const cmb of input.combinados ?? []) {
        await c.query(
          `INSERT INTO team_agreement (meeting_id, house_id, body, responsible, due_on, created_by)
           VALUES ($1,$2,$3,$4,$5::date,$6)`,
          [m.id, input.houseId, cmb.texto.trim(), cmb.responsavel ?? null,
           cmb.prazo ?? null, user.id]);
      }
      return m.id as string;
    }).catch((e: any) => {
      if (String(e?.message ?? '').includes('row-level security')) {
        throw new ForbiddenException('Sem permissão para registrar reunião nesta casa.');
      }
      throw e;
    });

    await this.audit.log({
      action: 'alignment.meeting', actorId: user.id, houseId: input.houseId,
      entity: 'team_meeting', entityId: id,
      detail: { tipo, combinados: (input.combinados ?? []).length },
    });

    /*
     * O QUE FOI DECIDIDO É DISPARADO PARA QUEM NÃO ESTAVA (fase 94).
     *
     * Pedido do Marcelo em 09/09: "nem toda a equipe participa — a maioria das
     * reuniões é diurna e o noturno não vai. O que foi decidido é disparado
     * para toda a casa". Até aqui o combinado ficava VISÍVEL para todos, que
     * não é a mesma coisa: quem não abre a tela não fica sabendo, e o educador
     * da noite descobre às 23h que havia um combinado — ou não descobre.
     *
     * Avisa quem NÃO estava: o plantão da casa (nível `equipe`) e o Líder
     * Noturno Geral, que é transversal e é o caso que ele deu. A técnica e a
     * coordenação não recebem porque conduziram a reunião — avisar quem acabou
     * de decidir é ruído, e ruído ensina a ignorar aviso.
     *
     * Reunião SEM combinado não dispara nada: não houve o que avisar.
     */
    const quantos = (input.combinados ?? []).length;
    if (quantos > 0) {
      const primeiro = (input.combinados ?? [])[0].texto.trim();
      const corpo = quantos === 1
        ? primeiro
        : `${primeiro} — e mais ${quantos - 1} ${quantos === 2 ? 'combinado' : 'combinados'}.`;
      for (const level of ['equipe', 'lider_noturno']) {
        await this.bus.publish('escalation.requested', {
          level,
          entity: 'team_meeting', entityId: id,
          reason: 'combinados da reunião',
          title: quantos === 1 ? 'Um combinado novo na casa' : `${quantos} combinados novos na casa`,
          body: corpo,
          /* Mesma reunião, mesmo aviso: reprocessar a fila não inunda ninguém. */
          groupKey: `reuniao:${id}`,
        }, { actorId: user.id, houseId: input.houseId });
      }
    }

    return {
      id, ok: true,
      aviso: quantos > 0
        ? 'Reunião registrada. Quem não estava — o plantão e o Líder Noturno — foi avisado dos '
          + 'combinados, e eles já aparecem para toda a casa.'
        : 'Reunião registrada. Sem combinados, ninguém foi avisado: não houve o que avisar.',
    };
  }

  /** Um combinado avulso: nem todo acerto nasce numa reunião. */
  async registrarCombinado(user: AuthenticatedUser, input: {
    houseId: string; texto: string; responsavel?: string; prazo?: string;
    reuniaoId?: string; substituiId?: string;
  }) {
    if (!ESCREVE.includes(user.role)) {
      throw new ForbiddenException(
        'Registrar combinado é da equipe técnica e da coordenação.');
    }
    if ((input.texto ?? '').trim().length < 10) {
      throw new BadRequestException(
        'Escreva o combinado por inteiro. Quem lê não estava na conversa.');
    }

    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [a] } = await c.query(
        `INSERT INTO team_agreement (meeting_id, house_id, body, responsible, due_on, created_by)
         VALUES ($1,$2,$3,$4,$5::date,$6) RETURNING id`,
        [input.reuniaoId ?? null, input.houseId, input.texto.trim(),
         input.responsavel ?? null, input.prazo ?? null, user.id]);
      return a.id as string;
    }).catch((e: any) => {
      if (String(e?.message ?? '').includes('row-level security')) {
        throw new ForbiddenException('Sem permissão para registrar combinado nesta casa.');
      }
      throw e;
    });

    // Substituir é um ato do combinado ANTIGO: ele é encerrado com motivo, e o
    // novo passa a apontar para ele. Assim quem lê o antigo sabe para onde ir.
    if (input.substituiId) {
      await this.mudarSituacao(user, input.substituiId, 'substituido',
        `Substituído por combinado registrado em ${new Date().toLocaleDateString('pt-BR')}.`,
        id);
    }

    await this.audit.log({
      action: 'alignment.agreement', actorId: user.id, houseId: input.houseId,
      entity: 'team_agreement', entityId: id,
      detail: { substitui: input.substituiId ?? null },
    });
    return { id, ok: true, aviso: 'Combinado registrado e visível para a casa.' };
  }

  /**
   * Cumprir, revogar ou substituir. O texto continua igual; o que muda é a
   * situação, e ela nunca muda em silêncio.
   */
  async mudarSituacao(
    user: AuthenticatedUser, agreementId: string, situacao: string,
    motivo: string, substitutoId?: string,
  ) {
    if (!motivo?.trim() || motivo.trim().length < 5) {
      throw new BadRequestException(
        'Escreva por que este combinado mudou. Um combinado que some sem explicação deixa a '
        + 'equipe cumprindo o que já foi desfeito.');
    }
    try {
      return await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT * FROM app_mudar_combinado($1,$2,$3,$4)`,
          [agreementId, situacao, motivo.trim(), substitutoId ?? null]);
        await this.audit.log({
          action: 'alignment.agreement_status', actorId: user.id,
          entity: 'team_agreement', entityId: agreementId,
          detail: { situacao },
        }, c);
        return { ok: true, situacao: r.status,
                 rotulo: SITUACOES[r.status] ?? r.status };
      });
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('combinado_nao_encontrado')) {
        throw new NotFoundException('Combinado não encontrado.');
      }
      if (m.includes('casa_fora_de_escopo')) {
        throw new ForbiddenException('Este combinado é de outra casa.');
      }
      if (m.includes('sem_permissao_para_mudar_combinado')) {
        throw new ForbiddenException(
          'Mudar um combinado é da equipe técnica e da coordenação.');
      }
      if (m.includes('combinado_ja_encerrado')) {
        throw new BadRequestException(
          'Este combinado já não está vigente. Registre um novo em vez de mexer neste.');
      }
      if (m.includes('situacao_invalida')) {
        throw new BadRequestException('Situação inválida.');
      }
      if (m.includes('motivo_obrigatorio')) {
        throw new BadRequestException('Escreva o motivo da mudança.');
      }
      throw e;
    }
  }

  // ------------------------------------------------------------------
  // Os combinados como documento
  // ------------------------------------------------------------------

  /** A folha dos combinados. Ver não é exportar. */
  async folhaDosCombinados(user: AuthenticatedUser, houseId: string) {
    const d: any = await this.list(user, houseId);
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
    /* Casa sem rótulo é casa fora do alcance — e o RLS teria devolvido lista
     * vazia, que se lê como "esta equipe não combinou nada". */
    if (!casa) throw new NotFoundException('Unidade não encontrada — ou fora do seu alcance.');
    return folhaDosCombinados(
      casa,
      (d.combinados ?? []).map((a: any) => ({
        texto: a.texto, responsavel: a.responsavel, prazo: a.prazo,
        por: a.por, criadoEm: a.criadoEm, situacao: a.situacao,
      })),
      (d.reunioes ?? []).map((m: any) => ({ data: m.data, titulo: m.titulo, por: m.por })),
      { nome: user.fullName, cargo: cargoNoDocumento(user.role) },
    );
  }

  async exportarCombinados(user: AuthenticatedUser, houseId: string, finalidade: string) {
    const folha = await this.folhaDosCombinados(user, houseId);
    return this.documentos.exportar(user, folha, {
      entidade: 'alignment_agreements', houseId, finalidade,
    });
  }


  // ============================================================
  // A PAUTA QUE O EDUCADOR PROPÕE (fase 94, migração 1140)
  // ============================================================

  /**
   * As propostas da casa — as abertas primeiro, e depois as respondidas.
   *
   * Leitura de toda a casa, de propósito: quem propôs precisa ler a resposta,
   * e quem não foi à reunião precisa ler o que foi proposto e respondido.
   * Resposta que só a coordenação enxerga é a mesma coisa que resposta nenhuma.
   */
  async pautas(user: AuthenticatedUser, houseId: string) {
    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows: [casa] } = await c.query(
        `SELECT app_house_in_scope($1) AS alcance`, [houseId]);
      if (!casa?.alcance) return null;
      const { rows } = await c.query(
        `SELECT id, body, context, status, answer, proposed_at, answered_at,
                proposed_by,
                app_user_display_name(proposed_by) AS por,
                app_user_display_name(answered_by) AS respondida_por
           FROM meeting_agenda_item
          WHERE house_id = $1
          ORDER BY (status = 'proposta') DESC, proposed_at DESC`, [houseId]);
      return rows;
    });
    if (!linhas) throw new NotFoundException('Casa não encontrada — ou fora do seu alcance.');

    return {
      podeResponder: RESPONDE_PAUTA.includes(user.role),
      abertas: linhas.filter((r: any) => r.status === 'proposta').length,
      itens: linhas.map((r: any) => ({
        id: r.id, texto: r.body, contexto: r.context,
        situacao: r.status,
        situacaoRotulo: r.status === 'proposta' ? 'esperando resposta' : DESFECHO[r.status].rotulo,
        resposta: r.answer, respondidaPor: r.respondida_por, respondidaEm: r.answered_at,
        por: r.por, em: r.proposed_at,
        /* Para a tela poder dizer "sua proposta" sem devolver o id de ninguém. */
        minha: r.proposed_by === user.id,
      })),
    };
  }

  /** Propor é de quem trabalha na casa — inclusive o educador e a enfermagem. */
  async proporPauta(user: AuthenticatedUser, input: {
    houseId?: string; texto?: string; contexto?: string;
  }) {
    const texto = String(input.texto ?? '').trim();
    if (texto.length < 10) {
      throw new BadRequestException(
        'Escreva o assunto da pauta — uma frase que quem não estava no seu turno entenda.');
    }
    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [casa] } = await c.query(
        `SELECT app_house_in_scope($1) AS alcance`, [input.houseId]);
      if (!casa?.alcance) return null;
      const { rows: [r] } = await c.query(
        `INSERT INTO meeting_agenda_item (house_id, body, context, proposed_by)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [input.houseId, texto, String(input.contexto ?? '').trim() || null, user.id]);
      return r.id as string;
    });
    if (!id) throw new NotFoundException('Casa não encontrada — ou fora do seu alcance.');

    await this.audit.log({
      action: 'pauta.proposta', actorId: user.id, institutionId: user.institutionId,
      houseId: input.houseId, entity: 'meeting_agenda_item', entityId: id,
    });
    return { id, ok: true,
      aviso: 'Proposta registrada. A equipe que conduz a reunião vai responder — e, se não '
        + 'entrar na pauta, você lê aqui o motivo.' };
  }

  /**
   * Responder: aceitar, recusar ou adiar — e recusar e adiar EXIGEM resposta.
   *
   * A frase do pedido é esta: "uma pauta recusada sem resposta é pior do que
   * não poder propor". O serviço recusa, e o banco recusa de novo
   * (`ck_pauta_recusa_responde`), porque é a garantia, não a mensagem.
   *
   * Quem propôs é AVISADO — inclusive, e principalmente, quando a resposta é
   * não. O aviso é o que fecha o ciclo: sem ele a resposta fica numa tela que
   * o educador da noite talvez nunca abra.
   */
  async responderPauta(user: AuthenticatedUser, id: string, input: {
    situacao?: string; resposta?: string;
  }) {
    if (!RESPONDE_PAUTA.includes(user.role)) {
      throw new ForbiddenException(
        'Responder a pauta é de quem conduz a reunião — equipe técnica, liderança de turno '
        + 'ou coordenação.');
    }
    const situacao = String(input.situacao ?? '');
    if (!DESFECHO[situacao]) {
      throw new BadRequestException('Diga se a pauta entra, não entra, ou fica para depois.');
    }
    const resposta = String(input.resposta ?? '').trim();
    if (situacao !== 'aceita' && resposta.length < 15) {
      throw new BadRequestException(
        situacao === 'recusada'
          ? 'Escreva por que esta pauta não entra. Quem propôs vai ler — e uma pauta recusada '
            + 'sem resposta é pior do que não poder propor.'
          : 'Escreva por que fica para depois, e o que quem propôs pode esperar. '
            + '"Fica para a próxima" sem uma palavra é recusa com outro nome.');
    }

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [x] } = await c.query(
        `SELECT * FROM app_responder_pauta($1,$2,$3)`, [id, situacao, resposta]);
      return x;
    }).catch((e: any) => {
      const frase: Record<string, string> = {
        pauta_inexistente: 'Proposta não encontrada — ou fora do seu alcance.',
        pauta_ja_respondida: 'Outra pessoa já respondeu esta proposta enquanto você escrevia.',
      };
      const chave = Object.keys(frase).find((k) => String(e?.message ?? '').includes(k));
      if (chave === 'pauta_inexistente') throw new NotFoundException(frase[chave]);
      if (chave) throw new ConflictException(frase[chave]);
      throw e;
    });

    await this.audit.log({
      action: `pauta.${situacao}`, actorId: user.id, institutionId: user.institutionId,
      houseId: r.out_house, entity: 'meeting_agenda_item', entityId: id,
      purpose: situacao === 'aceita' ? undefined : resposta,
    });

    /* Quem propôs é avisado — principalmente quando a resposta é não. */
    if (r.out_autor !== user.id) {
      await this.bus.publish('notice.requested', {
        userId: r.out_autor,
        title: situacao === 'aceita'
          ? 'Sua pauta entra na próxima reunião'
          : `Sua pauta: ${DESFECHO[situacao].rotulo}`,
        body: resposta || 'Ela entra na pauta da próxima reunião.',
        entity: 'meeting_agenda_item', entityId: id,
      }, { actorId: user.id, houseId: r.out_house });
    }
    return { ok: true, situacao, aviso: DESFECHO[situacao].aviso };
  }


  // ============================================================
  // O ESTATUTO — as regras de convivência (fase 95, migração 1150)
  // ============================================================

  /**
   * As regras que valem nesta casa: as dela e as da instituição, juntas.
   *
   * Juntas de propósito. Quem lê quer saber o que vale aqui — se a regra veio
   * da Fundação ou da coordenação é informação de origem, não duas listas para
   * procurar. A origem aparece em cada uma.
   */
  async estatuto(user: AuthenticatedUser, houseId: string) {
    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows: [casa] } = await c.query(
        `SELECT app_house_in_scope($1) AS alcance, app_house_label($1) AS rotulo`, [houseId]);
      if (!casa?.alcance) return null;
      /* rls-join-ok: `house_statute` responde a `estatuto_select` — regra da
         casa por alcance, regra da instituição pela instituição de quem lê. */
      const { rows } = await c.query(
        `SELECT s.id, s.body, s.audience, s.since, s.status, s.status_reason,
                s.house_id IS NULL AS da_instituicao, s.replaces_id,
                s.since::text AS desde_texto,
                app_user_display_name(s.created_by) AS por, s.created_at,
                app_user_display_name(s.status_by) AS mudada_por, s.status_at
           FROM house_statute s
          WHERE s.house_id = $1 OR s.house_id IS NULL
          ORDER BY (s.status = 'vigente') DESC, s.house_id IS NULL, s.since DESC,
                   s.created_at DESC`, [houseId]);
      return { rotulo: casa.rotulo as string, rows };
    });
    if (!linhas) throw new NotFoundException('Casa não encontrada — ou fora do seu alcance.');

    const hoje = new Date().toISOString().slice(0, 10);
    return {
      casa: linhas.rotulo,
      podeEscrever: ESCREVE_ESTATUTO.includes(user.role),
      podeEscreverDaInstituicao: user.role === 'gestor_geral',
      publicos: Object.entries(PUBLICO).map(([code, label]) => ({ code, label })),
      regras: linhas.rows.map((r: any) => ({
        id: r.id, texto: r.body,
        publico: r.audience, publicoRotulo: PUBLICO[r.audience],
        /* `since` como TEXTO: vindo como Date, `String(...)` dava
           "Fri Sep 12 2026…" e a comparação com hoje virava lixo — uma regra
           escrita hoje aparecia como "ainda não vale" (fase 95). */
        desde: r.desde_texto, daInstituicao: r.da_instituicao,
        origem: r.da_instituicao ? 'Regra da instituição' : 'Regra desta casa',
        /* Regra com início no futuro já aparece — e diz que ainda não vale. */
        aindaNaoVale: r.status === 'vigente' && r.desde_texto > hoje,
        situacao: r.status, motivoDaSituacao: r.status_reason,
        mudadaPor: r.mudada_por, mudadaEm: r.status_at,
        substitui: r.replaces_id,
        por: r.por, em: r.created_at,
      })),
    };
  }

  /**
   * Escrever uma regra. `substituiId` encerra a anterior na mesma transação:
   * mudar uma regra é escrever a nova e aposentar a velha, nunca reescrever o
   * texto — quem foi advertido em março tem direito a ler a regra de março.
   */
  async escreverEstatuto(user: AuthenticatedUser, input: {
    houseId?: string; texto?: string; publico?: string; desde?: string;
    daInstituicao?: boolean; substituiId?: string;
  }) {
    if (!ESCREVE_ESTATUTO.includes(user.role)) {
      throw new ForbiddenException(
        'Escrever o estatuto é da coordenação da casa. Ler é de todo mundo que trabalha nela.');
    }
    if (input.daInstituicao && user.role !== 'gestor_geral') {
      throw new ForbiddenException(
        'Regra que vale para as oito casas é da gestão geral. Nesta tela você escreve a regra '
        + 'desta casa.');
    }
    const texto = String(input.texto ?? '').trim();
    if (texto.length < 15) {
      throw new BadRequestException(
        'Escreva a regra por inteiro — ela vai ser lida por quem chegar depois de você, '
        + 'sem ninguém do lado para explicar.');
    }
    const publico = String(input.publico ?? 'todos');
    if (!PUBLICO[publico]) {
      throw new BadRequestException('Diga para quem é esta regra: todos, equipe, ou crianças e adolescentes.');
    }
    const desde = String(input.desde ?? '').trim() || null;
    if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
      throw new BadRequestException('A data a partir da qual a regra vale deve ser um dia do calendário.');
    }

    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [casa] } = await c.query(
        `SELECT app_house_in_scope($1) AS alcance`, [input.houseId]);
      if (!casa?.alcance) return null;
      const { rows: [novo] } = await c.query(
        `INSERT INTO house_statute (house_id, institution_id, body, audience, since,
                                    replaces_id, created_by)
         VALUES ($1, app_minha_instituicao(), $2, $3, coalesce($4::date, current_date), $5, $6)
         RETURNING id`,
        [input.daInstituicao ? null : input.houseId, texto, publico, desde,
         input.substituiId ?? null, user.id]);
      if (input.substituiId) {
        await c.query(`SELECT * FROM app_mudar_estatuto($1,'substituida',NULL,$2)`,
          [input.substituiId, novo.id]);
      }
      return novo.id as string;
    }).catch((e: any) => {
      if (String(e?.message ?? '').includes('estatuto_ja_encerrado')) {
        throw new ConflictException(
          'A regra que você ia substituir já tinha sido encerrada por outra pessoa. '
          + 'Abra o estatuto de novo antes de escrever.');
      }
      throw e;
    });
    if (!id) throw new NotFoundException('Casa não encontrada — ou fora do seu alcance.');

    await this.audit.log({
      action: 'estatuto.escrito', actorId: user.id, institutionId: user.institutionId,
      houseId: input.houseId, entity: 'house_statute', entityId: id,
      detail: { publico, daInstituicao: !!input.daInstituicao, substitui: input.substituiId ?? null },
    });
    return {
      id, ok: true,
      aviso: input.substituiId
        ? 'Regra nova no estatuto. A anterior ficou marcada como substituída e continua legível — '
          + 'quem precisar saber o que valia antes consegue ler.'
        : 'Regra escrita no estatuto. Ela vale para quem chegar depois, e está na folha que '
          + 'pode ir para a parede.',
    };
  }

  /** Revogar: exige motivo, como encerrar combinado. */
  async revogarEstatuto(user: AuthenticatedUser, id: string, input: { motivo?: string }) {
    if (!ESCREVE_ESTATUTO.includes(user.role)) {
      throw new ForbiddenException('Revogar regra do estatuto é da coordenação da casa.');
    }
    const motivo = String(input.motivo ?? '').trim();
    if (motivo.length < 15) {
      throw new BadRequestException(
        'Escreva por que esta regra deixou de valer. Sem isso, quem ler o estatuto daqui a seis '
        + 'meses não sabe se a regra caiu ou se alguém apagou por engano.');
    }
    await this.db.asUser(user.id, async (c) =>
      c.query(`SELECT * FROM app_mudar_estatuto($1,'revogada',$2,NULL)`, [id, motivo]))
      .catch((e: any) => {
        const m = String(e?.message ?? '');
        if (m.includes('estatuto_inexistente')) {
          throw new NotFoundException('Regra não encontrada — ou fora do seu alcance.');
        }
        if (m.includes('estatuto_ja_encerrado')) {
          throw new ConflictException('Esta regra já tinha sido encerrada por outra pessoa.');
        }
        throw e;
      });

    await this.audit.log({
      action: 'estatuto.revogado', actorId: user.id, institutionId: user.institutionId,
      entity: 'house_statute', entityId: id, purpose: motivo,
    });
    return { ok: true, aviso: 'Regra revogada. Ela continua legível no estatuto, com o motivo.' };
  }

  /** A folha do estatuto — ver não registra nada. */
  async folhaDoEstatuto(user: AuthenticatedUser, houseId: string, publico = 'todos') {
    if (!PUBLICO[publico]) {
      throw new BadRequestException('Público inválido para a folha do estatuto.');
    }
    const e = await this.estatuto(user, houseId);
    return folhaDoEstatuto(e.casa, e.regras, publico,
      { nome: user.fullName, cargo: cargoNoDocumento(user.role) });
  }

  /** Exportar em Word: exige finalidade e registra a saída. */
  async exportarEstatuto(user: AuthenticatedUser, input: {
    houseId?: string; publico?: string; finalidade?: string;
  }) {
    const folha = await this.folhaDoEstatuto(user, String(input.houseId ?? ''),
      String(input.publico ?? 'todos'));
    return this.documentos.exportar(user, folha, {
      entidade: 'estatuto', houseId: input.houseId ?? null,
      finalidade: input.finalidade ?? '',
    });
  }

}
