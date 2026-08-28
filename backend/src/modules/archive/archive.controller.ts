import {
  Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { ArchiveService } from './archive.service';

@Controller('archive')
@UseGuards(SessionGuard)
export class ArchiveController {
  constructor(@Inject(ArchiveService) private readonly archive: ArchiveService) {}

  /** Fila do arquivo — o que fechou e ainda não chegou ao Drive. */
  @Get('queue')
  fila(@CurrentUser() user: AuthenticatedUser, @Query('limite') limite?: string) {
    return this.archive.fila(user, Number(limite ?? 20));
  }

  @Get('reconcile')
  reconciliar(@CurrentUser() user: AuthenticatedUser,
              @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.archive.reconciliar(user, houseId);
  }

  @Post()
  enfileirar(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.archive.enfileirar(user, body);
  }

  @Post('process')
  processar(@CurrentUser() user: AuthenticatedUser, @Body() body: { limite?: number }) {
    return this.archive.processar(user, body?.limite ?? 5);
  }

  @Get(':id')
  item(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.archive.item(user, id);
  }
}
