import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { AlignmentsController } from './alignments.controller';
import { AlignmentsService } from './alignments.service';
import { EncontrosController } from './encontros.controller';
import { EncontrosService } from './encontros.service';

/**
 * Módulo `alignments` — o que a equipe combinou, escrito.
 *
 * Depende de: identity (sessão) e do kernel. Ninguém depende dele.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AlignmentsController, EncontrosController],
  providers: [AlignmentsService, EncontrosService],
  exports: [AlignmentsService, EncontrosService],
})
export class AlignmentsModule {}
