import { Module } from '@nestjs/common';
import { RelogioService } from './relogio.service';
import { MedicationsModule } from '../medications';
import { ActivitiesModule } from '../activities';
import { PeopleModule } from '../people';
import { IdentityModule } from '../identity';
import { ImplantacaoController } from './implantacao.controller';
import { ImplantacaoService } from './implantacao.service';

/**
 * O relógio não tem rota para RODAR: ninguém o chama por HTTP. A única rota
 * daqui é de LEITURA, a saúde da implantação (fase 185).
 *
 * Ele é invocado por `npm run relogio`, que roda NO SERVIDOR, pelo cron. Uma
 * rota exigiria uma credencial guardada em disco na máquina do agendador — e
 * uma credencial com alcance nas oito casas, capaz de gerar dose, é
 * exatamente o que não se deixa num `crontab`.
 */
@Module({
  imports: [IdentityModule, MedicationsModule, ActivitiesModule, PeopleModule],
  controllers: [ImplantacaoController],
  providers: [RelogioService, ImplantacaoService],
  exports: [RelogioService, ImplantacaoService],
})
export class RelogioModule {}
