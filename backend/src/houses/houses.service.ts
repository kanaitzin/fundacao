import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.service';

/**
 * Matriz de escopo (§5.13): para educador, líder diurno, equipe técnica e
 * coordenador somente a própria casa "existe". Exceções funcionais:
 * gestor_geral (institucional), enfermagem (saúde, 8 casas),
 * lider_noturno_geral (operacional, 8 casas no turno).
 *
 * O RLS no banco impõe o MESMO perímetro; este serviço nunca o excede —
 * defesa em profundidade, não fonte única.
 */
@Injectable()
export class HousesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(user: AuthenticatedUser) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT id, code, name, kind FROM house WHERE active ORDER BY code`);
      return rows;
    });
  }

  async open(user: AuthenticatedUser, houseId: string) {
    const house = await this.db.asUser(user.id, async (c) => {
      const { rows: [h] } = await c.query(
        `SELECT id, code, name, kind, address FROM house WHERE id = $1 AND active`, [houseId]);
      return h;
    });
    // Fora do escopo, o RLS não retorna a linha: 404 idêntico ao inexistente,
    // sem vazar a existência de outra casa (§23: busca sem vazar existência).
    if (!house) throw new NotFoundException('Casa não encontrada');

    // Gestor abre uma casa por vez, com abertura auditada (§5.2, §18.1)
    if (user.role === 'gestor_geral') {
      await this.audit.log({
        action: 'house.open', actorId: user.id, institutionId: user.institutionId,
        houseId, detail: { code: house.code },
      });
    }
    return house;
  }
}
