import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { CorpoConferido } from '../../kernel/common/data-do-dia.pipe';
import { CasaConferidaNoServico } from '../../kernel/common/casa-da-consulta.interceptor';
import { FuncionarioDoMesService } from './funcionario-do-mes.service';

/**
 * O funcionário do mês (fase 324). Ler é de quem trabalha na casa (e da Fundação, de
 * todos); escolher é da coordenação da casa e da Coordenação Geral. O banco recusa de novo.
 */
@Controller('alignments/funcionario-do-mes')
@UseGuards(SessionGuard)
export class FuncionarioDoMesController {
  constructor(@Inject(FuncionarioDoMesService) private readonly doMes: FuncionarioDoMesService) {}

  @CasaConferidaNoServico('a cozinha e a portaria leem o funcionário do mês da casa delas, e o app_house_in_scope diz não a elas; o serviço confere pelo app_le_o_do_mes e responde 404 fora do alcance')
  @Get()
  ler(@CurrentUser() user: AuthenticatedUser, @Query('houseId') houseId?: string) {
    return this.doMes.ler(user, houseId || null);
  }

  @CasaConferidaNoServico('quem escolhe é conferido pelo app_escolhe_o_do_mes, e fora do alcance é 403 com a frase')
  @Get('candidatos')
  candidatos(@CurrentUser() user: AuthenticatedUser, @Query('houseId') houseId?: string) {
    return this.doMes.candidatos(user, houseId || null);
  }

  @Post()
  escolher(@CurrentUser() user: AuthenticatedUser, @Body(CorpoConferido) body: any) {
    return this.doMes.escolher(user, body ?? {});
  }
}
