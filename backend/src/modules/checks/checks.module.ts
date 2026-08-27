import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { SyncModule } from '../sync';
import { ChecksOfflineHandlers } from './checks.offline';
import { ChecksController } from './checks.controller';
import { ChecksService } from './checks.service';
import { ChecksTimelineProvider } from './checks.timeline';

/**
 * Módulo `checks` — conferência coletiva com registro individual (§10).
 * Depende de: identity e kernel. Registra-se como provedor da linha do tempo.
 */
@Module({
  imports: [IdentityModule, SyncModule],
  controllers: [ChecksController],
  providers: [ChecksService, ChecksTimelineProvider, ChecksOfflineHandlers],
  exports: [ChecksService],
})
export class ChecksModule {}
