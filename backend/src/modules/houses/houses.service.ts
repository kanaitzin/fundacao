import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';

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

  /**
   * Catálogo de unidades para ESCOLHER um destino de transferência (§15.6).
   *
   * Não é brecha no isolamento: devolve código, nome e tipo — o catálogo
   * institucional, o mesmo que está na porta de cada casa. Nada do que
   * acontece dentro da outra unidade aparece aqui. Existe porque, sem ele,
   * pedir transferência seria impossível: não se aponta um destino que não se
   * consegue nomear. Restrito a quem decide transferência.
   */
  async directory(user: AuthenticatedUser) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_house_directory()`);
      return rows;
    });
    return rows.map((r) => ({
      id: r.id, codigo: r.code, nome: r.name, tipo: r.kind, propria: r.propria,
    }));
  }

  /**
   * Ocupação da casa: quantos são hoje e qual é o limite.
   *
   * Devolve número, nunca lista — quem enxerga a lotação não passa a enxergar
   * quem são as pessoas.
   */
  async occupancy(user: AuthenticatedUser, houseId: string) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(`SELECT * FROM app_house_occupancy($1)`, [houseId]);
      return row;
    }).catch((e: any) => {
      if (e?.message?.includes('casa_fora_de_escopo')) throw new NotFoundException('Casa não encontrada');
      throw e;
    });
    return {
      capacidade: r.capacidade, ocupadas: r.ocupadas, vagas: r.vagas,
      acimaDoLimite: r.acima_do_limite,
      podeAlterar: ['coordenador', 'gestor_geral'].includes(user.role),
    };
  }

  /**
   * Mudar o limite da casa (§ capacidade).
   *
   * As oito unidades nascem com 20, que é o número praticado. Mudar exige
   * motivo e fica registrado com autor e data: um dia alguém vai precisar
   * explicar por que aquela casa passou a receber 22.
   */
  async setCapacity(user: AuthenticatedUser, houseId: string, capacidade: number, motivo: string) {
    if (!['coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente a coordenação da casa e o Gestor Geral alteram o limite.');
    }
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_set_house_capacity($1,$2,$3)`, [houseId, capacidade, motivo]);
      return row;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('sem_permissao_capacidade')) {
        throw new ForbiddenException('Sem permissão para alterar o limite desta unidade.');
      }
      if (m.includes('motivo_insuficiente')) {
        throw new BadRequestException('Descreva o motivo da mudança de limite (mínimo 15 caracteres).');
      }
      if (m.includes('capacidade_invalida')) {
        throw new BadRequestException('O limite precisa estar entre 1 e 60.');
      }
      if (m.includes('capacidade_sem_mudanca')) {
        throw new BadRequestException('O limite informado já é o atual.');
      }
      if (m.includes('casa_inexistente')) throw new NotFoundException('Casa não encontrada');
      throw e;
    });

    await this.audit.log({
      action: 'house.capacity_change', actorId: user.id, institutionId: user.institutionId,
      houseId, entity: 'house', entityId: houseId,
      detail: { de: r.anterior, para: r.capacidade },
    });
    return {
      capacidade: r.capacidade, anterior: r.anterior,
      aviso: `Limite da unidade alterado de ${r.anterior} para ${r.capacidade}. A mudança fica registrada com o seu nome.`,
    };
  }

  /** Histórico de mudanças de limite — a decisão precisa continuar visível. */
  async capacityHistory(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT ch.from_capacity, ch.to_capacity, ch.reason, ch.changed_at, u.full_name AS autor
           FROM house_capacity_change ch
           -- rls-join-ok: app_user não tem RLS de linha; quem filtra é a policy cap_select.
           JOIN app_user u ON u.id = ch.changed_by
          WHERE ch.house_id = $1
          ORDER BY ch.changed_at DESC LIMIT 50`, [houseId]);
      return rows.map((r) => ({
        de: r.from_capacity, para: r.to_capacity, motivo: r.reason,
        autor: r.autor, em: r.changed_at,
      }));
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
