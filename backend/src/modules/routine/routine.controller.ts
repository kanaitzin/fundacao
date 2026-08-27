import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { RoutineService, RoutineItemInput } from './routine.service';

@Controller('routine')
@UseGuards(SessionGuard)
export class RoutineController {
  constructor(@Inject(RoutineService) private readonly routine: RoutineService) {}

  @Get()
  current(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.routine.current(user, houseId);
  }

  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.routine.history(user, houseId);
  }

  @Post('versions')
  newVersion(@CurrentUser() user: AuthenticatedUser,
             @Body() body: { houseId: string; motivo: string }) {
    return this.routine.newVersion(user, body.houseId, body.motivo);
  }

  @Post('versions/:id/items')
  addItem(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) versionId: string,
          @Body() body: RoutineItemInput & { houseId: string }) {
    return this.routine.addItem(user, body.houseId, versionId, body);
  }
}
