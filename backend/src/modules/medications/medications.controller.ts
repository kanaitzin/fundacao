import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { MedicationsService, ALERTAS_MIN } from './medications.service';

@Controller('medications')
@UseGuards(SessionGuard)
export class MedicationsController {
  constructor(@Inject(MedicationsService) private readonly meds: MedicationsService) {}

  /** Grade do dia da casa. */
  @Get()
  grid(@CurrentUser() user: AuthenticatedUser,
       @Query('houseId', ParseUUIDPipe) houseId: string,
       @Query('date') date?: string,
       @Query('personId') personId?: string) {
    return this.meds.dayGrid(user, houseId, date ?? hojeNaInstituicao(), personId || undefined);
  }

  /** Horários dos alertas, para o aparelho agendar lembrete local offline (§17.5). */
  @Get('alert-offsets')
  alerts() {
    return {
      minutos: ALERTAS_MIN,
      descricao: '−30 e −15 antes, no horário e +30 sem confirmação (§11.3)',
    };
  }

  @Post('generate-doses')
  generate(@CurrentUser() user: AuthenticatedUser, @Body() body: { houseId: string; date?: string }) {
    return this.meds.generateDoses(user, body.houseId, body.date ?? hojeNaInstituicao());
  }

  @Get('can-administer')
  can(@CurrentUser() user: AuthenticatedUser,
      @Query('houseId', ParseUUIDPipe) houseId: string,
      @Query('periodo') periodo: 'diurno' | 'noturno' = 'diurno') {
    return this.meds.canAdminister(user, houseId, periodo);
  }

  /** Confirmação de UMA dose. Não existe rota que confirme várias (§11.2). */
  @Post('doses/:id/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
          @Body() body: any) {
    return this.meds.confirmDose(user, id, body);
  }

  @Post('escalate-overdue')
  overdue(@CurrentUser() user: AuthenticatedUser, @Body() body: { houseId: string; minutos?: number }) {
    return this.meds.escalateOverdue(user, body.houseId, body.minutos ?? 30);
  }

  // ---- Prescrição (Enfermagem) ----
  @Post('prescriptions')
  prescribe(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.meds.prescribe(user, body);
  }

  /**
   * OS ESQUEMAS DA CASA. Palavra fixa, e vem ANTES de `prescriptions/:id/*`.
   *
   * Não existia rota que listasse prescrições: um rascunho salvo e não
   * assinado ficava gravado e invisível, e não havia de onde suspender.
   */
  @Get('prescriptions')
  prescriptions(@CurrentUser() user: AuthenticatedUser,
                @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.meds.listPrescriptions(user, houseId);
  }

  /** Quem está nominalmente autorizado a administrar nesta casa (§11.3). */
  @Get('authorizations')
  authorizations(@CurrentUser() user: AuthenticatedUser,
                 @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.meds.listAuthorizations(user, houseId);
  }

  @Post('prescriptions/:id/sign')
  sign(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.meds.sign(user, id);
  }

  @Post('prescriptions/:id/suspend')
  suspend(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
          @Body() body: { motivo: string }) {
    return this.meds.suspend(user, id, body?.motivo ?? '');
  }

  // ---- Estoque ----
  @Get('stock')
  stock(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.meds.stock(user, houseId);
  }

  /**
   * `tipo` é obrigatório: 'entrada' soma o que chegou, 'contagem' substitui
   * pelo que foi conferido e exige motivo. Sem padrão — ver o comentário em
   * `MedicationsService.upsertStock`.
   */
  @Post('stock')
  upsertStock(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.meds.upsertStock(user, body);
  }

  @Post('stock/:id/flag-low')
  flagLow(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
          @Body() body: { baixo: boolean }) {
    return this.meds.flagLow(user, id, body?.baixo ?? true);
  }

  // ---- Protocolo: pendência institucional 33.4.1 como configuração ----
  @Get('protocol')
  protocol(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.meds.getProtocol(user, houseId);
  }

  @Post('protocol')
  setProtocol(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.meds.setProtocol(user, body);
  }

  /** Cada decisão sobre quem pode administrar, com o que valia antes (0860). */
  @Get('protocol-history')
  protocolHistory(@CurrentUser() user: AuthenticatedUser,
                  @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.meds.protocolHistory(user, houseId);
  }

  @Post('authorize-educator')
  authorize(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.meds.authorizeEducator(user, body);
  }
}
