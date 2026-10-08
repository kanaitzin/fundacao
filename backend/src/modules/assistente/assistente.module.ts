import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { AssistenteController } from './assistente.controller';
import { AssistenteService } from './assistente.service';

/**
 * Módulo `assistente` — a Acolhe+AI (fase 192).
 *
 * Depende só de identity e do kernel. Não importa nenhum outro módulo: ela lê
 * o sistema pela tela de quem conversa, nunca por dentro (ferramentas.ts).
 */
@Module({
  imports: [IdentityModule],
  controllers: [AssistenteController],
  providers: [AssistenteService],
  exports: [AssistenteService],
})
export class AssistenteModule {}
