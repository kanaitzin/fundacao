import {
  Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { PeopleService } from './people.service';
import { ProfileService } from './profile.service';
import { BenefitsService } from './benefits.service';
import { TransfersService } from './transfers.service';

@Controller('people')
@UseGuards(SessionGuard)
export class PeopleController {
  constructor(
    @Inject(PeopleService) private readonly people: PeopleService,
    @Inject(ProfileService) private readonly profile: ProfileService,
    @Inject(BenefitsService) private readonly benefits: BenefitsService,
    @Inject(TransfersService) private readonly transfers: TransfersService,
  ) {}

  /** Visão da casa — “os 20”. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.people.listByHouse(user, houseId);
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

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: Record<string, string | null>) {
    return this.profile.updateDetail(user, id, body);
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
