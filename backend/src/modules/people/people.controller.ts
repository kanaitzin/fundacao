import {
  Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { SessionGuard, CurrentUser } from '../identity';
import { AuthenticatedUser } from '../../kernel/contracts';
import { DossieService } from './dossie.service';
import { PeopleService } from './people.service';
import { CozinhaService } from './cozinha.service';
import { PortariaService } from './portaria.service';
import { CamposDoPerfilService } from './campos.service';
import { AniversariosService } from './aniversarios.service';
import { ProfileService } from './profile.service';
import { ContatosService } from './contatos.service';
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
    @Inject(CozinhaService) private readonly cozinha: CozinhaService,
    @Inject(PortariaService) private readonly portaria: PortariaService,
    @Inject(CamposDoPerfilService) private readonly campos: CamposDoPerfilService,
    @Inject(AniversariosService) private readonly aniversarios: AniversariosService,
    @Inject(BenefitsService) private readonly benefits: BenefitsService,
    @Inject(TransfersService) private readonly transfers: TransfersService,
    @Inject(AdmissionService) private readonly admission: AdmissionService,
    @Inject(CredentialsService) private readonly credentials: CredentialsService,
    @Inject(DossieService) private readonly dossie: DossieService,
    @Inject(ContatosService) private readonly contatos: ContatosService,
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

  /* As idas dela, no perfil dela (fase 118). Antes de `:id` porque
     `family-stays` sem id já existe e este tem um id no meio. */
  @Get(':id/family-stays')
  convivenciasDoAcolhido(@CurrentUser() user: AuthenticatedUser,
                         @Param('id', ParseUUIDPipe) id: string) {
    return this.people.convivenciasDoAcolhido(user, id);
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

  /**
   * ACOLHIDO EM EXPERIÊNCIA FAMILIAR (1010).
   *
   * `family-stays` antes de `:id` na ordem do arquivo não importa aqui porque
   * o segmento é fixo e distinto — mas a leitura vem antes da escrita de
   * propósito: quem abre a tela precisa ver quem está fora antes de registrar
   * mais alguém saindo.
   */
  @Get('family-stays')
  convivencias(@CurrentUser() user: AuthenticatedUser, @Query('houseId') houseId: string) {
    return this.people.convivenciasAbertas(user, houseId);
  }

  @Post('family-stays')
  registrarSaida(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.people.registrarSaidaFamiliar(user, body);
  }

  /**
   * O RELATO DA CONVIVÊNCIA (fase 122) — sem prazo, e quantas vezes precisar.
   *
   * *"Deixar em aberto para ser registrado quando de fato tivermos uma
   * informação […] pode ser registrado quantas vezes for necessário, por
   * qualquer educador."* Não há rota para fechar nem para apagar: a linha nova
   * fica ao lado da antiga.
   */
  @Get('family-stays/:id/notes')
  relatos(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.people.relatosDaConvivencia(user, id);
  }

  @Post('family-stays/:id/notes')
  relatar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
          @Body() body: { relato?: string; houveAlteracao?: boolean }) {
    return this.people.relatarConvivencia(user, id, body ?? {});
  }

  @Post('family-stays/:id/return')
  registrarRetorno(@CurrentUser() user: AuthenticatedUser,
                   @Param('id', ParseUUIDPipe) id: string,
                   @Body() body: { quando: string; nota?: string; trouxe?: string }) {
    return this.people.registrarRetornoFamiliar(
      user, id, body?.quando, body?.nota, body?.trouxe);
  }

  /* ---------------- Pedidos para a cozinha (1030) ---------------- */

  @Get('kitchen-requests')
  pedidosCozinha(@CurrentUser() user: AuthenticatedUser,
                 @Query('houseId', ParseUUIDPipe) houseId: string,
                 @Query('de') de: string, @Query('ate') ate: string) {
    return this.cozinha.pedidos(user, houseId, de, ate);
  }

  @Get('kitchen-requests/summary')
  resumoCozinha(@CurrentUser() user: AuthenticatedUser,
                @Query('houseId', ParseUUIDPipe) houseId: string,
                @Query('de') de: string, @Query('ate') ate: string) {
    return this.cozinha.resumo(user, houseId, de, ate);
  }

  @Post('kitchen-requests')
  pedirCozinha(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.cozinha.pedir(user, body);
  }

  @Post('kitchen-requests/:id/cancel')
  cancelarPedido(@CurrentUser() user: AuthenticatedUser,
                 @Param('id', ParseUUIDPipe) id: string,
                 @Body() body: { motivo: string }) {
    return this.cozinha.cancelar(user, id, body?.motivo ?? '');
  }

  /*
   * As três folhas. `folha` mostra e NÃO registra; `export` exige finalidade e
   * registra a saída — ver não é exportar, e quem lê na tela já podia ler.
   */
  @Get('kitchen-requests/folha/lanches')
  folhaLanches(@CurrentUser() user: AuthenticatedUser,
               @Query('houseId', ParseUUIDPipe) houseId: string,
               @Query('de') de: string, @Query('ate') ate: string) {
    return this.cozinha.folhaDeLanches(user, houseId, de, ate);
  }

  @Post('kitchen-requests/export/lanches')
  exportLanches(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.cozinha.exportarLanches(user, body);
  }

  @Get('kitchen-requests/folha/restricoes')
  folhaRestricoes(@CurrentUser() user: AuthenticatedUser,
                  @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.cozinha.folhaDeRestricoes(user, houseId);
  }

  @Post('kitchen-requests/export/restricoes')
  exportRestricoes(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.cozinha.exportarRestricoes(user, body);
  }

  @Get('kitchen-requests/folha/cestas')
  folhaCestas(@CurrentUser() user: AuthenticatedUser,
              @Query('houseId', ParseUUIDPipe) houseId: string,
              @Query('de') de: string, @Query('ate') ate: string) {
    return this.cozinha.folhaDeCestas(user, houseId, de, ate);
  }

  @Post('kitchen-requests/export/cestas')
  exportCestas(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.cozinha.exportarCestas(user, body);
  }

  /* ---------------- Os aniversários (1160) ---------------- */
  @Get('birthdays')
  listarAniversarios(@CurrentUser() user: AuthenticatedUser,
               @Query('houseId', ParseUUIDPipe) houseId: string,
               @Query('dias') dias?: string) {
    return this.aniversarios.proximos(user, houseId, dias ? Number(dias) : 7);
  }

  @Post('birthdays/:personId/ack')
  cienteDoAniversario(@CurrentUser() user: AuthenticatedUser,
                      @Param('personId', ParseUUIDPipe) personId: string, @Body() body: any) {
    return this.aniversarios.darCiencia(user, personId, body ?? {});
  }

  /* Rota de máquina, como a geração das doses e do dia: chamada por cron. */
  @Post('birthdays/notify')
  avisarAniversarios(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.aniversarios.avisarDaCasa(user, body?.houseId ?? '');
  }

  /* ---------------- O que a coordenação liga e desliga (1130) ---------------- */
  @Get('profile-fields')
  camposDoPerfil(@CurrentUser() user: AuthenticatedUser,
                 @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.campos.listar(user, houseId);
  }

  @Post('profile-fields')
  definirCampoDoPerfil(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.campos.definir(user, body ?? {});
  }

  /* ---------------- A portaria: quem pode visitar (1120) ---------------- */
  /*
   * Mesmo desenho das folhas da cozinha: `folha` mostra e NÃO registra;
   * `export` exige finalidade e registra a saída. Rotas de palavra fixa,
   * antes de `:id`.
   */
  @Get('portaria/folha')
  folhaDaPortaria(@CurrentUser() user: AuthenticatedUser,
                  @Query('houseId', ParseUUIDPipe) houseId: string) {
    return this.portaria.folha(user, houseId);
  }

  @Post('portaria/export')
  exportarPortaria(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.portaria.exportar(user, body ?? {});
  }

  @Post('contacts/:contactId/visit')
  definirVisita(@CurrentUser() user: AuthenticatedUser,
                @Param('contactId', ParseUUIDPipe) contactId: string, @Body() body: any) {
    return this.contatos.definirVisita(user, contactId, body ?? {});
  }

  /**
   * O HISTÓRICO DA FOLHA DA PORTARIA (1500) — quem entrou, quem saiu, por quê.
   *
   * Fica antes de `contacts/:contactId/photo` só por ordem de leitura; as duas
   * são palavras fixas em posições diferentes e não se confundem.
   */
  @Get('contacts/:contactId/visit-history')
  historicoDaVisita(@CurrentUser() user: AuthenticatedUser,
                    @Param('contactId', ParseUUIDPipe) contactId: string) {
    return this.contatos.historicoDaVisita(user, contactId);
  }

  @Get('contacts/:contactId/photo')
  fotoDoContato(@CurrentUser() user: AuthenticatedUser,
                @Param('contactId', ParseUUIDPipe) contactId: string) {
    return this.contatos.lerFotoDoContato(user, contactId);
  }

  @Post('contacts/:contactId/photo')
  guardarFotoDoContato(@CurrentUser() user: AuthenticatedUser,
                       @Param('contactId', ParseUUIDPipe) contactId: string, @Body() body: any) {
    return this.contatos.guardarFotoDoContato(user, contactId, body ?? {});
  }

  /* ---------------- Sair sozinho (1020) ---------------- */

  @Get('outing-permissions')
  saidasAObservar(@CurrentUser() user: AuthenticatedUser, @Query('houseId') houseId: string) {
    return this.people.saidasAObservar(user, houseId);
  }

  @Get(':id/outing-permission')
  saidaSozinho(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.people.saidaSozinho(user, id);
  }

  @Post(':id/outing-permission')
  definirSaida(@CurrentUser() user: AuthenticatedUser,
               @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.people.definirSaidaSozinho(user, id, body);
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

  /*
   * A FOTO E OS CONTATOS.
   *
   * `GET :id/photo` devolve a imagem em base64, como o resto do dossiê faz —
   * o corpo é JSON e o protótipo, que roda sem servidor, precisa do mesmo
   * formato.
   */
  @Get(':id/photo')
  foto(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contatos.lerFoto(user, id);
  }

  @Post(':id/photo')
  guardarFoto(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
              @Body() body: any) {
    return this.contatos.guardarFoto(user, id, body ?? {});
  }

  /** O vocabulário dos vínculos — rota de palavra fixa, antes de `:id`. */
  @Get('contacts/kinds')
  vinculos() { return this.contatos.vocabulario(); }

  @Get(':id/contacts')
  contatosDo(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contatos.listar(user, id);
  }

  @Post(':id/contacts')
  novoContato(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
              @Body() body: any) {
    return this.contatos.criar(user, id, body ?? {});
  }

  @Post('contacts/:contactId/end')
  encerrarContato(@CurrentUser() user: AuthenticatedUser,
                  @Param('contactId', ParseUUIDPipe) contactId: string,
                  @Body() body: { motivo?: string }) {
    return this.contatos.encerrar(user, contactId, body?.motivo ?? '');
  }

  @Get(':id/correcoes')
  correcoes(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.profile.correcoes(user, id);
  }

  /** O que os campos descritivos do perfil diziam antes (migração 0850). */
  @Get(':id/detalhe-historico')
  detalheHistorico(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.profile.detalheHistorico(user, id);
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

  /**
   * UMA foto específica da vivência (fase 124) — a vivência passou a ter
   * quantas tiver. A rota acima continua valendo e devolve a primeira.
   */
  @Get(':id/memories/:memId/photos/:fotoId')
  umaFotoDaVivencia(@CurrentUser() user: AuthenticatedUser,
                    @Param('id', ParseUUIDPipe) id: string,
                    @Param('memId', ParseUUIDPipe) memId: string,
                    @Param('fotoId', ParseUUIDPipe) fotoId: string) {
    return this.dossie.foto(user, id, memId, fotoId);
  }

  /**
   * BAIXAR o documento do dossiê (fase 124) — *"poder visualizar a hora que
   * eles quiserem e baixar"*.
   *
   * `POST`, e não um `GET` com parâmetro: sair com o arquivo é um ato, e um
   * verbo que a rede inteira trata como leitura idempotente é o verbo errado
   * para um ato que deixa linha na auditoria.
   */
  @Post(':id/documents/:docId/download')
  baixarDoc(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
            @Param('docId', ParseUUIDPipe) docId: string) {
    return this.dossie.arquivo(user, id, docId, true);
  }

  /*
   * A ROTA CURTA DO DOSSIÊ SAIU NA FASE 130.
   *
   * `GET :id/documents/:docId` devolvia o metadado de um documento e registrava
   * `document.open` — **sem nada ser aberto**. Ela era restolho de um plano que
   * não aconteceu: a resposta anunciava
   * `download: { pronto: false, motivo: 'Armazenamento de objetos entra na Fase 3' }`,
   * e o baixar chegou na fase 124 por OUTRA rota (`/download`).
   *
   * Nenhuma tela a chamava, e o servidor de mentira nem a atendia. O que ela
   * provava — o educador levando 404 no documento judicial, idêntico a
   * inexistente — passou a ser provado no `/file`, que é por onde a tela passa
   * de verdade. Fronteira provada em rota que ninguém abre é fronteira que
   * ninguém confere.
   */

  // ---- Benefícios: comandos específicos, nunca update genérico (§25) ----

  /** Palavra fixa, e por isso vem ANTES de `:id/benefits/*`. */
  @Get('benefits/kinds')
  tiposBeneficio() { return this.benefits.vocabulario(); }

  /**
   * Quem abriu, alterou ou tentou abrir esta área. POST como o `view`, e pela
   * mesma razão: ler o histórico de um dado bancário também é um ato.
   */
  @Post(':id/benefits/history')
  benefitsHistory(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.benefits.historico(user, id);
  }

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
