import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from '../../kernel/contracts';
import { StaffService } from './staff.service';

/**
 * Equipe da casa (§5.3). Não existe rota de remoção: desligado é desativado.
 */
@Controller('staff')
@UseGuards(SessionGuard)
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get('sectors')
  sectors(@CurrentUser() user: AuthenticatedUser) {
    return this.staff.setores(user);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.staff.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.staff.create(user, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: any) {
    return this.staff.update(user, id, body);
  }

  @Post(':id/deactivate')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
             @Body() body: any) {
    return this.staff.setActive(user, id, false, body?.motivo);
  }

  @Post(':id/reactivate')
  reactivate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.setActive(user, id, true);
  }

  @Post(':id/reset-password')
  reset(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
        @Body() body: any) {
    return this.staff.resetPassword(user, id, body?.senha);
  }
}
