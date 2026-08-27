import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { StatementsService } from './statements.service';

@Controller('statements')
@UseGuards(SessionGuard)
export class StatementsController {
  constructor(@Inject(StatementsService) private readonly statements: StatementsService) {}

  /** Opções de testemunho (§12.2) — a tela não inventa a sua lista. */
  @Get('options')
  options() { return this.statements.opcoes(); }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.statements.create(user, body);
  }

  /** Relatos de um fato: ?entity=handover&entityId=... */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser,
       @Query('entity') entity: string,
       @Query('entityId', ParseUUIDPipe) entityId: string) {
    return this.statements.listFor(user, entity, entityId);
  }

  /**
   * Leitura excepcional com finalidade (§26.2 #29). Não existe variante
   * sem finalidade: o parâmetro é a própria condição de acesso.
   */
  @Post(':id/exceptional-read')
  exceptional(@CurrentUser() user: AuthenticatedUser,
              @Param('id', ParseUUIDPipe) id: string,
              @Body() body: { finalidade: string }) {
    return this.statements.readExceptional(user, id, body?.finalidade ?? '');
  }
}
