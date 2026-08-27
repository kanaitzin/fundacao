import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { HousesService } from './houses.service';

@Controller('houses')
@UseGuards(SessionGuard)
export class HousesController {
  constructor(@Inject(HousesService) private readonly houses: HousesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.houses.list(user);
  }

  /** Catálogo de unidades — para escolher destino de transferência (§15.6). */
  @Get('directory')
  directory(@CurrentUser() user: AuthenticatedUser) {
    return this.houses.directory(user);
  }

  @Get(':id')
  open(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.houses.open(user, id);
  }
}
