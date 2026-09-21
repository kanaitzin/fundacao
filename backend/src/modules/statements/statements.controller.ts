import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { StatementsService } from './statements.service';

@Controller('statements')
@UseGuards(SessionGuard)
export class StatementsController {
  constructor(@Inject(StatementsService) private readonly statements: StatementsService) {}

  /** Opções de testemunho (§12.2) — a tela não inventa a sua lista. */
  @Get('options')
  options() { return this.statements.opcoes(); }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.statements.create(user, body);
  }

  /** Relatos de um fato: ?entity=handover&entityId=... */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser,
       @Query('entity') entity: string,
       @Query('entityId', ParseUUIDPipe) entityId: string) {
    return this.statements.listFor(user, entity, entityId);
  }

  /**
   * Leitura excepcional com finalidade (§26.2 #29). Não existe variante
   * sem finalidade: o parâmetro é a própria condição de acesso.
   */
  /**
   * As cobranças de relato desta pessoa — o que o turno deixou pendente.
   *
   * Rota própria e não um campo do Dia: a cobrança sobrevive ao turno em que
   * nasceu, e quem responde amanhã de manhã não abre o Dia de ontem.
   */
  @Get('requests')
  minhasCobrancas(@CurrentUser() user: AuthenticatedUser) {
    return this.statements.minhasCobrancas(user);
  }

  /** Quem respondeu e quem falta. Nome e estado; nunca o texto dos outros. */
  /* ParseUUIDPipe: sem ele, um id que não é UUID chega ao Postgres e volta
     500 com a mensagem dele. A varredura de cargos pega isso — e pegou. */
  /*
   * `incident` é segmento FIXO, não `:entidade`.
   *
   * A tabela continua genérica — é o que permite remover o módulo de
   * ocorrências sem levar as cobranças junto. A ROTA é específica porque uma
   * palavra literal caindo num :param do servidor é falha silenciosa: o
   * conferidor de contrato pegou isto, e estava certo. Quando houver cobrança
   * de outro contexto, nasce outra rota.
   */
  @Get('requests/incident/:id')
  cobrancasDa(@CurrentUser() user: AuthenticatedUser,
              @Param('id', ParseUUIDPipe) id: string) {
    return this.statements.cobrancasDa(user, 'incident', id);
  }

  /**
   * O que se escreveu SOBRE esta criança (1360).
   *
   * `person` é segmento FIXO antes do id, e não `:id`, pela mesma razão que a
   * `requests/incident/:id`: palavra literal caindo num `:param` é falha
   * silenciosa, e o conferidor de contrato já pegou isso uma vez.
   *
   * Quem alcança lê; quem não alcança recebe a CONTAGEM dos restritos — nem
   * data, nem autor. É a decisão do §10 item 6, de 20/09.
   */
  @Get('person/:personId')
  porPessoa(@CurrentUser() user: AuthenticatedUser,
            @Param('personId', ParseUUIDPipe) personId: string) {
    return this.statements.porPessoa(user, personId);
  }

  @Post(':id/exceptional-read')
  exceptional(@CurrentUser() user: AuthenticatedUser,
              @Param('id', ParseUUIDPipe) id: string,
              @Body() body: { finalidade: string }) {
    return this.statements.readExceptional(user, id, body?.finalidade ?? '');
  }
}
