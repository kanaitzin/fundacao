import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ActivitiesTimelineProvider } from './activities.timeline';

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
  imports: [IdentityModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, ActivitiesTimelineProvider],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
