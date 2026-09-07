import {
  Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { FollowupsService } from './followups.service';
import { ReportsService } from './reports.service';
import { ImpactoService } from './impacto.service';
import { PanelService } from './panel.service';

@Controller('followups')
@UseGuards(SessionGuard)
export class FollowupsController {
  constructor(@Inject(FollowupsService) private readonly fu: FollowupsService) {}

  /** Eixos obrigatórios (§14.3). */
  @Get('axes')
  eixos() { return this.fu.eixos(); }

  /** A automação cria a pendência; o texto continua humano (§14.1). */
  @Post('generate')
  gerar(@CurrentUser() user: AuthenticatedUser, @Body() body: { houseId: string; data?: string }) {
    return this.fu.gerar(user, body.houseId, body.data);
  }

  @Get()
  pendentes(@CurrentUser() user: AuthenticatedUser,
            @Query('houseId', ParseUUIDPipe) houseId: string,
            @Query('tipo') tipo?: string) {
    return this.fu.pendentes(user, houseId, tipo);
  }

  @Get(':id')
  abrir(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.fu.abrir(user, id);
  }

  @Post(':id/draft')
  salvar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
         @Body() body: Record<string, string>) {
    return this.fu.salvar(user, id, body);
  }

  /** Escolha humana de fonte (§14.4) — guarda a referência, não a cópia. */
  @Post(':id/sources')
  fonte(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
        @Body() body: any) {
    return this.fu.escolherFonte(user, id, body);
  }

  @Post(':id/submit')
  enviar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.fu.enviarParaAprovacao(user, id);
  }

  @Post(':id/approve')
  aprovar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
          @Body() body: { nota?: string }) {
    return this.fu.aprovar(user, id, body?.nota);
  }

  @Post(':id/amend')
  novaVersao(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
             @Body() body: { motivo: string }) {
    return this.fu.novaVersao(user, id, body?.motivo ?? '');
  }
}

/**
 * O TRABALHO SOCIAL — o outro jeito de ver as oito casas (§18.4).
 *
 * O Gestor Geral responde por todas e não vai abrir a grade de medicação de
 * nenhuma. Aqui está a leitura que faltava: quantas crianças, quantas
 * entraram e saíram, e o que aconteceu de bom no período.
 *
 * `/impacto/panorama` é só dele; `/impacto/marcos` e a trajetória são de quem
 * alcança a criança — o educador inclusive, porque a parte boa da história
 * não se esconde de quem acorda a criança todo dia.
 */
@Controller('impacto')
@UseGuards(SessionGuard)
export class ImpactoController {
  constructor(@Inject(ImpactoService) private readonly impacto: ImpactoService) {}

  @Get('kinds')
  vocabulario() { return this.impacto.vocabulario(); }

  @Get('panorama')
  panorama(@CurrentUser() user: AuthenticatedUser,
           @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.impacto.panorama(user, de, ate);
  }

  @Get('marcos')
  marcos(@CurrentUser() user: AuthenticatedUser,
         @Query('houseId') houseId?: string, @Query('personId') personId?: string,
         @Query('de') de?: string, @Query('ate') ate?: string,
         @Query('tipo') tipo?: string) {
    return this.impacto.marcos(user, { houseId, personId, de, ate, tipo });
  }

  @Post('marcos')
  registrar(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.impacto.registrar(user, body ?? {});
  }

  /*
   * O documento que sai da instituição. `folha` monta e não registra; `export`
   * exige a finalidade escrita e registra a saída, como todo documento do
   * sistema desde a fase 47.
   */
  /*
   * Com `houseId`, é o relatório da PRÓPRIA casa — e aí a coordenação entra.
   * Ela responde por aquelas vinte crianças e é quem vai à reunião de rede e à
   * audiência concentrada; pedir ao Gestor Geral um documento sobre o trabalho
   * que ela mesma fez seria estranho. Sem `houseId`, é a visão das oito, que
   * continua sendo só dele.
   */
  @Get('folha')
  folhaDoImpacto(@CurrentUser() user: AuthenticatedUser,
                 @Query('de') de?: string, @Query('ate') ate?: string,
                 @Query('houseId') houseId?: string) {
    return this.impacto.folha(user, de, ate, houseId || undefined);
  }

