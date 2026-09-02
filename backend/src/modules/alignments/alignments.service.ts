import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { cargoNoDocumento } from '../../kernel/documentos/folha';
import { folhaDosCombinados } from './combinados-folha';

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

@Injectable()
export class AlignmentsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
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
    return {
      id, ok: true,
      aviso: 'Reunião registrada. Os combinados já aparecem para todo mundo da casa — '
        + 'inclusive para quem não estava.',
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

}
