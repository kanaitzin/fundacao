import {
  Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { AlignmentsService } from './alignments.service';

/**
 * O que a equipe combinou (§9.4).
 *
 * `GET /alignments` é aberto a quem alcança a casa — inclusive o educador e a
 * cozinha. Registrar é da equipe técnica e da coordenação, e o serviço recusa
 * de novo por baixo.
 */
@Controller('alignments')
@UseGuards(SessionGuard)
export class AlignmentsController {
  constructor(@Inject(AlignmentsService) private readonly alinhamentos: AlignmentsService) {}

  /** Palavra fixa, e por isso antes de qualquer rota com parâmetro. */
  @Get('kinds')
  tipos() { return this.alinhamentos.vocabulario(); }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser,
       @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.alinhamentos.list(user, houseId);
  }

  @Post('meetings')
  registrarReuniao(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.alinhamentos.registrarReuniao(user, body);
  }

  @Post('agreements')
  registrarCombinado(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.alinhamentos.registrarCombinado(user, body);
  }

  /** Cumprir, revogar ou substituir — sempre com motivo escrito. */
  @Post('agreements/:id/status')
  mudar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
        @Body() body: { situacao: string; motivo: string; substitutoId?: string }) {
    return this.alinhamentos.mudarSituacao(
      user, id, body?.situacao ?? '', body?.motivo ?? '', body?.substitutoId);
  }
}
