import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { EducacaoService } from './educacao.service';
import { NursingService } from './nursing.service';
import { InternacaoService } from './internacao.service';
import { HealthSummaryService } from './health-summary.service';

@Controller('nursing')
@UseGuards(SessionGuard)
export class NursingController {
  constructor(
    @Inject(NursingService) private readonly nursing: NursingService,
    @Inject(HealthSummaryService) private readonly summary: HealthSummaryService,
    @Inject(InternacaoService) private readonly internacao: InternacaoService,
    @Inject(EducacaoService) private readonly educacao: EducacaoService,
  ) {}

  /* =========================================================================
   * O PRONTUÁRIO DE EDUCAÇÃO (fase 111).
   *
   * Mora na partição `nursing` por acidente de história, e vale dizer por quê:
   * a migração 0530 trouxe as DUAS evoluções que a Fundação entregou no mesmo
   * dia — a de saúde e a de educação —, e as tabelas nasceram aqui. Mover
   * tabela entre partições é migração destrutiva; o caminho da rota é o preço
   * honesto de não fazer isso.
   *
   * Quem escreve não é escolha desta fase: as políticas da 0530 já incluíam o
   * educador, e o §8.12 diz por quê — *"quem acompanha a tarefa de casa é
   * ele"*.
   * ====================================================================== */

  @Get('education/kinds')
  vocabularioDaEducacao() { return this.educacao.vocabulario(); }

  @Get('education/:personId')
  educacaoDoAcolhido(@CurrentUser() user: AuthenticatedUser,
                     @Param('personId', ParseUUIDPipe) personId: string) {
    return this.educacao.doAcolhido(user, personId);
  }

  @Post('education/:personId/support')
  salvarApoio(@CurrentUser() user: AuthenticatedUser,
              @Param('personId', ParseUUIDPipe) personId: string, @Body() body: any) {
    return this.educacao.salvarApoio(user, personId, body?.houseId, body ?? {});
  }

  @Post('education/:personId/evolutions')
  registrarEvolucaoEducacional(@CurrentUser() user: AuthenticatedUser,
                               @Param('personId', ParseUUIDPipe) personId: string,
                               @Body() body: any) {
    return this.educacao.registrarEvolucao(user, personId, body?.houseId, body ?? {});
  }

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

  /*
   * INTERNAÇÃO HOSPITALAR (§7.6, migração 0890).
   *
   * A criança internada continua da casa e sai da linha do dia. O educador
   * social comum não alcança estas rotas — decisão da coordenação em
   * 03/09/2026 —, com uma exceção: o educador DESIGNADO para acompanhar
   * alcança a internação dele, porque é ele quem escreve o relato do dia.
   */
  @Get('hospitalizations/kinds')
  vocabularioInternacao() { return this.internacao.vocabulario(); }

  /* As internações de UMA criança (fase 118). Antes de `hospitalizations/:id`
     porque `person` é palavra literal contra um `:param`, que o
     `contrato-rotas` reprova quando vem depois. */
  @Get('hospitalizations/person/:personId')
  internacoesDoAcolhido(@CurrentUser() user: AuthenticatedUser,
                        @Param('personId', ParseUUIDPipe) personId: string) {
    return this.internacao.doAcolhido(user, personId);
  }

  @Get('hospitalizations')
  internacoes(@CurrentUser() user: AuthenticatedUser,
              @Query('houseId', ParseUUIDPipe) houseId: string,
              @Query('encerradas') encerradas?: string) {
    return this.internacao.daCasa(user, houseId, encerradas === '1');
  }

  @Post('hospitalizations')
  abrirInternacao(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.internacao.abrir(user, body ?? {});
  }

  @Get('hospitalizations/:id')
  internacao_(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.internacao.abrirPeriodo(user, id);
  }

  @Post('hospitalizations/:id/close')
  encerrarInternacao(@CurrentUser() user: AuthenticatedUser,
                     @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.internacao.encerrar(user, id, body ?? {});
  }

  @Post('hospitalizations/:id/notes')
  registrarNoDiario(@CurrentUser() user: AuthenticatedUser,
                    @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.internacao.registrar(user, id, body ?? {});
  }

  /** O anexo de um registro do diário: laudo, exame, solicitação do hospital. */
  @Get('hospitalizations/:id/notes/:notaId/anexo')
  anexoDoDiario(@CurrentUser() user: AuthenticatedUser,
                @Param('id', ParseUUIDPipe) id: string,
                @Param('notaId', ParseUUIDPipe) notaId: string) {
    return this.internacao.lerAnexo(user, id, notaId);
  }

  @Post('hospitalizations/:id/medications')
  medicacaoDoHospital(@CurrentUser() user: AuthenticatedUser,
                      @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.internacao.registrarMedicacao(user, id, body ?? {});
  }

  @Post('hospitalizations/:id/companion')
  designarAcompanhante(@CurrentUser() user: AuthenticatedUser,
                       @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.internacao.designar(user, id, body ?? {});
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
