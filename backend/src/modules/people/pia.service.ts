import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/** Com quantos dias de antecedência o PIA é avisado (decisão de 28/09, §10 item 9). */
export const PIA_AVISO_DIAS = 30;

/**
 * O PIA QUE ESTÁ CHEGANDO (fase 178).
 *
 * O relógio do dia pergunta, casa a casa, que PIA vence nos próximos trinta
 * dias, e a técnica e a coordenação da casa recebem um aviso por criança, uma
 * vez por PIA. A data é a validade do último PIA anexado ao dossiê; quem ainda
 * não tem PIA já aparece como faltando no dossiê, e não é avisado aqui.
 */
@Injectable()
export class PiaService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  async avisarDaCasa(user: AuthenticatedUser, houseId: string) {
    const linhas = await this.db.asUser(user.id, async (c) => (await c.query(
      `SELECT * FROM app_pia_chegando($1, $2)`, [houseId, PIA_AVISO_DIAS])).rows);
    for (const r of linhas) {
      const data = String(r.out_data).slice(0, 10);
      const dia = `${data.slice(8, 10)}/${data.slice(5, 7)}`;
      await this.bus.publish('escalation.requested', {
        level: 'tecnica_coordenacao',
        entity: 'pia', entityId: r.out_documento,
        reason: 'pia_chegando',
        title: `O PIA de ${r.out_nome} vence em ${dia}`,
        body: `O próximo PIA de ${r.out_nome} está previsto para ${dia}. `
          + 'O plano está no dossiê da criança, na parte restrita.',
        priority: 'normal', groupKey: `pia:${r.out_documento}`,
      }, { actorId: user.id, houseId });
    }
    return { ok: true, avisados: linhas.length };
  }
}
