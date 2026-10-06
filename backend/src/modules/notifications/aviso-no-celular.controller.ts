import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { Assinatura, AvisoNoCelularService } from './aviso-no-celular.service';

/**
 * O aviso no celular (fase 189). Cada pessoa liga e desliga o do PRÓPRIO
 * aparelho; ninguém liga nem lê o de outra.
 */
@Controller('avisos-no-celular')
@UseGuards(SessionGuard)
export class AvisoNoCelularController {
  constructor(@Inject(AvisoNoCelularService) private readonly aviso: AvisoNoCelularService) {}

  /** Se a instalação tem o aviso ligado, e a chave pública para o navegador. */
  @Get('chave')
  chave() {
    return this.aviso.estadoDaInstalacao();
  }

  @Post()
  ligar(@CurrentUser() user: AuthenticatedUser, @Body() corpo: Assinatura) {
    return this.aviso.ligar(user, corpo);
  }

  @Post('estado')
  @HttpCode(200)
  estado(@CurrentUser() user: AuthenticatedUser, @Body() corpo: { endpoint?: unknown }) {
    return this.aviso.estado(user, corpo);
  }

  @Post('desligar')
  @HttpCode(200)
  desligar(@CurrentUser() user: AuthenticatedUser, @Body() corpo: { endpoint?: unknown; motivo?: unknown }) {
    return this.aviso.desligar(user, corpo);
  }
}
