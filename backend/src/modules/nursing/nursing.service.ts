import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { cargoNoDocumento } from '../../kernel/documentos/folha';
import { folhaDeSaude } from './saude-folha';

/** Prazo esperado de triagem — pendência institucional 33.4.2, configurável. */
const SLA_TRIAGEM_HORAS = Number(process.env.NURSING_TRIAGE_SLA_HOURS ?? 24);

/**
 * O vocabulário do histórico sai daqui, e não da tela.
 *
 * `encounter_kind` é ENUM do banco (0210) e `status` é CHECK. Traduzir na tela
 * significa duas listas que combinam hoje e divergem no dia em que entrar um
 * tipo novo — foi exatamente o que aconteceu com os estados da dose, que a
 * Saúde escrevia com outros códigos e ninguém percebeu porque o rótulo batia.
 */
const TIPO_ATENDIMENTO: Record<string, string> = {
  consulta: 'Consulta', exame: 'Exame', urgencia: 'Urgência',
  emergencia: 'Emergência', internacao: 'Internação', retorno: 'Retorno',
  terapia: 'Terapia',
};
/**
 * COMO A CRIANÇA ESTAVA, nas quatro opções do modelo de papel da Fundação (1460).
 *
 * **Não é avaliação de personalidade**, e a 0530 já tinha escrito isso: é estado
 * observado em dois momentos, e a comparação entre eles é o que a Enfermagem lê.
 * Por isso são opções FECHADAS, ao lado do texto livre que já existe — e por isso
 * elas não são contadas em painel nenhum (§6: pontuação de comportamento não).
 */
const COMPORTAMENTO: Record<string, string> = {
  tranquila: 'Tranquila',
  ansiosa_temerosa_chorosa: 'Ansiosa, temerosa ou chorosa',
  agressiva: 'Agressiva',
  apatica: 'Apática',
};

const ESTADO_ATENDIMENTO: Record<string, string> = {
  em_andamento: 'Em andamento', concluido: 'Concluído',
  retorno_pendente: 'Retorno marcado',
};
const ESTADO_EVOLUCAO: Record<string, string> = {
  aguardando_triagem: 'Aguardando triagem da Enfermagem',
  complemento_solicitado: 'Devolvida para complemento',
  assinada: 'Conferida e assinada',
};
/**
 * Os mesmos rótulos de `ESTADO_DOSE` do módulo de medicamentos, escritos de
 * novo de propósito: partição não importa partição (arquitetura.spec), e a
 * alternativa — a Enfermagem pedir a lista ao módulo vizinho — é justamente o
 * acoplamento que a regra 5 evita. Se um estado novo entrar no ENUM, o `??`
 * abaixo mostra o código cru em vez de mentir um rótulo.
 */
const ESTADO_DA_DOSE: Record<string, string> = {
  aguardando_confirmacao: 'Aguardando confirmação',
  administrado_no_horario: 'Administrado no horário',
  administrado_com_atraso: 'Administrado com atraso',
  recusado: 'Recusado pelo acolhido',
  nao_administrado: 'Não administrado',
  indisponivel: 'Medicamento indisponível',
  suspenso_conforme_orientacao: 'Suspenso conforme orientação',
  acolhido_ausente: 'Acolhido ausente',
  incidente: 'Incidente registrado',
};

