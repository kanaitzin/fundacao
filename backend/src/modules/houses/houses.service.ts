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
  /**
   * O HORÁRIO DOS TURNOS DA CASA (fase 159).
   *
   * Devolve o horário de HOJE, o de AMANHÃ quando alguém já mudou (a mudança
   * vale a partir do dia seguinte), o turno de agora — que é o que a tela da
   * passagem usa para saber qual plantão abrir — e quem mudou o quê. O noturno
   * é o resto do dia: começa um minuto depois do fim do diurno.
   */
  async turnos(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT to_char(h.diurno_de, 'HH24:MI') AS de, to_char(h.diurno_ate, 'HH24:MI') AS ate,
                to_char(a.diurno_de, 'HH24:MI') AS de_amanha, to_char(a.diurno_ate, 'HH24:MI') AS ate_amanha,
                (app_hoje() + 1)::text AS amanha,
                t.dia::text AS dia_agora, t.periodo AS periodo_agora
           FROM app_horario_da_casa($1, app_hoje()) h,
                app_horario_da_casa($1, app_hoje() + 1) a,
                app_turno_de($1, now()) t`, [houseId]);
      const { rows: hist } = await c.query(
        `SELECT to_char(diurno_de, 'HH24:MI') AS de, to_char(diurno_ate, 'HH24:MI') AS ate,
                valid_from::text AS desde, reason, set_at, app_user_display_name(set_by) AS autor
           FROM house_shift_hours WHERE house_id = $1
          ORDER BY set_at DESC LIMIT 30`, [houseId]);
      const turno = (de: string, ate: string) => ({
        diurno: { de, ate },
        noturno: { de: minutos(ate, 1), ate: minutos(de, -1) },
      });
      const mudaAmanha = r.de_amanha !== r.de || r.ate_amanha !== r.ate;
      return {
        hoje: turno(r.de, r.ate),
        amanha: mudaAmanha ? { ...turno(r.de_amanha, r.ate_amanha), desde: r.amanha } : null,
        agora: { dia: r.dia_agora, turno: r.periodo_agora },
        podeMudar: ['coordenador', 'lider_diurno', 'equipe_tecnica'].includes(user.role),
        historico: hist.map((h) => ({
          diurno: { de: h.de, ate: h.ate }, desde: h.desde, motivo: h.reason,
          autor: h.autor, em: h.set_at,
        })),
        aviso: 'A mudança vale a partir do dia seguinte. As ATAs que já passaram '
          + 'continuam com o horário que tinham.',
      };
    });
  }

  async definirTurnos(user: AuthenticatedUser, houseId: string,
                      input: { diurnoDe?: string; diurnoAte?: string; motivo?: string }) {
    if (!['coordenador', 'lider_diurno', 'equipe_tecnica'].includes(user.role)) {
      throw new ForbiddenException(
        'O horário dos turnos é definido pela coordenação, pela equipe técnica ou pelo Líder Diurno da casa.');
    }
    const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!hora.test(input?.diurnoDe ?? '') || !hora.test(input?.diurnoAte ?? '')) {
      throw new BadRequestException('Informe o início e o fim do diurno como 08:00 e 20:00.');
    }
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT vigente_desde::text AS desde FROM app_definir_horario_da_casa($1, $2::time, $3::time, $4)`,
        [houseId, input.diurnoDe, input.diurnoAte, input.motivo ?? null]);
      return row;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('fora_de_escopo')) throw new NotFoundException('Casa não encontrada — ou fora do seu alcance.');
      if (m.includes('sem_permissao_horario')) {
        throw new ForbiddenException('Seu cargo não define o horário dos turnos.');
      }
      if (m.includes('horario_invalido')) {
        throw new BadRequestException(
          'O diurno precisa começar depois da meia-noite e terminar antes das 23:59, e o '
          + 'início vem antes do fim. O noturno é o resto do dia.');
      }
      throw e;
    });
    return {
      vigenteDesde: r.desde,
      aviso: `Horário gravado. Vale a partir de ${r.desde.split('-').reverse().join('/')}: `
        + `diurno das ${input.diurnoDe} às ${input.diurnoAte}, noturno das `
        + `${minutos(input.diurnoAte!, 1)} às ${minutos(input.diurnoDe!, -1)}.`,
    };
  }

  async capacityHistory(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        // `app_user` TEM RLS de linha: `user_select` só entrega o cadastro de
        // um colega a gestor, coordenação e equipe técnica. O JOIN interno que
        // estava aqui não filtrava o nome — ele SUMIA COM A LINHA, e o
        // educador, o líder e a Enfermagem recebiam um histórico VAZIO, sem
        // erro nenhum. "Por que esta casa recebe 22?" voltava a ser suposição
        // justamente para quem trabalha nela.
        `SELECT ch.from_capacity, ch.to_capacity, ch.reason, ch.changed_at,
                app_user_display_name(ch.changed_by) AS autor
           FROM house_capacity_change ch
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

/** Soma minutos a um HH:MM, dando a volta na meia-noite. */
function minutos(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = ((h * 60 + m + delta) % 1440 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
