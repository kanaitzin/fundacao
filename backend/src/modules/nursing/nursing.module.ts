import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { SyncModule } from '../sync';
import { NursingController } from './nursing.controller';
import { NursingService } from './nursing.service';
import { InternacaoService } from './internacao.service';
import { HealthSummaryService } from './health-summary.service';
import { NursingOfflineHandlers } from './nursing.offline';

/**
 * Módulo `nursing` — Enfermagem: painel transversal, Evolução de Saúde com
 * triagem e assinatura, histórico e Resumo de Saúde (§7).
 *
 * Depende de: identity e sync. Lê a grade de medicamentos pelo BANCO (o painel
 * e o resumo precisam das doses), sem importar o módulo `medications` — assim
 * os dois evoluem separados.
 */
@Module({
  imports: [IdentityModule, SyncModule],
  controllers: [NursingController],
  providers: [NursingService, InternacaoService, HealthSummaryService, NursingOfflineHandlers],
  exports: [NursingService, HealthSummaryService],
})
export class NursingModule {}
