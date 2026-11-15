import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import {
  FRASE_QUEM_ESCOLHE_O_DO_MES, MOTIVO_DA_TROCA_MINIMO, PORQUE_MINIMO, mesesQueSeEscolhem, rotuloDoMes,
} from './funcionario-do-mes.regra';

/**
 * O FUNCIONÁRIO DO MÊS (fase 324). Um por casa, da coordenação da casa, e um da Fundação,
 * da Coordenação Geral, com o porquê. Quem escolhe e quem lê é o banco (alignments/1728);
 * aqui a recusa chega em português. Trocar não apaga: a escolha de antes fica, com o motivo.
 */
@Injectable()
export class FuncionarioDoMesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  /** Os últimos doze meses da casa e da Fundação, com a escolha que vale e as trocas. */
  async ler(user: AuthenticatedUser, houseId: string | null) {
    if (houseId && !/^[0-9a-f-]{36}$/i.test(houseId)) throw new BadRequestException('A casa pedida não é uma casa.');
    return this.db.asUser(user.id, async (c) => {
      if (houseId) {
        const { rows: [l] } = await c.query(
          `SELECT app_le_o_do_mes(h.id, h.institution_id) AS le FROM house h WHERE h.id = $1`, [houseId]);
        if (!l?.le) throw new NotFoundException('Unidade não encontrada, ou fora do seu alcance.');
      }
      const { rows } = await c.query(
        `SELECT s.id, s.house_id, s.month::text AS mes, s.person_id, s.reason, s.chosen_at,
                s.replaces_id, s.change_reason,
                app_user_display_name(s.person_id) AS pessoa,
                app_user_cargo(s.person_id) AS cargo,
                app_user_profissao(s.person_id) AS profissao,
                app_user_display_name(s.chosen_by) AS por,
                app_house_label(s.house_id) AS casa,
                NOT EXISTS (SELECT 1 FROM staff_of_month t WHERE t.replaces_id = s.id) AS vale
           FROM staff_of_month s
          WHERE (s.house_id IS NULL OR s.house_id = $1)
            AND s.month >= (date_trunc('month', app_hoje()) - interval '11 months')::date
          ORDER BY s.month DESC, s.chosen_at DESC`, [houseId]);
      const { rows: [p] } = await c.query(
        `SELECT CASE WHEN $1::uuid IS NULL THEN false ELSE app_escolhe_o_do_mes($1) END AS casa,
                app_escolhe_o_do_mes(NULL) AS fundacao`, [houseId]);
      const emPortugues = (r: any) => ({
        id: r.id, mes: r.mes, mesRotulo: rotuloDoMes(r.mes), pessoaId: r.person_id, pessoa: r.pessoa,
        cargo: r.cargo, profissao: r.profissao ?? null, porque: r.reason, por: r.por, em: r.chosen_at,
        casa: r.casa, vale: r.vale, motivoDaTroca: r.change_reason,
      });
      const daCasa = rows.filter((r: any) => r.house_id !== null).map(emPortugues);
      const daFundacao = rows.filter((r: any) => r.house_id === null).map(emPortugues);
      return {
        houseId,
        mesesQueSeEscolhem: mesesQueSeEscolhem(hojeNaInstituicao())
          .map((m) => ({ mes: m, rotulo: rotuloDoMes(m) })),
        daCasa, daFundacao,
        podeEscolherDaCasa: !!p?.casa, podeEscolherDaFundacao: !!p?.fundacao,
      };
    });
  }

  /** Quem pode ser escolhido: na casa, quem trabalha nela; na Fundação, todas as contas. */
  async candidatos(user: AuthenticatedUser, houseId: string | null) {
    if (houseId && !/^[0-9a-f-]{36}$/i.test(houseId)) throw new BadRequestException('A casa pedida não é uma casa.');
    const pessoas = await this.db.asUser(user.id, async (c) => {
      const { rows: [p] } = await c.query(`SELECT app_escolhe_o_do_mes($1) AS pode`, [houseId]);
      if (!p?.pode) return null;
      const { rows } = await c.query(
        `SELECT s.id, s.full_name, s.role::text AS role, app_user_profissao(s.id) AS profissao
           FROM app_staff_list() s
          WHERE s.active AND app_pode_ser_o_do_mes($1, s.id)
          ORDER BY s.full_name`, [houseId]);
      return rows;
    });
    if (!pessoas) throw new ForbiddenException(FRASE_QUEM_ESCOLHE_O_DO_MES);
    return { pessoas: pessoas.map((p: any) => ({ id: p.id, nome: p.full_name, cargo: p.role, profissao: p.profissao ?? null })) };
  }

  async escolher(user: AuthenticatedUser, input: {
    houseId?: string | null; mes?: string; pessoaId?: string; porque?: string; motivoDaTroca?: string;
  }) {
    const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
    const houseId = input?.houseId == null || input.houseId === '' ? null : input.houseId;
    if (houseId !== null && !uuid(houseId)) throw new BadRequestException('Escolha a casa.');
    if (!uuid(input?.pessoaId)) throw new BadRequestException('Escolha a pessoa.');
    const meses = mesesQueSeEscolhem(hojeNaInstituicao());
    const mes = typeof input?.mes === 'string' && meses.includes(input.mes) ? input.mes : null;
    if (!mes) throw new BadRequestException('Escolha o mês: o de agora ou o anterior.');
    const porque = typeof input?.porque === 'string' ? input.porque.trim() : '';
    if (porque.length < PORQUE_MINIMO) {
      throw new BadRequestException(`Escreva o porquê da escolha, com pelo menos ${PORQUE_MINIMO} letras.`);
    }
    if (porque.length > 2000) throw new BadRequestException('O porquê cabe em até 2.000 letras.');
    const motivo = typeof input?.motivoDaTroca === 'string' ? input.motivoDaTroca.trim() : '';
    if (motivo.length > 2000) throw new BadRequestException('O motivo da troca cabe em até 2.000 letras.');

    let id: string;
    try {
      id = await this.db.asUser(user.id, async (c) => (await c.query(
        `SELECT app_escolher_o_do_mes($1, $2::date, $3, $4, $5) AS id`,
        [houseId, mes, input.pessoaId, porque, motivo || null])).rows[0].id);
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('do_mes_sem_alcance')) throw new ForbiddenException(FRASE_QUEM_ESCOLHE_O_DO_MES);
      if (m.includes('do_mes_fora_do_mes')) throw new BadRequestException('Escolha o mês: o de agora ou o anterior.');
      if (m.includes('do_mes_pessoa_fora')) {
        throw new BadRequestException(houseId
          ? 'Escolha alguém que trabalha nesta casa. Você não escolhe a si mesma.'
          : 'Escolha alguém da Fundação. Você não escolhe a si mesma.');
      }
      if (m.includes('do_mes_sem_porque')) {
        throw new BadRequestException(`Escreva o porquê da escolha, com pelo menos ${PORQUE_MINIMO} letras.`);
      }
      if (m.includes('do_mes_ja_escolhido')) {
        throw new ConflictException(`Este mês já tem a escolha. Para trocar, escreva o motivo da troca, com pelo menos ${MOTIVO_DA_TROCA_MINIMO} letras.`);
      }
      throw e;
    }
    await this.audit.log({
      action: 'funcionario_do_mes.escolhido', actorId: user.id, institutionId: user.institutionId,
      houseId, entity: 'staff_of_month', entityId: id, detail: { mes, troca: !!motivo },
    });
    await this.bus.publish('notice.requested', {
      userId: input.pessoaId as string,
      title: houseId ? `O funcionário do mês da casa em ${rotuloDoMes(mes)} é você` : `O funcionário do mês da Fundação em ${rotuloDoMes(mes)} é você`,
      body: 'A coordenação escreveu o porquê. Ele está na tela Encontros de alinhamento.',
      entity: 'staff_of_month', entityId: id,
    }, { actorId: user.id, houseId: houseId ?? undefined });
    return { ok: true, id, aviso: 'Escolha registrada. A pessoa recebe o aviso com o porquê.' };
  }
}
