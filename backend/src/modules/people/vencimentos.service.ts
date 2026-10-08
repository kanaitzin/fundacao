import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * A RECEITA E A VACINAÇÃO QUE ESTÃO VENCENDO (fase 191; decidido em 08/10).
 *
 * O relógio do dia pergunta, casa a casa, que receita vence nos próximos dez
 * dias e que caderneta de vacinação nos próximos quinze, e avisa uma vez por
 * documento a Enfermagem e a técnica e a coordenação da casa. A data é a
 * validade do último documento daquele tipo anexado ao dossiê da criança.
 *
 * O aviso não diz o remédio nem a vacina: diz que há um documento de saúde a
 * renovar, de quem e quando, e onde ele está. O resto se lê no dossiê.
 */
export const VENCIMENTOS = [
  { chave: 'receita', dias: 10, nome: 'a receita', onde: 'no dossiê da criança, em Saúde' },
  { chave: 'caderneta_vacinacao', dias: 15, nome: 'a caderneta de vacinação', onde: 'no dossiê da criança' },
] as const;

/** Quem recebe: a Enfermagem e a técnica e a coordenação da casa (decisão de 08/10). */
const NIVEIS = ['enfermagem', 'tecnica_coordenacao'] as const;

@Injectable()
export class VencimentosService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  async avisarDaCasa(user: AuthenticatedUser, houseId: string) {
    let avisados = 0;
    for (const v of VENCIMENTOS) {
      const linhas = await this.db.asUser(user.id, async (c) => (await c.query(
        `SELECT * FROM app_documentos_vencendo($1, $2, $3)`, [houseId, v.chave, v.dias])).rows);
      for (const r of linhas) {
        const data = String(r.out_data).slice(0, 10);
        const dia = `${data.slice(8, 10)}/${data.slice(5, 7)}`;
        const titulo = `${v.nome[0].toUpperCase()}${v.nome.slice(1)} de ${r.out_nome} vence em ${dia}`;
        for (const nivel of NIVEIS) {
          await this.bus.publish('escalation.requested', {
            level: nivel,
            entity: 'document', entityId: r.out_documento,
            reason: `${v.chave}_vencendo`,
            title: titulo,
            body: `${titulo}. O documento está ${v.onde}.`,
            priority: 'normal', groupKey: `vence:${r.out_documento}`,
          }, { actorId: user.id, houseId });
        }
        avisados++;
      }
    }
    return { ok: true, avisados };
  }
}
