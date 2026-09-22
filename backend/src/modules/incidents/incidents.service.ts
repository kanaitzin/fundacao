import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser, DocumentClosed, EscalationRequest } from '../../kernel/contracts';
import { StatementsService } from '../statements';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { ArquivosService } from '../../kernel/arquivos/arquivos.service';
import { cargoNoDocumento } from '../../kernel/documentos/folha';
import { folhaDaOcorrencia } from './ocorrencia-folha';

/** Situações que abrem fluxo especial (§13.1). */
export const CATEGORIAS = [
  { code: 'violencia_ou_suspeita', label: 'Violência ou suspeita de violação', revisaoTecnica: true, restrito: true },
  { code: 'conflito_agressao', label: 'Conflito ou agressão', revisaoTecnica: false, restrito: false },
  { code: 'saida_nao_autorizada', label: 'Saída não autorizada', revisaoTecnica: false, restrito: false },
  { code: 'erro_medicamento', label: 'Erro de medicamento', revisaoTecnica: true, restrito: false },
  { code: 'emergencia_saude', label: 'Emergência de saúde', revisaoTecnica: true, restrito: false },
  { code: 'contencao', label: 'Contenção', revisaoTecnica: true, restrito: true },
  { code: 'desorganizacao_relevante', label: 'Desorganização com repercussão relevante', revisaoTecnica: false, restrito: false },
  { code: 'dano_recusa_critica', label: 'Dano, recusa crítica ou fato que exija acompanhamento', revisaoTecnica: false, restrito: false },
  { code: 'outro', label: 'Outro', revisaoTecnica: false, restrito: false },
];

/**
 * ÓRGÃOS e CANAIS da comunicação externa (§13.6).
 *
 * Os códigos são do banco; os rótulos existem porque a tela não deve traduzir
 * `ministerio_publico` sozinha — no dia em que entrar um órgão novo, a lista
 * muda aqui e a tela acompanha sem release.
 *
 * O CANAL é registro do que foi feito por uma PESSOA. Não existe rota de
 * envio, e é por isso que "e-mail institucional" aqui significa "alguém
 * enviou um e-mail e anotou", jamais "o sistema enviou".
 */
const ORGAOS_LISTA = [
  { cod: 'judiciario', label: 'Judiciário (Vara da Infância)' },
  { cod: 'conselho_tutelar', label: 'Conselho Tutelar' },
  { cod: 'ministerio_publico', label: 'Ministério Público' },
  { cod: 'saude', label: 'Rede de saúde' },
  { cod: 'escola', label: 'Escola' },
  { cod: 'rede', label: 'Outro serviço da rede' },
  { cod: 'outro', label: 'Outro' },
];
const CANAIS_LISTA = [
  { cod: 'oficio', label: 'Ofício em papel' },
  { cod: 'email_institucional', label: 'E-mail institucional' },
  { cod: 'presencial', label: 'Entrega presencial' },
  { cod: 'telefone', label: 'Telefone' },
  { cod: 'sistema_externo', label: 'Sistema do órgão' },
];
/**
 * TIPOS DE ANEXO (§13.7).
 *
 * Anexo aqui NÃO é upload: o arquivo vive no Drive institucional e o sistema
 * guarda a REFERÊNCIA, o nome neutro e quem pode abrir — o educador não tem
 * acesso direto às pastas (§2), e é justamente por isso que a abertura passa
 * por aqui, com finalidade declarada e registro.
 *
 * `restritoPorPadrao` diz o que já nasce fechado: foto e documento médico não
 * circulam pelo plantão. `exigeJustificativa` é a regra do §13.7 para foto —
 * para que ela é necessária e qual autorização a ampara.
 */
const TIPOS_ANEXO = [
  { cod: 'documento_medico', label: 'Documento médico',
    ajuda: 'Receita, atestado, encaminhamento, laudo.',
    restritoPorPadrao: true, exigeJustificativa: false },
  { cod: 'comunicacao_oficial', label: 'Comunicação oficial',
    ajuda: 'Ofício recebido ou enviado, decisão, guia.',
    restritoPorPadrao: false, exigeJustificativa: false },
  { cod: 'foto_autorizada', label: 'Foto autorizada',
    ajuda: 'Só com autorização, e nunca na linha do tempo. Exige justificativa escrita.',
    restritoPorPadrao: true, exigeJustificativa: true },
  { cod: 'documento_escolar', label: 'Documento escolar',
    ajuda: 'Boletim, declaração de matrícula, comunicado da escola.',
    restritoPorPadrao: false, exigeJustificativa: false },
  { cod: 'documento_tecnico', label: 'Documento técnico',
    ajuda: 'Relatório ou parecer produzido pela equipe.',
    restritoPorPadrao: true, exigeJustificativa: false },
];

const ORGAOS = ORGAOS_LISTA.map((o) => o.cod);
const CANAIS = CANAIS_LISTA.map((c) => c.cod);

/** Termos que não podem aparecer em nome de arquivo (§3.3). */
const PROIBIDO_NO_NOME = [
  /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,                       // CPF, com ou sem máscara
  /\b\d{11}\b/,
  /\b(hiv|aids|soropositiv|cid[\s-]?\d|f\d{2}\.\d|autis|esquizo|depress|transtorn|psiquiatr)/i,
  /\b(judicial|processo|autos|vara|promotoria|mandado)\b/i,
];

/**
 * OCORRÊNCIAS ESPECIAIS E PROTEÇÃO (§13).
 *
 * O que este serviço nunca faz: julgar se a contenção foi adequada, classificar
 * gravidade sozinho, decidir destino, punição ou responsabilidade, ou enviar
 * qualquer coisa para fora da instituição. Ele registra, avisa quem tem função
 * de agir e mantém o que foi escrito exatamente como foi escrito.
 */
/**
 * As categorias que COBRAM relato de quem estava no turno.
 *
 * São as quatro que já não se encerram sem validação técnica, mais o conflito
 * com agressão. Fora delas, a cobrança gastaria atenção onde não muda nada — e
 * cobrança que se ignora uma vez se ignora sempre.
 *
 * Quem marca a categoria é quem abre. O sistema não decide sozinho o que é
 * grave (regra 3).
 */
const COBRA_RELATO = new Set([
  'violencia_ou_suspeita', 'conflito_agressao', 'contencao',
  'erro_medicamento', 'emergencia_saude',
]);

