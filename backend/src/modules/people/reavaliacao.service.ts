import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { REAVALIACAO_AVISO_DIAS, prazoDaReavaliacao, PrazoDaReavaliacao } from './reavaliacao.regra';
import { hojeNaInstituicao } from '../../kernel/common/tempo';

/**
 * O PRAZO DA REAVALIAÇÃO (fase 269).
 *
 * O relógio do dia pergunta, casa a casa, quem tem o relatório de reavaliação
 * ao Juízo vencendo nos próximos quinze dias, e a técnica e a coordenação da
 * casa recebem um aviso por criança, uma vez por prazo. A regra é a de
 * `reavaliacao.regra.ts`; a área restrita do perfil mostra o mesmo prazo.
 */
@Injectable()
export class ReavaliacaoService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  async avisarDaCasa(user: AuthenticatedUser, houseId: string) {
    const linhas = await this.db.asUser(user.id, async (c) => (await c.query(
      `SELECT * FROM app_reavaliacao_chegando($1, $2)`, [houseId, REAVALIACAO_AVISO_DIAS])).rows);
    for (const r of linhas) {
      const data = String(r.out_data).slice(0, 10);
      const dia = `${data.slice(8, 10)}/${data.slice(5, 7)}`;
      await this.bus.publish('escalation.requested', {
        level: 'tecnica_coordenacao',
        entity: 'person', entityId: r.out_pessoa,
        reason: 'reavaliacao_chegando',
        title: `O relatório de reavaliação de ${r.out_nome} vai ao Juízo até ${dia}`,
        body: `A situação de ${r.out_nome} é reavaliada a cada três meses no máximo, e o `
          + `próximo relatório da equipe técnica vai até ${dia}. Quando for enviado, anexe-o no `
          + 'dossiê da criança, na parte restrita, como Relatório de reavaliação.',
        priority: 'normal', groupKey: `reavaliacao:${r.out_pessoa}:${data}`,
      }, { actorId: user.id, houseId });
    }
    return { ok: true, avisados: linhas.length };
  }

  /** O prazo de uma criança, lido por quem já passou pela área restrita. */
  async prazoDa(user: AuthenticatedUser, personId: string): Promise<PrazoDaReavaliacao | null> {
    const base = await this.db.asUser(user.id, async (c) => (await c.query(
      `SELECT out_desde::text AS desde, out_ultimo::text AS ultimo
         FROM app_reavaliacao_base($1)`, [personId])).rows[0]);
    if (!base?.desde) return null;
    return prazoDaReavaliacao(base.desde, base.ultimo ?? null, hojeNaInstituicao());
  }
}
