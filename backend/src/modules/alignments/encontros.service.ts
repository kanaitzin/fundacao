import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { DataDoDia } from '../../kernel/common/data-do-dia.pipe';
import {
  PERIODICIDADES, ROTULO_DA_PERIODICIDADE, QUEM_REGISTRA_ALINHAMENTO,
} from './encontros.regra';

/**
 * O ENCONTRO DE ALINHAMENTO COM QUEM TRABALHA (fase 322, decidido pelo dono em 14/11).
 *
 * A coordenação da casa registra o encontro com quem trabalha na casa dela, e a
 * Coordenação Geral com todos abaixo dela. Lê a própria pessoa, quem registrou, a
 * coordenação da casa e a Coordenação Geral. A pessoa dá ciência e pode comentar.
 *
 * Quem decide quem registra e quem lê é o banco (`app_alinha_com`,
 * `app_le_o_alinhamento`, migração alignments/1721); aqui a recusa chega em português.
 * Não há nota nem pontuação: o encontro é texto, com a intenção de alinhar a casa.
 */
@Injectable()
export class EncontrosService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  vocabulario() {
    return {
      periodicidades: PERIODICIDADES.map((code) => ({ code, label: ROTULO_DA_PERIODICIDADE[code] })),
      aviso: 'O encontro fica escrito com os pontos positivos, o que podemos melhorar e os '
        + 'combinados. A pessoa lê o registro, dá ciência e pode comentar.',
    };
  }

  private emPortugues(a: any, respostas: any[], adendos: any[]) {
    const r = respostas.find((x) => x.alignment_id === a.id);
    return {
      id: a.id,
      pessoaId: a.subject_id,
      pessoa: a.pessoa,
      casa: a.casa,
      periodicidade: a.periodicity,
      periodicidadeRotulo: ROTULO_DA_PERIODICIDADE[a.periodicity as keyof typeof ROTULO_DA_PERIODICIDADE] ?? a.periodicity,
      dia: a.met_on,
      positivos: a.positives,
      melhorar: a.to_improve,
      combinados: a.agreements,
      proximo: a.next_on,
      por: a.por,
      porId: a.written_by,
      em: a.written_at,
      ciencia: r ? { em: r.written_at, comentario: r.note } : null,
      adendos: adendos.filter((x) => x.alignment_id === a.id)
        .map((x) => ({ id: x.id, texto: x.note, por: x.por, em: x.written_at })),
    };
  }

  private async lerEncontros(c: any, onde: string, args: unknown[]) {
    const { rows } = await c.query(
      `SELECT a.id, a.subject_id, a.periodicity, a.met_on::text AS met_on, a.positives, a.to_improve,
              a.agreements, a.next_on::text AS next_on, a.written_by, a.written_at,
              app_user_display_name(a.written_by) AS por,
              app_user_display_name(a.subject_id) AS pessoa,
              app_house_label(a.house_id) AS casa
         FROM staff_alignment a WHERE ${onde}
        ORDER BY a.met_on DESC, a.written_at DESC LIMIT 200`, args);
    const ids = rows.map((r: any) => r.id);
    if (!ids.length) return [];
    const { rows: respostas } = await c.query(
      `SELECT alignment_id, note, written_at FROM staff_alignment_reply WHERE alignment_id = ANY($1::uuid[])`, [ids]);
    const { rows: adendos } = await c.query(
      `SELECT id, alignment_id, note, written_at, app_user_display_name(written_by) AS por
         FROM staff_alignment_addendum WHERE alignment_id = ANY($1::uuid[]) ORDER BY written_at`, [ids]);
    return rows.map((a: any) => this.emPortugues(a, respostas, adendos));
  }

  /** Os meus encontros: os que foram registrados comigo, para eu ler e dar ciência. */
  async comigo(user: AuthenticatedUser) {
    const encontros = await this.db.asUser(user.id, (c) =>
      this.lerEncontros(c, 'a.subject_id = app_current_user()', []));
    return { encontros, semCiencia: encontros.filter((e: any) => !e.ciencia).length };
  }

  /**
   * Com quem eu faço o encontro: as pessoas que eu alcanço, em ordem de nome, com o dia
   * do último encontro e o próximo combinado. A ordem é por nome, e nada se conta.
   */
  async equipe(user: AuthenticatedUser) {
    if (!QUEM_REGISTRA_ALINHAMENTO.includes(user.role)) return { pessoas: [], podeRegistrar: false };
    const pessoas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT s.id, s.full_name, s.role, s.house_code, app_user_profissao(s.id) AS profissao,
                (SELECT max(a.met_on)::text FROM staff_alignment a WHERE a.subject_id = s.id) AS ultimo,
                (SELECT a.next_on::text FROM staff_alignment a WHERE a.subject_id = s.id
                  ORDER BY a.met_on DESC, a.written_at DESC LIMIT 1) AS proximo
           FROM app_staff_list() s
          WHERE s.active AND app_alinha_com(s.id)
          ORDER BY s.full_name`);
      return rows;
    });
    return {
      podeRegistrar: true,
      pessoas: pessoas.map((p: any) => ({
        id: p.id, nome: p.full_name, cargo: p.role, profissao: p.profissao ?? null, casa: p.house_code,
        ultimo: p.ultimo, proximo: p.proximo,
      })),
    };
  }

  /** O histórico de uma pessoa, para quem lê os encontros dela. A leitura alheia vai à auditoria. */
  async daPessoa(user: AuthenticatedUser, pessoaId: string) {
    const r = await this.db.asUser(user.id, async (c) => {
      const encontros = await this.lerEncontros(c, 'a.subject_id = $1', [pessoaId]);
      const { rows: [p] } = await c.query(
        `SELECT app_user_display_name($1) AS nome, app_alinha_com($1) AS pode`, [pessoaId]);
      return { encontros, nome: p?.nome ?? null, pode: !!p?.pode };
    });
    if (!r.pode && !r.encontros.length && pessoaId !== user.id) {
      throw new NotFoundException('Pessoa não encontrada');
    }
    if (pessoaId !== user.id && r.encontros.length) {
      await this.audit.log({
        action: 'alinhamento.lido', actorId: user.id, institutionId: user.institutionId,
        houseId: null, entity: 'app_user', entityId: pessoaId,
        detail: { encontros: r.encontros.length },
      });
    }
    return { pessoa: r.nome, podeRegistrar: r.pode, encontros: r.encontros };
  }

  async registrar(user: AuthenticatedUser, input: {
    pessoaId?: string; periodicidade?: string; dia?: string; positivos?: string;
    melhorar?: string; combinados?: string; proximo?: string;
  }) {
    if (!QUEM_REGISTRA_ALINHAMENTO.includes(user.role)) {
      throw new ForbiddenException('O encontro de alinhamento é registrado pela coordenação da casa ou pela Coordenação Geral.');
    }
    if (typeof input?.pessoaId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.pessoaId)) {
      throw new BadRequestException('Escolha com quem foi o encontro.');
    }
    if (!PERIODICIDADES.includes(input?.periodicidade as any)) {
      throw new BadRequestException('Escolha se o encontro é mensal, trimestral, semestral ou anual.');
    }
    /* As datas passam pela mesma conferência das datas da URL (fase 148): forma e dia que existe. */
    const dia = new DataDoDia().transform(typeof input?.dia === 'string' ? input.dia : undefined);
    const proximo = new DataDoDia().transform(typeof input?.proximo === 'string' ? input.proximo : undefined);
    const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const positivos = texto(input?.positivos);
    if (positivos.length < 10) {
      throw new BadRequestException('Escreva os pontos positivos, com pelo menos 10 letras.');
    }
    for (const v of [positivos, texto(input?.melhorar), texto(input?.combinados)]) {
      if (v.length > 4000) throw new BadRequestException('Cada parte do encontro cabe em até 4.000 letras.');
    }

    let id: string;
    try {
      id = await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(
          `SELECT app_registrar_alinhamento($1, $2, $3, $4, $5, $6, $7) AS id`,
          [input.pessoaId, input.periodicidade, dia ?? null, positivos,
           texto(input?.melhorar) || null, texto(input?.combinados) || null, proximo ?? null]);
        return row.id;
      });
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('alinhamento_sem_alcance')) {
        throw new ForbiddenException('Você registra o encontro com quem trabalha na sua casa; a Coordenação Geral, com todos abaixo dela.');
      }
      if (m.includes('alinhamento_no_futuro')) throw new BadRequestException('O dia do encontro não pode ser depois de hoje.');
      if (m.includes('alinhamento_proximo_antes')) throw new BadRequestException('O próximo encontro precisa ser depois deste.');
      if (m.includes('alinhamento_sem_positivos')) throw new BadRequestException('Escreva os pontos positivos, com pelo menos 10 letras.');
      throw e;
    }

    const { rows: [a] } = await this.db.asUser(user.id, (c) => c.query(
      `SELECT house_id, periodicity, met_on::text AS met_on FROM staff_alignment WHERE id = $1`, [id]));
    await this.audit.log({
      action: 'alinhamento.registrado', actorId: user.id, institutionId: user.institutionId,
      houseId: a?.house_id ?? null, entity: 'staff_alignment', entityId: id,
      detail: { periodicidade: input.periodicidade },
    });
    await this.bus.publish('notice.requested', {
      userId: input.pessoaId,
      title: 'O registro do seu encontro de alinhamento',
      body: 'Leia os pontos positivos, o que podemos melhorar e os combinados, e dê a sua ciência. '
        + 'Se quiser, escreva um comentário.',
      entity: 'staff_alignment', entityId: id,
    }, { actorId: user.id, houseId: a?.house_id ?? undefined });
    return { ok: true, id, aviso: 'Encontro registrado. A pessoa recebe o aviso para ler e dar ciência.' };
  }

  async ciencia(user: AuthenticatedUser, id: string, input: { comentario?: string }) {
    const comentario = typeof input?.comentario === 'string' ? input.comentario.trim() : '';
    if (comentario.length > 4000) throw new BadRequestException('O comentário cabe em até 4.000 letras.');
    try {
      await this.db.asUser(user.id, (c) => c.query(
        `SELECT app_responder_alinhamento($1, $2)`, [id, comentario || null]));
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('alinhamento_inexistente')) throw new NotFoundException('Encontro não encontrado');
      if (m.includes('alinhamento_ja_respondido')) throw new ConflictException('A sua ciência já está registrada neste encontro.');
      throw e;
    }
    const { rows: [a] } = await this.db.asUser(user.id, (c) => c.query(
      `SELECT written_by, house_id FROM staff_alignment WHERE id = $1`, [id]));
    await this.audit.log({
      action: 'alinhamento.ciencia', actorId: user.id, institutionId: user.institutionId,
      houseId: a?.house_id ?? null, entity: 'staff_alignment', entityId: id,
    });
    if (a?.written_by) {
      await this.bus.publish('notice.requested', {
        userId: a.written_by,
        title: comentario ? 'Ciência e comentário no encontro de alinhamento' : 'Ciência no encontro de alinhamento',
        body: comentario
          ? 'A pessoa leu o registro do encontro e escreveu um comentário.'
          : 'A pessoa leu o registro do encontro e deu ciência.',
        entity: 'staff_alignment', entityId: id,
      }, { actorId: user.id, houseId: a.house_id ?? undefined });
    }
    return { ok: true, aviso: comentario ? 'Ciência e comentário registrados.' : 'Ciência registrada.' };
  }

  async adendo(user: AuthenticatedUser, id: string, input: { texto?: string }) {
    const texto = typeof input?.texto === 'string' ? input.texto.trim() : '';
    if (texto.length < 10) throw new BadRequestException('Escreva o adendo, com pelo menos 10 letras.');
    if (texto.length > 4000) throw new BadRequestException('O adendo cabe em até 4.000 letras.');
    try {
      await this.db.asUser(user.id, (c) => c.query(`SELECT app_adendo_do_alinhamento($1, $2)`, [id, texto]));
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('alinhamento_inexistente')) throw new NotFoundException('Encontro não encontrado');
      if (m.includes('alinhamento_adendo_curto')) throw new BadRequestException('Escreva o adendo, com pelo menos 10 letras.');
      throw e;
    }
    const { rows: [a] } = await this.db.asUser(user.id, (c) => c.query(
      `SELECT subject_id, house_id FROM staff_alignment WHERE id = $1`, [id]));
    await this.audit.log({
      action: 'alinhamento.adendo', actorId: user.id, institutionId: user.institutionId,
      houseId: a?.house_id ?? null, entity: 'staff_alignment', entityId: id,
    });
    if (a?.subject_id) {
      await this.bus.publish('notice.requested', {
        userId: a.subject_id,
        title: 'Um adendo no seu encontro de alinhamento',
        body: 'Quem registrou o encontro acrescentou um adendo. O registro de antes continua como estava.',
        entity: 'staff_alignment', entityId: id,
      }, { actorId: user.id, houseId: a.house_id ?? undefined });
    }
    return { ok: true, aviso: 'Adendo registrado. O que estava escrito continua como estava.' };
  }

  /**
   * O relógio do dia: o próximo encontro combinado chegou, e quem registrou é avisado,
   * uma vez só. Com a casa, os encontros da casa; com `null`, os de quem atende todas as
   * casas.
   */
  async avisarProximos(user: AuthenticatedUser, houseId: string | null) {
    const linhas = await this.db.asUser(user.id, async (c) => (await c.query(
      `SELECT out_id, out_autor, out_nome, out_house, out_proximo::text AS proximo
         FROM app_alinhamentos_que_chegam($1)`, [houseId])).rows);
    for (const r of linhas) {
      await this.bus.publish('notice.requested', {
        userId: r.out_autor,
        title: `Chegou o dia do próximo encontro de alinhamento com ${r.out_nome}`,
        body: 'O dia que você combinou no último encontro chegou. Registre o encontro na tela '
          + 'Encontros de alinhamento quando ele acontecer.',
        entity: 'staff_alignment', entityId: r.out_id,
      }, { actorId: user.id, houseId: r.out_house ?? undefined });
    }
    return { ok: true, avisados: linhas.length };
  }
}
