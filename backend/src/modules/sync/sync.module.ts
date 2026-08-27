import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncHandlers } from './sync.handlers';

/**
 * Módulo `sync` — fila offline, idempotência e conflitos (§17).
 * Depende de: identity e kernel. Aplica operações por comando no banco,
 * sem importar módulos de domínio.
 */
@Module({
  imports: [IdentityModule],
  controllers: [SyncController],
  providers: [SyncService, SyncHandlers],
  exports: [SyncService],
})
export class SyncModule {}
