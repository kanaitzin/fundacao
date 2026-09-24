import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { ChecksService } from './checks.service';
import { DataDoDia } from '../../kernel/common/data-do-dia.pipe';

@Controller('checks')
@UseGuards(SessionGuard)
export class ChecksController {
  constructor(@Inject(ChecksService) private readonly checks: ChecksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser,
       @Query('houseId', ParseUUIDPipe) houseId: string, @Query('date', DataDoDia) date?: string) {
    return this.checks.listDay(user, houseId, date ?? hojeNaInstituicao());
  }

  @Post()
  open(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.checks.open(user, body);
  }

  /**
   * O vocabulário da chamada — tipos e opções. Palavra fixa antes de
   * `@Get(':id')`, que exige uuid.
   */
  @Get('kinds')
  kinds() { return this.checks.tipos(); }

  /**
   * A PRESENÇA DE UMA CRIANÇA — palavra fixa, e vem ANTES de `:id`.
   *
   * A chamada é coletiva, e o registro de cada criança ficava dentro dela: só
   * se sabia se a Alice esteve no almoço de terça abrindo a chamada daquele
   * almoço (§9, item 4). Isto é o mesmo dado, recortado pela vida dela.
   */
  @Get('person/:personId')
  presenca(@CurrentUser() user: AuthenticatedUser,
           @Param('personId', ParseUUIDPipe) personId: string,
           @Query('dias') dias?: string) {
    return this.checks.presencaDoAcolhido(user, personId, Number(dias) || 14);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checks.get(user, id);
  }

  /**
   * Marca UM acolhido. A marcação em lote SILENCIOSA continua não existindo
   * (§10, §11.2): o que existe é a conferência de mesa abaixo, que se declara.
   */
  @Post(':id/mark')
  mark(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
       @Body() body: any) {
    return this.checks.mark(user, id, body);
  }

  /**
   * A CONFERÊNCIA DE MESA (§10) — um ATO, gravado como um ato.
   *
   * Não é a "marcação em lote silenciosa" que a regra proíbe: o que ela proíbe
   * é preencher o que não foi olhado, e é por isso que este ato fica com nome,
   * horário e contagem próprios em `check_bulk`, e as linhas que nascem dele
   * apontam para ele. Quem lê um ano depois sabe a diferença.
   */
  @Post(':id/bulk')
  bulk(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checks.bulk(user, id);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checks.confirm(user, id);
  }
}
