import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { ShiftsService } from './shifts.service';
import { DataDoDia } from '../../kernel/common/data-do-dia.pipe';

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

  /**
   * O ARQUIVO DAS ATAS — o livro folheado para trás, por dia, semana ou mês.
   *
   * Fica ANTES de `@Get(':id')`, como as demais rotas de palavra fixa: o Nest
   * casa na ordem de declaração, e `ata-archive` cairia em `:id` — que exige
   * uuid e devolveria erro de formato em vez da tela.
   */
  /**
   * O PEDIDO DE LEITURA DA OBSERVAÇÃO RESTRITA (1540).
   *
   * Palavras fixas, e por isso antes de `@Get(':id')` — "ata-read-requests"
   * cairia no `:id`, que exige uuid, e a tela receberia erro de formato.
   */
  @Get('ata-read-requests')
  pedidosDeLeitura(@CurrentUser() user: AuthenticatedUser,
                   @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.shifts.pedidosDeLeitura(user, houseId);
  }

  @Post('ata/:ataId/read-request')
  pedirLeitura(@CurrentUser() user: AuthenticatedUser,
               @Param('ataId', ParseUUIDPipe) ataId: string, @Body() body: any) {
    return this.shifts.pedirLeituraDaAta(user, ataId, body?.motivo ?? '');
  }

  @Post('ata-read-requests/:id/decide')
  decidirLeitura(@CurrentUser() user: AuthenticatedUser,
                 @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.shifts.decidirLeituraDaAta(user, id, body?.liberar, body?.motivo ?? '');
  }

  @Post('ata-read-requests/:id/revoke')
  revogarLeitura(@CurrentUser() user: AuthenticatedUser,
                 @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.shifts.revogarLeituraDaAta(user, id, body?.motivo ?? '');
  }

  @Get('ata-archive')
  archive(@CurrentUser() user: AuthenticatedUser,
          @Query('houseId', ParseUUIDPipe) houseId: string,
          @Query('escala') escala?: string,
          @Query('data', DataDoDia) data?: string) {
    const janela = escala === 'semana' || escala === 'mes' ? escala : 'dia';
    return this.shifts.arquivo(user, houseId, janela, data ?? hojeNaInstituicao());
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

  /**
   * A correção da linha desta casa, PELA DATA (1440).
   *
   * Caminho próprio, e não `general-ata/:id/...`, porque o id da folha das oito
   * casas não deve sair do servidor para quem só corrige a linha da casa dele —
   * com ele em mãos, a linha das outras sete está a uma chamada de distância.
   */
  @Patch('general-night-line/:data/house/:houseId')
  corrigirLinhaPelaData(@CurrentUser() user: AuthenticatedUser,
                        @Param('data', DataDoDia) data: string,
                        @Param('houseId', ParseUUIDPipe) houseId: string,
                        @Body() body: any) {
    return this.shifts.updateGeneralHouseByDate(user, data, houseId, body);
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

  /**
   * A FOLHA DA ATA — ver antes de baixar, e baixar o que se viu.
   *
   * `folha` monta a estrutura e não gera arquivo nenhum: ver não é exportar,
   * e por isso não pede finalidade nem registra saída. `export` gera o .docx
   * a partir da MESMA folha, exige a finalidade escrita e registra a saída
   * com o nome de quem pediu.
   *
   * Até 02/09/2026 as duas coisas aconteciam no navegador. O documento saía
   * certo e o sistema ficava sem resposta para a pergunta que importa meses
   * depois: quem tirou esta cópia daqui, e para quê?
   */
  @Get(':id/folha')
  folha(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.folhaDoPlantao(user, id);
  }

  @Post(':id/export')
  exportar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
           @Body() body: { finalidade?: string }) {
    return this.shifts.exportarAta(user, id, body?.finalidade ?? '');
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

  /**
   * A ATA do turno ANTERIOR — palavra fixa, e por isso antes do `@Get(':id')`.
   * É a porta que faltava para "todos leem a ATA do turno anterior" (0970).
   */
  @Get('anterior')
  anterior(@CurrentUser() user: AuthenticatedUser,
           @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.shifts.anterior(user, houseId);
  }

  @Post('ata/:ataId/notes')
  escrever(@CurrentUser() user: AuthenticatedUser,
           @Param('ataId', ParseUUIDPipe) ataId: string, @Body() body: any) {
    return this.shifts.escreverNaAta(user, ataId, body);
  }

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
