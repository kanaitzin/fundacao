import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { SyncModule } from '../sync';
import { MedicationsController } from './medications.controller';
import { MedicationsService } from './medications.service';
import { MedicationsTimelineProvider } from './medications.timeline';
import { MedicationsOfflineHandlers } from './medications.offline';

/**
 * Módulo `medications` — prescrição, grade, administração e estoque (§11).
 *
 * Depende de: identity (sessão) e sync (registrar o aplicador offline).
 * Registra-se como provedor da linha do tempo, sem que a timeline mude.
 */
@Module({
  imports: [IdentityModule, SyncModule],
  controllers: [MedicationsController],
  providers: [MedicationsService, MedicationsTimelineProvider, MedicationsOfflineHandlers],
  exports: [MedicationsService],
})
export class MedicationsModule {}
