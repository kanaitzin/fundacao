import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { AssistenteService, PedidoDeConversa } from './assistente.service';

/**
 * A Acolhe+AI (fase 192). Toda rota pede sessão: a assistente fala com quem
 * entrou, e com o acesso de quem entrou.
 */
@Controller('assistente')
@UseGuards(SessionGuard)
export class AssistenteController {
  constructor(@Inject(AssistenteService) private readonly acolhe: AssistenteService) {}

  /** Se a instalação tem o modelo ligado. Sem ele, a tela responde pelo guia. */
  @Get('estado')
  estado() { return this.acolhe.estado(); }

  @Post('conversa')
  @HttpCode(200)
  conversar(@CurrentUser() user: AuthenticatedUser, @Body() corpo: PedidoDeConversa) {
    return this.acolhe.conversar(user, corpo);
  }

  /** A pessoa confirmou uma proposta, e a gravação deu certo: fica na auditoria. */
  @Post('preparado')
  @HttpCode(200)
  preparado(@CurrentUser() user: AuthenticatedUser,
            @Body() corpo: { acao?: unknown; entidadeId?: unknown; casaId?: unknown }) {
    return this.acolhe.registrarPreparado(user, corpo);
  }

  @Post('sugestoes')
  sugerir(@CurrentUser() user: AuthenticatedUser,
          @Body() corpo: { texto?: unknown; tela?: unknown; casaId?: unknown }) {
    return this.acolhe.sugerir(user, corpo);
  }

  @Get('sugestoes')
  sugestoes(@CurrentUser() user: AuthenticatedUser, @Query('houseId') casaId?: string) {
    return this.acolhe.sugestoes(user, casaId || undefined);
  }
}
