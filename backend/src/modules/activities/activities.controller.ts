import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { ActivitiesService } from './activities.service';
import { AgendaService } from './agenda.service';

@Controller('activities')
@UseGuards(SessionGuard)
export class ActivitiesController {
  constructor(
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(AgendaService) private readonly agenda: AgendaService,
  ) {}

  // ---- Agenda da linha do tempo: marcar com data e hora, semanas à frente ----

  /** Tipos, repetições e dias da semana — a tela não inventa a lista. */
  @Get('agenda/options')
  opcoesAgenda() { return this.agenda.opcoes(); }

  /** Projeção de um período: o que cai em cada dia, sem materializar nada. */
  @Get('agenda')
  verAgenda(@CurrentUser() user: AuthenticatedUser,
            @Query('houseId', ParseUUIDPipe) houseId: string,
            @Query('de') de: string, @Query('ate') ate: string,
            @Query('personId') personId?: string) {
    return this.agenda.agenda(user, houseId, de ?? hojeNaInstituicao(),
      ate ?? hojeNaInstituicao(), personId || undefined);
  }

  /** Compromissos vigentes da casa — para revisar o que continua marcado. */
  @Get('agenda/commitments')
  compromissos(@CurrentUser() user: AuthenticatedUser,
               @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.agenda.vigentes(user, houseId);
  }

  @Post('agenda')
  marcar(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.agenda.marcar(user, body);
  }

  @Post('agenda/generate')
  materializar(@CurrentUser() user: AuthenticatedUser,
               @Body() body: { houseId: string; date?: string }) {
    return this.agenda.gerarDoDia(user, body.houseId, body.date);
  }

  @Post('agenda/:id/cancel')
  encerrar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
           @Body() body: { motivo: string }) {
    return this.agenda.cancelar(user, id, body?.motivo ?? '');
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser,
       @Query('houseId', ParseUUIDPipe) houseId: string,
       @Query('date') date?: string,
       @Query('personId') personId?: string,
       @Query('mine') mine?: string) {
    return this.activities.listDay(user, houseId, date ?? hojeNaInstituicao(), {
      personId: personId || undefined, onlyMine: mine === 'true',
    });
  }

  @Post('generate-day')
  generate(@CurrentUser() user: AuthenticatedUser, @Body() body: { houseId: string; date?: string }) {
    return this.activities.generateDay(user, body.houseId, body.date ?? hojeNaInstituicao());
  }

  @Post('urgent')
  urgent(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.activities.createUrgent(user, body);
  }

  // Comandos específicos, não update genérico (§25)
  @Post(':id/acknowledge')
  ack(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
      @Body() body: { device?: string; offline?: boolean }) {
    return this.activities.acknowledge(user, id, body ?? {});
  }

  @Post(':id/record')
  record(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: any) {
    return this.activities.record(user, id, body);
  }

  @Post(':id/substitution')
  substitution(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
               @Body() body: { motivo: string }) {
    return this.activities.requestSubstitution(user, id, body?.motivo ?? '');
  }

  @Get('substitutions')
  subs(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.activities.listSubstitutions(user, houseId);
  }

  @Post('substitutions/:id/assign')
  assign(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: { substitutoId: string; nota?: string }) {
    return this.activities.assignSubstitute(user, id, body.substitutoId, body.nota);
  }

  @Post('mark-unconfirmed')
  unconfirmed(@CurrentUser() user: AuthenticatedUser,
              @Body() body: { houseId: string; minutos?: number }) {
    return this.activities.markUnconfirmed(user, body.houseId, body.minutos ?? 60);
  }
}
