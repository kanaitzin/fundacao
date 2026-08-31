import { Controller, Get, Inject, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { TimelineService, TimelineMode } from './timeline.service';

@Controller('timeline')
@UseGuards(SessionGuard)
export class TimelineController {
  constructor(@Inject(TimelineService) private readonly timeline: TimelineService) {}

  /**
   * Todas as unidades que a pessoa alcança, num dia só (§9).
   *
   * Vem ANTES da rota sem sufixo de propósito: o Nest casa as rotas na ordem
   * em que são declaradas, e `/timeline` com query casaria antes de `/all`.
   */
  @Get('all')
  todas(@CurrentUser() user: AuthenticatedUser,
        @Query('date') date?: string,
        @Query('mode') mode?: TimelineMode) {
    return this.timeline.dayAllHouses(user, { date: date ?? hojeNaInstituicao(), mode });
  }

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