@Injectable()
export class NursingService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
  ) {}

  // ---------- Painel (§7.1) ----------

  /**
   * Painel da Enfermagem por casa: TODOS os acolhidos, inclusive quem não tem
   * medicação prevista. A ausência de medicação é informação — não motivo para
   * a pessoa sumir da tela.
   */
  async panel(user: AuthenticatedUser, houseId: string, date: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_nursing_panel($1,$2::date)`, [houseId, date]);
      return rows;
    });

    const acolhidos = rows.map((r) => ({
      acolhidoId: r.person_id,
      nome: r.nome,
      nomeCivil: r.nome_civil,
      idade: r.idade,
      alergias: r.alergias,
      restricoes: r.restricoes,
      condicoes: r.condicoes,
      dosesPrevistas: r.doses_previstas,
      proximaDose: r.proxima_dose,
      ultimaDose: r.ultima_dose,
      dosesPendentes: r.pendentes,
      evolucoesAguardandoTriagem: r.evolucoes_pendentes,
      internacaoEmAndamento: r.internacao,
      retornoPendente: r.retorno_pendente,
      receitaVencendo: r.receita_vencendo,
      semMedicacaoPrevista: r.doses_previstas === 0,
    }));

    // O aviso de receita vencendo parte de HOJE, e não do dia mostrado (§8.4):
    // a receita vence numa data, e a data não muda porque a Enfermagem foi
    // revisar a véspera. Quando os dois dias diferem, a tela precisa dizer de
    // onde o número parte — número certo com origem escondida vira dúvida.
    const hoje = hojeNaInstituicao();

    return {
      data: date,
      hoje,
      receitaVencendoAncoradaEm: hoje,
      revendoOutroDia: date !== hoje,
      total: acolhidos.length,
      resumo: {
        comMedicacao: acolhidos.filter((a) => !a.semMedicacaoPrevista).length,
        semMedicacao: acolhidos.filter((a) => a.semMedicacaoPrevista).length,
        dosesPendentes: acolhidos.reduce((s, a) => s + a.dosesPendentes, 0),
        triagensPendentes: acolhidos.reduce((s, a) => s + a.evolucoesAguardandoTriagem, 0),
        internacoes: acolhidos.filter((a) => a.internacaoEmAndamento).length,
      },
      acolhidos,
      aviso: 'Indicadores operacionais. Não constituem diagnóstico nem prioridade clínica automática.',
    };
  }

  // ---------- Evolução de Saúde (§7.2) ----------

  /**
   * Preenchida por quem ACOMPANHOU o atendimento. O envio cria pendência para
   * a Enfermagem — e a receita citada aqui não altera a grade de medicamentos
   * antes da revisão dela.
   */
  /**
   * AS OPÇÕES DA EVOLUÇÃO DE SAÚDE — e por que o tipo vem do ENUM do banco.
   *
   * **Isto conserta um defeito de 500.** A tela tinha a própria lista escrita à
   * mão, com um `vacina` que **não existe** no `encounter_kind`: quem registrasse
   * uma vacina recebia *"Internal server error"* — medido em 22/09/2026. E o
   * enum tinha `emergencia` e `terapia`, que a tela nunca ofereceu, então dois
   * tipos de atendimento não tinham como ser registrados.
   *
   * A lista vem do CATÁLOGO, e não de uma constante daqui: constante daqui
   * empata com a da tela e as duas envelhecem juntas. Lendo o enum, um valor novo
   * aparece na tela sem ninguém lembrar de nada — e um valor que a tela oferece
   * mas o banco não aceita deixa de ser possível.
   *
   * O RÓTULO é daqui, porque nome de gente não mora em enum. Valor sem rótulo cai
   * no próprio código em vez de sumir: a tela mostra `terapia` feio uma vez, e
   * alguém escreve o rótulo — melhor do que o botão não existir.
   */
  async opcoesDaEvolucao(user: AuthenticatedUser) {
    const tipos = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT e.enumlabel AS cod FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'encounter_kind' ORDER BY e.enumsortorder`);
      return rows.map((r) => ({ cod: r.cod as string,
        label: TIPO_ATENDIMENTO[r.cod] ?? r.cod }));
    });
    return {
      tipos,
      comportamentos: Object.entries(COMPORTAMENTO).map(([cod, label]) => ({ cod, label })),
      aviso: 'Como a criança estava ao chegar e ao sair é observação de dois momentos, para a '
        + 'Enfermagem comparar. Não é avaliação da criança, e não é contada em painel nenhum.',
    };
  }

  async submitEvolution(user: AuthenticatedUser, input: {
    personId: string; houseId: string; tipo: string; quandoAconteceu: string;
    local?: string; especialidade?: string; servicoProfissional?: string; motivo?: string;
    estadoSaida?: string; estadoDurante?: string; estadoRetorno?: string;
    procedimentos?: string; examesSolicitados?: string; examesResultados?: string;
    receita?: string; orientacoes?: string; restricoes?: string; prazoRetorno?: string;
    encaminhamentos?: string; intercorrenciasDeslocamento?: string; observacoes?: string;
    offline?: boolean; clientOpId?: string;
    /**
     * Quem LEVOU a criança, quando não foi quem escreve (1400).
     *
     * Opcional, e o normal é vir vazio: `accompanied_by` já é o autor. Isto é
     * para o motorista da Fundação e para a tia autorizada — que não têm conta
     * no sistema, e não devem ter uma só para caber num `uuid`.
     */
    acompanhanteNome?: string;
    /**
     * COMO A CRIANÇA ESTAVA AO CHEGAR E AO SAIR (1460).
     *
     * As quatro opções do modelo de papel da Fundação. **Não é avaliação de
     * personalidade**: é estado observado em dois momentos, e a comparação entre
     * eles é o que a Enfermagem lê — foi assim que a 0530 escreveu, e é a razão
     * de serem opções fechadas em vez de texto livre (que já existe ao lado).
     *
     * **Não são contadas em painel nenhum**, de propósito: contar quatro opções
     * sobre como a criança estava é pontuação de comportamento, e o §6 proíbe.
     */
    comportamentoAoChegar?: string;
    comportamentoAoSair?: string;
  }) {
    if (!input.quandoAconteceu) {
      throw new BadRequestException('Informe o horário real do atendimento.');
    }
    if (!input.estadoRetorno?.trim()) {
      // O estado no retorno é o que o próximo plantão mais precisa saber.
      throw new BadRequestException('Descreva o estado observado no retorno.');
    }

    // Comando de sistema (migração 0210): a evolução e o atendimento nascem
    // juntos. O educador RELATA o que acompanhou — não ganha permissão de
    // editar o histórico de saúde, que continua sendo ato da Enfermagem.
    let ids: { out_evolution_id: string };
    try {
      ids = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT * FROM app_submit_evolution($1,$2,$3,$4::timestamptz,$5,$6,$7,$8,$9,$10,$11,
             $12,$13,$14,$15,$16,$17,$18::date,$19,$20,$21,$22,$23,$24,$25,$26)`,
          [input.personId, input.houseId, input.tipo, input.quandoAconteceu,
           input.local ?? null, input.especialidade ?? null, input.servicoProfissional ?? null,
           input.motivo ?? null, input.estadoSaida ?? null, input.estadoDurante ?? null,
           input.estadoRetorno, input.procedimentos ?? null, input.examesSolicitados ?? null,
           input.examesResultados ?? null, input.receita ?? null, input.orientacoes ?? null,
           input.restricoes ?? null, input.prazoRetorno ?? null, input.encaminhamentos ?? null,
           input.intercorrenciasDeslocamento ?? null, input.observacoes ?? null,
           input.offline ?? false, input.clientOpId ?? null,
           input.acompanhanteNome?.trim() || null,
           input.comportamentoAoChegar || null, input.comportamentoAoSair || null]);
        return r;
      });
    } catch (e: any) {
      if (e?.message?.includes('acolhido_fora_de_escopo')) {
        throw new NotFoundException('Acolhido não encontrado.');
      }
      /*
       * TIPO QUE O BANCO NÃO CONHECE VIRA FRASE, E NÃO 500 (fase 140).
       *
       * O `p_kind::encounter_kind` estoura cru quando o valor não está no enum, e
       * o educador via *"Internal server error"* — foi exatamente o que a tela
       * causava ao oferecer `vacina`, que não existe. A tela já não oferece, mas a
       * recusa tem de falar português de qualquer forma: **uma fila offline
       * gravada antes desta fase ainda vai subir com o valor antigo**, e quem a
       * vê subir é quem está de plantão.
       */
      if (String(e?.message ?? '').includes('invalid input value for enum encounter_kind')) {
        const { tipos } = await this.opcoesDaEvolucao(user);
        throw new BadRequestException(
          'Este tipo de atendimento não existe no sistema. Os que existem são: '
          + `${tipos.map((t) => t.label).join(', ')}.`);
      }
      throw e;
    }
    const id = ids.out_evolution_id;

    await this.audit.log({
      action: 'health.evolution_submit', actorId: user.id, houseId: input.houseId,
      entity: 'health_evolution', entityId: id,
      detail: { tipo: input.tipo, offline: input.offline ?? false },
    });
    // A Enfermagem é avisada pelo contrato genérico do kernel: quem publica
    // não sabe quem ouve, e o módulo de notificações não sabe o que é uma
    // Evolução de Saúde.
    await this.bus.publish('escalation.requested', {
      level: 'enfermagem', entity: 'health_evolution', entityId: id,
      reason: 'Evolução de Saúde aguardando triagem',
      title: 'Evolução de Saúde aguardando triagem',
      body: `Atendimento acompanhado por ${user.fullName} aguarda conferência e assinatura. Prazo combinado: ${SLA_TRIAGEM_HORAS}h.`,
      priority: 'alta',
    }, { actorId: user.id, houseId: input.houseId });

    return {
      id,
      status: 'aguardando_triagem',
      aviso: 'Evolução enviada à Enfermagem para triagem, conferência e assinatura. ' +
             'Receita nova só altera a grade de medicamentos após essa revisão.',
      prazoEsperadoHoras: SLA_TRIAGEM_HORAS,
    };
  }

  /** Fila de triagem da Enfermagem — transversal às casas em escopo. */
  async triageQueue(user: AuthenticatedUser, houseId?: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT e.id, e.kind, e.happened_at, e.place, e.specialty, e.status, e.created_at,
                e.state_return, e.prescription_note, e.guidance, e.restrictions, e.return_deadline,
                e.offline, e.house_id,
                -- e.house_id é a casa do ATENDIMENTO, congelada. Com JOIN
                -- house, a evolução pendente de uma criança recém-transferida
                -- sumia para a técnica que acabou de recebê-la — justamente
                -- quem o §7.2 encarrega de cobrar a pendência.
                app_house_label(e.house_id) AS casa,
                app_person_display_name(e.person_id) AS pessoa, e.person_id,
                app_user_display_name(e.accompanied_by) AS acompanhante,
                -- Quem LEVOU, quando não foi quem escreveu (1400). Vem ao lado
                -- e não NO LUGAR: a Enfermagem que tria precisa saber os dois.
                e.companion_name,
                -- Os dois momentos do papel (1460). Vêm JUNTOS ou não vêm: é a
                -- comparação entre eles que a Enfermagem lê, e um sozinho é um
                -- rótulo solto sobre a criança.
                e.behavior_before, e.behavior_after,
                (SELECT t.request_note FROM nursing_triage t
                  WHERE t.evolution_id = e.id ORDER BY t.at DESC LIMIT 1) AS pedido_complemento
         FROM health_evolution e
         WHERE e.status <> 'assinada' AND ($1::uuid IS NULL OR e.house_id = $1)
         ORDER BY e.created_at`, [houseId ?? null]);
      return rows;
    });

    const agora = Date.now();
    return rows.map((r) => {
      const horas = (agora - new Date(r.created_at).getTime()) / 3_600_000;
      return {
        id: r.id, acolhidoId: r.person_id, acolhido: r.pessoa, casa: r.casa,
        tipo: r.kind, quando: r.happened_at, local: r.place, especialidade: r.specialty,
        acompanhante: r.acompanhante,
        /* Vem AO LADO do autor, nunca no lugar dele: quem escreveu responde
           pelo que escreveu, e quem levou é outra pergunta (1400). */
        quemLevou: r.companion_name ?? null,
        comportamentoAoChegar: r.behavior_before ?? null,
        comportamentoAoSair: r.behavior_after ?? null,
        estadoRetorno: r.state_return,
        receita: r.prescription_note, orientacoes: r.guidance, restricoes: r.restrictions,
        prazoRetorno: r.return_deadline, offline: r.offline,
        status: r.status, pedidoComplemento: r.pedido_complemento,
        horasNaFila: Math.floor(horas),
        // Prazo é acompanhamento, não punição: sinaliza o que passou do combinado.
        foraDoPrazo: horas > SLA_TRIAGEM_HORAS,
      };
    });
  }

  /**
   * Triagem: complementa, confere e ASSINA — ou devolve pedindo complemento.
   * Só a Enfermagem. A coordenação cobra a pendência, mas não assina por ela.
   */
  async triage(user: AuthenticatedUser, evolutionId: string, input: {
    acao: 'assinar' | 'pedir_complemento'; complemento?: string;
    notaClinica?: string; pedido?: string;
  }) {
    if (!['enfermagem', 'gestor_geral'].includes(user.role)) {
      /* A casa da evolução vem do banco, lida como dona: a recusa tem de ficar
         no rastro da casa, e quem foi recusado não alcança a linha (fase 149). */
      const { rows: [ev] } = await this.db.query(
        `SELECT house_id FROM health_evolution WHERE id = $1`, [evolutionId]);
      await this.audit.log({
        action: 'health.triage_denied', actorId: user.id,
        houseId: (ev?.house_id as string | null) ?? null,
        entity: 'health_evolution', entityId: evolutionId, detail: { papel: user.role },
      });
      throw new ForbiddenException(
        'Somente a Enfermagem tria e assina Evoluções de Saúde. A coordenação acompanha e cobra a pendência.');
    }
    if (input.acao === 'pedir_complemento' && !input.pedido?.trim()) {
      throw new BadRequestException('Descreva o que falta para o acompanhante complementar.');
    }

    const ok = await this.db.asUser(user.id, async (c) => {
      const { rows: [e] } = await c.query(
        `SELECT id, person_id, house_id, status FROM health_evolution WHERE id = $1`, [evolutionId]);
      if (!e) return null;
      if (e.status === 'assinada') return { ja: true, corrida: false, e };

      /*
       * O ESTADO PRIMEIRO, conferido no próprio UPDATE; a triagem depois (fase 91).
       *
       * Antes a triagem era gravada e o estado mudava com `WHERE id = $1`. A
       * Enfermagem assinando enquanto o Gestor devolvia: as duas passavam pela
       * leitura acima, e a segunda a gravar desfazia a primeira — a evolução
       * ASSINADA voltava a "complemento solicitado", com duas triagens
       * registradas, e as duas pessoas lendo "feito". A leitura continua dando
       * a frase certa; quem garante que é uma triagem só é o WHERE com o estado
       * que foi lido (regra 11).
       */
      const { rowCount } = await c.query(
        `UPDATE health_evolution SET status = $2 WHERE id = $1 AND status = $3`,
        [evolutionId, input.acao === 'assinar' ? 'assinada' : 'complemento_solicitado', e.status]);
      if (!rowCount) return { ja: false, corrida: true, e };

      await c.query(
        `INSERT INTO nursing_triage (evolution_id, nurse_id, complement, clinical_note, action, request_note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [evolutionId, user.id, input.complemento ?? null, input.notaClinica ?? null,
         input.acao === 'assinar' ? 'assinada' : 'complemento_solicitado', input.pedido ?? null]);
      return { ja: false, corrida: false, e };
    });
    if (!ok) throw new NotFoundException('Evolução não encontrada.');
    if (ok.ja) throw new BadRequestException('Esta evolução já foi triada e assinada.');
    if (ok.corrida) {
      throw new ConflictException(
        'Outra pessoa triou esta evolução enquanto você conferia. Abra de novo para ver como ficou '
        + '— nada do que você escreveu foi gravado.');
    }

    await this.audit.log({
      action: input.acao === 'assinar' ? 'health.triage_sign' : 'health.triage_request',
      actorId: user.id, houseId: ok.e.house_id,
      entity: 'health_evolution', entityId: evolutionId,
    });
    await this.bus.publish(
      input.acao === 'assinar' ? 'health.evolution_signed' : 'health.evolution_complement_requested',
      { evolutionId, personId: ok.e.person_id }, { actorId: user.id, houseId: ok.e.house_id });

    return input.acao === 'assinar'
      ? {
          ok: true, status: 'assinada',
          aviso: 'Evolução conferida e assinada. Agora a grade de medicamentos pode ser atualizada, se for o caso.',
        }
      : { ok: true, status: 'complemento_solicitado', aviso: 'Devolvida ao acompanhante com o pedido registrado.' };
  }

  /**
   * HISTÓRICO DE SAÚDE DO ACOLHIDO — a linha única do §7.3.
   *
   * A rota existia desde a fase 4 e nunca teve tela. O sistema guardava
   * atendimento, evolução e dose administrada de cada criança, e quem
   * precisasse saber quando foi a última consulta ou quando é o retorno tinha
   * de perguntar a um colega — que é como um retorno se perde.
   *
   * Três coisas que a resposta carrega e que a tela sozinha não deveria
   * inventar:
   *
   *  * o RÓTULO de cada tipo e estado vem daqui, dos códigos do banco;
   *  * o retorno marcado que já passou vem MARCADO como vencido. Sem isso a
   *    tela mostra uma data antiga em cinza e ninguém a lê como pendência;
   *  * e a contagem no topo, para quem abre e precisa saber, em um olhar, se
   *    há algo esperando.
   */
  async history(user: AuthenticatedUser, personId: string) {
    const hoje = hojeNaInstituicao();
    return this.db.asUser(user.id, async (c) => {
      const { rows: encontros } = await c.query(
        `SELECT id, kind, happened_at, place, specialty, professional, reason, outcome,
                status, return_on::text AS return_on
         FROM health_encounter WHERE person_id = $1 ORDER BY happened_at DESC LIMIT 100`, [personId]);
      const { rows: evolucoes } = await c.query(
        `SELECT e.id, e.kind, e.happened_at, e.state_return, e.guidance, e.status,
                app_user_display_name(e.accompanied_by) AS acompanhante,
                -- Quem LEVOU, quando não foi quem escreveu (1400). Vem ao lado
                -- e não NO LUGAR: a Enfermagem que tria precisa saber os dois.
                e.companion_name,
                -- Os dois momentos do papel (1460). Vêm JUNTOS ou não vêm: é a
                -- comparação entre eles que a Enfermagem lê, e um sozinho é um
                -- rótulo solto sobre a criança.
                e.behavior_before, e.behavior_after,
                (SELECT t.complement FROM nursing_triage t
                  WHERE t.evolution_id = e.id AND t.action = 'assinada' ORDER BY t.at DESC LIMIT 1) AS complemento
         FROM health_evolution e
         WHERE e.person_id = $1 ORDER BY e.happened_at DESC LIMIT 100`, [personId]);
      const { rows: doses } = await c.query(
        `SELECT a.scheduled_at, a.state, a.administered_at, a.note, pr.medication, pr.dose,
                app_user_display_name(a.administered_by) AS por
         FROM medication_administration a
         -- rls-join-ok: prescription e medication_administration usam a mesma
         -- política (app_person_in_scope).
         JOIN prescription pr ON pr.id = a.prescription_id
         WHERE a.person_id = $1 AND a.state <> 'aguardando_confirmacao'
         ORDER BY a.scheduled_at DESC LIMIT 100`, [personId]);

      /*
       * AS INTERNAÇÕES ENTRAM NO HISTÓRICO DE SAÚDE.
       *
       * "A medicação dada no hospital entra no perfil e no sistema sim, pois o
       * sistema está cuidando da criança como um todo" — coordenação,
       * 03/09/2026. Sem isto, o histórico teria um buraco de três semanas
       * exatamente no período em que mais coisa aconteceu com a criança.
       *
       * A leitura NÃO passa pela política da internação: quem alcança o
       * histórico de saúde vê que houve internação, o hospital e o período.
       * O DIÁRIO continua onde estava, atrás do alcance da internação — o
       * educador comum não lê o relato do dia no hospital, e essa é a decisão
       * da coordenação. Saber que a criança esteve internada é outra coisa:
       * é a resposta para "por que ela sumiu da chamada em agosto?".
       */
      const { rows: internacoes } = await c.query(
        `SELECT h.id, h.hospital, h.started_at, h.ended_at, h.status, h.outcome,
                (SELECT count(*)::int FROM hospitalization_medication m
                  WHERE m.hospitalization_id = h.id) AS doses
           FROM hospitalization h WHERE h.person_id = $1
          ORDER BY h.started_at DESC`, [personId]);

      const { rows: dosesNoHospital } = await c.query(
        `SELECT m.given_at, m.medication, m.dose, m.route, m.note, h.hospital
           FROM hospitalization_medication m
           JOIN hospitalization h ON h.id = m.hospitalization_id
          WHERE h.person_id = $1
          ORDER BY m.given_at DESC LIMIT 100`, [personId]);

      const atendimentos = encontros.map((e) => ({
        id: e.id, tipo: e.kind, tipoRotulo: TIPO_ATENDIMENTO[e.kind] ?? e.kind,
        quando: e.happened_at, local: e.place, especialidade: e.specialty,
        profissional: e.professional, motivo: e.reason, desfecho: e.outcome,
        status: e.status, statusRotulo: ESTADO_ATENDIMENTO[e.status] ?? e.status,
        retornoEm: e.return_on,
        // Retorno marcado para uma data que já passou não é histórico: é
        // pendência. Quem lê precisa disso escrito, não deduzido da data.
        retornoVencido: e.status === 'retorno_pendente'
          && e.return_on != null && String(e.return_on) < hoje,
      }));
      const evolucoesMap = evolucoes.map((e) => ({
        id: e.id, tipo: e.kind, tipoRotulo: TIPO_ATENDIMENTO[e.kind] ?? e.kind,
        quando: e.happened_at, estadoRetorno: e.state_return,
        orientacoes: e.guidance, acompanhante: e.acompanhante,
        quemLevou: e.companion_name ?? null,
        comportamentoAoChegar: e.behavior_before ?? null,
        comportamentoAoSair: e.behavior_after ?? null,
        status: e.status,
        statusRotulo: ESTADO_EVOLUCAO[e.status] ?? e.status,
        complementoEnfermagem: e.complemento,
      }));

      return {
        atendimentos,
        evolucoes: evolucoesMap,
        administracoes: doses.map((d) => ({
          previsto: d.scheduled_at, estado: d.state,
          estadoRotulo: ESTADO_DA_DOSE[d.state] ?? d.state,
          realizado: d.administered_at,
          medicamento: d.medication, dose: d.dose, por: d.por, observacao: d.note,
        })),
        internacoes: internacoes.map((i: any) => ({
          id: i.id, hospital: i.hospital, desde: i.started_at, ate: i.ended_at,
          status: i.status, desfecho: i.outcome, dosesNoHospital: i.doses,
        })),
        /*
         * As doses do hospital ficam numa lista SEPARADA da grade da casa, e
         * cada uma sai com a origem escrita. Misturá-las com as doses
         * confirmadas por quem administrou faria a casa aparecer
         * administrando o que não administrou.
         */
        medicacaoNoHospital: dosesNoHospital.map((m: any) => ({
          quando: m.given_at, medicamento: m.medication, dose: m.dose, via: m.route,
          observacao: m.note, origem: `Administrada pelo ${m.hospital}`,
        })),
        // O que está esperando alguém, contado aqui e não na tela.
        pendencias: {
          retornosVencidos: atendimentos.filter((a) => a.retornoVencido).length,
          retornosMarcados: atendimentos.filter(
            (a) => a.status === 'retorno_pendente' && !a.retornoVencido).length,
          /* A internação de verdade é a da tabela `hospitalization`, e não o
           * tipo de atendimento — que registra QUE houve, e não o período. */
          internacaoEmAndamento: internacoes.some((i: any) => i.status === 'em_andamento'),
          evolucoesAguardandoTriagem: evolucoesMap.filter(
            (e) => e.status !== 'assinada').length,
        },
        aviso: 'O histórico é a linha única do acolhido: atendimento, evolução de quem '
          + 'acompanhou e dose administrada, na ordem em que aconteceram. Ele não resume, '
          + 'não conclui e não ordena por gravidade — quem lê é quem interpreta.',
      };
    });
  }

  // ------------------------------------------------------------------
  // A saúde do acolhido como documento
  // ------------------------------------------------------------------

  /** A folha da saúde. Ver não é exportar: não gera arquivo e não registra. */
  async folhaDeSaude(user: AuthenticatedUser, personId: string) {
    const h: any = await this.history(user, personId);
    const quem = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT app_person_display_name($1) AS nome,
                (SELECT app_house_label(hs.house_id) || ' — ' || app_house_name(hs.house_id)
                   FROM house_stay hs
                  WHERE hs.person_id = $1 AND hs.status = 'ativa' LIMIT 1) AS unidade`,
        [personId]);
      return r;
    });
    /* Nome nulo significa uma coisa só: a criança nunca esteve numa casa do
     * seu alcance. Gerar a folha assim entregaria um documento sobre alguém
     * que a pessoa não pode ver. */
    if (!quem?.nome) {
      throw new NotFoundException('Acolhido não encontrado — ou fora do seu alcance.');
    }
    return folhaDeSaude(
      { nome: quem.nome },
      {
        atendimentos: h.atendimentos, evolucoes: h.evolucoes,
        /* O período no hospital e a medicação de lá entram na folha que a
         * Enfermagem leva para a consulta: uma folha com três semanas em
         * branco, sem dizer que a criança esteve internada, faz o médico
         * concluir que ninguém acompanhou. */
        internacoes: h.internacoes, medicacaoNoHospital: h.medicacaoNoHospital,
        administracoes: h.administracoes, pendencias: h.pendencias,
      },
      quem.unidade ?? 'Unidade',
      { nome: user.fullName, cargo: cargoNoDocumento(user.role) },
    );
  }

  async exportarSaude(user: AuthenticatedUser, personId: string, finalidade: string) {
    const folha = await this.folhaDeSaude(user, personId);
    /* A casa da criança, lida pelo alcance de quem exporta (fase 154). Sem ela a
     * linha nascia sem casa, e a coordenação não sabia quem tirou do sistema a
     * ficha de saúde de uma criança dela — a exportação mais sensível que há. */
    return this.documentos.exportar(user, folha, {
      entidade: 'health_history', entidadeId: personId, finalidade,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
    });
  }

}

export { SLA_TRIAGEM_HORAS };
