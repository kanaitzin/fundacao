import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';

/**
 * Módulo `statements` — relatos independentes (§12.2, §13.4).
 * Não conhece plantão nem ocorrência: recebe `entity`/`entityId` e guarda.
 * É o que permite remover qualquer um dos dois sem levar os relatos junto.
 */
@Module({
  imports: [IdentityModule],
  controllers: [StatementsController],
  providers: [StatementsService],
  exports: [StatementsService],
})
export class StatementsModule {}
