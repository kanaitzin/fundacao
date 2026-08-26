import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { HousesService } from './houses.service';

@Controller('houses')
@UseGuards(SessionGuard)
export class HousesController {
  constructor(@Inject(HousesService) private readonly houses: HousesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.houses.list(user);
  }

  @Get(':id')
  open(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.houses.open(user, id);
  }
}
