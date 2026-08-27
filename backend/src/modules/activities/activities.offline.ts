import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SyncService, OfflineOp } from '../sync';
import { AuthenticatedUser } from '../../kernel/contracts';
import { ActivitiesService } from './activities.service';

/**
 * Aplicador das operações offline DE ATIVIDADES.
 *
 * Mora aqui, e não dentro de `sync`, por uma razão de fronteira: quem conhece
 * as regras e as tabelas de uma atividade é este módulo. O `sync` cuida da
 * fila, da idempotência e dos conflitos — e não precisa saber o que é uma
 * atividade. Remover `activities` faz suas operações offline serem recusadas
 * com motivo, em vez de quebrar a sincronização.
 *
 * **Por que estes handlers chamam o SERVIÇO, e não o banco direto.**
 * A primeira versão escrevia nas tabelas por conta própria, e com isso a fila
 * offline entrava por baixo de todas as validações:
 *
 *   * a justificativa obrigatória das exceções (§8.4) não era exigida — pela
 *     API, "Não realizada — transporte" sem explicação dá 400; pela fila,
 *     entrava calada;
 *   * o `exception_note` nem sequer era gravado, então a linha do tempo
 *     mostrava o estado de exceção sem nenhum motivo;
 *   * a ciência gravava o registro mas não mudava o estado da atividade: o
 *     educador tomava ciência e continuava sendo escalonado como se não
 *     tivesse tomado.
 *
 * Estar sem sinal não pode ser um caminho para gravar o que a regra recusa.
 * Se a operação não passa nas validações, ela vira CONFLITO para decisão
 * humana — que é exatamente o que o §17.4 manda fazer.
 */
@Injectable()
export class ActivitiesOfflineHandlers implements OnModuleInit {
  constructor(
    @Inject(SyncService) private readonly sync: SyncService,
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
  ) {}

  onModuleInit() {
    this.sync.registerHandler('activity.record', (u, op) => this.record(u, op));
    this.sync.registerHandler('activity.acknowledge', (u, op) => this.acknowledge(u, op));
  }

  /** Conclusão ou exceção registrada sem internet. Horário real preservado. */
  private async record(user: AuthenticatedUser, op: OfflineOp) {
    const p = op.payload as any;
    const r = await this.activities.record(user, p.activityId, {
      estado: p.estado, nota: p.nota,
      // O horário REAL do aparelho, nunca o da sincronização (§17.3).
      happenedAt: op.happenedAt,
      offline: true, device: op.device, clientOpId: op.clientOpId,
    });
    return { duplicada: !!(r as any).duplicada };
  }

  private async acknowledge(user: AuthenticatedUser, op: OfflineOp) {
    const p = op.payload as any;
    try {
      await this.activities.acknowledge(user, p.activityId, {
        device: op.device, offline: true,
      });
      return {};
    } catch (e: any) {
      // Ciência repetida vinda da fila é reenvio, não erro do educador.
      if (/já tomou ciência/i.test(e?.message ?? '')) return { duplicada: true };
      throw e;
    }
  }
}
