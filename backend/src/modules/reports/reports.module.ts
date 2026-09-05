import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { FollowupsController, ReportsController, ImpactoController } from './reports.controller';
import { FollowupsService } from './followups.service';
import { ReportsService } from './reports.service';
import { ImpactoService } from './impacto.service';
import { PanelService } from './panel.service';
import { ConteudoService } from './conteudo.service';
import { DocumentoService } from './documento.service';

/**
 * Módulo `reports` — acompanhamentos, relatórios, aprovações e painéis (§14, §18).
 *
 * Depende de `identity`. NÃO depende de `archive`: quem fecha um documento
 * pede o arquivamento publicando um evento, e se o módulo de arquivo não
 * existir, o relatório continua existindo.
 */
@Module({
  imports: [IdentityModule],
  controllers: [FollowupsController, ReportsController, ImpactoController],
  providers: [FollowupsService, ReportsService, ImpactoService, PanelService,
    ConteudoService, DocumentoService],
  exports: [ReportsService, FollowupsService],
})
export class ReportsModule {}
