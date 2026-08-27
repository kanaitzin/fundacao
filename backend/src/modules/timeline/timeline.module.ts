import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';

/**
 * Módulo `timeline` — o ponto de encontro do sistema.
 *
 * Depende de: identity (sessão) e do kernel (registro de provedores).
 * NÃO depende de nenhum módulo de domínio — e o teste de fronteiras falha se
 * alguém tentar acrescentar um. É essa ausência de dependências que permite
 * adicionar ou remover módulos sem quebrar a tela mais usada do plantão.
 */
@Module({
  imports: [IdentityModule],
  controllers: [TimelineController],
  providers: [TimelineService],
  exports: [TimelineService],
})
export class TimelineModule {}
