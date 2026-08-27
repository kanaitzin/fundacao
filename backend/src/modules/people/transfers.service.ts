import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser, EscalationRequest } from '../../kernel/contracts';

/**
 * Transferência entre casas (§15.6).
 *
 * A ideia de fundo: **nenhuma coordenação entra na casa da outra.** A origem
 * pede, o destino decide, e as duas conversam sobre o pedido — dentro do
 * sistema, porque WhatsApp está proibido (§3.3). A casa atual só muda no
 * aceite, e o único ato que atravessa a fronteira entre as casas é um comando
 * de sistema que valida a autorização por dentro.
 *
 * Duas caixas:
 *   * **Recebidas** — o que outras casas pediram a esta;
 *   * **Da casa** — o que esta casa pediu a outras, com a resposta que veio.
 *
 * Recusar exige motivo escrito, e o motivo fica registrado nas DUAS casas.
 */
const PODE_TRANSFERIR = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

const ROTULO_STATUS: Record<string, string> = {
  solicitada: 'Aguardando decisão do destino',
  aceita: 'Aceita — acolhido transferido',
  devolvida: 'Recusada com justificativa',
  cancelada: 'Cancelada pela origem',
};

@Injectable()
export class TransfersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  // ------------------------------------------------------------------
  // Solicitar
  // ------------------------------------------------------------------

  async request(user: AuthenticatedUser, input: { personId: string; toHouseId: string; reason: string }) {
    if (!PODE_TRANSFERIR.includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação iniciam transferência.');
    }
    if ((input.reason ?? '').trim().length < 10) {
      throw new BadRequestException(
        'Informe o motivo da transferência. É ele que a outra coordenação vai ler para decidir.');
    }

    const criada = await this.db.asUser(user.id, async (c) => {
      const { rows: [stay] } = await c.query(
        `SELECT s.id, s.house_id, s.episode_id FROM house_stay s
         WHERE s.person_id = $1 AND s.status = 'ativa'`, [input.personId]);
      if (!stay) throw new NotFoundException('Acolhido não encontrado entre os ativos da sua casa.');
      if (stay.house_id === input.toHouseId) throw new BadRequestException('Destino igual à casa atual.');

      const { rows: [pend] } = await c.query(
        `SELECT id FROM transfer_request WHERE person_id = $1 AND status = 'solicitada'`, [input.personId]);
      if (pend) throw new ConflictException('Já existe uma transferência pendente para este acolhido.');

      const { rows: [t] } = await c.query(
        `INSERT INTO transfer_request (person_id, episode_id, from_house_id, to_house_id, reason, requested_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, requested_at`,
        [input.personId, stay.episode_id, stay.house_id, input.toHouseId, input.reason.trim(), user.id]);
      return { id: t.id as string, requestedAt: t.requested_at, fromHouse: stay.house_id as string };
    });

    await this.audit.log({
      action: 'transfer.request', actorId: user.id, houseId: criada.fromHouse,
      entity: 'transfer_request', entityId: criada.id,
      detail: { personId: input.personId, destino: input.toHouseId },
    });

    // A coordenação do destino é avisada na hora — a solicitação não fica
    // esperando alguém lembrar de abrir a tela.
    await this.avisar(user, input.toHouseId, {
      entity: 'transfer_request', entityId: criada.id, reason: 'transferencia_recebida',
      title: 'Nova solicitação de transferência',
      body: 'Uma casa solicitou transferência de um acolhido para esta unidade. Abra Transferências › Recebidas para decidir.',
      priority: 'alta',
    });

    return {
      id: criada.id, status: 'solicitada', solicitadaEm: criada.requestedAt,
      aviso: 'Enquanto pendente, a responsabilidade continua com a casa de origem. '
           + 'A coordenação do destino foi avisada e pode aceitar, recusar com motivo ou conversar aqui mesmo.',
    };
  }

  // ------------------------------------------------------------------
  // As duas caixas
  // ------------------------------------------------------------------

  /**
   * Recebidas: o que outras casas pediram a esta.
   *
   * Mostra nome completo, idade, unidade de origem, motivo e quem pediu — o
   * necessário para decidir com responsabilidade. **Não** abre o perfil: saúde,
   * documentos, medicamentos, benefícios, narrativas e histórico só depois do
   * aceite (§15.6).
   */
  async inbox(user: AuthenticatedUser, houseId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_transfer_inbox($1)`, [houseId]);
      return rows;
    });
    return {
      aviso: 'Você vê quem é, de onde vem e por quê. O perfil completo — saúde, documentos, '
           + 'benefícios e histórico — só abre depois do aceite.',
      solicitacoes: rows.map((r) => ({
        id: r.id,
        nomeCompleto: r.nome_completo,
        nomeSocial: r.nome_social,
        idade: r.idade,
        origem: { codigo: r.origem_codigo, nome: r.origem_nome },
        motivo: r.motivo,
        solicitadaPor: r.solicitante,
        solicitadaEm: r.solicitada_em,
        mensagens: r.mensagens,
      })),
    };
  }

  /** Da casa: o que esta casa pediu, com a resposta que veio de volta. */
  async outbox(user: AuthenticatedUser, houseId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_transfer_outbox($1)`, [houseId]);
      return rows;
    });
    return {
      solicitacoes: rows.map((r) => ({
        id: r.id,
        nomeCompleto: r.nome_completo,
        nomeSocial: r.nome_social,
        idade: r.idade,
        destino: { codigo: r.destino_codigo, nome: r.destino_nome },
        motivo: r.motivo,
        status: r.status,
        situacao: ROTULO_STATUS[r.status] ?? r.status,
        solicitadaPor: r.solicitante,
        solicitadaEm: r.solicitada_em,
        decididaPor: r.decidido_por,
        decididaEm: r.decidido_em,
        // Quando o destino recusa, a justificativa aparece AQUI, na casa de
        // origem. É o que faz a recusa constar nos dois lados.
        justificativa: r.justificativa,
        mensagens: r.mensagens,
      })),
    };
  }

  // ------------------------------------------------------------------
  // Conversa entre as coordenações
  // ------------------------------------------------------------------

  async messages(user: AuthenticatedUser, transferId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      // Sem `JOIN house`: a política de casas (corretamente) só mostra a
      // própria unidade, e o JOIN fazia a mensagem da OUTRA casa desaparecer
      // em silêncio. `app_house_label` devolve só o código da unidade.
      const { rows } = await c.query(
        `SELECT m.id, m.body, m.at, m.author_id,
                app_user_display_name(m.author_id) AS autor,
                app_house_label(m.author_house_id) AS casa
         FROM transfer_message m
         WHERE m.transfer_id = $1 ORDER BY m.at`, [transferId]);
      return rows;
    });
    return rows.map((r) => ({
      id: r.id, autor: r.autor, casa: r.casa, texto: r.body, quando: r.at,
      minha: r.author_id === user.id,
    }));
  }

  async sendMessage(user: AuthenticatedUser, transferId: string, input: { casaId: string; texto: string }) {
    if ((input.texto ?? '').trim().length < 2) {
      throw new BadRequestException('Escreva a mensagem.');
    }
    const dados = await this.db.asUser(user.id, async (c) => {
      const { rows: [t] } = await c.query(
        `SELECT from_house_id, to_house_id, status FROM transfer_request WHERE id = $1`, [transferId]);
      return t;
    });
    if (!dados) throw new NotFoundException('Solicitação não encontrada.');

    let id: string;
    try {
      id = await this.db.asUser(user.id, async (c) => {
        const { rows: [m] } = await c.query(
          `INSERT INTO transfer_message (transfer_id, author_id, author_house_id, body)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [transferId, user.id, input.casaId, input.texto.trim()]);
        return m.id as string;
      });
    } catch (e: any) {
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        throw new ForbiddenException(
          'Só as coordenações das duas casas envolvidas conversam sobre esta solicitação.');
      }
      throw e;
    }

    // O aviso vai para a OUTRA casa — a que não escreveu.
    const outra = input.casaId === dados.from_house_id ? dados.to_house_id : dados.from_house_id;
    await this.avisar(user, outra, {
      // A chave usa o id da MENSAGEM: cada mensagem avisa uma vez, sem que a
      // idempotência do escalonamento engula as seguintes.
      entity: 'transfer_message', entityId: id, reason: 'mensagem_de_transferencia',
      title: 'Mensagem sobre uma transferência',
      // O texto não vai na notificação: quem precisa ler, abre.
      body: 'A outra coordenação escreveu sobre uma solicitação de transferência.',
      priority: 'normal',
    });

    await this.audit.log({
      action: 'transfer.message', actorId: user.id, houseId: input.casaId,
      entity: 'transfer_request', entityId: transferId, detail: { mensagem: id },
    });

    return { id, aviso: 'Mensagem registrada. Ela faz parte do histórico da decisão e não pode ser apagada.' };
  }

  // ------------------------------------------------------------------
  // Decisão
  // ------------------------------------------------------------------

  /** Aceite: efetiva a mudança de casa numa única transação. */
  async accept(user: AuthenticatedUser, transferId: string, note?: string) {
    if (!PODE_TRANSFERIR.includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação decidem transferência.');
    }
    const t = await this.db.asUser(user.id, async (c) => {
      // Comando de sistema (migração 0040): encerra na origem e abre no destino
      // numa transição atômica, com a autorização verificada dentro da função.
      // O destino nunca recebe escrita sobre registros da casa de origem.
      let row: { person_id: string; from_house: string; to_house: string };
      try {
        const { rows: [r] } = await c.query(`SELECT * FROM app_accept_transfer($1)`, [transferId]);
        row = r;
      } catch (e: any) {
        if (e?.message?.includes('transferencia_inexistente')) {
          throw new NotFoundException('Solicitação não encontrada ou já decidida.');
        }
        if (e?.message?.includes('sem_permissao_no_destino')) {
          throw new ForbiddenException('Somente a equipe da unidade de destino aceita esta transferência.');
        }
        throw e;
      }
      if (note) {
        await c.query(`UPDATE transfer_request SET decision_note = $2 WHERE id = $1`, [transferId, note]);
      }
      return row;
    });

    await this.audit.log({
      action: 'transfer.accept', actorId: user.id, houseId: t.to_house,
      entity: 'transfer_request', entityId: transferId,
      detail: { personId: t.person_id, origem: t.from_house, destino: t.to_house },
    });
    // A origem precisa saber que a criança foi acolhida — é o fim da sua
    // responsabilidade sobre ela, e isso não pode chegar por boato.
    await this.avisar(user, t.from_house, {
      entity: 'transfer_decision', entityId: transferId, reason: 'transferencia_aceita',
      title: 'Transferência aceita pela unidade de destino',
      body: 'O acolhido passou à responsabilidade da outra unidade. O histórico acompanhou o perfil.',
      priority: 'alta',
    });

    return {
      ok: true, status: 'aceita',
      efeitos: [
        'Casa atual alterada; o perfil deixa de aparecer na origem.',
        'Histórico, documentos, medicamentos, alergias, restrições e pendências acompanham o acolhido.',
        'ATAs fechadas da origem permanecem imutáveis.',
        'Acesso a benefícios e dados bancários passou à coordenação do destino.',
      ],
    };
  }

  /** Recusa com motivo obrigatório — registrada nas duas casas (§15.6). */
  async decline(user: AuthenticatedUser, transferId: string, motivo: string) {
    const t = await this.comando(user, 'app_decline_transfer($1,$2)', [transferId, motivo ?? ''], {
      somente_o_destino_decide: () => new ForbiddenException(
        'Quem aceita ou recusa é a coordenação da unidade de destino.'),
      motivo_insuficiente: () => new BadRequestException(
        'Descreva o motivo da recusa (mínimo 15 caracteres). Ele fica registrado nas duas casas e é o que '
        + 'a coordenação de origem vai ler para decidir o próximo passo.'),
      transferencia_ja_decidida: () => new BadRequestException('Esta solicitação já foi decidida.'),
      transferencia_inexistente: () => new NotFoundException('Solicitação não encontrada.'),
    });

    await this.avisar(user, t.out_from, {
      entity: 'transfer_decision', entityId: transferId, reason: 'transferencia_recusada',
      title: 'Transferência recusada pela unidade de destino',
      body: 'A solicitação foi recusada com justificativa. Abra Transferências › Da casa para ler o motivo.',
      priority: 'alta',
    });

    return {
      ok: true, status: 'devolvida',
      aviso: 'Recusa registrada com justificativa nas duas casas. Nada mudou de lugar: '
           + 'o acolhido permanece na unidade de origem, que segue responsável.',
    };
  }

  /** Cancelamento pela origem, enquanto ninguém decidiu. */
  async cancel(user: AuthenticatedUser, transferId: string, motivo: string) {
    const t = await this.comando(user, 'app_cancel_transfer($1,$2)', [transferId, motivo ?? ''], {
      somente_a_origem_cancela: () => new ForbiddenException(
        'Só a casa que pediu pode cancelar a própria solicitação.'),
      motivo_insuficiente: () => new BadRequestException('Informe o motivo do cancelamento.'),
      transferencia_ja_decidida: () => new BadRequestException(
        'Esta solicitação já foi decidida pelo destino. A decisão dele não se apaga.'),
      transferencia_inexistente: () => new NotFoundException('Solicitação não encontrada.'),
    });

    await this.audit.log({
      action: 'transfer.cancel', actorId: user.id, houseId: t.out_from,
      entity: 'transfer_request', entityId: transferId, purpose: motivo,
    });
    await this.avisar(user, t.out_to, {
      entity: 'transfer_decision', entityId: transferId, reason: 'transferencia_cancelada',
      title: 'Solicitação de transferência cancelada',
      body: 'A unidade de origem cancelou a solicitação.',
      priority: 'normal',
    });
    return { ok: true, status: 'cancelada' };
  }

  /** Compatível com a chamada antiga: a caixa de entrada de uma casa. */
  async pendingFor(user: AuthenticatedUser, houseId: string) {
    const r = await this.inbox(user, houseId);
    return r.solicitacoes;
  }

  // ------------------------------------------------------------------

  private async avisar(user: AuthenticatedUser, houseId: string, p: {
    entity: string; entityId: string; reason: string;
    title: string; body: string; priority?: 'normal' | 'alta' | 'critica';
  }) {
    const pedido: EscalationRequest = { level: 'tecnica_coordenacao', ...p };
    await this.bus.publish('escalation.requested', pedido, { actorId: user.id, houseId });
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
      throw e;
    }
  }
}
