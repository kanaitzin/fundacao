import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { SyncModule } from '../sync';
import { ActivitiesOfflineHandlers } from './activities.offline';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ActivitiesTimelineProvider } from './activities.timeline';
import { AgendaService } from './agenda.service';

/**
 * Módulo `activities` — o que acontece no dia e quem responde por isso.
 *
 * Depende de: identity (sessão) e do kernel (banco, auditoria, eventos,
 * registro de linha do tempo).
 *
 * NÃO depende de `timeline`: apenas se registra como provedor. E não depende
 * de `routine`: a geração do dia lê a rotina vigente no banco. As duas coisas
 * mantêm as partições soltas.
 */
@Module({
  imports: [IdentityModule, SyncModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, AgendaService, ActivitiesTimelineProvider, ActivitiesOfflineHandlers],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
