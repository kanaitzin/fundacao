import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser, DocumentClosed, EscalationRequest } from '../../kernel/contracts';
import { hojeNaInstituicao, dataDoPlantao, janelaDeConsulta } from '../../kernel/common/tempo';
import { SECOES_ATA, AMBIENTES_CASA, CLASSIFICACOES_EPISODIO } from './ata-secoes';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { cargoNoDocumento } from '../../kernel/documentos/folha';
import { folhaDaAta } from './ata-folha';

/**
 * PLANTÃO, PASSAGEM E ATA (§12).
 *
 * Três coisas que este serviço se recusa a fazer, e que valem mais do que as
 * que ele faz:
 *
 *  * completar a ATA quando falta assinatura — ele NOMEIA quem faltou e fecha
 *    "com pendência" (§12.4). Uma ATA cheia e falsa é pior do que uma ATA
 *    honesta e incompleta;
 *  * deixar alguém assinar pelo colega — a política do banco recusa antes de
 *    o serviço opinar (§26.2 #18);
 *  * reescrever ATA fechada — correção é adendo com antes e depois (§12.7).
 */
@Injectable()
export class ShiftsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
  ) {}

  secoes() {
    return {
      secoes: SECOES_ATA,
      // Os ambientes da seção "Organização da casa": o formulário de papel
      // marca um por um, e a tela precisa da lista para desenhar o mesmo.
      ambientes: AMBIENTES_CASA,
      classificacoesEpisodio: CLASSIFICACOES_EPISODIO,
      aviso: 'A ATA descreve o TURNO e os AMBIENTES. A organização da casa é do ambiente, '
        + 'nunca de quem arrumou ou deixou de arrumar (§3.3).',
    };
  }

  // ------------------------------------------------------------------
  // Plantão
  // ------------------------------------------------------------------

  async open(user: AuthenticatedUser, input: { houseId: string; data?: string; turno: string }) {
    // A noite pertence ao dia em que COMEÇOU: às 02h de quinta ainda é o
    // plantão de quarta. Sem isso, quem abre antes e quem abre depois da
    // meia-noite criam dois plantões para a mesma noite.
    const data = input.data ?? dataDoPlantao(input.turno);
    if (!['diurno', 'noturno'].includes(input.turno)) {
      throw new BadRequestException('Turno deve ser "diurno" ou "noturno".');
    }
    const r = await this.comando(user, 'app_open_shift($1,$2,$3)', [input.houseId, data, input.turno]);
    if (r.out_created) {
      await this.audit.log({
        action: 'shift.open', actorId: user.id, houseId: input.houseId,
        entity: 'shift', entityId: r.out_shift_id, detail: { data, turno: input.turno },
      });
    }
    return {
      plantaoId: r.out_shift_id, ataId: r.out_ata_id, novo: r.out_created,
      data, turno: input.turno, secoes: SECOES_ATA,
    };
  }

  /** Situação do plantão: quem assinou, quem falta, quem recebeu. */
  async get(user: AuthenticatedUser, shiftId: string) {
    const dados = await this.db.asUser(user.id, async (c) => {
      const { rows: [s] } = await c.query(`SELECT * FROM shift WHERE id = $1`, [shiftId]);
      if (!s) return null;
      const { rows: [a] } = await c.query(`SELECT * FROM ata WHERE shift_id = $1`, [shiftId]);
      const { rows: passagens } = await c.query(
        `SELECT h.id, h.user_id, h.role, h.device, h.contributions, h.pending, h.guidance,
                h.medication_note, h.signed_at, h.happened_at, h.late, h.offline,
                app_user_display_name(h.user_id) AS quem
         FROM handover h WHERE h.shift_id = $1 ORDER BY h.signed_at`, [shiftId]);
      // As doses do turno vêm JUNTO com o plantão, e não numa rota à parte: a
      // tela da passagem precisa delas antes de assinar, e uma segunda ida ao
      // servidor é uma tela que abre pela metade no corredor.
      const { rows: doses } = await c.query(`SELECT * FROM app_doses_do_turno($1)`, [shiftId]);
      /*
       * AS CONVIVÊNCIAS FAMILIARES DO TURNO (1070).
       *
       * Vem junto pelo mesmo motivo das doses: a Passagem e a ATA precisam
       * disto antes de qualquer clique, e uma segunda ida ao servidor é uma
       * tela que abre pela metade no corredor. E vem de UMA função para as
       * DUAS telas — duas consultas quase iguais divergiriam no primeiro
       * ajuste, e a passagem passaria a dizer uma coisa e a ATA outra sobre o
       * mesmo domingo.
       */
      const { rows: convivencias } = await c.query(
        `SELECT * FROM app_convivencias_do_turno($1)`, [shiftId]);
      const { rows: [jaEscrito] } = await c.query(
        `SELECT count(*)::int AS n FROM handover
          WHERE shift_id = $1 AND btrim(coalesce(medication_note,'')) <> ''`, [shiftId]);
      /*
       * AS LINHAS DA ATA, com autor (0970). A política já esconde as restritas
       * de quem não as alcança; a CONTAGEM vem de `app_ata_restritas`, que é
       * SECURITY DEFINER de propósito — quem não lê o texto precisa saber que
       * ele existe, e é o precedente do §13.7.
       */
      const { rows: notas } = await c.query(
        `SELECT n.id, n.author_id, n.body, n.restricted, n.happened_at, n.created_at,
                app_user_display_name(n.author_id) AS quem,
                (SELECT u.role::text FROM app_user u WHERE u.id = n.author_id) AS cargo,
                /* A cor ESCOLHIDA do autor (0990). Sai por função porque quem lê
                   a ATA não gere equipe — o educador não alcança app_staff_list.
                   NULL: a tela cai no tom automático, como antes. */
                app_cor_do_autor(n.author_id) AS cor_autor
           FROM ata_note n WHERE n.ata_id = $1 ORDER BY n.happened_at`, [a?.id ?? null]);
      const { rows: [restritas] } = a
        ? await c.query(`SELECT app_ata_restritas($1) AS n`, [a.id])
        : { rows: [{ n: 0 }] } as any;
      const { rows: complementos } = await c.query(
        `SELECT n.id, n.handover_id, n.user_id, n.body, n.happened_at, n.written_at, n.offline,
                app_user_display_name(n.user_id) AS quem
         FROM handover_note n WHERE n.shift_id = $1 ORDER BY n.written_at`, [shiftId]);
      const { rows: recebimentos } = await c.query(
        `SELECT r.id, r.user_id, r.received_at, r.read_guidance, r.took_pending, r.note,
                app_user_display_name(r.user_id) AS quem
         FROM handover_receipt r WHERE r.shift_id = $1 ORDER BY r.received_at`, [shiftId]);
      const { rows: faltam } = await c.query(
        `SELECT user_id, full_name, role FROM app_missing_handovers($1)`, [shiftId]);
      /*
       * A ESCALA DESTE TURNO FOI LANÇADA? (1370)
       *
       * Pergunta separada porque a resposta precisa existir quando a LISTA não
       * existe: sem escala lançada, `app_missing_handovers` devolve vazio, e
       * "ninguém deve assinar" e "ninguém foi escalado" não podem chegar à tela
       * como a mesma coisa.
       *
       * A 0960 prometia isso numa coluna `fonte` de cada linha, e este serviço
       * nunca a leu — a tela passou de 0960 até 20/09/2026 sem poder distinguir
       * "faltou assinar" de "escala não cadastrada", que era a razão de a coluna
       * existir.
       */
      const { rows: [fonte] } = await c.query(
        `SELECT app_fonte_da_escala($1) AS f`, [shiftId]);
      const { rows: episodios } = await c.query(
        // Sem `JOIN person`: a ATA pertence à CASA e é imutável, mas a pessoa
        // é visível pela permanência ATIVA. Um episódio de contenção sumia da
        // ATA fechada no dia em que a criança era transferida — o registro
        // continuava lá, e a tela mostrava lista vazia.
        `SELECT e.id, e.person_id, e.classification, e.factual, e.happened_at, e.incident_id,
                app_person_display_name(e.person_id) AS acolhido,
                app_user_display_name(e.created_by) AS registrado_por,
                (SELECT count(*)::int FROM ata_episode_ack k WHERE k.episode_id = e.id) AS ciencias
         FROM ata_episode e
         WHERE e.ata_id = $1 ORDER BY e.happened_at`, [a?.id ?? null]);
      // A contagem sozinha não serve para nada: "2 ciências" não diz se o
      // líder que assume o turno é uma delas, e é exatamente isso que a tela
      // precisa saber para oferecer (ou não) o botão. A ciência é ato com
      // nome — vem com quem, quando e o comentário próprio, se houver.
      // rls-join-ok: ack_select já exige app_house_in_scope do episódio.
      const { rows: ciencias } = await c.query(
        `SELECT k.id, k.episode_id, k.user_id, k.comment, k.at,
                app_user_display_name(k.user_id) AS quem
           FROM ata_episode_ack k
           JOIN ata_episode e ON e.id = k.episode_id
          WHERE e.ata_id = $1 ORDER BY k.at`, [a?.id ?? null]);
      return { s, a, passagens, complementos, recebimentos, faltam, episodios, ciencias,
               doses, jaEscrito: (jaEscrito?.n ?? 0) > 0, convivencias,
               notas, restritas: restritas?.n ?? 0, fonteDaEscala: fonte?.f ?? null };
    });
    if (!dados) throw new NotFoundException('Plantão não encontrado.');

    return {
      id: dados.s.id, casaId: dados.s.house_id, data: dados.s.on_date,
      turno: dados.s.period, status: dados.s.status,
      abertoEm: dados.s.opened_at, fechadoEm: dados.s.closed_at,
      ata: dados.a ? {
        id: dados.a.id, status: dados.a.status, versao: dados.a.version,
        conteudo: dados.a.content, pendencias: dados.a.pendencies,
        assinaturasFaltantes: dados.a.missing_signatures,
        fechadaEm: dados.a.closed_at,
      } : null,
      passagens: dados.passagens.map((h: any) => ({
        id: h.id, quem: h.quem, cargo: h.role, aparelho: h.device,
        contribuicoes: h.contributions, pendencias: h.pending, orientacoes: h.guidance,
        medicacao: h.medication_note,
        assinadaEm: h.signed_at, horarioReal: h.happened_at,
        complementoTardio: h.late, offline: h.offline,
        propria: h.user_id === user.id,
        // O complemento nasce ao lado da passagem, nunca dentro dela: quem
        // lê vê o que foi assinado às 19h e, separado, o que o mesmo autor
        // acrescentou às 20h.
        complementos: dados.complementos
          .filter((n: any) => n.handover_id === h.id)
          .map((n: any) => ({
            id: n.id, quem: n.quem, texto: n.body,
            quando: n.happened_at, escritoEm: n.written_at, offline: n.offline,
          })),
      })),
      // A lista de quem falta é parte da tela, não um detalhe de fechamento:
      // é o que permite ir atrás da pessoa antes de fechar com pendência.
      assinaturasPendentes: dados.faltam.map((f: any) => ({ quem: f.full_name, cargo: f.role })),
      /**
       * A ESCALA DESTE TURNO FOI LANÇADA (1370).
       *
       * *"Não cabe a nós deduzir"* — decisão da Fundação de 20/09/2026. Sem
       * escala lançada, o sistema deixou de nomear quem devia estar, e a tela
       * precisa dizer o que ficou no lugar: **ninguém lançou a escala deste
       * turno**, que é pendência da CASA e não de uma pessoa.
       *
       * Assinar continua aberto a quem está ali — a escala decide quem é
       * cobrado, nunca quem pode.
       */
      escalaLancada: dados.fonteDaEscala === 'escala_do_dia',
      nenhumaPassagemAssinada: dados.passagens.length === 0,
      /**
       * Se a passagem de QUEM ESTÁ OLHANDO é esperada neste plantão.
       *
       * A tela dizia "sua passagem falta" para a equipe técnica num plantão
       * em que ela nunca esteve — transformando "você não trabalhou aqui" em
       * alarme. Falta é de quem era esperado; para os demais, assinar
       * continua possível (quem cobriu um turno fora da escala precisa
       * registrar), só não é cobrança.
       */
      minhaPassagemEsperada: dados.faltam.some((f: any) => f.user_id === user.id),
      recebimentos: dados.recebimentos.map((r: any) => ({
        id: r.id, quem: r.quem, recebidoEm: r.received_at,
        leuOrientacoes: r.read_guidance, assumiuPendencias: r.took_pending, nota: r.note,
        // A tela precisa saber se o recebimento é SEU sem comparar nomes: dois
        // homônimos na Fundação fariam a tela esconder o botão da pessoa errada.
        propria: r.user_id === user.id,
      })),
      episodios: dados.episodios.map((e: any) => ({
        id: e.id, acolhidoId: e.person_id, acolhido: e.acolhido,
        classificacao: e.classification, relato: e.factual,
        quando: e.happened_at, ocorrenciaId: e.incident_id,
        registradoPor: e.registrado_por, ciencias: e.ciencias,
        cienciaPropria: dados.ciencias.some(
          (k: any) => k.episode_id === e.id && k.user_id === user.id),
        quemDeuCiencia: dados.ciencias
          .filter((k: any) => k.episode_id === e.id)
          .map((k: any) => ({ id: k.id, quem: k.quem, comentario: k.comment, quando: k.at })),
      })),
      /**
       * AS LINHAS DA ATA (0970) — o que a próxima equipe abre para ler.
       *
       * Cada uma com o AUTOR: quem lê de manhã precisa saber a quem perguntar.
       * A cor é da tela; o nome vem daqui, porque cor não sobrevive à impressão
       * em preto e branco nem ao corredor às 23h (regra 7).
       */
      linhas: {
        notas: dados.notas.map((n: any) => ({
          id: n.id, autorId: n.author_id, quem: n.quem, cargo: n.cargo,
          corAutor: n.cor_autor ?? null,
          texto: n.body, restrita: n.restricted,
          quando: n.happened_at, escritaEm: n.created_at,
          propria: n.author_id === user.id,
        })),
        /** Quantas linhas restritas existem — inclusive para quem não as lê. */
        restritas: dados.restritas,
        /** Quantas delas esta pessoa NÃO está vendo. */
        restritasOcultas: Math.max(
          0, dados.restritas - dados.notas.filter((n: any) => n.restricted).length),
        podeEscreverRestrita: ['coordenador', 'equipe_tecnica', 'lider_diurno',
                               'lider_noturno_geral', 'gestor_geral'].includes(user.role),
      },
      /**
       * OS REMÉDIOS DO TURNO (0940). A tela da passagem mostra o que ficou
       * gravado — nunca um botão que marque tudo de uma vez (§11.2).
       */
      remedios: {
        doses: dados.doses.map((d: any) => ({
          id: d.dose_id, acolhido: d.acolhido, medicamento: d.medicamento,
          previsto: d.previsto, estado: d.estado, confirmou: d.confirmou,
          soEnfermagem: d.so_enfermagem,
          semResposta: d.estado === 'aguardando_confirmacao',
        })),
        total: dados.doses.length,
        semResposta: dados.doses.filter(
          (d: any) => d.estado === 'aguardando_confirmacao').length,
        /** Alguém do turno já escreveu sobre as doses — a cobrança é uma só. */
        jaEscrito: dados.jaEscrito,
        exigeFrase: !dados.jaEscrito
          && dados.doses.some((d: any) => d.estado === 'aguardando_confirmacao'),
      },
      /**
       * AS CONVIVÊNCIAS FAMILIARES DESTE TURNO (1070).
       *
       * Quem voltou, quem saiu e quem CONTINUA fora — nesta ordem, porque é a
       * ordem em que a equipe seguinte precisa das três. O retorno era
       * registrado no perfil desde a fase 80 e ficava lá: ninguém abre vinte
       * perfis às 19h para descobrir que a Alice chegou às 18h10.
       *
       * `situacao` fala do TURNO, nunca da criança, e `atrasado` fala do
       * relógio. O sistema não chama isso de evasão — quem apura é gente.
       */
      convivencias: dados.convivencias.map((f: any) => ({
        id: f.id, personId: f.person_id, acolhido: f.acolhido,
        comQuem: f.com_quem, vinculo: f.vinculo,
        situacao: f.situacao as 'voltou' | 'saiu' | 'fora',
        saiuEm: f.saiu_em, retornoPrevisto: f.retorno_previsto,
        voltouEm: f.voltou_em, recebidaPor: f.recebida_por,
        comoChegou: f.como_chegou, trouxe: f.trouxe,
        atrasado: f.atrasado === true,
      })),
    };
  }

  /**
   * Assinatura da própria passagem (§12.1). Se o plantão já foi fechado, a
   * passagem entra como complemento tardio com o horário REAL informado —
   * nunca como se tivesse sido assinada a tempo (§12.4).
   */
  /**
   * AS DOSES DO TURNO, para a passagem ler de volta (0940).
   *
   * Não confirma nada: devolve o que ficou gravado, com o que ainda espera
   * resposta em primeiro lugar na cabeça de quem lê. É o pedido do Marcelo de
   * 08/09 — "no fim da passagem alguém diz que deu o remédio e se está tudo
   * ok" — na única forma que não fere o §11.2.
   */
  async dosesDoTurno(user: AuthenticatedUser, shiftId: string) {
    const { linhas, jaEscrito } = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_doses_do_turno($1)`, [shiftId]);
      /*
       * "ALGUÉM tem que dizer", e não "cada um tem que dizer".
       *
       * Quatro pessoas assinam a passagem do mesmo turno. Cobrar a frase de
       * todas seria pedir quatro vezes a mesma coisa sobre as mesmas doses —
       * e a quarta pessoa escreveria qualquer coisa para conseguir sair. A
       * cobrança é de quem assina primeiro; as demais continuam VENDO a lista,
       * que é o que faz a dose esquecida aparecer enquanto dá para resolver.
       */
      const { rows: [j] } = await c.query(
        `SELECT count(*)::int AS n FROM handover
          WHERE shift_id = $1 AND btrim(coalesce(medication_note,'')) <> ''`, [shiftId]);
      return { linhas: rows, jaEscrito: (j?.n ?? 0) > 0 };
    });
    const doses = linhas.map((r: any) => ({
      id: r.dose_id, acolhido: r.acolhido, medicamento: r.medicamento,
      previsto: r.previsto, estado: r.estado,
      confirmou: r.confirmou, soEnfermagem: r.so_enfermagem,
      semResposta: r.estado === 'aguardando_confirmacao',
    }));
    const semResposta = doses.filter((d) => d.semResposta);
    return {
      doses,
      total: doses.length,
      semResposta: semResposta.length,
      jaEscrito,
      // A tela não decide sozinha o que fazer com o número: o servidor diz se
      // a frase é obrigatória, e é a mesma resposta que a gravação cobra.
      exigeFrase: semResposta.length > 0 && !jaEscrito,
    };
  }

  async signHandover(user: AuthenticatedUser, shiftId: string, input: {
    aparelho?: string; itens?: Record<string, unknown>; contribuicoes?: string;
    pendencias?: string; orientacoes?: string; happenedAt?: string;
    offline?: boolean; clientOpId?: string; medicacao?: string;
  }) {
    const s = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(`SELECT * FROM shift WHERE id = $1`, [shiftId]);
      return row;
    });
    if (!s) throw new NotFoundException('Plantão não encontrado.');

    /*
     * A COBRANÇA DA FRASE SOBRE OS REMÉDIOS (0940).
     *
     * Regra de negócio, e por isso mora aqui e não no banco: quando alguma
     * dose do turno ficou SEM RESPOSTA, a passagem exige uma linha dizendo o
     * que houve. Ela avisa e cobra; ela NÃO bloqueia a assinatura — decisão do
     * Leonardo em 08/09. Uma passagem que se recusa a fechar às 23h empurra a
     * casa de volta para o caderno, e a saída mais fácil para quem precisa ir
     * embora seria confirmar dose que não deu.
     *
     * O texto entra no lugar próprio, e nunca no campo de contribuições: quem
     * lê a passagem amanhã procura remédio em um lugar só.
     */
    const remedios = await this.dosesDoTurno(user, shiftId);
    const frase = input.medicacao?.trim() ?? '';
    if (remedios.exigeFrase && frase.length < 10) {
      const quais = remedios.doses.filter((d) => d.semResposta)
        .map((d) => `${d.medicamento} (${d.acolhido})`).join(', ');
      throw new BadRequestException(
        `${remedios.semResposta === 1 ? 'Uma dose deste turno ficou' : `${remedios.semResposta} doses deste turno ficaram`}`
        + ` sem resposta: ${quais}. Escreva o que aconteceu antes de assinar — quem deu o remédio ainda`
        + ' está na casa agora, e amanhã ninguém vai saber dizer.');
    }

    if (['fechado', 'fechado_com_pendencia'].includes(s.status) && !input.happenedAt) {
      throw new BadRequestException(
        'Este plantão já foi fechado. Informe o horário real em que a passagem foi feita — ela entra como complemento tardio.');
    }

    // TUDO numa transação só. Antes eram três chamadas `asUser` separadas, e
    // entre a leitura do plantão e a gravação da passagem o líder podia fechar
    // a ATA: a passagem entrava como assinada a tempo, sem adendo — exatamente
    // o registro que o §12.4 quer impedir. Agora o estado é relido COM TRAVA
    // dentro da mesma transação que grava, e o adendo nasce junto: ou os dois
    // existem, ou nenhum dos dois.
    let id: string; let tardia = false; let duplicada = false;
    try {
      ({ id, tardia, duplicada } = await this.db.asUser(user.id, async (c) => {
        if (input.clientOpId) {
          const { rows: [dup] } = await c.query(
            `SELECT id, late FROM handover WHERE client_op_id = $1`, [input.clientOpId]);
          // Reenvio da fila devolve o que já existe e NÃO grava outro adendo.
          // Antes, cinco reenvios numa madrugada de internet ruim criavam cinco
          // adendos idênticos de "complemento tardio" — numa tabela append-only,
          // sem como remover.
          if (dup) return { id: dup.id as string, tardia: !!dup.late, duplicada: true };
        }
        const { rows: [atual] } = await c.query(
          `SELECT status FROM shift WHERE id = $1 FOR UPDATE`, [shiftId]);
        const fechado = ['fechado', 'fechado_com_pendencia'].includes(atual?.status);
        if (fechado && !input.happenedAt) {
          throw new BadRequestException(
            'Este plantão foi fechado enquanto você preenchia. Informe o horário real da passagem — ela entra como complemento tardio.');
        }

        const { rows: [r] } = await c.query(
          `INSERT INTO handover (shift_id, house_id, user_id, role, device, items,
             contributions, pending, guidance, medication_note, happened_at, late, offline, client_op_id)
           VALUES ($1,$2,$3,$4::role_code,$5,$6,$7,$8,$9,$10, coalesce($11::timestamptz, now()), $12,$13,$14)
           RETURNING id`,
          [shiftId, s.house_id, user.id, user.role, input.aparelho ?? null,
           JSON.stringify(input.itens ?? {}), input.contribuicoes ?? null,
           input.pendencias ?? null, input.orientacoes ?? null, frase || null,
           input.happenedAt ?? null, fechado, input.offline ?? false, input.clientOpId ?? null]);

        if (fechado) {
          await c.query(
            `INSERT INTO ata_addendum (ata_id, kind, reason, after_state, author_id)
             SELECT a.id, 'complemento_tardio',
                    'Passagem assinada após o fechamento, com horário real informado.',
                    jsonb_build_object('handover', $2::text), $3
             FROM ata a WHERE a.shift_id = $1`, [shiftId, r.id, user.id]);
        }
        return { id: r.id as string, tardia: fechado, duplicada: false };
      }));
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      if (e?.code === '23505') {
        throw new BadRequestException(
          // A mensagem antiga prometia "relato complementar" sem que existisse
          // caminho para ele. Agora existe, e ela diz qual é.
          'Você já assinou a passagem deste plantão. Para acrescentar algo, registre um complemento — '
          + 'ele entra ao lado, sem reescrever o que você assinou.');
      }
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        // Chega aqui quem tentou gravar em nome de outro ou fora da própria casa.
        throw new ForbiddenException('A passagem é assinada individualmente, por quem esteve no plantão.');
      }
      throw e;
    }

    if (duplicada) {
      return { id, tardia, duplicada: true,
               aviso: 'Esta passagem já havia sido registrada — o reenvio não cria outra.' };
    }

    await this.audit.log({
      action: 'handover.sign', actorId: user.id, houseId: s.house_id,
      entity: 'handover', entityId: id,
      detail: { plantao: shiftId, tardia, offline: input.offline ?? false },
    });

    return {
      id, tardia,
      aviso: tardia
        ? 'Registrada como complemento tardio, com o horário real informado. A ATA guarda o adendo.'
        : 'Passagem assinada. Somente você pode assiná-la, e ela não pode ser reescrita.',
    };
  }

  /**
   * ESCREVER UMA LINHA NA ATA (0970).
   *
   * A linha é imutável e nasce com o nome de quem escreveu. Corrigir é escrever
   * outra: a anterior continua legível, com o horário dela — o mesmo desenho do
   * episódio do turno, e pela mesma razão (§12.5).
   */
  async escreverNaAta(user: AuthenticatedUser, ataId: string, input: {
    texto?: string; restrita?: boolean; happenedAt?: string;
  }) {
    const texto = (input.texto ?? '').trim();
    if (texto.length < 3) {
      throw new BadRequestException('Escreva a linha antes de registrar.');
    }
    const casa = await this.casaDaAta(user, ataId);

    let id: string;
    try {
      id = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `INSERT INTO ata_note (ata_id, house_id, author_id, body, restricted, happened_at)
           VALUES ($1,$2,app_current_user(),$3,$4, coalesce($5::timestamptz, now()))
           RETURNING id`,
          [ataId, casa, texto, input.restrita === true, input.happenedAt ?? null]);
        return r.id as string;
      });
    } catch (e: any) {
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        /* Duas recusas caem aqui, e a frase diz qual: escrever em nome de
         * outro, e marcar como restrita sem poder relê-la depois. */
        throw new ForbiddenException(input.restrita
          ? 'A linha restrita é da coordenação, da equipe técnica e dos líderes — quem escreve '
            + 'uma linha precisa poder relê-la depois.'
          : 'A linha da ATA é escrita em nome de quem escreve, e na casa dela.');
      }
      throw e;
    }

    await this.audit.log({
      action: 'ata.note', actorId: user.id, houseId: casa,
      entity: 'ata', entityId: ataId, detail: { restrita: input.restrita === true },
    });
    return {
      id,
      aviso: input.restrita
        ? 'Linha registrada, restrita à coordenação, à equipe técnica e aos líderes. Quem não a '
          + 'alcança vê que ela existe, e não o que ela diz.'
        : 'Linha registrada com o seu nome. Ela não é reescrita: para corrigir, escreva outra.',
    };
  }

  /**
   * A ATA DO TURNO ANTERIOR — o que a equipe que entra abre.
   *
   * "Todos leem a ATA do turno anterior" foi o pedido do Marcelo, e o que
   * faltava era a PORTA: a ATA já era legível por toda a equipe da casa, e a
   * tela pedia sempre o plantão de hoje.
   */
  async anterior(user: AuthenticatedUser, houseId: string) {
    const linha = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT * FROM app_ata_anterior($1, now())`, [houseId]);
      return r;
    }).catch((e: any) => {
      if (String(e?.message ?? '').includes('casa_fora_de_escopo')) {
        throw new ForbiddenException('Esta casa está fora do seu alcance.');
      }
      throw e;
    });
    if (!linha?.shift_id) {
      return {
        existe: false,
        aviso: 'Ainda não há plantão anterior registrado nesta casa. O primeiro turno a fechar '
          + 'é o que a próxima equipe vai ler.',
      };
    }
    const plantao = await this.get(user, linha.shift_id);
    return { existe: true, ...plantao };
  }

  /** Recebimento individual pelo turno que entra (§12.3, §26.2 #21). */
  /**
   * COMPLEMENTO da própria passagem (§12.1, §12.4).
   *
   * Existe porque a lembrança não respeita o fim do turno. O educador assina
   * às 19h e, às 20h, lembra que a mãe do Bruno ligou às 17h30 — sem este
   * caminho, ou ele reescreve (proibido), ou pede a outro (o que a passagem
   * individual existe para impedir), ou manda no aplicativo de conversa.
   *
   * O complemento não toca a passagem assinada: nasce ao lado, com hora
   * própria. Se a ATA já estiver fechada, entra também como adendo — pelo
   * mesmo motivo da passagem tardia: quem ler depois precisa saber que
   * chegou depois.
   */
  async complementHandover(user: AuthenticatedUser, shiftId: string, input: {
    texto?: string; happenedAt?: string; offline?: boolean; clientOpId?: string;
  }) {
    const texto = (input.texto ?? '').trim();
    if (texto.length < 5) {
      throw new BadRequestException('Escreva o complemento — o que aconteceu, em uma linha que seja.');
    }

    const contexto = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT s.house_id, s.status,
                (SELECT h.id FROM handover h
                  WHERE h.shift_id = s.id AND h.user_id = app_current_user()) AS handover_id
           FROM shift s WHERE s.id = $1`, [shiftId]);
      return row;
    });
    if (!contexto) throw new NotFoundException('Plantão não encontrado.');
    if (!contexto.handover_id) {
      throw new BadRequestException(
        'Você ainda não assinou a passagem deste plantão. Assine primeiro — o complemento acrescenta a ela.');
    }

    const fechado = ['fechado', 'fechado_com_pendencia'].includes(contexto.status);

    let id: string; let duplicado = false;
    try {
      ({ id, duplicado } = await this.db.asUser(user.id, async (c) => {
        if (input.clientOpId) {
          const { rows: [dup] } = await c.query(
            `SELECT id FROM handover_note WHERE client_op_id = $1`, [input.clientOpId]);
          if (dup) return { id: dup.id as string, duplicado: true };
        }
        const { rows: [r] } = await c.query(
          `INSERT INTO handover_note (handover_id, shift_id, house_id, user_id, body,
                                      happened_at, offline, client_op_id)
           VALUES ($1,$2,$3,$4,$5, coalesce($6::timestamptz, now()), $7, $8)
           RETURNING id`,
          [contexto.handover_id, shiftId, contexto.house_id, user.id, texto,
           input.happenedAt ?? null, input.offline ?? false, input.clientOpId ?? null]);

        if (fechado) {
          await c.query(
            `INSERT INTO ata_addendum (ata_id, kind, reason, after_state, author_id)
             SELECT a.id, 'complemento_tardio',
                    'Complemento da própria passagem, escrito após o fechamento.',
                    jsonb_build_object('handover_note', $2::text), $3
             FROM ata a WHERE a.shift_id = $1`, [shiftId, r.id, user.id]);
        }
        return { id: r.id as string, duplicado: false };
      }));
    } catch (e: any) {
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        throw new ForbiddenException('O complemento é da própria passagem, escrito por quem a assinou.');
      }
      throw e;
    }

    if (duplicado) {
      return { id, aviso: 'Este complemento já havia sido registrado — o reenvio não cria outro.' };
    }

    await this.audit.log({
      action: 'handover.complement', actorId: user.id, houseId: contexto.house_id,
      entity: 'handover', entityId: contexto.handover_id,
      detail: { nota: id, ataFechada: fechado },
    });

    return {
      id,
      aviso: fechado
        ? 'Complemento registrado ao lado da sua passagem, e a ATA guarda o adendo. O que já estava escrito continua como estava.'
        : 'Complemento registrado ao lado da sua passagem. O que já estava escrito continua como estava.',
    };
  }

  async receive(user: AuthenticatedUser, shiftId: string, input: {
    leuOrientacoes?: boolean; assumiuPendencias?: boolean; nota?: string;
    offline?: boolean; clientOpId?: string;
  }) {
    const s = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(`SELECT house_id FROM shift WHERE id = $1`, [shiftId]);
      return row;
    });
    if (!s) throw new NotFoundException('Plantão não encontrado.');

    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(
          `INSERT INTO handover_receipt (shift_id, house_id, user_id, read_guidance, took_pending, note, offline, client_op_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [shiftId, s.house_id, user.id, input.leuOrientacoes ?? false,
           input.assumiuPendencias ?? false, input.nota ?? null,
           input.offline ?? false, input.clientOpId ?? null]);
      });
    } catch (e: any) {
      if (e?.code === '23505') {
        throw new BadRequestException('Você já confirmou o recebimento deste plantão.');
      }
      throw e;
    }

    await this.audit.log({
      action: 'handover.receive', actorId: user.id, houseId: s.house_id,
      entity: 'shift', entityId: shiftId,
      detail: { orientacoes: input.leuOrientacoes ?? false, pendencias: input.assumiuPendencias ?? false },
    });

    return {
      ok: true,
      // §12.3, textual e deliberado: receber não é concordar.
      aviso: 'Recebimento registrado em seu nome. Confirmar o recebimento não significa concordância '
           + 'com narrativas de colegas — se você tem outra versão do fato, registre o seu relato.',
    };
  }

  // ------------------------------------------------------------------
  // ATA da casa
  // ------------------------------------------------------------------

  async saveAta(user: AuthenticatedUser, ataId: string, input: { conteudo: Record<string, unknown>; pendencias?: string }) {
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE ata SET content = $2, pendencies = coalesce($3, pendencies)
         WHERE id = $1 AND status IN ('rascunho','reaberta')`,
        [ataId, JSON.stringify(input.conteudo ?? {}), input.pendencias ?? null]);
      return (rowCount ?? 0) > 0;
    });
    if (!ok) {
      throw new BadRequestException(
        'ATA fechada não é reescrita. Peça reabertura à equipe técnica — a correção entra como adendo, com antes e depois.');
    }
    return { ok: true };
  }

  /** Fechamento (§12.4, §26.2 #19). */
  async closeAta(user: AuthenticatedUser, ataId: string, pendencias?: string) {
    const r = await this.comando(user, 'app_close_ata($1,$2)', [ataId, pendencias ?? null], {
      cargo_nao_fecha_ata: (d: string) => new ForbiddenException(
        d === 'diurno'
          ? 'O fechamento da ATA diurna cabe ao Líder Diurno, à equipe técnica ou à coordenação.'
          : 'O fechamento da ATA noturna cabe ao Líder Noturno Geral, à equipe técnica ou à coordenação.'),
      ata_ja_fechada: () => new BadRequestException('Esta ATA já foi fechada.'),
      ata_inexistente: () => new NotFoundException('ATA não encontrada.'),
    });

    const faltam = Number(r.out_missing);
    const semEscala = r.out_fonte === 'escala_nao_lancada';
    const casa = await this.casaDaAta(user, ataId);

    /*
     * DUAS PENDÊNCIAS DIFERENTES, E A SEGUNDA NÃO TEM NOME (1370).
     *
     * `faltam > 0` é gente: alguém escalado não assinou, e quem lê pode ir
     * atrás dela. O outro caso é a CASA — a escala não foi lançada e ninguém
     * registrou o turno —, e ele só existe porque a dedução saiu: antes, o
     * vínculo da casa preenchia a lista, e a pendência saía com o nome de quem
     * estava de folga.
     *
     * O aviso precisa dizer QUAL das duas é, porque o que se faz a seguir é
     * diferente: uma se resolve falando com uma pessoa, a outra lançando a
     * escala.
     */
    const pendencia = faltam > 0 || r.out_status === 'fechada_com_pendencia';
    if (pendencia) {
      // §12.4: falta passagem → avisar equipe técnica/coordenação. O aviso sai
      // pelo contrato genérico do kernel; este módulo não conhece notificações.
      const pedido: EscalationRequest = {
        level: 'tecnica_coordenacao', entity: 'ata', entityId: ataId,
        reason: 'ata_fechada_com_pendencia',
        title: faltam > 0
          ? 'ATA fechada com assinatura pendente'
          : 'ATA fechada sem escala lançada e sem nenhuma passagem',
        body: faltam > 0
          ? `${faltam} passagem(ns) não assinada(s) no plantão. A ATA foi fechada com pendência registrada.`
          : 'A escala deste turno não foi lançada, e nenhuma passagem foi assinada. O sistema não '
            + 'deduz quem devia estar — então não há nome a cobrar, e o turno ficou sem registro.',
        priority: 'alta', groupKey: `ata:${ataId}`,
      };
      await this.bus.publish('escalation.requested', pedido, { actorId: user.id, houseId: casa });
    }

    /*
     * A CÓPIA DOCUMENTAL (§16.2): fechou, entra na fila do arquivo.
     *
     * Publicado DEPOIS do fechamento e por evento, não por chamada: este
     * módulo não conhece o `archive`, e a ATA precisa fechar mesmo que o
     * Drive esteja fora do ar. A fila tem retentativa; o documento vale no
     * sistema desde já.
     */
    const copia: DocumentClosed = {
      categoria: 'ata', entidade: 'ata', entityId: ataId, houseId: casa,
    };
    await this.bus.publish('document.closed', copia, { actorId: user.id, houseId: casa });

    return {
      status: r.out_status,
      assinaturasFaltantes: faltam,
      /** A escala deste turno foi lançada? (1370) */
      escalaLancada: !semEscala,
      aviso: faltam > 0
        ? `Fechada com pendência: ${faltam} passagem(ns) sem assinatura. Nenhuma assinatura foi presumida; `
          + 'a equipe técnica e a coordenação foram avisadas.'
        : r.out_status === 'fechada_com_pendencia'
          ? 'Fechada com pendência: a escala deste turno não foi lançada e nenhuma passagem foi '
            + 'assinada. O sistema não deduz quem devia estar — a equipe técnica e a coordenação '
            + 'foram avisadas.'
          : semEscala
            ? 'Fechada. A escala deste turno não foi lançada, e quem esteve na casa assinou.'
            : 'Fechada com todas as passagens assinadas.',
    };
  }

  async reopenAta(user: AuthenticatedUser, ataId: string, motivo: string) {
    const r = await this.comando(user, 'app_reopen_ata($1,$2)', [ataId, motivo ?? ''], {
      cargo_nao_reabre_ata: () => new ForbiddenException(
        'A reabertura de ATA cabe à equipe técnica e à coordenação.'),
      motivo_insuficiente: () => new BadRequestException(
        'Descreva o motivo da reabertura (mínimo 15 caracteres). Ele fica gravado no adendo.'),
      ata_nao_esta_fechada: () => new BadRequestException('Esta ATA não está fechada.'),
      ata_inexistente: () => new NotFoundException('ATA não encontrada.'),
    });
    return {
      versao: Number(r.out_version),
      aviso: 'Reaberta. O estado anterior foi gravado no adendo antes de qualquer alteração.',
    };
  }

  async amendAta(user: AuthenticatedUser, ataId: string, motivo: string, conteudo: Record<string, unknown>) {
    const r = await this.comando(user, 'app_amend_ata($1,$2,$3::jsonb)',
      [ataId, motivo ?? '', JSON.stringify(conteudo ?? {})], {
        cargo_nao_corrige_ata: () => new ForbiddenException(
          'A correção de ATA cabe à equipe técnica e à coordenação.'),
        motivo_insuficiente: () => new BadRequestException(
          'Descreva o motivo da correção (mínimo 15 caracteres).'),
        ata_nao_reaberta: () => new BadRequestException(
          'Corrija apenas depois de reabrir: a reabertura é o que grava o estado anterior.'),
      });
    return { versao: Number(r.out_version), status: r.out_status,
             aviso: 'Correção gravada com antes e depois. A versão anterior continua consultável.' };
  }

  /** Histórico de adendos — é o "antes e depois" que o §26.2 #20 exige ver. */
  async addenda(user: AuthenticatedUser, ataId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT d.id, d.kind, d.reason, d.before_state, d.after_state, d.at,
                app_user_display_name(d.author_id) AS autor
         FROM ata_addendum d WHERE d.ata_id = $1 ORDER BY d.at`, [ataId]);
      return rows.map((r) => ({
        id: r.id, tipo: r.kind, motivo: r.reason, autor: r.autor, quando: r.at,
        antes: r.before_state, depois: r.after_state,
      }));
    });
  }

  // ------------------------------------------------------------------
  // Episódio de acolhido dentro da ATA (§12.5)
  // ------------------------------------------------------------------

  async addEpisode(user: AuthenticatedUser, ataId: string, input: {
    acolhidoId: string; classificacao: string; relato: string;
    happenedAt?: string; ocorrenciaId?: string;
  }) {
    if (!CLASSIFICACOES_EPISODIO.some((c) => c.code === input.classificacao)) {
      throw new BadRequestException('Classificação inválida para o episódio.');
    }
    if ((input.relato ?? '').trim().length < 10) {
      throw new BadRequestException(
        'Descreva o fato objetivamente: o que aconteceu, quando e o que foi feito.');
    }
    const casa = await this.ataAberta(user, ataId);
    let id: string;
    try {
      id = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `INSERT INTO ata_episode (ata_id, house_id, person_id, classification, factual,
             incident_id, happened_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6, coalesce($7::timestamptz, now()), $8) RETURNING id`,
          [ataId, casa, input.acolhidoId, input.classificacao, input.relato.trim(),
           input.ocorrenciaId ?? null, input.happenedAt ?? null, user.id]);
        return r.id as string;
      });
    } catch (e: any) {
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        throw new BadRequestException(
          'Este acolhido não está ativo nesta casa. O episódio pertence à casa onde ele está.');
      }
      throw e;
    }

    await this.audit.log({
      action: 'ata.episode', actorId: user.id, houseId: casa,
      entity: 'ata_episode', entityId: id,
      detail: { classificacao: input.classificacao, ata: ataId },
    });

    return {
      id,
      aviso: 'Registrado uma única vez: aparece no perfil do acolhido, na linha do tempo e nesta ATA. '
           + 'O relato original não pode ser alterado — o líder registra ciência e, se quiser, comentário próprio.',
    };
  }

  /** Ciência do líder sobre o episódio, sem alterar o relato original (§12.5). */
  async ackEpisode(user: AuthenticatedUser, episodeId: string, comentario?: string) {
    try {
      await this.db.asUser(user.id, async (c) => {
        await c.query(
          `INSERT INTO ata_episode_ack (episode_id, user_id, comment) VALUES ($1,$2,$3)`,
          [episodeId, user.id, comentario ?? null]);
      });
    } catch (e: any) {
      if (e?.code === '23505') throw new BadRequestException('Você já registrou ciência sobre este episódio.');
      throw e;
    }
    await this.audit.log({
      action: 'ata.episode_ack', actorId: user.id, entity: 'ata_episode', entityId: episodeId,
      detail: { comentou: !!comentario },
    });
    return { ok: true, aviso: 'Ciência registrada. O relato original permanece como foi escrito.' };
  }

  // ------------------------------------------------------------------
  // ATA Geral Noturna (§12.6)
  // ------------------------------------------------------------------

  async openGeneral(user: AuthenticatedUser, data?: string) {
    // A ATA Geral é da NOITE, e a noite tem a data em que começou — senão o
    // líder que a abre depois da meia-noite não encontra as ATAs das casas.
    const dia = data ?? dataDoPlantao('noturno');
    const r = await this.comando(user, 'app_open_general_night_ata($1)', [dia], {
      apenas_lider_noturno_geral: () => new ForbiddenException(
        'A ATA Geral Noturna é do Líder Noturno Geral.'),
    });
    return {
      id: r.out_id, data: dia, casas: Number(r.out_houses),
      aviso: 'As oito casas já constam na ATA. Casa sem chamado também é registro — não pode ficar em branco.',
    };
  }

  async getGeneral(user: AuthenticatedUser, id: string) {
    const dados = await this.db.asUser(user.id, async (c) => {
      const { rows: [g] } = await c.query(`SELECT * FROM general_night_ata WHERE id = $1`, [id]);
      if (!g) return null;
      const { rows } = await c.query(
        // A política entrega as OITO linhas à coordenação de propósito; o
        // `JOIN house` desfazia isso (a casa alheia não passa pelo RLS) e os
        // contadores acabavam calculados sobre uma lista truncada — a tela
        // dizia "1 de 1 confirmada" com sete casas sequer lidas.
        `SELECT e.*,
                app_house_label(e.house_id) AS code,
                app_house_name(e.house_id) AS name,
                app_night_ata_status(e.house_id, $2::date) AS ata_casa
         FROM general_night_house_entry e
         WHERE e.general_ata_id = $1
         ORDER BY app_house_label(e.house_id)`, [id, g.on_date]);
      /*
       * O HISTÓRICO DAS CORREÇÕES (1440), junto da leitura.
       *
       * Registrar a correção e não mostrá-la seria pior do que não registrar:
       * criaria a impressão de rastro onde ninguém vê rastro nenhum. Vem na
       * mesma resposta porque é a mesma folha — quem lê a ATA Geral precisa ver
       * "antes constava" na linha, e não noutra tela.
       */
      const { rows: correcoes } = await c.query(
        `SELECT a.house_id, h.*
           FROM general_night_house_amendment a
           CROSS JOIN LATERAL app_gn_house_history($1, a.house_id) h
          WHERE a.general_ata_id = $1
          GROUP BY a.house_id, h.por, h.corrigido_em, h.motivo, h.antes_situacao,
                   h.antes_houve_contato, h.antes_chegada, h.antes_saida,
                   h.antes_motivo, h.antes_pessoas, h.antes_acao, h.antes_categoria,
                   h.antes_pendencias, h.antes_evento_de_saude, h.antes_nota_de_saude
          ORDER BY h.corrigido_em DESC`, [id]);
      return { g, rows, correcoes };
    });
    if (!dados) throw new NotFoundException('ATA Geral não encontrada.');

    return {
      id: dados.g.id, data: dados.g.on_date, status: dados.g.status,
      pendencias: dados.g.pendencies, assinadaEm: dados.g.signed_at,
      casas: dados.rows.map((e: any) => ({
        casaId: e.house_id, codigo: e.code, nome: e.name,
        houveContato: e.had_contact, contatoEm: e.contact_at,
        chegada: e.arrived_at, saida: e.left_at,
        motivo: e.reason, pessoas: e.people_involved, acao: e.action_taken,
        categoria: e.category, pendencias: e.pendencies,
        ataNoturnaConfirmada: e.house_ata_confirmed,
        // Agora NULL significa mesmo 'não existe', e não 'não posso ver'.
        situacaoAtaDaCasa: e.ata_casa ?? 'ATA noturna ainda não aberta',
        /* O que constava antes, se alguém corrigiu depois da assinatura. */
        correcoes: (dados.correcoes ?? [])
          .filter((k: any) => k.house_id === e.house_id)
          .map((k: any) => ({
            por: k.por, em: k.corrigido_em, motivo: k.motivo,
            antes: {
              situacao: k.antes_situacao, houveContato: k.antes_houve_contato,
              chegada: k.antes_chegada, saida: k.antes_saida,
              motivo: k.antes_motivo, pessoas: k.antes_pessoas,
              acao: k.antes_acao, categoria: k.antes_categoria,
              pendencias: k.antes_pendencias,
              eventoDeSaude: k.antes_evento_de_saude, notaDeSaude: k.antes_nota_de_saude,
            },
          })),
      })),
      confirmadas: dados.rows.filter((e: any) => e.house_ata_confirmed).length,
      total: dados.rows.length,
    };
  }

  async updateGeneralHouse(user: AuthenticatedUser, id: string, houseId: string, input: {
    houveContato?: boolean; contatoEm?: string; chegada?: string; saida?: string;
    motivo?: string; pessoas?: string; acao?: string; categoria?: string;
    pendencias?: string; confirmarAtaNoturna?: boolean;
    /**
     * POR QUE ESTÁ SENDO CORRIGIDO (1440, decisão de 21/09).
     *
     * Só é exigido depois de a ATA Geral ser ASSINADA: antes é rascunho, e
     * rascunho se escreve sem justificar. Depois, a linha já foi lida por
     * alguém — mudá-la sem dizer por quê deixa o leitor de amanhã com duas
     * versões e nenhuma explicação.
     *
     * Chega ao banco por `set_config`, e não como coluna: o motivo é da
     * CORREÇÃO, não da linha. É o gatilho que o guarda, junto do que constava.
     */
    motivoDaCorrecao?: string;
  }) {
    // Confirmar o fechamento da ATA da casa exige que ela ESTEJA fechada. O
    // Líder Noturno Geral confirma um fato, não o produz — e em nenhum momento
    // assina a passagem de um educador (§26.2 #36).
    if (input.confirmarAtaNoturna) {
      const fechada = await this.db.asUser(user.id, async (c) => {
        const { rows: [a] } = await c.query(
          `SELECT a.status FROM ata a
           JOIN general_night_ata g ON g.id = $1
           WHERE a.house_id = $2 AND a.on_date = g.on_date AND a.period = 'noturno'`,
          [id, houseId]);
        return a?.status;
      });
      if (!fechada || !['fechada', 'fechada_com_pendencia'].includes(fechada)) {
        throw new BadRequestException(
          'A ATA noturna desta casa ainda não foi fechada. A confirmação registra um fechamento que existe — '
          + 'ela não substitui as assinaturas da equipe.');
      }
    }

    /*
     * A ATA JÁ ASSINADA É CORRIGIDA PELOS TRÊS (1440). A conferência de cargo
     * mora na policy — esta daqui existe para a recusa chegar em português a
     * quem está corrigindo, e não em código de Postgres (é a lição da fase 123).
     */
    /*
     * O CARGO VEM ANTES DO ESTADO, e a ordem é a lição do teste desta fase.
     *
     * Eu havia lido o `status` primeiro, para só então conferir o cargo. Quem
     * não alcança a ATA Geral recebe NULO do RLS — e nulo era lido como
     * "rascunho", então o educador caía numa recusa por alcance em vez da recusa
     * por cargo, e a mensagem não dizia a verdade. Perguntar o cargo primeiro
     * não depende de leitura nenhuma.
     */
    const CORRIGEM = ['lider_diurno', 'equipe_tecnica', 'coordenador'];
    const AUTOR = 'lider_noturno_geral';
    if (!CORRIGEM.includes(user.role) && user.role !== AUTOR && user.role !== 'gestor_geral') {
      throw new ForbiddenException(
        'A linha de uma casa na ATA Geral é preenchida pelo Líder Noturno Geral e corrigida '
        + 'pelo Líder Diurno, pela equipe técnica ou pela coordenação — a correção fica '
        + 'registrada com o nome de quem a fez.');
    }

    const assinada = await this.db.asUser(user.id, async (c) => {
      const { rows: [g] } = await c.query(
        `SELECT status FROM general_night_ata WHERE id = $1`, [id]);
      return g != null && g.status !== 'rascunho';
    });
    if (assinada) {
      if (!CORRIGEM.includes(user.role)) {
        throw new ForbiddenException(
          'A ATA Geral já foi assinada. Depois disso, quem corrige a linha de uma casa é o '
          + 'Líder Diurno, a equipe técnica ou a coordenação — e a correção fica registrada '
          + 'com o nome de quem a fez.');
      }
      if (String(input.motivoDaCorrecao ?? '').trim().length < 10) {
        throw new BadRequestException(
          'Esta ATA Geral já foi assinada: descreva por que a linha está sendo corrigida '
          + '(mínimo 10 caracteres). O que constava antes continua legível, e o motivo fica '
          + 'ao lado — é o que explica as duas versões a quem ler depois.');
      }
    }

    const ok = await this.db.asUser(user.id, async (c) => {
      /* O motivo vai para a sessão ANTES do UPDATE: é o gatilho que o lê, e ele
         roda dentro desta mesma transação. */
      await c.query(`SELECT set_config('app.motivo_correcao', $1, true)`,
        [String(input.motivoDaCorrecao ?? '').trim()]);
      const { rowCount } = await c.query(
        `UPDATE general_night_house_entry SET
           had_contact = coalesce($3, had_contact),
           contact_at = coalesce($4::timestamptz, contact_at),
           arrived_at = coalesce($5::timestamptz, arrived_at),
           left_at = coalesce($6::timestamptz, left_at),
           reason = coalesce($7, reason),
           people_involved = coalesce($8, people_involved),
           action_taken = coalesce($9, action_taken),
           category = coalesce($10, category),
           pendencies = coalesce($11, pendencies),
           house_ata_confirmed = coalesce($12, house_ata_confirmed),
           updated_at = now()
         WHERE general_ata_id = $1 AND house_id = $2`,
        [id, houseId, input.houveContato ?? null, input.contatoEm ?? null,
         input.chegada ?? null, input.saida ?? null, input.motivo ?? null,
         input.pessoas ?? null, input.acao ?? null, input.categoria ?? null,
         input.pendencias ?? null, input.confirmarAtaNoturna ?? null]);
      return (rowCount ?? 0) > 0;
    });
    if (!ok) {
      throw new BadRequestException(
        assinada
          ? 'Esta casa não está no seu alcance — a linha dela não é sua para corrigir.'
          : 'ATA Geral fechada ou fora do seu alcance — não é possível alterar.');
    }

    if (assinada) {
      await this.audit.log({
        action: 'ata_geral.house_amend', actorId: user.id, houseId,
        entity: 'general_night_house_entry', entityId: id,
        /* Metadado, nunca o texto do motivo nem o conteúdo da linha (§20). */
        detail: { casa: houseId },
      });
    }

    return {
      ok: true,
      aviso: assinada
        ? 'Corrigido. O que constava antes continua legível na ATA, com o seu nome e o motivo '
          + 'ao lado — nada se apaga.'
        : undefined,
    };
  }

  /**
   * CORRIGIR A LINHA DESTA CASA PELA DATA (1440).
   *
   * Existe para que **o id da folha das oito casas não precise sair do servidor**:
   * quem corrige diz o dia e a casa. A ATA é encontrada aqui dentro, e daí em
   * diante é o mesmo caminho — as mesmas guardas, o mesmo gatilho, o mesmo
   * registro.
   */
  async updateGeneralHouseByDate(user: AuthenticatedUser, data: string, houseId: string,
                                 input: Parameters<ShiftsService['updateGeneralHouse']>[3]) {
    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [g] } = await c.query(
        `SELECT id FROM general_night_ata WHERE on_date = $1::date`, [data]);
      return g?.id as string | undefined;
    });
    if (!id) {
      throw new NotFoundException(
        'Não há ATA Geral Noturna nesta data — não há linha para corrigir.');
    }
    return this.updateGeneralHouse(user, id, houseId, input);
  }

  async closeGeneral(user: AuthenticatedUser, id: string, pendencias?: string) {
    const r = await this.comando(user, 'app_close_general_night_ata($1,$2)', [id, pendencias ?? null], {
      apenas_o_autor_assina: () => new ForbiddenException(
        'A ATA Geral é assinada por quem a preencheu. Ninguém assina por outro.'),
      ata_geral_ja_fechada: () => new BadRequestException('Esta ATA Geral já foi fechada.'),
      pendencia_exige_descricao: () => new BadRequestException(
        'Há casas sem confirmação. Descreva a pendência (mínimo 10 caracteres) — ela vai para a equipe técnica.'),
      ata_geral_inexistente: () => new NotFoundException('ATA Geral não encontrada.'),
    });

    const abertas: string[] = r.out_open ?? [];
    if (abertas.length) {
      await this.audit.log({
        action: 'ata_geral.close_pending', actorId: user.id,
        entity: 'general_night_ata', entityId: id, detail: { casas: abertas },
      });
    }
    // A Geral Noturna é institucional: vai para a raiz sem casa, e é por isso
    // que `houseId` fica nulo — o caminho no Drive diz INSTITUCIONAL.
    const copia: DocumentClosed = {
      categoria: 'ata', entidade: 'general_night_ata', entityId: id, houseId: null,
    };
    await this.bus.publish('document.closed', copia, { actorId: user.id });

    return {
      status: r.out_status,
      confirmadas: Number(r.out_confirmed), total: Number(r.out_total),
      casasSemConfirmacao: abertas,
      aviso: abertas.length
        ? `Assinada com pendência: ${abertas.join(', ')} sem confirmação de fechamento.`
        : 'Assinada. As oito ATAs noturnas constam confirmadas.',
    };
  }

  // ------------------------------------------------------------------
  // Leitura para a linha do tempo
  // ------------------------------------------------------------------

  async listDay(user: AuthenticatedUser, houseId: string, date: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT s.id, s.period, s.status, s.opened_at, s.closed_at,
                a.id AS ata_id, a.status AS ata_status, a.missing_signatures,
                (SELECT count(*)::int FROM handover h WHERE h.shift_id = s.id) AS assinadas,
                (SELECT count(*)::int FROM handover_receipt r WHERE r.shift_id = s.id) AS recebimentos
         -- rls-join-ok: shift e ata compartilham a mesma política (casa).
         FROM shift s LEFT JOIN ata a ON a.shift_id = s.id
         WHERE s.house_id = $1 AND s.on_date = $2::date
         ORDER BY s.period`, [houseId, date]);
      return rows.map((r) => ({
        id: r.id, turno: r.period, status: r.status,
        abertoEm: r.opened_at, fechadoEm: r.closed_at,
        ataId: r.ata_id, ataStatus: r.ata_status,
        assinaturasFaltantes: r.missing_signatures,
        passagensAssinadas: r.assinadas, recebimentos: r.recebimentos,
      }));
    });
  }

  /**
   * O ARQUIVO DAS ATAS — folhear o livro para trás.
   *
   * Três coisas que este método decide, e que não são detalhe:
   *
   *  * o recorte é de CALENDÁRIO, e a conta é feita aqui, no fuso da
   *     instituição: "a semana do dia 12" é segunda a domingo, "março" é do
   *     primeiro ao último dia. "Últimos 7 dias" seria mais fácil de somar e
   *     impossível de pedir a alguém — ninguém manda "a ATA dos últimos sete
   *     dias" para o Conselho Tutelar;
   *  * a ATA Geral Noturna entra só pela linha DAQUELA CASA. Quem quiser a
   *     folha das oito abre a Geral pelo caminho de sempre, e para isso
   *     precisa ser o Líder Noturno Geral ou o Gestor Geral;
   *  * consultar deixa rastro. O que fica registrado é o recorte — casa e
   *     período —, nunca o conteúdo das ATAS lidas (§20).
   */
  async arquivo(user: AuthenticatedUser, houseId: string,
                escala: 'dia' | 'semana' | 'mes', data: string) {
    const { de, ate } = janelaDeConsulta(escala, data || hojeNaInstituicao());

    /*
     * AS CORREÇÕES DA LINHA DESTA CASA (1440), no mesmo recorte.
     *
     * Elas vêm aqui, e não só na folha das oito, porque o Arquivo é onde a
     * coordenação e a equipe técnica OLHAM a linha da casa delas — a folha
     * completa das oito é de quem responde pela instituição. Corrigir sem ver o
     * que se corrigiu não é corrigir.
     */
    const correcoes = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT a.general_ata_id, g.on_date,
                app_user_display_name(a.replaced_by) AS por, a.replaced_at, a.motivo,
                a.reason AS antes_motivo, a.action_taken AS antes_acao,
                a.pendencies AS antes_pendencias, a.arrived_at AS antes_chegada,
                a.left_at AS antes_saida, a.had_contact AS antes_houve_contato
           FROM general_night_house_amendment a
           -- rls-join-ok: a política do adendo já exige a linha, e a linha exige
           -- a casa no escopo; o cabeçalho vem só pela data.
           JOIN general_night_ata g ON g.id = a.general_ata_id
          WHERE a.house_id = $1 AND g.on_date BETWEEN $2::date AND $3::date
          ORDER BY a.replaced_at DESC`, [houseId, de, ate]);
      return rows;
    });

    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM app_arquivo_atas($1, $2::date, $3::date)`, [houseId, de, ate]);
      return rows;
    }).catch((e: any) => {
      const msg: string = e?.message ?? '';
      if (msg.includes('fora_de_escopo')) {
        throw new ForbiddenException('Esta casa não está no seu alcance.');
      }
      if (msg.includes('cargo_nao_consulta_arquivo')) {
        throw new ForbiddenException(
          'O arquivo das ATAS é da coordenação, da equipe técnica e dos líderes.');
      }
      if (msg.includes('periodo_invalido')) {
        throw new BadRequestException('Escolha um período de até um mês.');
      }
      throw e;
    });

    await this.audit.log({
      action: 'ata.arquivo.consulta', actorId: user.id, houseId,
      entity: 'ata', entityId: houseId,
      // Só o recorte. O que estava escrito nas ATAS não vai para o log.
      detail: { escala, de, ate, atas: linhas.length },
    });

    // Um DIA por vez, com os dois turnos dentro — é assim que o livro é lido
    // na casa, e é assim que a pessoa pergunta ("o que houve no dia 12?").
    const dias = new Map<string, any>();
    for (const l of linhas) {
      const dia = typeof l.na_data === 'string'
        ? l.na_data : new Date(l.na_data).toISOString().slice(0, 10);
      if (!dias.has(dia)) dias.set(dia, { data: dia, diurno: null, noturno: null, geral: null });
      const registro = {
        ataId: l.ata_id, plantaoId: l.shift_id, status: l.ata_status,
        pendencias: l.pendencias, assinaturasFaltantes: l.assinaturas_faltantes,
        fechadaEm: l.fechada_em, fechadaPor: l.fechada_por,
        aditamentos: l.aditamentos, episodios: l.episodios, passagens: l.passagens,
      };
      const d = dias.get(dia);
      if (l.turno === 'noturno') {
        d.noturno = registro;
        if (l.geral_id) {
          d.geral = {
            status: l.geral_status, houveContato: l.geral_houve_contato,
            categoria: l.geral_categoria, motivo: l.geral_motivo, acao: l.geral_acao,
            pendencias: l.geral_pendencias, chegada: l.geral_chegada, saida: l.geral_saida,
          };
        }
      } else d.diurno = registro;
    }

    /*
     * O identificador da folha completa das oito casas sai daqui só para quem
     * responde por ela: o Líder Noturno Geral, que a escreve, e o Gestor
     * Geral. Para os demais o arquivo entrega a LINHA da casa e mais nada —
     * ter o id em mãos é ter o caminho para a folha inteira.
     *
     * (A ATA Geral do DIA CORRENTE continua como está na tela de sempre, e a
     * coordenação a alcança. Se o mesmo recorte deve valer lá, é decisão de
     * produto ainda aberta — não mudei sozinho o que já foi aprovado.)
     */
    const veFolhaCompleta = user.role === 'gestor_geral' || user.role === 'lider_noturno_geral';
    /* Quem corrige a linha depois de assinada — decisão de 21/09/2026 (1440). */
    const podeCorrigir = ['lider_diurno', 'equipe_tecnica', 'coordenador'].includes(user.role);
    const diaDe = (l: any) => (typeof l.na_data === 'string' ? l.na_data
      : new Date(l.na_data).toISOString().slice(0, 10));

    return {
      de, ate, escala,
      dias: [...dias.values()].map((d) => {
        const ataId = linhas.find((l: any) => l.geral_id && diaDe(l) === d.data)?.geral_id ?? null;
        return {
          ...d,
          geral: d.geral && {
            ...d.geral,
            id: veFolhaCompleta ? ataId : null,
            /*
             * **O ID NÃO SAI DAQUI, e isto é conserto de um erro meu.**
             *
             * Eu havia devolvido o id da ATA Geral para quem pode corrigir, e a
             * suíte do Arquivo me pegou com a frase que já estava escrita nela:
             * *"nem o identificador da folha completa: com ele em mãos, a linha
             * das outras sete está a uma chamada de distância"*. Está certa — a
             * política das linhas entrega as oito à coordenação desde a 0310, e é
             * a TELA que decide não mostrá-las; entregar o id desfaria isso pela
             * porta dos fundos.
             *
             * Então a correção não passa por id: a rota
             * `PATCH /shifts/general-night-line/:data/house/:houseId` resolve a
             * ATA pela DATA, no servidor. Quem corrige diz o dia e a casa — que é
             * como a pessoa pensa —, e nunca fica com o endereço da folha inteira.
             */
            podeCorrigir: podeCorrigir && ataId != null,
            correcoes: correcoes
              .filter((k: any) => k.general_ata_id === ataId)
              .map((k: any) => ({
                por: k.por, em: k.replaced_at, motivo: k.motivo,
                antes: {
                  motivo: k.antes_motivo, acao: k.antes_acao,
                  pendencias: k.antes_pendencias, chegada: k.antes_chegada,
                  saida: k.antes_saida, houveContato: k.antes_houve_contato,
                },
              })),
          },
        };
      }),
      /*
       * A tela diz por que a folha das oito casas não está ali. Esconder sem
       * explicar faz a pessoa achar que o sistema perdeu o registro — e o
       * caminho seguinte costuma ser pedir por fora, que é o que a regra 2
       * proíbe.
       */
      notaAtaGeral: user.role === 'gestor_geral'
        ? 'Da ATA Geral Noturna aparece aqui a linha desta casa. A folha completa '
          + 'das oito casas você abre pela ATA Geral do dia.'
        : 'Da ATA Geral Noturna aparece a linha desta casa — o que o Líder Noturno '
          + 'Geral registrou sobre ela. O que ele registrou sobre as outras casas é '
          + 'assunto delas.',
    };
  }

  // ------------------------------------------------------------------
  // Infra local
  // ------------------------------------------------------------------

  private async casaDaAta(user: AuthenticatedUser, ataId: string): Promise<string> {
    const casa = await this.db.asUser(user.id, async (c) => {
      const { rows: [a] } = await c.query(`SELECT house_id FROM ata WHERE id = $1`, [ataId]);
      return a?.house_id;
    });
    if (!casa) throw new NotFoundException('ATA não encontrada.');
    return casa;
  }

  /**
   * A ATA e o STATUS dela — para quem precisa recusar sobre documento fechado.
   *
   * Encontrado em 01/09/2026 pelo ensaio dos episódios: `addEpisode` só pedia a
   * casa, e por isso um episódio novo entrava numa ATA JÁ FECHADA e a mudava
   * sem adendo nenhum. A cópia documental daquela ATA já tinha ido para o
   * arquivo — o sistema e a cópia filhada passavam a dizer coisas diferentes,
   * em silêncio. Corrigir ATA fechada é reabrir e registrar (§12.7); episódio
   * novo pertence ao plantão que está aberto, com o horário real do fato.
   */
  private async ataAberta(user: AuthenticatedUser, ataId: string): Promise<string> {
    const a = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT house_id, status FROM ata WHERE id = $1`, [ataId]);
      return row;
    });
    if (!a) throw new NotFoundException('ATA não encontrada.');
    if (['fechada', 'fechada_com_pendencia'].includes(a.status)) {
      throw new BadRequestException(
        'Esta ATA está fechada e não recebe registro novo. O episódio pertence ao plantão que '
        + 'está aberto — registre nele, com o horário real do fato. Se o que precisa mudar é o '
        + 'texto desta ATA, o caminho é a reabertura, e ela deixa adendo.');
    }
    return a.house_id;
  }

  /**
   * Chamada de comando de sistema com tradução de erro.
   * As exceções do banco viram mensagens de usuário AQUI, uma vez só — foi o
   * que evitou, na Fase 2, que "Internal server error" chegasse à tela.
   */
  private async comando(
    user: AuthenticatedUser, sql: string, params: unknown[],
    mapa: Record<string, (detalhe: string) => Error> = {},
  ): Promise<any> {
    try {
      return await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(`SELECT * FROM ${sql}`, params);
        return row;
      });
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      for (const [chave, fabrica] of Object.entries(mapa)) {
        if (msg.includes(chave)) {
          const detalhe = msg.split(`${chave}:`)[1]?.trim() ?? '';
          throw fabrica(detalhe);
        }
      }
      if (msg.includes('fora_de_escopo')) {
        throw new ForbiddenException('Este plantão pertence a outra casa.');
      }
      if (msg.includes('cargo_nao_abre_plantao')) {
        throw new ForbiddenException('Seu cargo não abre plantão.');
      }
      throw e;
    }
  }

  // ------------------------------------------------------------------
  // A ATA como documento
  // ------------------------------------------------------------------

  /**
   * A folha da ATA — a mesma estrutura que a tela desenha e que vira o .docx.
   *
   * Não gera arquivo e não registra saída: ver não é exportar. Quem tem
   * alcance no plantão tem alcance na folha dele, e é o RLS de `get` que
   * decide isso — não uma segunda lista de permissões aqui.
   */
  async folhaDoPlantao(user: AuthenticatedUser, shiftId: string) {
    const p = await this.get(user, shiftId);
    const casa = await this.db.asUser(user.id, async (c) => {
      const { rows: [h] } = await c.query(
        `SELECT app_house_label($1) AS code, app_house_name($1) AS name`, [p.casaId]);
      return [h?.code, h?.name].filter(Boolean).join(' — ') || 'Unidade';
    });
    return folhaDaAta(
      {
        data: p.data, turno: p.turno,
        status: p.ata?.status ?? p.status,
        conteudo: p.ata?.conteudo ?? null,
        pendencias: p.ata?.pendencias ?? null,
        episodios: p.episodios.map((e: any) => ({
          quando: e.quando, classificacao: e.classificacao,
          relato: e.relato, por: e.registradoPor,
        })),
        passagens: p.passagens.map((h: any) => ({
          quem: h.quem, cargo: cargoNoDocumento(h.cargo), assinadaEm: h.assinadaEm,
        })),
      },
      SECOES_ATA.map((s) => ({ chave: s.chave, titulo: s.titulo })),
      casa,
      { nome: user.fullName, cargo: cargoNoDocumento(user.role) },
    );
  }

  /** O arquivo. Exige finalidade escrita, e a saída fica registrada. */
  async exportarAta(user: AuthenticatedUser, shiftId: string, finalidade: string) {
    const folha = await this.folhaDoPlantao(user, shiftId);
    const p = await this.get(user, shiftId);
    return this.documentos.exportar(user, folha, {
      entidade: 'ata', entidadeId: p.ata?.id ?? shiftId,
      houseId: p.casaId, finalidade,
    });
  }

}
