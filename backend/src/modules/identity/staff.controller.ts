import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from '../../kernel/contracts';
import { StaffService } from './staff.service';
import { ALCANCE_POR_CARGO } from './alcance';
import { InviteService } from './invite.service';

/**
 * Equipe da casa (§5.3). Não existe rota de remoção: desligado é desativado.
 */
@Controller('staff')
@UseGuards(SessionGuard)
export class StaffController {
  constructor(
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(InviteService) private readonly convite: InviteService,
  ) {}

  /**
   * O que cada setor enxerga — a resposta escrita (§8.3).
   *
   * A leitura é aberta a quem administra equipe e a quem responde pela casa:
   * a pergunta "o educador vê isso?" é da coordenação, e respondê-la trocando
   * de conta é o que o §2 proíbe. Não há dado de acolhido aqui: é a descrição
   * do sistema, não conteúdo do acolhimento.
   */
  @Get('alcance')
  alcance() { return { cargos: ALCANCE_POR_CARGO }; }

  @Get('sectors')
  sectors(@CurrentUser() user: AuthenticatedUser) {
    return this.staff.setores(user);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.staff.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.staff.create(user, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: any) {
    return this.staff.update(user, id, body);
  }

  /**
   * A cor da linha desta pessoa na ATA e nos registros.
   *
   * `GET` primeiro, para a tela não oferecer o que o servidor recusa: a fase 75
   * achou o contrário disto noutra tela — a opção aparecia e a recusa vinha
   * depois do clique.
   */
  @Get('line-colors')
  coresEmUso(@CurrentUser() user: AuthenticatedUser, @Query('houseId') houseId: string) {
    return this.staff.coresEmUso(user, houseId);
  }

  @Patch(':id/line-color')
  definirCor(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
             @Body() body: { cor: string | null }) {
    return this.staff.definirCor(user, id, body?.cor ?? null);
  }

  @Post(':id/deactivate')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
             @Body() body: any) {
    return this.staff.setActive(user, id, false, body?.motivo);
  }

  @Post(':id/reactivate')
  reactivate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.setActive(user, id, true);
  }

  /**
   * Convidar para o primeiro acesso. Preferível ao reset-password: a senha
   * não passa pela mão de quem convida, e o link vence em 24 horas.
   */
  @Post(':id/convite')
  convidar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.convite.convidar(user, id);
  }

  @Post(':id/reset-password')
  reset(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
        @Body() body: any) {
    return this.staff.resetPassword(user, id, body?.senha);
  }
}
