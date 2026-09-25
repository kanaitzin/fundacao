import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { IncidentsService } from './incidents.service';
import { CorpoConferido } from '../../kernel/common/data-do-dia.pipe';

@Controller('incidents')
@UseGuards(SessionGuard)
export class IncidentsController {
  constructor(@Inject(IncidentsService) private readonly incidents: IncidentsService) {}

  @Get('catalog')
  catalog() { return this.incidents.catalogo(); }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser,
       @Query('houseId', ParseUUIDPipe) houseId: string,
       @Query('abertas') abertas?: string) {
    return this.incidents.list(user, houseId, abertas === 'true');
  }

  @Post()
  open(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.incidents.open(user, body);
  }

  // ---------- Comunicação externa (rotas fixas antes de :id) ----------
  // Não existe rota de envio. Procurar por ela é a forma mais rápida de
  // verificar o §13.6: não há POST que despache nada para fora.

  /* Os ofícios SOBRE uma criança (fase 118). Antes da lista da casa porque
     `communications/person/:id` cairia no `:id` de outra rota se viesse
     depois — e `person` é palavra literal, que o contrato-rotas exige. */
  @Get('communications/person/:personId')
  comunicacoesDoAcolhido(@CurrentUser() user: AuthenticatedUser,
                         @Param('personId', ParseUUIDPipe) personId: string) {
    return this.incidents.comunicacoesDoAcolhido(user, personId);
  }

  @Get('communications')
  listCommunications(@CurrentUser() user: AuthenticatedUser,
                     @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.incidents.listCommunications(user, houseId);
  }

  @Post('communications')
  createCommunication(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.incidents.createCommunication(user, body);
  }

  @Post('communications/:id/submit')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.submitCommunication(user, id);
  }

  @Post('communications/:id/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.approveCommunication(user, id);
  }

  @Post('communications/:id/delivery')
  delivery(@CurrentUser() user: AuthenticatedUser,
           @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.incidents.registerDelivery(user, id, body ?? {});
  }

  // ---------- Anexos ----------

  @Post('attachments/:id/open')
  openAttachment(@CurrentUser() user: AuthenticatedUser,
                 @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.incidents.openAttachment(user, id, body?.finalidade);
  }

  // ---------- Ocorrência ----------

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.get(user, id);
  }

  /**
   * A FOLHA DA OCORRÊNCIA — ver antes de baixar, e baixar o que se viu.
   *
   * A folha NÃO leva fala espontânea nem sinais observados (§13.2), estejam
   * eles visíveis ou não para quem pede: papel é fotocopiado, fica em cima de
   * uma mesa e vai por e-mail. Quem precisar do inteiro teor abre a ocorrência
   * e responde pelo acesso dela.
   */
  @Get(':id/folha')
  folha(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.folhaDaOcorrencia(user, id);
  }

  @Post(':id/export')
  exportar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
           @Body(CorpoConferido) body: { finalidade?: string }) {
    return this.incidents.exportar(user, id, body?.finalidade ?? '');
  }

  @Post(':id/protected')
  addProtected(@CurrentUser() user: AuthenticatedUser,
               @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.incidents.addProtected(user, id, body);
  }

  @Post(':id/restraint')
  addRestraint(@CurrentUser() user: AuthenticatedUser,
               @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.incidents.addRestraint(user, id, body);
  }

  @Post(':id/synthesis')
  addSynthesis(@CurrentUser() user: AuthenticatedUser,
               @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.incidents.addSynthesis(user, id, body?.texto ?? '');
  }

  @Post(':id/attachments')
  addAttachment(@CurrentUser() user: AuthenticatedUser,
                @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.incidents.addAttachment(user, id, body);
  }

  /** Encerra a ETAPA OPERACIONAL. Categoria crítica segue aguardando revisão. */
  @Post(':id/operational-close')
  closeOperational(@CurrentUser() user: AuthenticatedUser,
                   @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.incidents.closeOperational(user, id, body?.nota);
  }

  @Post(':id/review')
  review(@CurrentUser() user: AuthenticatedUser,
         @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.incidents.review(user, id, body?.decisao ?? 'validar', body?.nota);
  }
}
