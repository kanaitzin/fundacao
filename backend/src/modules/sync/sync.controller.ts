import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { SyncService, OfflineOp } from './sync.service';

@Controller('sync')
@UseGuards(SessionGuard)
export class SyncController {
  constructor(@Inject(SyncService) private readonly sync: SyncService) {}

  /** Envia a fila local acumulada offline. Reenvio é seguro (idempotente). */
  @Post('push')
  push(@CurrentUser() user: AuthenticatedUser, @Body() body: { operacoes: OfflineOp[] }) {
    return this.sync.push(user, body?.operacoes ?? []);
  }

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.sync.status(user);
  }

  @Get('conflicts')
  conflicts(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.sync.listConflicts(user, houseId);
  }

  @Post('conflicts/:id/resolve')
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
          @Body() body: { decisao: string }) {
    return this.sync.resolveConflict(user, id, body?.decisao ?? '');
  }
}
