import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { SyncModule } from '../sync';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { ShiftsTimelineProvider } from './shifts.timeline';
import { ShiftsOfflineHandlers } from './shifts.offline';

/**
 * Módulo `shifts` — plantão, passagem individual e ATA (§12).
 * Depende de `identity` e `sync`. Avisa a equipe técnica publicando o
 * contrato genérico de escalonamento: não conhece `notifications`.
 */
@Module({
  imports: [IdentityModule, SyncModule],
  controllers: [ShiftsController],
  providers: [ShiftsService, ShiftsTimelineProvider, ShiftsOfflineHandlers],
  exports: [ShiftsService],
})
export class ShiftsModule {}
