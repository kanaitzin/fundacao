import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Módulo `notifications` — central, escalonamento e ciência (§19).
 *
 * Depende de: identity e kernel. Reage a eventos por NOME, nunca importando
 * quem os publica: remover este módulo silencia os avisos e não afeta mais nada.
 */
@Module({
  imports: [IdentityModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
