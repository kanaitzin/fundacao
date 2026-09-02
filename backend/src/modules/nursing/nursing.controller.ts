import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { NursingService } from './nursing.service';
import { HealthSummaryService } from './health-summary.service';

@Controller('nursing')
@UseGuards(SessionGuard)
export class NursingController {
  constructor(
    @Inject(NursingService) private readonly nursing: NursingService,
    @Inject(HealthSummaryService) private readonly summary: HealthSummaryService,
  ) {}

  /** Painel da casa: todos os acolhidos, inclusive sem medicação prevista (§7.1). */
  @Get('panel')
  panel(@CurrentUser() user: AuthenticatedUser,
        @Query('houseId', ParseUUIDPipe) houseId: string,
        @Query('date') date?: string) {
    return this.nursing.panel(user, houseId, date ?? hojeNaInstituicao());
  }

  // ---- Evolução de Saúde (§7.2) ----
  @Post('evolutions')
  submit(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.nursing.submitEvolution(user, body);
  }

  @Get('triage')
  queue(@CurrentUser() user: AuthenticatedUser, @Query('houseId') houseId?: string) {
    return this.nursing.triageQueue(user, houseId || undefined);
  }

  @Post('evolutions/:id/triage')
  triage(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: any) {
    return this.nursing.triage(user, id, body);
  }

  @Get('history/:personId')
  history(@CurrentUser() user: AuthenticatedUser, @Param('personId', ParseUUIDPipe) personId: string) {
    return this.nursing.history(user, personId);
  }

  /**
   * A FOLHA DE SAÚDE — o que a Enfermagem leva para a consulta.
   *
   * Vem do MESMO histórico que a tela mostra: quem alcança o histórico alcança
   * a folha dele, e é o RLS de `history` que decide isso.
   */
  @Get('history/:personId/folha')
  folha(@CurrentUser() user: AuthenticatedUser, @Param('personId', ParseUUIDPipe) personId: string) {
    return this.nursing.folhaDeSaude(user, personId);
  }

  @Post('history/:personId/export')
  exportar(@CurrentUser() user: AuthenticatedUser,
           @Param('personId', ParseUUIDPipe) personId: string,
           @Body() body: { finalidade?: string }) {
    return this.nursing.exportarSaude(user, personId, body?.finalidade ?? '');
  }

  // ---- Resumo de Saúde (§7.4) ----
  @Post('summary/:personId')
  generate(@CurrentUser() user: AuthenticatedUser,
           @Param('personId', ParseUUIDPipe) personId: string, @Body() body: any) {
    return this.summary.generate(user, personId, body);
  }

  @Post('summary/issues/:id/download')
  download(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.summary.registerDownload(user, id);
  }

  @Get('summary/:personId/issues')
  issues(@CurrentUser() user: AuthenticatedUser, @Param('personId', ParseUUIDPipe) personId: string) {
    return this.summary.issues(user, personId);
  }
}
