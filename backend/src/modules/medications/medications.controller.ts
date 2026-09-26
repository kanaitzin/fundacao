import { RegistroDaRota } from '../../kernel/common/registro-da-rota.guard';
import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { MedicationsService, ALERTAS_MIN } from './medications.service';
import { DataDoDia, CorpoConferido } from '../../kernel/common/data-do-dia.pipe';

@Controller('medications')
@UseGuards(SessionGuard)
export class MedicationsController {
  constructor(@Inject(MedicationsService) private readonly meds: MedicationsService) {}

  /** Grade do dia da casa. */
  @Get()
  grid(@CurrentUser() user: AuthenticatedUser,
       @Query('houseId', ParseUUIDPipe) houseId: string,
       @Query('date', DataDoDia) date?: string,
       @Query('personId') personId?: string) {
    return this.meds.dayGrid(user, houseId, date ?? hojeNaInstituicao(), personId || undefined);
  }

  /**
   * A GRADE COMO FOLHA — o papel que fica na porta do armário.
   *
   * Vem da mesma grade que a tela mostra. A folha traz horário, nome e
   * medicamento, e NÃO traz diagnóstico nem alergia: ela é papel de serviço,
   * fica em área restrita à equipe, e a decisão está escrita nela.
   */
  @Get('folha')
  folha(@CurrentUser() user: AuthenticatedUser,
        @Query('houseId', ParseUUIDPipe) houseId: string,
        @Query('date', DataDoDia) date?: string) {
    return this.meds.folhaDaGrade(user, houseId, date ?? hojeNaInstituicao());
  }

