import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { AlignmentsController } from './alignments.controller';
import { AlignmentsService } from './alignments.service';

/**
 * Módulo `alignments` — o que a equipe combinou, escrito.
 *
 * Depende de: identity (sessão) e do kernel. Ninguém depende dele.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AlignmentsController],
  providers: [AlignmentsService],
  exports: [AlignmentsService],
})
export class AlignmentsModule {}
