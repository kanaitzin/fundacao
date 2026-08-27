import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { newSessionToken, hashToken } from '../../kernel/common/crypto';

/**
 * APARELHOS INSTITUCIONAIS (§11.7, pendência institucional #7).
 *
 * O aparelho designado da casa passou a ser uma CREDENCIAL. Antes, a regra
 * "offline, só o aparelho institucional confirma medicamento" era verificada
 * contra um booleano que vinha no corpo da requisição — quem enviasse `true`
 * passava. A regra existia no papel e no código, e não existia de fato.
 *
 * Agora o token é gerado no registro, mostrado UMA vez, e o banco guarda só o
 * hash — o mesmo padrão das sessões (ADR-002). Quem decide é o servidor.
 */
@Injectable()
export class DevicesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT id, label, active, registered_at, revoked_at, revoked_reason, last_seen_at
         FROM institutional_device WHERE house_id = $1 ORDER BY active DESC, label`, [houseId]);
      return rows.map((r) => ({
        id: r.id, rotulo: r.label, ativo: r.active,
        registradoEm: r.registered_at, revogadoEm: r.revoked_at,
        motivoRevogacao: r.revoked_reason, ultimoUso: r.last_seen_at,
      }));
    });
  }

  /** Registra e devolve o token UMA vez. Depois disso ele não é recuperável. */
  async register(user: AuthenticatedUser, input: { houseId: string; rotulo: string }) {
    const { token, hash } = newSessionToken();
    try {
      const id = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT * FROM app_register_device($1,$2,$3)`, [input.houseId, input.rotulo ?? '', hash]);
        return r.out_id as string;
      });
      return {
        id, rotulo: input.rotulo,
        token,
        aviso: 'Guarde este código no aparelho agora: ele é mostrado uma única vez. '
             + 'O sistema conserva apenas a impressão digital dele — se perder, registre outro aparelho e revogue este.',
      };
    } catch (e: any) {
      const m = e?.message ?? '';
      if (m.includes('cargo_nao_registra_aparelho')) {
        throw new ForbiddenException('O registro de aparelhos é da coordenação.');
      }
      if (m.includes('fora_de_escopo')) throw new ForbiddenException('Esta casa não está no seu alcance.');
      if (m.includes('rotulo_insuficiente')) {
        throw new BadRequestException('Dê um nome ao aparelho — algo que a equipe reconheça na prateleira.');
      }
      if (e?.code === '23505') {
        throw new BadRequestException('Já existe um aparelho com este nome nesta casa.');
      }
      throw e;
    }
  }

  async revoke(user: AuthenticatedUser, deviceId: string, motivo: string) {
    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(`SELECT * FROM app_revoke_device($1,$2)`, [deviceId, motivo ?? null]);
      });
      return {
        ok: true,
        aviso: 'Aparelho revogado. O registro permanece: as confirmações feitas por ele continuam rastreáveis.',
      };
    } catch (e: any) {
      const m = e?.message ?? '';
      if (m.includes('cargo_nao_registra_aparelho')) {
        throw new ForbiddenException('A revogação de aparelhos é da coordenação.');
      }
      if (m.includes('aparelho_inexistente')) throw new NotFoundException('Aparelho não encontrado.');
      throw e;
    }
  }

  /**
   * O servidor decide se o aparelho é o institucional daquela casa.
   * Devolve o id do aparelho, ou null. O que o cliente afirma sobre si mesmo
   * não entra na conta.
   */
  async verificar(user: AuthenticatedUser, houseId: string | undefined, token: string | undefined) {
    if (!houseId || !token) return null;
    return this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT app_check_device($1,$2) AS id`, [houseId, hashToken(token)]);
      return (r?.id as string | null) ?? null;
    });
  }
}
