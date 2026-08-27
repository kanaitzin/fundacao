import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { RoutineController } from './routine.controller';
import { RoutineService } from './routine.service';

/**
 * Módulo `routine` — o molde do dia da casa.
 *
 * Depende de: identity (sessão) e do kernel.
 * Ninguém depende dele em código: `activities` lê a rotina pelo BANCO, na
 * função `app_generate_day`, e não importa nada daqui. Assim a rotina pode
 * evoluir — ou ser substituída — sem tocar nas atividades.
 */
@Module({
  imports: [IdentityModule],
  controllers: [RoutineController],
  providers: [RoutineService],
  exports: [RoutineService],
})
export class RoutineModule {}
