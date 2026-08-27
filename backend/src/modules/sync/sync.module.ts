import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

/**
 * Módulo `sync` — fila offline, idempotência e conflitos (§17).
 *
 * Depende de: identity e kernel. NÃO conhece nenhum domínio: quem sabe aplicar
 * uma operação offline é o módulo dono dela, que se registra aqui
 * (`SyncService.registerHandler`). Um tipo sem dono registrado é recusado com
 * motivo claro, e a fila do aparelho não é descartada.
 */
@Module({
  imports: [IdentityModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
