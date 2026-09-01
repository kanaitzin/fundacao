import {
  Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { DossieService } from './dossie.service';
import { PeopleService } from './people.service';
import { ProfileService } from './profile.service';
import { BenefitsService } from './benefits.service';
import { TransfersService } from './transfers.service';
import { AdmissionService } from './admission.service';
import { CredentialsService } from './credentials.service';

@Controller('people')
@UseGuards(SessionGuard)
export class PeopleController {
  constructor(
    @Inject(PeopleService) private readonly people: PeopleService,
    @Inject(ProfileService) private readonly profile: ProfileService,
    @Inject(BenefitsService) private readonly benefits: BenefitsService,
    @Inject(TransfersService) private readonly transfers: TransfersService,
    @Inject(AdmissionService) private readonly admission: AdmissionService,
    @Inject(CredentialsService) private readonly credentials: CredentialsService,
    @Inject(DossieService) private readonly dossie: DossieService,
  ) {}

  /** Visão da casa — “os 20”. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.people.listByHouse(user, houseId);
  }

  /**
   * Acervo histórico da casa (§15.2) — quem saiu, e por onde se registra o
   * retorno. Palavra fixa, declarada antes de `@Get(':id')`.
   */
  @Get('archive')
  archive(@CurrentUser() user: AuthenticatedUser,
          @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.people.acervo(user, houseId);
  }

  /** Verificação obrigatória antes de qualquer cadastro (§6.1). */
  @Post('check-cpf')
  checkCpf(@CurrentUser() user: AuthenticatedUser, @Body() body: { cpf: string }) {
    return this.people.checkCpf(user, body.cpf ?? '');
  }

  @Post()
  admit(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.people.admit(user, body);
  }

  // ---- Cadastro completo (§6.1, §13.1) ----

  /** Listas fechadas do formulário: motivos, órgãos e tipos de medida. */
  @Get('admission/options')
  admissionOptions() {
    return this.admission.opcoes();
  }

  @Post('admission')
  admitFull(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.admission.admitFull(user, {
      houseId: body?.houseId,
      pessoa: body?.pessoa ?? {},
      acolhimento: body?.acolhimento ?? {},
      judicial: body?.judicial ?? {},
    });
  }

  @Get(':id/admission')
  acolhimento(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admission.acolhimento(user, id);
  }

  /** Área restrita: motivo do acolhimento, guia, processo e vara (§13.1). */
  @Get(':id/judicial')
  judicial(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admission.judicial(user, id);
  }

  @Patch(':id/judicial')
  judicialUpdate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
                 @Body() body: Record<string, string | null>) {
    return this.admission.atualizarJudicial(user, id, body ?? {});
  }

  @Post(':id/readmit')
  readmit(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
          @Body() body: { houseId: string }) {
    return this.people.readmit(user, id, body.houseId);
  }

  @Post(':id/discharge')
  discharge(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
            @Body() body: { motivo: string }) {
    return this.people.discharge(user, id, body.motivo);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.profile.get(user, id);
  }

  /**
   * CORRIGIR A IDENTIFICAÇÃO (§6.2) — comando próprio, não update genérico.
   *
   * `PATCH :id` abaixo atualiza o que é DESCRIÇÃO (escola, cuidados) e não
   * pede motivo. Nome e data de nascimento são outra coisa: são a identidade
   * da criança nos papéis, e mudá-los exige motivo e deixa histórico legível.
   */
  @Post(':id/corrigir-identificacao')
  corrigir(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
           @Body() body: any) {
    return this.profile.corrigirIdentificacao(user, id, body ?? {});
  }

  @Get(':id/correcoes')
  correcoes(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.profile.correcoes(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: Record<string, string | null>) {
    return this.profile.updateDetail(user, id, body);
  }

  // ---- O dossiê do acolhido (§6.1) e o álbum de vivências (§6.9) ----
  // `catalogo` é palavra fixa e vem ANTES de `:id`, que exige uuid.

  @Get('dossie/catalogo')
  catalogo() { return this.dossie.catalogo(); }

  @Get(':id/dossie')
  dossieDo(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.dossie.dossie(user, id);
  }

  @Post(':id/documents')
  anexar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: any) {
    return this.dossie.anexar(user, id, body);
  }

  /** O ACEITE — de quem olhou a prévia. Anexar não confere. */
  @Post(':id/documents/:docId/accept')
  aceitar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
          @Param('docId', ParseUUIDPipe) docId: string, @Body() body: any) {
    return this.dossie.aceitar(user, id, docId, body?.nota);
  }

  /** Os bytes, para a prévia. Cada abertura vira registro (§20). */
  @Get(':id/documents/:docId/file')
  arquivoDo(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
            @Param('docId', ParseUUIDPipe) docId: string) {
    return this.dossie.arquivo(user, id, docId);
  }

  @Get(':id/memories')
  vivencias(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.dossie.vivencias(user, id);
  }

  @Post(':id/memories')
  registrarVivencia(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
                    @Body() body: any) {
    return this.dossie.registrarVivencia(user, id, body);
  }

  @Get(':id/memories/:memId/file')
  fotoDaVivencia(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
                 @Param('memId', ParseUUIDPipe) memId: string) {
    return this.dossie.foto(user, id, memId);
  }

  @Get(':id/documents/:docId')
  openDoc(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
          @Param('docId', ParseUUIDPipe) docId: string) {
    return this.profile.openDocument(user, id, docId);
  }

  // ---- Benefícios: comandos específicos, nunca update genérico (§25) ----
  @Post(':id/benefits/view')
  benefitsView(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
               @Body() body: { finalidade: string }) {
    return this.benefits.list(user, id, body.finalidade ?? '');
  }

  @Post(':id/benefits')
  benefitsUpsert(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
                 @Body() body: any) {
    return this.benefits.upsert(user, id, body);
  }

  // ---- Cofre de acessos do acolhido (§6.10) ----
  // Só a coordenação da casa. Cada abertura exige finalidade e fica registrada.

  @Get('credentials/kinds')
  tiposCredencial() { return this.credentials.tipos(); }

  @Post(':id/credentials/view')
  credenciais(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.credentials.listar(user, id);
  }

  @Post(':id/credentials')
  guardarCredencial(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
                    @Body() body: any) {
    return this.credentials.guardar(user, id, body);
  }

  /** Abrir uma senha: devolve uma vez, com finalidade, e registra antes. */
  @Post(':id/credentials/:credId/reveal')
  revelarCredencial(@CurrentUser() user: AuthenticatedUser,
                    @Param('id', ParseUUIDPipe) id: string,
                    @Param('credId', ParseUUIDPipe) credId: string,
                    @Body() body: { finalidade: string }) {
    return this.credentials.revelar(user, credId, body?.finalidade ?? '');
  }

  @Post(':id/credentials/history')
  historicoCredencial(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.credentials.historico(user, id);
  }

  @Post(':id/benefits/export')
  benefitsExport(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
                 @Body() body: { formato: string; finalidade: string }) {
    return this.benefits.export(user, id, body.formato ?? 'pdf', body.finalidade ?? '');
  }
}

