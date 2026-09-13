import { Module } from '@nestjs/common';
import { RelogioService } from './relogio.service';
import { MedicationsModule } from '../medications';
import { ActivitiesModule } from '../activities';
import { PeopleModule } from '../people';

/**
 * O relógio não tem controlador: ninguém o chama por HTTP.
 *
 * Ele é invocado por `npm run relogio`, que roda NO SERVIDOR, pelo cron. Uma
 * rota exigiria uma credencial guardada em disco na máquina do agendador — e
 * uma credencial com alcance nas oito casas, capaz de gerar dose, é
 * exatamente o que não se deixa num `crontab`.
 */
@Module({
  imports: [MedicationsModule, ActivitiesModule, PeopleModule],
  providers: [RelogioService],
  exports: [RelogioService],
})
export class RelogioModule {}