/**
 * A pergunta que a pessoa lê.
 *
 * Objetiva, como a equipe técnica pediu: quem não viu marca "Não presenciei"
 * num toque e segue o turno. A frase não descreve o fato — quem precisa do
 * fato abre a ocorrência; quem só vai dizer que não estava lá não deve receber
 * o relato de um episódio grave numa notificação.
 */
const perguntaDoRelato = (categoria: string) =>
  `Houve ${categoria.toLowerCase()} na casa no seu turno. Você presenciou alguma coisa?`;

@Injectable()
export class IncidentsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(StatementsService) private readonly statements: StatementsService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
    @Inject(ArquivosService) private readonly arquivos: ArquivosService,
  ) {}

  catalogo() {
    return {
      categorias: CATEGORIAS,
      orgaos: ORGAOS_LISTA, canais: CANAIS_LISTA,
      tiposAnexo: TIPOS_ANEXO,
      avisoAnexo: 'O sistema não guarda o arquivo: guarda a REFERÊNCIA dele no Drive da '
        + 'instituição, o nome neutro e quem pode abrir. Nome de arquivo nunca leva CPF, '
        + 'diagnóstico nem conteúdo judicial (§3.3), e abrir um anexo restrito exige dizer '
        + 'para quê — a abertura fica registrada com o seu nome.',
      /*
       * A frase é a regra, e vai junto do vocabulário de propósito: quem
       * desenhar uma tela sobre estes dados lê, na mesma resposta, que não
       * existe envio (§13.6, e a proibição do §2).
       */
      avisoComunicacao: 'O sistema NÃO envia nada para fora. Ele registra o que foi redigido, '
        + 'quem revisou, quem aprovou e quem entregou — a entrega é sempre de uma pessoa.',
      aviso: 'O registro nunca deve atrasar proteção imediata, atendimento de saúde ou o protocolo institucional. '
           + 'Abra a ocorrência com o mínimo e complete depois.',
    };
  }

  // ------------------------------------------------------------------

  async open(user: AuthenticatedUser, input: {
    houseId: string; categoria: string; quando: string; fato: string;
    acolhidos?: string[]; atividade?: string; presentes?: string;
    medidasImediatas?: string; saude?: boolean; medicamento?: boolean;
    contatos?: string; pendencias?: string; prazo?: string;
    falaEspontanea?: string; sinaisObservados?: string;
    offline?: boolean; clientOpId?: string;
  }) {
    const cat = CATEGORIAS.find((c) => c.code === input.categoria);
    if (!cat) throw new BadRequestException('Categoria inválida.');
    if ((input.fato ?? '').trim().length < 15) {
      throw new BadRequestException(
        'Descreva o fato objetivamente: o que aconteceu, onde e quando. Sem interpretação e sem juízo sobre a pessoa.');
    }
    if (!input.quando) throw new BadRequestException('Informe a data e a hora do fato.');

    const id = await this.db.asUser(user.id, async (c) => {
      if (input.clientOpId) {
        const { rows: [dup] } = await c.query(`SELECT id FROM incident WHERE client_op_id = $1`, [input.clientOpId]);
        if (dup) return dup.id as string;
      }
      const { rows: [r] } = await c.query(
        `INSERT INTO incident (house_id, category, happened_at, activity_ref, objective_fact,
           people_present, immediate_measures, health_related, medication_related,
           contacts, pendencies, deadline, opened_by, offline, client_op_id)
         VALUES ($1,$2,$3::timestamptz,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13,$14,$15)
         RETURNING id`,
        [input.houseId, input.categoria, input.quando, input.atividade ?? null,
         input.fato.trim(), input.presentes ?? null, input.medidasImediatas ?? null,
         input.saude ?? false, input.medicamento ?? false, input.contatos ?? null,
         input.pendencias ?? null, input.prazo ?? null, user.id,
         input.offline ?? false, input.clientOpId ?? null]);
      const novoId = r.id as string;

      for (const p of input.acolhidos ?? []) {
        await c.query(
          `INSERT INTO incident_person (incident_id, person_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`, [novoId, p]);
      }
      if (input.falaEspontanea || input.sinaisObservados) {
        await c.query(
          `INSERT INTO incident_protected (incident_id, house_id, spontaneous_speech,
             observed_signs, author_id, health_related)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [novoId, input.houseId, input.falaEspontanea ?? null,
           input.sinaisObservados ?? null, user.id, input.saude ?? false]);
      }
      /*
       * COBRAR O RELATO DE QUEM ESTAVA NO TURNO (1000).
       *
       * Só nas categorias que já não fecham sem revisão técnica, mais o
       * conflito com agressão: são os episódios em que a técnica vai conversar
       * com o adolescente, e para isso precisa do relato de todas as partes
       * antes — pedido dela em 09/09.
       *
       * Fora dessas, cobrar relato de seis pessoas por uma desorganização
       * relevante gastaria a cobrança onde ela não muda nada, e a próxima
       * seria ignorada junto.
       *
       * Dentro da MESMA transação da abertura: ocorrência aberta sem cobrança
       * é a falha silenciosa que este trecho existe para impedir.
       */
      if (COBRA_RELATO.has(input.categoria)) {
        await c.query(
          `SELECT * FROM app_cobrar_relatos($1,'ocorrencia','incident',$2,$3,$4::timestamptz)`,
          [input.houseId, novoId, perguntaDoRelato(cat.label), input.quando]);
      }
      return novoId;
    }).catch((e: any) => {
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        throw new ForbiddenException('Você não tem função para abrir ocorrência nesta casa.');
      }
      throw e;
    });

    await this.audit.log({
      action: 'incident.open', actorId: user.id, houseId: input.houseId,
      entity: 'incident', entityId: id,
      // Metadados. O fato em si nunca vai para o log (§20).
      detail: { categoria: input.categoria, acolhidos: (input.acolhidos ?? []).length,
                saude: input.saude ?? false, medicamento: input.medicamento ?? false },
    });

    // §13.2 — avisar IMEDIATAMENTE líder, equipe técnica e coordenação; e a
    // Enfermagem quando há saúde ou medicamento. O Gestor Geral NÃO entra
    // automaticamente: quem escalona a ele é gente, conforme gravidade.
    const alvos = ['lider', 'tecnica_coordenacao'];
    if (input.saude || input.medicamento || cat.code === 'emergencia_saude' || cat.code === 'erro_medicamento') {
      alvos.push('enfermagem');
    }
    for (const level of alvos) {
      const pedido: EscalationRequest = {
        level, entity: 'incident', entityId: id, reason: `ocorrencia:${input.categoria}`,
        title: `Ocorrência aberta — ${cat.label}`,
        // O corpo da notificação não carrega o fato: quem precisa saber, abre.
        body: 'Uma ocorrência foi registrada e aguarda acompanhamento. Abra na Rede Acolher para ver os detalhes.',
        priority: cat.revisaoTecnica ? 'critica' : 'alta',
        groupKey: `incident:${id}:${level}`,
      };
      await this.bus.publish('escalation.requested', pedido, { actorId: user.id, houseId: input.houseId });
    }

    return {
      id, categoria: cat.label,
      revisaoTecnicaObrigatoria: cat.revisaoTecnica,
      nivelAcesso: cat.restrito ? 'restrito' : 'equipe',
      avisados: alvos,
      aviso: cat.revisaoTecnica
        ? 'Registrada. Esta categoria não se encerra sem validação da equipe técnica ou da coordenação.'
        : 'Registrada. Líder, equipe técnica e coordenação foram avisados.',
    };
  }

  async list(user: AuthenticatedUser, houseId: string, apenasAbertas = false) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT i.id, i.category, i.happened_at, i.status, i.access_level,
                i.requires_technical_review, i.deadline,
                app_user_display_name(i.opened_by) AS aberta_por,
                (SELECT count(*)::int FROM incident_person p WHERE p.incident_id = i.id) AS acolhidos,
                (SELECT count(*)::int FROM incident_attachment a WHERE a.incident_id = i.id) AS anexos
         FROM incident i
         WHERE i.house_id = $1 AND ($2::boolean IS NOT TRUE OR i.status <> 'fechada')
         ORDER BY i.happened_at DESC LIMIT 200`, [houseId, apenasAbertas]);
      return rows.map((r) => ({
        id: r.id,
        categoria: CATEGORIAS.find((c) => c.code === r.category)?.label ?? r.category,
        codigoCategoria: r.category,
        quando: r.happened_at, status: r.status, nivelAcesso: r.access_level,
        revisaoTecnicaObrigatoria: r.requires_technical_review,
        prazo: r.deadline, abertaPor: r.aberta_por,
        acolhidos: r.acolhidos, anexos: r.anexos,
      }));
    });
  }

  async get(user: AuthenticatedUser, id: string) {
    const dados = await this.db.asUser(user.id, async (c) => {
      const { rows: [i] } = await c.query(`SELECT * FROM incident WHERE id = $1`, [id]);
      if (!i) return null;
      // Sem `JOIN person`: a ocorrência pertence à CASA, a pessoa é visível
      // pela permanência ATIVA. Numa ocorrência de violência — categoria em
      // que a transferência é frequente — a equipe técnica que PRECISA fazer
      // a revisão abria o caso e não via mais criança nenhuma associada.
      const { rows: pessoas } = await c.query(
        `SELECT ip.person_id AS id, app_person_display_name(ip.person_id) AS nome
         FROM incident_person ip WHERE ip.incident_id = $1`, [id]);
      const { rows: [prot] } = await c.query(
        `SELECT spontaneous_speech, observed_signs, at FROM incident_protected WHERE incident_id = $1`, [id]);
      const { rows: [cont] } = await c.query(
        `SELECT * FROM incident_restraint WHERE incident_id = $1`, [id]);
      const { rows: sinteses } = await c.query(
        `SELECT s.id, s.body, s.at, app_user_display_name(s.author_id) AS autor
         FROM incident_synthesis s WHERE s.incident_id = $1 ORDER BY s.at`, [id]);
      /* `storage_ref` e `storage_key` não são pedidos: o papel da aplicação não
       * tem privilégio de leitura em nenhuma das duas (migrações 0320 e 1220).
       * Quem diz que há arquivo é o `mime`, que é metadado e não porta — a
       * tela precisa saber se o botão abre um documento ou um caminho, e
       * descobrir isso só ao clicar seria oferecer o que pode não existir. */
      const { rows: anexos } = await c.query(
        `SELECT a.id, a.kind, a.display_name, a.justification, a.restricted, a.at,
                a.mime IS NOT NULL AS tem_arquivo, a.file_name, a.size_bytes,
                app_user_display_name(a.author_id) AS autor
         FROM incident_attachment a WHERE a.incident_id = $1 ORDER BY a.at`, [id]);
      const { rows: comunicacoes } = await c.query(
        `SELECT e.id, e.organ, e.recipient_role, e.channel, e.status, e.occurred_at,
                e.approved_at, e.delivered_at
         FROM external_communication e WHERE e.incident_id = $1 ORDER BY e.created_at`, [id]);
      return { i, pessoas, prot, cont, sinteses, anexos, comunicacoes };
    });
    if (!dados) throw new NotFoundException('Ocorrência não encontrada — ou fora do seu alcance.');

    const relatos = await this.statements.listFor(user, 'incident', id);
    const i = dados.i;

    /*
     * A LEITURA DO BLOCO PROTEGIDO DEIXA LINHA (1530).
     *
     * Não deixava, para ninguém: a auditoria registrava quem ESCREVEU
     * (`incident.protected`) e não quem abriu. Quando a Fundação incluiu o Líder
     * Diurno entre quem lê, em 22/09, ampliar o acesso ao material mais pesado do
     * sistema sem rastro nenhum passou a ser a única coisa desta fase que eu não
     * saberia defender numa audiência — e a casa já tinha o precedente:
     * `person.judicial_view`, desde a fase 112.
     *
     * NÃO É a porta com finalidade escrita, que a Fundação recusou para este
     * caso: nada é perguntado a quem abre o caso para trabalhar. É uma linha.
     *
     * Só quando o bloco EXISTE e VEIO: registrar a abertura de uma ocorrência que
     * não tem bloco protegido encheria a auditoria de leituras de nada, e é assim
     * que uma trilha deixa de ser legível. E o log leva o ID e o cargo — nunca a
     * fala da criança (§5).
     */
    if (dados.prot) {
      await this.audit.log({
        action: 'incident.protected_view', actorId: user.id, houseId: i.house_id,
        entity: 'incident_protected', entityId: id,
        detail: { categoria: i.category, cargo: user.role },
      });
    }

    return {
      id: i.id, casaId: i.house_id,
      categoria: CATEGORIAS.find((c) => c.code === i.category)?.label ?? i.category,
      codigoCategoria: i.category,
      quando: i.happened_at, atividade: i.activity_ref,
      fato: i.objective_fact, presentes: i.people_present,
      medidasImediatas: i.immediate_measures,
      saude: i.health_related, medicamento: i.medication_related,
      contatos: i.contacts, pendencias: i.pendencies, prazo: i.deadline,
      status: i.status, nivelAcesso: i.access_level,
      revisaoTecnicaObrigatoria: i.requires_technical_review,
      acolhidos: dados.pessoas.map((p: any) => ({
        id: p.id,
        // Nome nulo aqui significa uma coisa só: a criança nunca esteve numa
        // casa do seu alcance. Dizer isso é melhor do que exibir um vazio.
        nome: p.nome ?? '(fora do seu alcance)',
        visivel: p.nome != null,
      })),
      // Vem nulo para quem a política não autoriza — e a tela diz por quê.
      protegido: dados.prot
        ? { falaEspontanea: dados.prot.spontaneous_speech,
            sinaisObservados: dados.prot.observed_signs, registradoEm: dados.prot.at }
        : null,
      /* A frase nomeava só dois cargos e envelheceu na 1530, quando a Fundação
         incluiu o Líder Diurno. Frase de tela que envelhece é frase que mente. */
      avisoProtegido: dados.prot ? null
        : 'Fala espontânea e sinais observados, quando existem, são acessíveis a quem os '
          + 'escreveu, à equipe técnica, à coordenação e ao Líder Diurno da casa — e à '
          + 'Enfermagem quando o registro é de saúde.',
      contencao: dados.cont ? {
        antecedentes: dados.cont.antecedents, local: dados.cont.place,
        presentes: dados.cont.people_present, tentativasAnteriores: dados.cont.previous_attempts,
        metodo: dados.cont.method, duracaoMinutos: dados.cont.duration_minutes,
        possivelLesao: dados.cont.possible_injury, avaliacaoSaude: dados.cont.health_evaluation,
        acaoPosterior: dados.cont.later_action,
        nota: 'O sistema não avalia se a medida foi adequada. Essa análise é humana e técnica.',
      } : null,
      sinteses: dados.sinteses.map((s: any) => ({ id: s.id, texto: s.body, autor: s.autor, quando: s.at })),
      relatos,
      // Listas vazias por política não são "não existe": são "não posso ver".
      // O líder encerra a etapa operacional sem navegar pela análise técnica,
      // mas precisa saber que ela pode existir (§13.5).
      avisoAnaliseTecnica: ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)
        ? null
        : 'Sínteses técnicas e comunicações externas, quando existem, são acessíveis à equipe técnica e à coordenação.',
      anexos: dados.anexos.map((a: any) => ({
        id: a.id, tipo: a.kind, nome: a.display_name, justificativa: a.justification,
        restrito: a.restricted, autor: a.autor, quando: a.at,
        // O líder vê que existe; abrir é outro ato, com finalidade.
        podeAbrirDireto: !a.restricted,
        // Arquivo aqui dentro, ou caminho no Drive? A tela escreve uma coisa
        // diferente em cada caso, e só uma das duas abre uma prévia.
        temArquivo: a.tem_arquivo === true,
        nomeDoArquivo: a.file_name, tamanho: a.size_bytes,
      })),
      comunicacoesExternas: dados.comunicacoes.map((e: any) => ({
        id: e.id, orgao: e.organ, destinatarioFuncional: e.recipient_role,
        canal: e.channel, status: e.status, quando: e.occurred_at,
        aprovadaEm: e.approved_at, entregueEm: e.delivered_at,
      })),
    };
  }

  // ------------------------------------------------------------------

  /**
   * FALA ESPONTÂNEA E SINAIS OBSERVADOS (§13.2).
   *
   * O registro mais delicado do sistema, e o único que a casa não podia fazer
   * por tela: o servidor tem esta rota desde a fase 6 e não havia porta. Sem
   * porta, o que a criança disse ou virava texto no campo "fato" — que o
   * plantão inteiro lê — ou não era registrado.
   *
   * Três recusas que valem mais do que o campo:
   *
   *  * VAZIO não se registra. Uma linha protegida com os dois campos nulos
   *    ocupa o lugar único da ocorrência e não pode ser reescrita: a próxima
   *    pessoa, que tem o que dizer, leva a recusa por causa de um toque errado;
   *  * OCORRÊNCIA FECHADA não recebe. A cópia documental já foi para o
   *    arquivo; sistema e cópia passariam a dizer coisas diferentes, em
   *    silêncio. É a mesma correção do episódio em ATA fechada;
   *  * e a recusa do registro que já existe NÃO descreve o que existe. Quem
   *    não pode ler o conteúdo protegido também não deveria saber o que ele
   *    diz — a frase fala do ATO, e indica o caminho que continua aberto para
   *    essa pessoa: o relato em nome próprio.
   */
  async addProtected(user: AuthenticatedUser, id: string, input: {
    falaEspontanea?: string; sinaisObservados?: string;
  }) {
    const fala = (input.falaEspontanea ?? '').trim();
    const sinais = (input.sinaisObservados ?? '').trim();
    if (!fala && !sinais) {
      throw new BadRequestException(
        'Escreva ao menos a fala espontânea ou os sinais observados. Este registro é único '
        + 'por ocorrência e não é reescrito — um registro vazio ocuparia o lugar de quem '
        + 'tem o que dizer.');
    }
    const casa = await this.casa(user, id);
    const { rows: [st] } = await this.db.asUser(user.id, async (c) =>
      c.query(`SELECT status FROM incident WHERE id = $1`, [id]));
    if (st?.status === 'fechada') {
      throw new BadRequestException(
        'A ocorrência está fechada e a cópia documental dela já foi arquivada. Para acrescentar '
        + 'algo, peça a reabertura à equipe técnica — a reabertura fica registrada, e o que '
        + 'você escrever depois nasce datado do dia em que foi escrito.');
    }
    input = { falaEspontanea: fala || undefined, sinaisObservados: sinais || undefined };
    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(
          `INSERT INTO incident_protected (incident_id, house_id, spontaneous_speech, observed_signs, author_id, health_related)
           SELECT $1,$2,$3,$4,$5, i.health_related FROM incident i WHERE i.id = $1`,
          [id, casa, input.falaEspontanea ?? null, input.sinaisObservados ?? null, user.id]);
      });
    } catch (e: any) {
      if (e?.code === '23505') {
        // De propósito, não diz o que já está lá: quem não pode LER o conteúdo
        // protegido não fica sabendo o que ele diz por causa de uma recusa.
        throw new BadRequestException(
          'Esta ocorrência não recebe outro registro protegido: ele é único e não se reescreve. '
          + 'Escreva um relato em seu nome — ele fica ao lado, com a sua assinatura e a sua hora, '
          + 'e ninguém o altera depois.');
      }
      throw e;
    }
    await this.audit.log({ action: 'incident.protected', actorId: user.id, houseId: casa,
      entity: 'incident', entityId: id, detail: { fala: !!input.falaEspontanea, sinais: !!input.sinaisObservados } });
    return { ok: true, aviso: 'Registrado. Este conteúdo não aparece para colegas do plantão.' };
  }

  /** Contenção: campos próprios exigidos pelo §13.3. */
  async addRestraint(user: AuthenticatedUser, id: string, input: any) {
    const obrigatorios: Array<[string, string]> = [
      ['antecedentes', 'fatos antecedentes'], ['local', 'local'],
      ['presentes', 'pessoas presentes'], ['tentativasAnteriores', 'tentativas anteriores'],
      ['metodo', 'método utilizado'],
    ];
    const faltando = obrigatorios.filter(([k]) => !(input?.[k] ?? '').toString().trim());
    if (faltando.length) {
      throw new BadRequestException(
        `Registro de contenção exige: ${faltando.map(([, l]) => l).join(', ')}.`);
    }
    /*
     * A CASA, ANTES DE ESCREVER (1550).
     *
     * Este era o único dos irmãos que não conferia — `addSynthesis`,
     * `addProtected` e os anexos chamam `this.casa`. Sem ela, a recusa vinha da
     * política do banco, e em inglês de Postgres, na tela de quem registra uma
     * contenção às 3h. A política agora também recusa (é ela que vale para
     * qualquer caminho novo); aqui a resposta é a frase da regra 8 — fora do
     * alcance responde igual a inexistente.
     */
    const casa = await this.casa(user, id);
    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(
          `INSERT INTO incident_restraint (incident_id, antecedents, place, people_present,
             previous_attempts, method, duration_minutes, possible_injury, health_evaluation,
             later_action, followup_by, recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [id, input.antecedentes, input.local, input.presentes, input.tentativasAnteriores,
           input.metodo, input.duracaoMinutos ?? null, input.possivelLesao ?? null,
           input.avaliacaoSaude ?? null, input.acaoPosterior ?? null,
           input.responsavelAcompanhamentoId ?? null, user.id]);
      });
    } catch (e: any) {
      if (e?.code === '23505') throw new BadRequestException('Esta contenção já foi registrada e não é reescrita.');
      throw e;
    }
    await this.audit.log({ action: 'incident.restraint', actorId: user.id, houseId: casa,
      entity: 'incident', entityId: id, detail: { duracao: input.duracaoMinutos ?? null } });
    return {
      ok: true,
      aviso: 'Registrado. O sistema não avalia se a medida foi adequada — a análise é da equipe técnica.',
    };
  }

  /** Síntese técnica: registro NOVO, ao lado dos originais (§13.4). */
  async addSynthesis(user: AuthenticatedUser, id: string, texto: string) {
    if ((texto ?? '').trim().length < 20) {
      throw new BadRequestException('A síntese precisa de conteúdo (mínimo 20 caracteres).');
    }
    const casa = await this.casa(user, id);
    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(
          `INSERT INTO incident_synthesis (incident_id, house_id, body, author_id)
           VALUES ($1,$2,$3,$4)`, [id, casa, texto.trim(), user.id]);
      });
    } catch (e: any) {
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        throw new ForbiddenException('A síntese cabe à equipe técnica e à coordenação.');
      }
      throw e;
    }
    await this.audit.log({ action: 'incident.synthesis', actorId: user.id, houseId: casa,
      entity: 'incident', entityId: id });
    return { ok: true, aviso: 'Síntese gravada. Nenhum relato original foi alterado ou apagado.' };
  }

  /** §26.2 #22 — ocorrência crítica fechada pelo líder AGUARDA revisão técnica. */
  async closeOperational(user: AuthenticatedUser, id: string, nota?: string) {
    const r = await this.comando(user, 'app_close_incident_operational($1,$2)', [id, nota ?? null], {
      cargo_nao_encerra_ocorrencia: () => new ForbiddenException(
        'O encerramento da etapa operacional cabe ao líder responsável, à equipe técnica ou à coordenação.'),
      ocorrencia_ja_fechada: () => new BadRequestException('Esta ocorrência já está fechada.'),
      etapa_operacional_ja_encerrada: () => new BadRequestException(
        'A etapa operacional desta ocorrência já foi encerrada.'),
      ocorrencia_inexistente: () => new NotFoundException('Ocorrência não encontrada.'),
    });

    if (r.out_needs_review) {
      const casa = await this.casa(user, id);
      const pedido: EscalationRequest = {
        level: 'tecnica_coordenacao', entity: 'incident_review', entityId: id,
        reason: 'aguardando_revisao_tecnica',
        title: 'Ocorrência aguardando revisão técnica',
        body: 'A etapa operacional foi encerrada. A validação técnica ainda é necessária para fechar.',
        priority: 'critica', groupKey: `incident-review:${id}`,
      };
      await this.bus.publish('escalation.requested', pedido, { actorId: user.id, houseId: casa });
    }

    return {
      status: r.out_status,
      aviso: r.out_needs_review
        ? 'Etapa operacional encerrada. A ocorrência permanece AGUARDANDO REVISÃO TÉCNICA — ela não está fechada.'
        : 'Etapa operacional encerrada.',
    };
  }

  async review(user: AuthenticatedUser, id: string, decisao: string, nota?: string) {
    const r = await this.comando(user, 'app_review_incident($1,$2,$3)', [id, decisao, nota ?? null], {
      cargo_nao_revisa: () => new ForbiddenException(
        'A validação técnica cabe à equipe técnica e à coordenação.'),
      sintese_ausente: () => new BadRequestException(
        'Registre a síntese técnica antes de fechar. Em caso de saúde, medicamento, contenção ou '
        + 'violência, o fechamento precisa dizer a que se chegou.'),
      etapa_operacional_em_aberto: () => new BadRequestException(
        'A revisão técnica vem depois do encerramento da etapa operacional. '
        + 'O líder responsável precisa encerrá-la primeiro.'),
      ocorrencia_ja_fechada: () => new BadRequestException(
        'Esta ocorrência já está fechada. Reabra com histórico se for preciso rever.'),
      ocorrencia_nao_esta_encerrada: () => new BadRequestException(
        'Só se reabre uma ocorrência encerrada ou fechada.'),
      decisao_invalida: () => new BadRequestException('Decisão deve ser "validar" ou "reabrir".'),
      ocorrencia_inexistente: () => new NotFoundException('Ocorrência não encontrada.'),
    });
    /*
     * Só a ocorrência FECHADA vira cópia documental. Reabrir não arquiva: o
     * documento ainda está sendo escrito, e uma cópia de meio de caminho é
     * pior do que cópia nenhuma — ela circula como se fosse a versão final.
     * O segundo fechamento reenfileira, e a fila é idempotente por versão.
     */
    if (r.out_status === 'fechada') {
      const casa = await this.casa(user, id);
      const copia: DocumentClosed = {
        categoria: 'ocorrencia', entidade: 'incident', entityId: id, houseId: casa,
      };
      await this.bus.publish('document.closed', copia, { actorId: user.id, houseId: casa });
    }

    return {
      status: r.out_status,
      aviso: r.out_status === 'fechada'
        ? 'Fechada após validação técnica. O histórico permanece consultável e pode ser reaberto.'
        : 'Reaberta, com histórico preservado.',
    };
  }

  // ------------------------------------------------------------------
  // Anexos (§13.7)
  // ------------------------------------------------------------------

  /**
   * AS DUAS FORMAS DE ANEXAR, e a casa escolhe uma delas por anexo (fase 108).
   *
   * `conteudo` em base64 sobe o papel digitalizado; `referencia` aponta o
   * caminho no Drive institucional. **Uma das duas, e não nenhuma** — é o que o
   * CHECK `anexo_tem_onde_estar` cobra no banco, e é o que faltava: o
   * `storage_ref NOT NULL` garantia um texto, nunca um documento.
   */
  async addAttachment(user: AuthenticatedUser, id: string, input: {
    tipo: string; nome: string; referencia?: string; justificativa?: string;
    restrito?: boolean; checksum?: string; conteudo?: string; nomeArquivo?: string;
  }) {
    const tipo = TIPOS_ANEXO.find((t) => t.cod === input.tipo);
    if (!tipo) {
      throw new BadRequestException(
        `Escolha o tipo do anexo: ${TIPOS_ANEXO.map((t) => t.label).join('; ')}.`);
    }
    const referencia = (input.referencia ?? '').trim();
    if (!referencia && !(input.conteudo ?? '').trim()) {
      throw new BadRequestException(
        'Anexe o documento digitalizado, ou informe onde ele está — a pasta ou o link no '
        + 'Drive da instituição. Uma das duas: anexo sem nenhuma das duas é uma linha que '
        + 'promete um documento que ninguém alcança.');
    }
    // §13.7: foto exige justificativa. Sem ela, não entra.
    if (input.tipo === 'foto_autorizada' && (input.justificativa ?? '').trim().length < 15) {
      throw new BadRequestException(
        'Foto exige justificativa: para que ela é necessária e qual autorização a ampara.');
    }
    const nome = (input.nome ?? '').trim();
    if (!nome) throw new BadRequestException('Informe um nome de exibição para o anexo.');
    if (PROIBIDO_NO_NOME.some((re) => re.test(nome))) {
      // §3.3 — CPF, diagnóstico e conteúdo judicial nunca em nome de arquivo.
      throw new BadRequestException(
        'O nome do arquivo não pode conter CPF, diagnóstico ou referência judicial. '
        + 'Use um nome neutro; o conteúdo fica protegido dentro do anexo.');
    }

    /* O nome do ARQUIVO passa pela mesma regra do nome de exibição: ele viaja
     * junto com os bytes, aparece em download e em pasta compartilhada. */
    const nomeArquivo = (input.nomeArquivo ?? '').trim();
    if (nomeArquivo && PROIBIDO_NO_NOME.some((re) => re.test(nomeArquivo))) {
      throw new BadRequestException(
        'O NOME DO ARQUIVO tem o mesmo problema: nada de CPF, diagnóstico ou referência '
        + 'judicial. Renomeie antes de anexar.');
    }

    // Guardado ANTES da transação: se o disco recusar, nenhuma linha nasce
    // apontando para um objeto que não existe.
    const guardado = await this.arquivos.guardar(input.conteudo);

    const casa = await this.casa(user, id);
    const attId = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `INSERT INTO incident_attachment (incident_id, house_id, kind, display_name,
           justification, restricted, storage_ref, checksum, author_id,
           storage_key, mime, file_name, size_bytes, sha256)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [id, casa, input.tipo, nome, input.justificativa ?? null,
         input.restrito ?? tipo.restritoPorPadrao,
         referencia || null, input.checksum ?? null, user.id,
         guardado?.chave ?? null, guardado?.mime ?? null,
         guardado ? (nomeArquivo || nome) : null,
         guardado?.tamanho ?? null, guardado?.sha256 ?? null]);
      return r.id as string;
    });

    await this.audit.log({ action: 'incident.attachment_add', actorId: user.id, houseId: casa,
      entity: 'incident_attachment', entityId: attId,
      detail: { tipo: input.tipo, forma: guardado ? 'arquivo' : 'referencia' } });
    return {
      id: attId,
      aviso: guardado
        ? 'Anexo guardado no sistema. Quem abrir vê o documento, e a abertura fica registrada.'
        : 'Anexo registrado por referência: o arquivo continua no Drive da instituição.',
    };
  }

  async openAttachment(user: AuthenticatedUser, attachmentId: string, finalidade?: string) {
    try {
      const r = await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_open_attachment($1,$2)`, [attachmentId, finalidade ?? '']);
        return row;
      });
      /* O ARQUIVO, quando ele está aqui dentro. A leitura do disco vem DEPOIS
       * da função, que é quem registra — o registro não pode depender de o
       * objeto ainda estar lá. E se ele não estiver, a frase diz a verdade em
       * vez de devolver um anexo vazio: o banco continua jurando que o arquivo
       * existe, e quem perdeu metade do acervo num backup descobre aqui. */
      const bytes = r.out_key ? await this.arquivos.ler(r.out_key) : null;
      if (r.out_key && !bytes) {
        throw new NotFoundException(
          'O registro deste anexo existe, mas o arquivo não está no acervo. '
          + 'Avise a TI: é o caso de acervo restaurado pela metade (§12.2).');
      }
      return {
        referencia: r.out_ref, tipo: r.out_kind, nome: r.out_name,
        arquivo: bytes
          ? { nome: r.out_file_name ?? r.out_name, tipo: r.out_mime ?? 'application/octet-stream',
              conteudo: bytes.toString('base64') }
          : null,
        aviso: bytes
          ? 'Abertura registrada em auditoria, com o seu nome e o horário.'
          : 'Abertura registrada em auditoria. O arquivo está no Drive da instituição, '
            + 'no caminho abaixo.',
      };
    } catch (e: any) {
      const m = e?.message ?? '';
      if (m.includes('anexo_restrito')) {
        throw new ForbiddenException(
          'Anexo restrito. Você pode ver que ele existe; abri-lo cabe à equipe técnica e à coordenação.');
      }
      if (m.includes('finalidade_insuficiente')) {
        throw new BadRequestException('Descreva a finalidade da abertura (mínimo 15 caracteres).');
      }
      if (m.includes('anexo_inexistente')) throw new NotFoundException('Anexo não encontrado.');
      throw e;
    }
  }

  // ------------------------------------------------------------------
  // Comunicação externa (§13.6) — registrar, gerar, aprovar. NUNCA enviar.
  // ------------------------------------------------------------------

  async createCommunication(user: AuthenticatedUser, input: {
    houseId: string; incidentId?: string; acolhidoId?: string;
    orgao: string; destinatarioFuncional: string; canal: string;
    quando?: string; resumo: string; documentos?: unknown[];
    orientacao?: string; acompanhamento?: string;
  }) {
    if (!ORGAOS.includes(input.orgao)) throw new BadRequestException('Órgão inválido.');
    if (!CANAIS.includes(input.canal)) throw new BadRequestException('Canal inválido.');
    if ((input.resumo ?? '').trim().length < 20) {
      throw new BadRequestException('Descreva o teor da comunicação (mínimo 20 caracteres).');
    }
    if (!(input.destinatarioFuncional ?? '').trim()) {
      throw new BadRequestException(
        'Informe o destinatário funcional (o cargo ou setor), não o nome de uma pessoa.');
    }

    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `INSERT INTO external_communication (house_id, incident_id, person_id, organ,
           recipient_role, channel, occurred_at, summary, documents, guidance, followup,
           responsible_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9::jsonb,$10,$11,$12,$13) RETURNING id`,
        [input.houseId, input.incidentId ?? null, input.acolhidoId ?? null, input.orgao,
         input.destinatarioFuncional.trim(), input.canal, input.quando ?? null,
         input.resumo.trim(), JSON.stringify(input.documentos ?? []),
         input.orientacao ?? null, input.acompanhamento ?? null, user.id, user.id]);
      return r.id as string;
    }).catch((e: any) => {
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        throw new ForbiddenException('A comunicação externa é registrada pela equipe técnica ou pela coordenação.');
      }
      throw e;
    });

    await this.audit.log({ action: 'external_comm.create', actorId: user.id, houseId: input.houseId,
      entity: 'external_communication', entityId: id, detail: { orgao: input.orgao, canal: input.canal } });

    return {
      id, status: 'rascunho',
      // A frase é a regra: não há botão de enviar, em lugar nenhum.
      aviso: 'Registrada como rascunho. O sistema NÃO envia nada para fora: depois de revisada e aprovada, '
           + 'a entrega é feita por uma pessoa e registrada aqui.',
    };
  }

  async submitCommunication(user: AuthenticatedUser, id: string) {
    return this.mudarStatus(user, id, 'em_revisao', 'external_comm.submit',
      'Enviada para revisão interna.');
  }

  async approveCommunication(user: AuthenticatedUser, id: string) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('A aprovação cabe à equipe técnica, à coordenação ou ao Gestor Geral.');
    }
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE external_communication SET status = 'aprovado', approved_by = $2, approved_at = now()
         WHERE id = $1 AND status IN ('rascunho','em_revisao')`, [id, user.id]);
      return (rowCount ?? 0) > 0;
    }).catch((e: any) => {
      // Padrão protetivo (reversível): quem redige não aprova. O §13.6 trata
      // "registrar", "revisar" e "aprovar" como etapas distintas — e uma
      // comunicação ao Judiciário ou ao Conselho Tutelar aprovada pelo próprio
      // autor não passou por revisão nenhuma.
      if ((e?.message ?? '').includes('aprovador_igual_ao_autor')) {
        throw new BadRequestException(
          'Quem redigiu a comunicação não pode aprová-la. A aprovação é de outra pessoa da equipe técnica, '
          + 'da coordenação ou do Gestor Geral.');
      }
      throw e;
    });
    if (!ok) throw new BadRequestException('Só se aprova comunicação em rascunho ou em revisão.');
    await this.audit.log({ action: 'external_comm.approve', actorId: user.id,
      entity: 'external_communication', entityId: id });
    return {
      status: 'aprovado',
      aviso: 'Aprovada. O documento pode ser gerado e entregue por uma pessoa — o sistema não realiza o envio.',
    };
  }

  /** Registro da entrega feita por um humano (§13.6). */
  async registerDelivery(user: AuthenticatedUser, id: string, input: { quando?: string; nota?: string }) {
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE external_communication
            SET status = 'entregue_manualmente', delivered_by = $2,
                delivered_at = coalesce($3::timestamptz, now()), delivery_note = $4
          WHERE id = $1 AND status = 'aprovado'`,
        [id, user.id, input.quando ?? null, input.nota ?? null]);
      return (rowCount ?? 0) > 0;
    }).catch((e: any) => {
      if ((e?.message ?? '').includes('entrega_sem_aprovacao')) {
        throw new BadRequestException('A entrega só é registrada depois da aprovação.');
      }
      throw e;
    });
    if (!ok) throw new BadRequestException('A entrega só é registrada depois da aprovação.');
    await this.audit.log({ action: 'external_comm.delivered', actorId: user.id,
      entity: 'external_communication', entityId: id });
    return { status: 'entregue_manualmente', aviso: 'Entrega registrada, com responsável e horário.' };
  }

  /**
   * OS OFÍCIOS SOBRE UMA CRIANÇA, NA VIDA DELA (fase 118).
   *
   * `external_communication.person_id` é gravado desde a migração 0320 e
   * **nenhuma consulta o lia**: nem o detalhe da ocorrência, nem a lista da
   * casa. Um ofício ao Judiciário, ao Conselho Tutelar ou ao Ministério
   * Público SOBRE a Alice não aparecia em lugar nenhum da vida da Alice — e é
   * o tipo de documento que a audiência pergunta se existe.
   *
   * O alcance é o da própria `ec_select`: equipe técnica, coordenação e Gestor
   * Geral, na casa. O educador de plantão não lê ofício, e continua não lendo.
   *
   * Sem contagem: a lista é a lista. "Três ofícios ao MP" no alto do perfil de
   * uma criança é um número que viaja e um contexto que fica para trás.
   */
  async comunicacoesDoAcolhido(user: AuthenticatedUser, personId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT e.id, e.organ, e.recipient_role, e.channel, e.status, e.summary,
                e.occurred_at, e.approved_at, e.delivered_at, e.incident_id,
                app_user_display_name(e.responsible_id) AS responsavel
         FROM external_communication e
         WHERE e.person_id = $1
         ORDER BY e.created_at DESC LIMIT 100`, [personId]);
      return rows.map((r) => ({
        id: r.id, orgao: r.organ, destinatarioFuncional: r.recipient_role,
        canal: r.channel, status: r.status, resumo: r.summary,
        quando: r.occurred_at, aprovadaEm: r.approved_at, entregueEm: r.delivered_at,
        ocorrenciaId: r.incident_id, responsavel: r.responsavel,
      }));
    });
  }

  async listCommunications(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT e.id, e.organ, e.recipient_role, e.channel, e.status, e.summary,
                e.occurred_at, e.approved_at, e.delivered_at, e.incident_id,
                app_user_display_name(e.responsible_id) AS responsavel
         FROM external_communication e WHERE e.house_id = $1
         ORDER BY e.created_at DESC LIMIT 200`, [houseId]);
      return rows.map((r) => ({
        id: r.id, orgao: r.organ, destinatarioFuncional: r.recipient_role,
        canal: r.channel, status: r.status, resumo: r.summary,
        quando: r.occurred_at, aprovadaEm: r.approved_at, entregueEm: r.delivered_at,
        ocorrenciaId: r.incident_id, responsavel: r.responsavel,
      }));
    });
  }

  // ------------------------------------------------------------------

  private async mudarStatus(user: AuthenticatedUser, id: string, novo: string, acao: string, aviso: string) {
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE external_communication SET status = $2 WHERE id = $1 AND status = 'rascunho'`,
        [id, novo]);
      return (rowCount ?? 0) > 0;
    });
    if (!ok) throw new BadRequestException('Transição não permitida a partir do estado atual.');
    await this.audit.log({ action: acao, actorId: user.id, entity: 'external_communication', entityId: id });
    return { status: novo, aviso };
  }

  private async casa(user: AuthenticatedUser, incidentId: string): Promise<string> {
    const casa = await this.db.asUser(user.id, async (c) => {
      const { rows: [i] } = await c.query(`SELECT house_id FROM incident WHERE id = $1`, [incidentId]);
      return i?.house_id;
    });
    if (!casa) throw new NotFoundException('Ocorrência não encontrada — ou fora do seu alcance.');
    return casa;
  }

  private async comando(
    user: AuthenticatedUser, sql: string, params: unknown[],
    mapa: Record<string, () => Error> = {},
  ): Promise<any> {
    try {
      return await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(`SELECT * FROM ${sql}`, params);
        return row;
      });
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      for (const [chave, fabrica] of Object.entries(mapa)) {
        if (msg.includes(chave)) throw fabrica();
      }
      if (msg.includes('fora_de_escopo')) {
        throw new ForbiddenException('Esta ocorrência pertence a outra casa.');
      }
      throw e;
    }
  }

  // ------------------------------------------------------------------
  // A ocorrência como documento
  // ------------------------------------------------------------------

  /**
   * A folha da ocorrência. Ver não é exportar: não gera arquivo e não registra.
   *
   * O que fica de fora é a decisão desta folha: `protegido` NUNCA entra, nem
   * para quem tem a política para lê-lo na tela. Ver na tela é um acesso
   * registrado, de uma pessoa, num momento; a folha impressa é uma cópia que
   * anda sozinha pela casa.
   */
  async folhaDaOcorrencia(user: AuthenticatedUser, id: string) {
    const o: any = await this.get(user, id);
    return folhaDaOcorrencia(
      {
        categoria: o.categoria, quando: o.quando, status: o.status,
        fato: o.fato, medidasImediatas: o.medidasImediatas,
        acolhidos: (o.acolhidos ?? []).map((a: any) => ({ nome: a.nome })),
        relatos: { relatos: (o.relatos?.relatos ?? []).map((r: any) => ({
          autor: r.autor, testemunho: r.testemunho, quando: r.quando, relato: r.relato,
        })) },
        sinteses: (o.sinteses ?? []).map((x: any) => ({
          autor: x.autor, quando: x.quando, texto: x.texto,
        })),
      },
      { nome: user.fullName, cargo: cargoNoDocumento(user.role) },
    );
  }

  async exportar(user: AuthenticatedUser, id: string, finalidade: string) {
    const o: any = await this.get(user, id);
    const folha = await this.folhaDaOcorrencia(user, id);
    return this.documentos.exportar(user, folha, {
      entidade: 'incident', entidadeId: id, houseId: o.casaId, finalidade,
    });
  }

}
