import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { ChecksService } from './checks.service';

@Controller('checks')
@UseGuards(SessionGuard)
export class ChecksController {
  constructor(@Inject(ChecksService) private readonly checks: ChecksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser,
       @Query('houseId', ParseUUIDPipe) houseId: string, @Query('date') date?: string) {
    return this.checks.listDay(user, houseId, date ?? hojeNaInstituicao());
  }

  @Post()
  open(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.checks.open(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checks.get(user, id);
  }

  /** Marca UM acolhido — não existe marcação em lote (§10, §11.2). */
  @Post(':id/mark')
  mark(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
       @Body() body: any) {
    return this.checks.mark(user, id, body);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checks.confirm(user, id);
  }
}
