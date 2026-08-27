import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * Transferência entre casas (§15.6).
 *
 * A casa atual só muda NO ACEITE. Enquanto pendente, a origem mantém a
 * responsabilidade e o destino não vê dados do acolhido — apenas que há uma
 * solicitação. Ao efetivar: o perfil some operacionalmente da origem, aparece
 * no destino, o histórico inteiro segue junto, as ATAs fechadas da origem
 * permanecem imutáveis e o acesso a benefícios muda de mãos.
 */
const PODE_TRANSFERIR = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

@Injectable()
export class TransfersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async request(user: AuthenticatedUser, input: { personId: string; toHouseId: string; reason: string }) {
    if (!PODE_TRANSFERIR.includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação iniciam transferência.');
    }
    if (!input.reason?.trim()) throw new BadRequestException('Informe o motivo da transferência.');

    return this.db.asUser(user.id, async (c) => {
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
        [input.personId, stay.episode_id, stay.house_id, input.toHouseId, input.reason, user.id]);

      await this.audit.log({
        action: 'transfer.request', actorId: user.id, houseId: stay.house_id,
        entity: 'transfer_request', entityId: t.id,
        detail: { personId: input.personId, destino: input.toHouseId },
      });
      return {
        id: t.id, status: 'solicitada', solicitadaEm: t.requested_at,
        aviso: 'Enquanto pendente, a responsabilidade continua com a casa de origem.',
      };
    });
  }

  /** Caixa de entrada do destino: mostra a solicitação sem expor o perfil ainda. */
  async pendingFor(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      // Antes do aceite o RLS esconde a pessoa do destino — e deve mesmo.
      // O resumo mínimo para decidir vem de função própria (§15.6):
      // origem, motivo e idade. Sem nome, CPF, saúde ou histórico.
      const { rows } = await c.query(`SELECT * FROM app_transfer_inbox($1)`, [houseId]);
      return rows.map((r) => ({
        id: r.id, origem: r.origem, motivo: r.motivo, idade: r.idade, solicitadaEm: r.solicitada_em,
      }));
    });
  }

  /** Aceite: efetiva a mudança de casa numa única transação. */
  async accept(user: AuthenticatedUser, transferId: string, note?: string) {
    if (!PODE_TRANSFERIR.includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação decidem transferência.');
    }
    return this.db.asUser(user.id, async (c) => {
      // Comando de sistema (migração 004): encerra na origem e abre no destino
      // numa transição atômica, com a autorização verificada dentro da função.
      // O destino nunca recebe escrita sobre registros da casa de origem.
      let t: { person_id: string; from_house: string; to_house: string };
      try {
        const { rows: [r] } = await c.query(`SELECT * FROM app_accept_transfer($1)`, [transferId]);
        t = r;
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

      await this.audit.log({
        action: 'transfer.accept', actorId: user.id, houseId: t.to_house,
        entity: 'transfer_request', entityId: transferId,
        detail: { personId: t.person_id, origem: t.from_house, destino: t.to_house },
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
    });
  }

  /** Devolução com motivo: nada muda de lugar. */
  async decline(user: AuthenticatedUser, transferId: string, motivo: string) {
    if (!PODE_TRANSFERIR.includes(user.role)) throw new ForbiddenException('Sem permissão.');
    if (!motivo?.trim()) throw new BadRequestException('Informe o motivo da devolução.');
    return this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE transfer_request SET status='devolvida', decided_by=$2, decided_at=now(), decision_note=$3
         WHERE id=$1 AND status='solicitada'`, [transferId, user.id, motivo]);
      if (!rowCount) throw new NotFoundException('Solicitação não encontrada ou já decidida.');
      await this.audit.log({
        action: 'transfer.decline', actorId: user.id, entity: 'transfer_request', entityId: transferId,
        detail: { motivo },
      });
      return { ok: true, status: 'devolvida' };
    });
  }
}
