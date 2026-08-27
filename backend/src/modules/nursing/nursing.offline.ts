import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SyncService, OfflineOp } from '../sync';
import { AuthenticatedUser } from '../../kernel/contracts';
import { NursingService } from './nursing.service';

/**
 * Evolução de Saúde preenchida OFFLINE (§17.1): o educador acompanha um
 * atendimento fora da casa, muitas vezes sem sinal, e registra ali mesmo.
 * O horário real do atendimento é preservado; a fila sincroniza depois.
 *
 * **Por que passa pelo serviço.** A primeira versão fazia o INSERT direto, e
 * com isso a evolução vinda da fila era uma evolução PIOR do que a online:
 *
 *   * não criava o `health_encounter` que `app_submit_evolution` cria junto,
 *     então o atendimento nunca entrava no histórico de saúde (§7.3);
 *   * simplesmente NÃO MAPEAVA receita, exames, prazo de retorno e
 *     encaminhamentos — o educador digitava a receita entregue pelo médico e o
 *     prazo de 15 dias, e os dois eram descartados em silêncio na
 *     sincronização;
 *   * não publicava o escalonamento, então a Enfermagem nem era avisada de que
 *     havia uma evolução esperando triagem.
 *
 * Justamente o caminho que o §7.2 prevê para acompanhamento externo era o que
 * perdia mais informação clínica.
 */
@Injectable()
export class NursingOfflineHandlers implements OnModuleInit {
  constructor(
    @Inject(SyncService) private readonly sync: SyncService,
    @Inject(NursingService) private readonly nursing: NursingService,
  ) {}

  onModuleInit() {
    this.sync.registerHandler('health.evolution', (u, op) => this.evolution(u, op));
  }

  private async evolution(user: AuthenticatedUser, op: OfflineOp) {
    const p = op.payload as any;
    const r = await this.nursing.submitEvolution(user, {
      personId: p.personId, houseId: op.houseId as string, tipo: p.tipo,
      quandoAconteceu: op.happenedAt,
      local: p.local, especialidade: p.especialidade,
      servicoProfissional: p.servicoProfissional, motivo: p.motivo,
      estadoSaida: p.estadoSaida, estadoDurante: p.estadoDurante,
      estadoRetorno: p.estadoRetorno,
      procedimentos: p.procedimentos,
      examesSolicitados: p.examesSolicitados, examesResultados: p.examesResultados,
      receita: p.receita, orientacoes: p.orientacoes, restricoes: p.restricoes,
      prazoRetorno: p.prazoRetorno, encaminhamentos: p.encaminhamentos,
      intercorrenciasDeslocamento: p.intercorrenciasDeslocamento,
      observacoes: p.observacoes,
      offline: true, clientOpId: op.clientOpId,
    });
    return { duplicada: !!(r as any).duplicada };
  }
}