  @Post('export')
  exportar(@CurrentUser() user: AuthenticatedUser,
           @Body(CorpoConferido) body: { houseId: string; date?: string; finalidade?: string }) {
    return this.meds.exportarGrade(
      user, body?.houseId, body?.date ?? hojeNaInstituicao(), body?.finalidade ?? '');
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

  /**
   * O que está disponível "quando necessário" (1390).
   *
   * Palavra fixa, e por isso vem ANTES de `prescriptions/:id/...` na ordem do
   * arquivo — palavra literal caindo num `:param` é falha silenciosa.
   */
  @Get('prn')
  prnDisponivel(@CurrentUser() user: AuthenticatedUser,
                @Query('houseId', ParseUUIDPipe) houseId: string,
                @Query('personId') personId?: string) {
    return this.meds.quandoNecessarioDisponivel(user, houseId, personId || undefined);
  }

  /**
   * A DOSE "QUANDO NECESSÁRIO" (1390).
   *
   * `prescriptions/:id/prn` e não `doses/:id/...`: aqui não há dose ainda. Ela
   * nasce deste ato, porque uma prescrição sem horário não gera dose na virada
   * do dia — e era por isso que o remédio das 2h da manhã não tinha onde ficar.
   */
  @Post('prescriptions/:id/prn')
  registrarPrn(@CurrentUser() user: AuthenticatedUser,
               @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.meds.registrarQuandoNecessario(user, id, body ?? {});
  }

  /** O que aconteceu depois — sem prazo, e uma vez (1390). */
  @Post('doses/:id/prn-outcome')
  desfechoPrn(@CurrentUser() user: AuthenticatedUser,
              @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.meds.desfechoQuandoNecessario(user, id, body?.desfecho);
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
  /* ---------------- O remédio que vai junto (1050) ---------------- */

  /** Calcula e mostra. Não muda nada — pode ser chamado quantas vezes for. */
  @RegistroDaRota('id', 'family_stay')
  @Get('family-stays/:id/to-take')
  medicamentosParaLevar(@CurrentUser() user: AuthenticatedUser,
                        @Param('id', ParseUUIDPipe) id: string) {
    return this.meds.medicamentosParaLevar(user, id);
  }

  /** A folha timbrada que vai na mão de quem recebe a criança. */
  @Get('family-stays/:id/to-take/folha')
  folhaDosMedicamentos(@CurrentUser() user: AuthenticatedUser,
                       @Param('id', ParseUUIDPipe) id: string) {
    return this.meds.folhaDosMedicamentos(user, id);
  }

  @Post('family-stays/:id/to-take/export')
  exportarMedicamentos(@CurrentUser() user: AuthenticatedUser,
                       @Param('id', ParseUUIDPipe) id: string, @Body(CorpoConferido) body: any) {
    return this.meds.exportarMedicamentosDaSaida(user, {
      familyStayId: id, finalidade: body?.finalidade ?? '' });
  }

  /**
   * O ATO: os comprimidos saíram do armário. Idempotente por saída — imprimir
   * a folha de novo não pode dar baixa outra vez.
   */
  @Post('family-stays/:id/to-take/register')
  registrarSaidaMedicamentos(@CurrentUser() user: AuthenticatedUser,
                             @Param('id', ParseUUIDPipe) id: string) {
    return this.meds.registrarSaidaDeMedicamentos(user, id);
  }

  /* ---------------- Nota fiscal e receita (1040) ---------------- */

  /** As compras do período, com o gasto somado e quantas estão sem o papel. */
  @Get('purchases')
  compras(@CurrentUser() user: AuthenticatedUser,
          @Query('houseId', ParseUUIDPipe) houseId: string,
          @Query('de', DataDoDia) de: string, @Query('ate', DataDoDia) ate: string) {
    return this.meds.compras(user, houseId, de, ate);
  }

  @Post('purchases')
  registrarCompra(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.meds.registrarCompra(user, body);
  }

  /* A receita digitalizada fica junto da prescrição que ela autoriza. */
  @RegistroDaRota('id', 'prescription')
  @Get('prescriptions/:id/documents')
  receitas(@CurrentUser() user: AuthenticatedUser,
           @Param('id', ParseUUIDPipe) id: string) {
    return this.meds.receitas(user, id);
  }

  @Post('prescriptions/:id/documents')
  anexarReceita(@CurrentUser() user: AuthenticatedUser,
                @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.meds.anexarReceita(user, id, body);
  }

  /*
   * ABRIR A RECEITA E ABRIR A NOTA (fase 108).
   *
   * As duas passam por função que registra a abertura ANTES de devolver, como
   * o anexo da ocorrência. Quando o documento foi anexado por REFERÊNCIA, elas
   * devolvem o caminho no Drive e nenhum arquivo — a tela escreve uma coisa
   * diferente em cada caso, e é por isso que a resposta diz qual das duas é.
   */
  @Get('prescriptions/documents/:docId/file')
  abrirReceita(@CurrentUser() user: AuthenticatedUser,
               @Param('docId', ParseUUIDPipe) docId: string) {
    return this.meds.abrirReceita(user, docId);
  }

  @Get('purchases/:compraId/file')
  abrirNota(@CurrentUser() user: AuthenticatedUser,
            @Param('compraId', ParseUUIDPipe) compraId: string) {
    return this.meds.abrirNotaFiscal(user, compraId);
  }

  @Get('stock')
  stock(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.meds.stock(user, houseId);
  }

  /*
   * O MOVIMENTO DE UM ITEM DO ARMÁRIO (fase 109).
   *
   * `stock` devolve o saldo; isto devolve a história. A tabela era escrita por
   * três lugares e lida por nenhum desde a migração 0200 — a fase 85 gravou o
   * `consumo` que faltava, e o lugar de abrir nunca existiu.
   */
  @Get('stock/:id/movements')
  movimento(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.meds.movimentoDoArmario(user, id);
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

  /**
   * O protocolo por período e a autorização nominal deixaram de DECIDIR em
   * 08/09/2026 (migração 0930): a Fundação respondeu quem dá o remédio, e a
   * resposta é "a Enfermagem das 9h às 17h, o educador de plantão fora disso".
   * As duas rotas de ESCRITA saíram; as de leitura ficam, porque o que a casa
   * decidiu em agosto continua sendo história dela (regra 6).
   */
  @Get('protocol')
  protocol(@CurrentUser() user: AuthenticatedUser, @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.meds.getProtocol(user, houseId);
  }

  @Get('protocol-history')
  protocolHistory(@CurrentUser() user: AuthenticatedUser,
                  @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.meds.protocolHistory(user, houseId);
  }

  /** A exceção que passou a existir: o medicamento que só a Enfermagem dá. */
  @Post('prescriptions/:id/nurse-only')
  nurseOnly(@CurrentUser() user: AuthenticatedUser,
            @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.meds.setNurseOnly(user, id, body);
  }

  @RegistroDaRota('id', 'prescription')
  @Get('prescriptions/:id/nurse-only-history')
  nurseOnlyHistory(@CurrentUser() user: AuthenticatedUser,
                   @Param('id', ParseUUIDPipe) id: string) {
    return this.meds.nurseOnlyHistory(user, id);
  }
}