  @Post('export')
  exportarImpacto(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.impacto.exportar(user, body ?? {});
  }

  /** A história de uma criança, para levar a uma audiência. */
  @Get('trajetoria/:personId/folha')
  folhaDaTrajetoria(@CurrentUser() user: AuthenticatedUser,
                    @Param('personId', ParseUUIDPipe) personId: string) {
    return this.impacto.folhaDaTrajetoria(user, personId);
  }

  @Post('trajetoria/:personId/export')
  exportarTrajetoria(@CurrentUser() user: AuthenticatedUser,
                     @Param('personId', ParseUUIDPipe) personId: string,
                     @Body() body: { finalidade?: string }) {
    return this.impacto.exportarTrajetoria(user, personId, body?.finalidade ?? '');
  }

  /** O comprovante de um marco: diploma, certificado, carteira. */
  @Get('marcos/:id/comprovante')
  comprovante(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.impacto.lerComprovante(user, id);
  }

  @Get('trajetoria/:personId')
  trajetoria(@CurrentUser() user: AuthenticatedUser,
             @Param('personId', ParseUUIDPipe) personId: string) {
    return this.impacto.trajetoria(user, personId);
  }
}

@Controller('reports')
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(PanelService) private readonly panel: PanelService,
  ) {}

  @Get('kinds')
  tipos(@CurrentUser() user: AuthenticatedUser) { return this.reports.tipos(user); }

  /** Painel do gestor: um cartão por casa, na ordem do código. Sem ranking. */
  @Get('panel')
  painel(@CurrentUser() user: AuthenticatedUser) { return this.panel.cards(user); }

  @Get('house-monthly')
  mensalDaCasa(@CurrentUser() user: AuthenticatedUser,
               @Query('houseId', ParseUUIDPipe) houseId: string,
               @Query('mes') mes: string) {
    return this.panel.mensalDaCasa(user, houseId, mes);
  }

  @Get()
  listar(@CurrentUser() user: AuthenticatedUser,
         @Query('houseId') houseId?: string, @Query('personId') personId?: string) {
    return this.reports.listar(user, houseId, personId);
  }

  @Post()
  gerar(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.reports.gerar(user, body);
  }

  @Get(':id')
  abrir(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.abrir(user, id);
  }

  @Post(':id/submit')
  enviar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.enviarParaAprovacao(user, id);
  }

  @Post(':id/approve')
  aprovar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.aprovar(user, id);
  }

  /**
   * A folha ANTES de baixar. Ver não é exportar: não gera arquivo, não pede
   * finalidade e não deixa rastro — quem lê na tela já podia ler na tela.
   */
  @Post(':id/preview')
  previa(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.previa(user, id);
  }

  /** Exportar deixa rastro: quem, finalidade, formato, filtros, hora (§18.4). */
  @Post(':id/export')
  exportar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
           @Body() body: { formato?: string; finalidade: string; filtros?: Record<string, unknown> }) {
    return this.reports.exportar(user, id, body?.formato ?? 'pdf', body?.finalidade ?? '', body?.filtros ?? {});
  }

  /**
   * Registro de ENTREGA a órgão externo (§14.6).
   *
   * Não existe rota de envio neste módulo, e isso é a garantia: o sistema
   * gera, a pessoa entrega, o sistema registra que ela entregou.
   */
  @Post(':id/delivery')
  entrega(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
          @Body() body: any) {
    return this.reports.registrarEntrega(user, id, body);
  }

  @Get(':id/delivery')
  entregas(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.entregas(user, id);
  }
}