@Controller('transfers')
@UseGuards(SessionGuard)
export class TransfersController {
  constructor(@Inject(TransfersService) private readonly transfers: TransfersService) {}

  @Post()
  request(@CurrentUser() user: AuthenticatedUser,
          @Body() body: { personId: string; toHouseId: string; reason: string }) {
    return this.transfers.request(user, body);
  }

  /** Recebidas: o que outras casas pediram a esta. */
  @Get('inbox')
  inbox(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.transfers.inbox(user, houseId);
  }

  /** Da casa: o que esta casa pediu, com a resposta que veio. */
  @Get('outbox')
  outbox(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.transfers.outbox(user, houseId);
  }

  @Get('pending')
  pending(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.transfers.pendingFor(user, houseId);
  }

  /** Conversa entre as duas coordenações sobre a solicitação (§3.3: no sistema). */
  @Get(':id/messages')
  messages(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.messages(user, id);
  }

  @Post(':id/messages')
  sendMessage(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
              @Body() body: { casaId: string; texto: string }) {
    return this.transfers.sendMessage(user, id, body);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: { motivo: string }) {
    return this.transfers.cancel(user, id, body?.motivo ?? '');
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: { nota?: string }) {
    return this.transfers.accept(user, id, body?.nota);
  }

  @Post(':id/decline')
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
          @Body() body: { motivo: string }) {
    return this.transfers.decline(user, id, body?.motivo ?? '');
  }
}

@Controller('reports')
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(@Inject(ProfileService) private readonly profile: ProfileService) {}

  /** Relatório mínimo de alimentação — sem CPF, diagnóstico ou caso (§7). */
  @Get('kitchen')
  kitchen(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.profile.kitchenReport(user, houseId);
  }
}
