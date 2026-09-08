import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from '../../kernel/contracts';
import { EscalaService } from './escala.service';

/**
 * A ESCALA DA CASA — quem assume cada plantão (§5.12).
 *
 * Lê quem trabalha na casa: o educador precisa saber quando ele trabalha, e a
 * escala já é pública dentro da casa (ela vai pregada na parede). Monta a
 * coordenação da casa, e a gestão.
 */
@UseGuards(SessionGuard)
@Controller('escala')
export class EscalaController {
  constructor(private readonly escala: EscalaService) {}

  /* Palavra fixa ANTES de qualquer `:id` — a lição que o roteador já cobrou
   * duas vezes neste projeto, no servidor e no mock. */
  @Get('folha')
  folha(@CurrentUser() user: AuthenticatedUser,
        @Query('houseId', ParseUUIDPipe) houseId: string,
        @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.escala.folha(user, houseId, de, ate);
  }

  @Post('export')
  exportar(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.escala.exportar(user, body?.houseId, body?.finalidade ?? '', body?.de, body?.ate);
  }

  @Get()
  periodo(@CurrentUser() user: AuthenticatedUser,
          @Query('houseId', ParseUUIDPipe) houseId: string,
          @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.escala.periodo(user, houseId, de, ate);
  }

  @Post()
  escalar(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.escala.escalar(user, body);
  }

  @Post(':id/revogar')
  revogar(@CurrentUser() user: AuthenticatedUser,
          @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.escala.desescalar(user, id, body?.motivo);
  }
}
