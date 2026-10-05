import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { ImplantacaoService } from './implantacao.service';

/**
 * A leitura da saúde da implantação (fase 185). O relógio continua sem rota
 * para RODAR — isso fica no cron, sem credencial guardada —; esta rota só lê
 * o que ele e os outros anotaram.
 */
@Controller('implantacao')
@UseGuards(SessionGuard)
export class ImplantacaoController {
  constructor(@Inject(ImplantacaoService) private readonly implantacao: ImplantacaoService) {}

  @Get('saude')
  saude(@CurrentUser() user: AuthenticatedUser) {
    return this.implantacao.saude(user);
  }
}
