import {
  Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
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

  /** Ocupação e limite da unidade. */
  @Get(':id/occupancy')
  occupancy(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.houses.occupancy(user, id);
  }

  @Get(':id/capacity-history')
  capacityHistory(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.houses.capacityHistory(user, id);
  }

  @Post(':id/capacity')
  setCapacity(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
              @Body() body: { capacidade: number; motivo: string }) {
    return this.houses.setCapacity(user, id, Number(body?.capacidade), body?.motivo ?? '');
  }

  @Get(':id')
  open(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.houses.open(user, id);
  }
}
