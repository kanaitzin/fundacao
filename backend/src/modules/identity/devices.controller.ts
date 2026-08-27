import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from '../../kernel/contracts';
import { DevicesService } from './devices.service';

@Controller('devices')
@UseGuards(SessionGuard)
export class DevicesController {
  constructor(@Inject(DevicesService) private readonly devices: DevicesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.devices.list(user, houseId);
  }

  /** Devolve o código do aparelho UMA vez. Não há rota que o recupere depois. */
  @Post()
  register(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.devices.register(user, body);
  }

  @Post(':id/revoke')
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: any) {
    return this.devices.revoke(user, id, body?.motivo ?? '');
  }
}
