import { Controller, Get, Inject, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { TimelineService, TimelineMode } from './timeline.service';

@Controller('timeline')
@UseGuards(SessionGuard)
export class TimelineController {
  constructor(@Inject(TimelineService) private readonly timeline: TimelineService) {}

  /** Modos do §9: casa (todos), minhas responsabilidades, acolhido individual. */
  @Get()
  day(@CurrentUser() user: AuthenticatedUser,
      @Query('houseId', ParseUUIDPipe) houseId: string,
      @Query('date') date?: string,
      @Query('mode') mode?: TimelineMode,
      @Query('personId') personId?: string) {
    return this.timeline.day(user, { houseId, date: date ?? hojeNaInstituicao(), mode, personId });
  }

  /** Painel da Casa — visão dos 20 (§9). */
  @Get('house-panel')
  panel(@CurrentUser() user: AuthenticatedUser,
        @Query('houseId', ParseUUIDPipe) houseId: string,
        @Query('date') date?: string) {
    return this.timeline.housePanel(user, houseId, date ?? hojeNaInstituicao());
  }
}
