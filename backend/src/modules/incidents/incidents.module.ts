import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { StatementsModule } from '../statements';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { IncidentsTimelineProvider } from './incidents.timeline';

/**
 * Módulo `incidents` — ocorrências especiais e proteção (§13).
 * Depende de `identity` e de `statements` (relatos independentes).
 * Avisa líder, equipe técnica, coordenação e Enfermagem publicando o contrato
 * genérico de escalonamento — sem conhecer `notifications`.
 */
@Module({
  imports: [IdentityModule, StatementsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentsTimelineProvider],
  exports: [IncidentsService],
})
export class IncidentsModule {}
