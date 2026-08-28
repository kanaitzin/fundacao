import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';
import { DriveGateway } from './drive.gateway';

/**
 * Módulo `archive` — cópia documental no Google Shared Drive (§16).
 *
 * Depende só de `identity`. Nenhum módulo depende dele: quem fecha um
 * documento não precisa saber que existe arquivo. Remover esta pasta desliga
 * o arquivamento e não quebra ATA, ocorrência nem relatório.
 */
@Module({
  imports: [IdentityModule],
  controllers: [ArchiveController],
  providers: [ArchiveService, DriveGateway],
  exports: [ArchiveService],
})
export class ArchiveModule {}
