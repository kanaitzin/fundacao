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

  /**
   * A FOLHA DOS COMBINADOS — a que a equipe leva para o mural dela.
   *
   * Só os vigentes entram. Dentro do sistema o encerrado não some, porque
   * "mas ficou combinado que..." é uma discussão que só o registro encerra;
   * numa folha impressa ele viraria instrução em vigor.
   */
  @Get('folha')
  folha(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.alinhamentos.folhaDosCombinados(user, houseId);
  }

  @Post('export')
  exportar(@CurrentUser() user: AuthenticatedUser,
           @Body() body: { houseId: string; finalidade?: string }) {
    return this.alinhamentos.exportarCombinados(user, body?.houseId, body?.finalidade ?? '');
  }

  @Post('meetings')
  registrarReuniao(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.alinhamentos.registrarReuniao(user, body);
  }

  /* ---------------- O estatuto: regras de convivência (1150) ---------------- */
  @Get('statute')
  estatuto(@CurrentUser() user: AuthenticatedUser,
           @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.alinhamentos.estatuto(user, houseId);
  }

  @Post('statute')
  escreverEstatuto(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.alinhamentos.escreverEstatuto(user, body ?? {});
  }

  @Post('statute/:id/revoke')
  revogarEstatuto(@CurrentUser() user: AuthenticatedUser,
                  @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.alinhamentos.revogarEstatuto(user, id, body ?? {});
  }

  @Get('statute/folha')
  folhaDoEstatuto(@CurrentUser() user: AuthenticatedUser,
                  @Query('houseId', ParseUUIDPipe) houseId: string,
                  @Query('publico') publico?: string) {
    return this.alinhamentos.folhaDoEstatuto(user, houseId, publico ?? 'todos');
  }

  @Post('statute/export')
  exportarEstatuto(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.alinhamentos.exportarEstatuto(user, body ?? {});
  }

  /* ---------------- A pauta que o educador propõe (1140) ---------------- */
  @Get('agenda')
  pautas(@CurrentUser() user: AuthenticatedUser,
         @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.alinhamentos.pautas(user, houseId);
  }

  @Post('agenda')
  proporPauta(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.alinhamentos.proporPauta(user, body ?? {});
  }

  @Post('agenda/:id/answer')
  responderPauta(@CurrentUser() user: AuthenticatedUser,
                 @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.alinhamentos.responderPauta(user, id, body ?? {});
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
