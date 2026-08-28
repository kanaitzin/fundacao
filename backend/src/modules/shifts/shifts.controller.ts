import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { ShiftsService } from './shifts.service';

@Controller('shifts')
@UseGuards(SessionGuard)
export class ShiftsController {
  constructor(@Inject(ShiftsService) private readonly shifts: ShiftsService) {}

  /** Estrutura da ATA — a tela não inventa seções. */
  @Get('ata-sections')
  sections() { return this.shifts.secoes(); }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser,
       @Query('houseId', ParseUUIDPipe) houseId: string, @Query('date') date?: string) {
    return this.shifts.listDay(user, houseId, date ?? hojeNaInstituicao());
  }

  @Post()
  open(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.shifts.open(user, body);
  }

  // ---------- ATA Geral Noturna (rotas fixas antes de :id) ----------

  @Post('general-ata')
  openGeneral(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.shifts.openGeneral(user, body?.data);
  }

  @Get('general-ata/:id')
  getGeneral(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.getGeneral(user, id);
  }

  @Patch('general-ata/:id/house/:houseId')
  updateGeneralHouse(@CurrentUser() user: AuthenticatedUser,
                     @Param('id', ParseUUIDPipe) id: string,
                     @Param('houseId', ParseUUIDPipe) houseId: string,
                     @Body() body: any) {
    return this.shifts.updateGeneralHouse(user, id, houseId, body);
  }

  @Post('general-ata/:id/sign')
  closeGeneral(@CurrentUser() user: AuthenticatedUser,
               @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.shifts.closeGeneral(user, id, body?.pendencias);
  }

  // ---------- ATA da casa ----------

  @Patch('ata/:ataId')
  saveAta(@CurrentUser() user: AuthenticatedUser,
          @Param('ataId', ParseUUIDPipe) ataId: string, @Body() body: any) {
    return this.shifts.saveAta(user, ataId, body);
  }

  @Post('ata/:ataId/close')
  closeAta(@CurrentUser() user: AuthenticatedUser,
           @Param('ataId', ParseUUIDPipe) ataId: string, @Body() body: any) {
    return this.shifts.closeAta(user, ataId, body?.pendencias);
  }

  @Post('ata/:ataId/reopen')
  reopenAta(@CurrentUser() user: AuthenticatedUser,
            @Param('ataId', ParseUUIDPipe) ataId: string, @Body() body: any) {
    return this.shifts.reopenAta(user, ataId, body?.motivo ?? '');
  }

  @Post('ata/:ataId/amend')
  amendAta(@CurrentUser() user: AuthenticatedUser,
           @Param('ataId', ParseUUIDPipe) ataId: string, @Body() body: any) {
    return this.shifts.amendAta(user, ataId, body?.motivo ?? '', body?.conteudo ?? {});
  }

  @Get('ata/:ataId/addenda')
  addenda(@CurrentUser() user: AuthenticatedUser, @Param('ataId', ParseUUIDPipe) ataId: string) {
    return this.shifts.addenda(user, ataId);
  }

  @Post('ata/:ataId/episodes')
  addEpisode(@CurrentUser() user: AuthenticatedUser,
             @Param('ataId', ParseUUIDPipe) ataId: string, @Body() body: any) {
    return this.shifts.addEpisode(user, ataId, body);
  }

  @Post('episodes/:episodeId/ack')
  ackEpisode(@CurrentUser() user: AuthenticatedUser,
             @Param('episodeId', ParseUUIDPipe) episodeId: string, @Body() body: any) {
    return this.shifts.ackEpisode(user, episodeId, body?.comentario);
  }

  // ---------- Plantão ----------

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.get(user, id);
  }

  /** Assina a PRÓPRIA passagem. Não existe rota que assine por outro (§12.1). */
  @Post(':id/handover')
  sign(@CurrentUser() user: AuthenticatedUser,
       @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.shifts.signHandover(user, id, body);
  }

  /**
   * Complementa a PRÓPRIA passagem (§12.4). A passagem assinada não muda: o
   * complemento nasce ao lado dela, com hora própria.
   */
  @Post(':id/handover/note')
  complement(@CurrentUser() user: AuthenticatedUser,
             @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.shifts.complementHandover(user, id, body);
  }

  @Post(':id/receipt')
  receive(@CurrentUser() user: AuthenticatedUser,
          @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.shifts.receive(user, id, body);
  }
}
