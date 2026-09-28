import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { ArquivosService, RegraDoArquivo } from '../../kernel/arquivos/arquivos.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { EventBus } from '../../kernel/events/event-bus.service';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { cargoNoDocumento } from '../../kernel/documentos/folha';
import { paginasDoPdf } from '../../kernel/documentos/paginas-do-pdf';
import { folhaDaInternacao, AnexoDaInternacao } from './internacao-folha';

/**
 * A INTERNAÇÃO HOSPITALAR (migração 0890).
 *
 * A criança internada continua da casa: continua na contagem, continua
 * ocupando a vaga, continua sendo responsabilidade da equipe. O que muda é que
 * ela sai da linha do dia — chamada, grade de medicação, rotina — e ganha um
 * diário paralelo, onde se registra o que aconteceu no hospital.
 *
 * A regra que atravessa o módulo inteiro: **o sistema nunca conclui nada sobre
 * o que não viu.** A dose que estava na grade não vira "não administrada" ao
 * abrir a internação — ela sai da tela e continua no banco, sem juízo. A
 * medicação que o hospital deu entra com o nome do hospital, e não com o de
 * ninguém da casa. Quem escreveu no sistema e quem administrou são pessoas
 * diferentes, e o registro diz as duas coisas.
 */
/**
 * O ANEXO DA NOTA DE INTERNAÇÃO — 10 MB, PDF, JPG ou PNG.
 *
 * Mais estreito que o dossiê porque o que chega aqui é o papel que o hospital
 * entrega na hora: receita, resultado de exame, alta. Foi escrito assim na
 * fase 96 e continua assim — a fase 114 mudou só ONDE a regra mora.
 */
const O_ANEXO_DA_INTERNACAO: RegraDoArquivo = {
  aceita: ['application/pdf', 'image/jpeg', 'image/png'],
  maximo: 10 * 1024 * 1024,
  conferirInteireza: true,
  recusas: {
    vazio: 'O anexo chegou vazio.',
    grande: 'O anexo passa de 10 MB. Digitalize em qualidade menor.',
    tipo: 'O anexo precisa ser PDF, JPG ou PNG.',
    incompleto: 'O anexo chegou incompleto, provavelmente porque o sinal caiu durante o envio. '
      + 'Envie de novo.',
  },
};

/** O que o papel anexado é (1622). A lista é a do pedido de 25/09. */
export const CATEGORIAS_DO_ANEXO = [
  { cod: 'receita', label: 'Receita' },
  { cod: 'atestado', label: 'Atestado' },
  { cod: 'relatorio_medico', label: 'Relatório médico' },
  { cod: 'exame', label: 'Exame' },
  { cod: 'encaminhamento', label: 'Encaminhamento' },
  { cod: 'foto_de_documento', label: 'Foto de documento' },
  { cod: 'outro', label: 'Outro documento' },
];

@Injectable()
export class InternacaoService {

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ArquivosService) private readonly arquivos: ArquivosService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  private readonly TIPOS_DE_NOTA = [
    { cod: 'relato', label: 'Relato do dia' },
    { cod: 'retorno_medico', label: 'Retorno médico' },
    { cod: 'exame', label: 'Exame' },
    { cod: 'atendimento', label: 'Atendimento' },
    { cod: 'medicacao', label: 'Medicação' },
    { cod: 'solicitacao_do_hospital', label: 'Solicitação do hospital' },
    { cod: 'alta_prevista', label: 'Alta prevista' },
  ];

  private readonly DESFECHOS = [
    { cod: 'alta', label: 'Alta — volta para a casa' },
    { cod: 'transferencia_hospitalar', label: 'Transferência para outro hospital' },
    { cod: 'obito', label: 'Óbito' },
  ];

  vocabulario() {
    return {
      tiposDeNota: this.TIPOS_DE_NOTA,
      desfechos: this.DESFECHOS,
      categoriasDoAnexo: CATEGORIAS_DO_ANEXO,
      nota: 'O relato diário não é obrigatório e não vira pendência de ninguém. '
        + 'Ele existe porque a equipe visita todo dia, e o que foi visto lá se perde '
        + 'se não for escrito no mesmo dia.',
    };
  }

  private soTecnicaOuCoordenacao(user: AuthenticatedUser) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException(
        'Abrir e encerrar internação é da equipe técnica e da coordenação.');
    }
  }

  // --------------------------------------------------------------- Abrir

  async abrir(user: AuthenticatedUser, input: {
    personId?: string; houseId?: string; hospital?: string; motivo?: string; desde?: string;
  }) {
    this.soTecnicaOuCoordenacao(user);
    if (!(input.hospital ?? '').trim()) {
      throw new BadRequestException('Escreva em que hospital a criança está.');
    }
    /*
     * O motivo é obrigatório e curto demais é recusado. "Internação" não
     * responde nada a quem abrir este registro daqui a um ano — e é a
     * primeira coisa que a audiência pergunta quando a criança passou três
     * semanas fora da casa.
     */
    if ((input.motivo ?? '').trim().length < 10) {
      throw new BadRequestException(
        'Escreva por que a criança foi internada. Quem ler daqui a um ano precisa '
        + 'saber o que aconteceu — "internação" não explica nada.');
    }

    const aberta = await this.db.asUser(user.id, async (c) => {
      try {
        const { rows: [r] } = await c.query(
          `INSERT INTO hospitalization (person_id, house_id, hospital, reason,
                                        started_at, opened_by)
           VALUES ($1,$2,$3,$4, coalesce($5::timestamptz, now()), $6) RETURNING id`,
          [input.personId, input.houseId, input.hospital!.trim(), input.motivo!.trim(),
           input.desde ?? null, user.id]);
        await this.audit.log({
          action: 'internacao.aberta', actorId: user.id, institutionId: user.institutionId,
          houseId: input.houseId, entity: 'hospitalization', entityId: r.id,
          // Metadado: o hospital, nunca o motivo — que é conteúdo de saúde.
          detail: { hospital: input.hospital!.trim() },
        });
        return {
          id: r.id,
          aviso: 'Internação aberta. A criança sai da chamada e da grade de medicação da '
            + 'casa enquanto estiver internada, e continua ocupando a vaga. As doses que '
            + 'estavam previstas não foram apagadas nem marcadas como não administradas — '
            + 'o sistema não conclui o que não viu.',
        };
      } catch (e: any) {
        const m = String(e?.message ?? '');
        if (m.includes('uq_internacao_aberta')) {
          throw new BadRequestException(
            'Esta criança já tem uma internação aberta. Encerre a anterior antes.');
        }
        if (m.includes('row-level security')) {
          throw new ForbiddenException(
            'Abrir internação é da equipe técnica e da coordenação, na casa da criança.');
        }
        throw e;
      }
    });
    /* A Coordenação Geral recebe os graves das oito casas (decisão de 28/09, 1635),
       e internação é um deles. O aviso não diz o motivo nem o hospital: quem
       precisa saber, abre. */
    await this.bus.publish('escalation.requested', {
      level: 'coordenacao_geral', entity: 'hospitalization', entityId: aberta.id,
      reason: 'internacao_aberta',
      title: 'Internação aberta',
      body: 'Uma criança foi internada. Abra na Rede Acolher para ver a casa e o acompanhamento.',
      priority: 'alta', groupKey: `internacao:${aberta.id}:coordenacao_geral`,
    }, { actorId: user.id, houseId: input.houseId });
    return aberta;
  }

  // ------------------------------------------------------------- Encerrar

  async encerrar(user: AuthenticatedUser, id: string, input: {
    desfecho?: string; observacao?: string; ate?: string;
  }) {
    this.soTecnicaOuCoordenacao(user);
    if (!this.DESFECHOS.some((d) => d.cod === input.desfecho)) {
      throw new BadRequestException('Informe como a internação terminou.');
    }
    return this.db.asUser(user.id, async (c) => {
      const { rowCount, rows } = await c.query(
        `UPDATE hospitalization
            SET status = 'encerrada', ended_at = coalesce($3::timestamptz, now()),
                outcome = $2, outcome_note = $4, closed_by = $5, closed_at = now()
          WHERE id = $1 AND status = 'em_andamento'
        RETURNING house_id`,
        [id, input.desfecho, input.ate ?? null, (input.observacao ?? '').trim() || null, user.id]);
      if (!rowCount) {
        throw new NotFoundException('Internação não encontrada — ou já encerrada.');
      }
      await this.audit.log({
        action: 'internacao.encerrada', actorId: user.id, institutionId: user.institutionId,
        houseId: (rows[0].house_id as string | null) ?? null,
        entity: 'hospitalization', entityId: id, detail: { desfecho: input.desfecho },
      });
      return {
        ok: true,
        aviso: input.desfecho === 'alta'
          ? 'Internação encerrada. A criança volta à chamada, à grade e à rotina da casa a '
            + 'partir de hoje. Confira com a Enfermagem se a medicação mudou no hospital.'
          : 'Internação encerrada.',
      };
    });
  }

  // --------------------------------------------------------------- Listar

  /** As internações de uma casa — abertas primeiro. */
  /**
   * AS INTERNAÇÕES DELA, NA VIDA DELA (fase 118).
   *
   * A internação é lida pela CASA — quem está no hospital agora —, e a tela de
   * internação abre por ali. O perfil da criança não dizia que ela esteve
   * quinze dias internada em agosto: para saber, alguém tinha de ir à tela de
   * internação e pedir também as encerradas.
   *
   * O alcance é o da `hosp_select`: quem alcança a criança. A Enfermagem vê
   * nas oito casas, e isso é decisão de 03/09 registrada no §10, item 11 —
   * internação é primeiro um fato de saúde.
   */
  async doAcolhido(user: AuthenticatedUser, personId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT h.id, h.hospital, h.reason, h.started_at, h.ended_at, h.status, h.outcome,
                app_user_display_name(h.opened_by)  AS abriu,
                app_user_display_name(h.closed_by)  AS encerrou
           FROM hospitalization h
          WHERE h.person_id = $1
          ORDER BY h.started_at DESC LIMIT 50`, [personId]);
      return rows.map((r) => ({
        id: r.id, hospital: r.hospital, motivo: r.reason,
        desde: r.started_at, ate: r.ended_at, status: r.status, desfecho: r.outcome,
        abriu: r.abriu, encerrou: r.encerrou,
      }));
    });
  }

  async daCasa(user: AuthenticatedUser, houseId: string, incluirEncerradas = false) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT h.id, h.person_id, app_person_display_name(h.person_id) AS acolhido,
                h.hospital, h.reason, h.started_at, h.ended_at, h.status, h.outcome,
                app_user_display_name(h.opened_by) AS abertaPor,
                (SELECT count(*)::int FROM hospitalization_note n
                  WHERE n.hospitalization_id = h.id) AS notas,
                (SELECT count(DISTINCT n.on_date)::int FROM hospitalization_note n
                  WHERE n.hospitalization_id = h.id) AS diasComRelato,
                (SELECT app_user_display_name(a.user_id) FROM hospitalization_companion a
                  WHERE a.hospitalization_id = h.id AND a.to_date IS NULL
                  ORDER BY a.from_date DESC LIMIT 1) AS acompanhante
           FROM hospitalization h
          WHERE h.house_id = $1 AND ($2 OR h.status = 'em_andamento')
          ORDER BY h.status, h.started_at DESC`, [houseId, incluirEncerradas]);
      return rows.map((r) => ({
        id: r.id, acolhidoId: r.person_id, acolhido: r.acolhido,
        hospital: r.hospital, motivo: r.reason,
        desde: r.started_at, ate: r.ended_at,
        status: r.status, desfecho: r.outcome,
        abertaPor: r.abertapor, acompanhante: r.acompanhante,
        /* Dias COM relato, e não "dias sem" — a contagem é informação, não
         * cobrança. O relato diário não é obrigatório (decisão da
         * coordenação, 03/09/2026). */
        diasComRelato: r.diascomrelato, registros: r.notas,
        diasInternada: Math.max(1, Math.ceil(
          ((r.ended_at ? new Date(r.ended_at) : new Date()).getTime()
            - new Date(r.started_at).getTime()) / 86_400_000)),
      }));
    });
  }

  /** O período inteiro: o diário, a medicação do hospital e quem acompanhou. */
  async abrirPeriodo(user: AuthenticatedUser, id: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [h] } = await c.query(
        `SELECT h.*, app_person_display_name(h.person_id) AS acolhido,
                app_user_display_name(h.opened_by) AS abertaPor,
                app_user_display_name(h.closed_by) AS encerradaPor
           FROM hospitalization h WHERE h.id = $1`, [id]);
      if (!h) throw new NotFoundException('Internação não encontrada — ou fora do seu alcance.');

      const { rows: notas } = await c.query(
        `SELECT n.id, n.on_date::text AS on_date, n.kind, n.body, n.file_name, n.storage_key IS NOT NULL AS temAnexo,
                n.doc_category, n.mime,
                app_user_display_name(n.written_by) AS por,
                app_user_cargo_em(n.written_by, n.written_at) AS cargo, n.written_at
           FROM hospitalization_note n WHERE n.hospitalization_id = $1
          ORDER BY n.on_date DESC, n.written_at DESC`, [id]);

      const { rows: meds } = await c.query(
        `SELECT m.id, m.given_at, m.medication, m.dose, m.route, m.note,
                app_user_display_name(m.recorded_by) AS registradoPor
           FROM hospitalization_medication m WHERE m.hospitalization_id = $1
          ORDER BY m.given_at DESC`, [id]);

      const { rows: acomp } = await c.query(
        `SELECT a.id, app_user_display_name(a.user_id) AS quem, a.from_date::text AS from_date,
                a.to_date::text AS to_date, a.note,
                app_user_cargo_em(a.user_id, (a.from_date + time '12:00') AT TIME ZONE 'America/Sao_Paulo') AS cargo,
                app_user_display_name(a.assigned_by) AS designadoPor
           FROM hospitalization_companion a WHERE a.hospitalization_id = $1
          ORDER BY a.from_date DESC`, [id]);

      return {
        id: h.id, acolhidoId: h.person_id, acolhido: h.acolhido,
        hospital: h.hospital, motivo: h.reason,
        desde: h.started_at, ate: h.ended_at, status: h.status,
        desfecho: h.outcome, observacaoDoDesfecho: h.outcome_note,
        abertaPor: h.abertapor, encerradaPor: h.encerradapor,
        diario: notas.map((n) => ({
          id: n.id, dia: n.on_date, tipo: n.kind,
          tipoRotulo: this.TIPOS_DE_NOTA.find((t) => t.cod === n.kind)?.label ?? n.kind,
          texto: n.body, temAnexo: n.temanexo, nomeDoArquivo: n.file_name,
          categoria: n.doc_category ?? null,
          categoriaRotulo: CATEGORIAS_DO_ANEXO.find((c) => c.cod === n.doc_category)?.label ?? null,
          tipoDoArquivo: n.mime ?? null,
          por: n.por, cargo: n.cargo, em: n.written_at,
        })),
        /* A medicação do hospital sai SEMPRE com a origem escrita. Sem essa
         * frase, a linha se leria como dose da casa — e a casa apareceria
         * administrando o que não administrou. */
        medicacaoNoHospital: meds.map((m) => ({
          id: m.id, quando: m.given_at, medicamento: m.medication, dose: m.dose,
          via: m.route, observacao: m.note,
          origem: 'Administrada pelo hospital', registradoPor: m.registradopor,
        })),
        acompanhantes: acomp.map((a) => ({
          id: a.id, quem: a.quem, cargo: a.cargo, de: a.from_date, ate: a.to_date,
          observacao: a.note, designadoPor: a.designadopor,
        })),
      };
    });
  }

  // -------------------------------------------------------------- Escrever

  async registrar(user: AuthenticatedUser, id: string, input: {
    dia?: string; tipo?: string; texto?: string; conteudo?: string; nomeArquivo?: string;
    categoria?: string;
  }) {
    if (!(input.texto ?? '').trim()) {
      throw new BadRequestException(
        'Escreva o que aconteceu. O anexo sozinho, daqui a um ano, não diz o que foi feito.');
    }
    if (input.tipo && !this.TIPOS_DE_NOTA.some((t) => t.cod === input.tipo)) {
      throw new BadRequestException('Tipo de registro desconhecido.');
    }

    const temAnexo = !!String(input.conteudo ?? '').trim();
    if (temAnexo && !CATEGORIAS_DO_ANEXO.some((c) => c.cod === input.categoria)) {
      throw new BadRequestException(
        'Diga que documento é o anexo: receita, atestado, relatório médico, exame, '
        + 'encaminhamento, foto de documento ou outro.');
    }
    if (!temAnexo && input.categoria) {
      throw new BadRequestException('A categoria é do anexo, e este registro não tem anexo.');
    }

    /* O MESMO ARQUIVO DUAS VEZES (1622): conferido ANTES de gravar, para não
       deixar no disco um objeto que nenhum registro aponta. */
    const soma = this.arquivos.somaDe(input.conteudo);
    if (soma) {
      const repetido = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT on_date::text AS dia, app_user_display_name(written_by) AS quem
             FROM hospitalization_note WHERE hospitalization_id = $1 AND sha256 = $2`, [id, soma]);
        return r;
      });
      if (repetido) {
        const [a, m, d] = String(repetido.dia).split('-');
        throw new ConflictException(
          `Este mesmo arquivo já foi anexado a esta internação, no registro de ${d}/${m}/${a}`
          + (repetido.quem ? `, por ${repetido.quem}` : '') + '. Não é preciso enviar de novo.');
      }
    }

    const guardado = await this.arquivos.guardar(input.conteudo, O_ANEXO_DA_INTERNACAO);
    const chave = guardado?.chave ?? null;
    const tipoArq = guardado?.mime ?? null;

    return this.db.asUser(user.id, async (c) => {
      try {
        const { rows: [r] } = await c.query(
          `INSERT INTO hospitalization_note (hospitalization_id, on_date, kind, body,
                                             storage_key, mime, file_name, written_by,
                                             doc_category, sha256, size_bytes)
           VALUES ($1, coalesce($2::date, app_hoje()), coalesce($3,'relato'), $4,
                   $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [id, input.dia ?? null, input.tipo ?? null, input.texto!.trim(),
           chave, tipoArq, input.nomeArquivo ?? null, user.id,
           chave ? input.categoria : null, guardado?.sha256 ?? null, guardado?.tamanho ?? null]);

        /*
         * E O ANEXO CAI NO PERFIL DA CRIANÇA (fase 125).
         *
         * *"Todos os outros lugares onde a gente preenche […] têm que ir
         * individual para cada um no seu registro."* O laudo que o hospital
         * entregou é documento DELA, e ficava só no diário da internação —
         * que some da tela da casa quando a internação encerra.
         *
         * Espelho, e não cópia: o mesmo objeto guardado, a mesma soma de
         * verificação. E na MESMA transação do registro: se o espelho falhar,
         * o diário também volta, e a equipe reescreve uma vez em vez de
         * descobrir meses depois que metade dos laudos chegou ao dossiê.
         */
        if (chave) {
          const { rows: [h] } = await c.query(
            `SELECT person_id FROM hospitalization WHERE id = $1`, [id]);
          if (h?.person_id) {
            await c.query(
              `SELECT * FROM app_espelhar_no_dossie($1,'saude',NULL,$2,$3,$4,$5,$6,$7,$8,NULL)`,
              [h.person_id,
               (input.nomeArquivo ?? '').trim() || 'Anexo do diário de internação',
               'Anexo do diário de internação',
               `hospitalization_note:${r.id}`,
               chave, guardado?.sha256 ?? null, tipoArq, input.nomeArquivo ?? null]);
          }
        }
        return { id: r.id, ok: true };
      } catch (e: any) {
        if (String(e?.message ?? '').includes('row-level security')) {
          throw new ForbiddenException(
            'Este registro é de quem acompanha a internação, da equipe técnica, '
            + 'do líder, da Enfermagem e da coordenação.');
        }
        throw e;
      }
    });
  }

  /**
   * O ANEXO DO DIÁRIO — o laudo, o exame, a solicitação do hospital.
   *
   * Ele era guardado e nunca mais lido: a rota de leitura não existia. Um
   * arquivo que entra e não sai é pior do que arquivo nenhum — a equipe
   * acredita que digitalizou o exame, e no dia em que ele for pedido não há
   * nada, nem o papel, que foi devolvido ao hospital.
   *
   * O alcance é o da própria internação: quem lê o diário lê o anexo dele.
   * Nada de rota separada com regra própria, que é como as duas se
   * desencontram com o tempo.
   */
  async lerAnexo(user: AuthenticatedUser, internacaoId: string, notaId: string) {
    const nota = await this.db.asUser(user.id, async (c) => {
      /* rls-join-ok: `hospitalization_note` já é filtrada pela internação; a
         casa vem da internação porque a nota não a guarda (fase 149). */
      const { rows: [r] } = await c.query(
        `SELECT n.storage_key, n.mime, n.file_name, i.house_id
           FROM hospitalization_note n
           JOIN hospitalization i ON i.id = n.hospitalization_id
          WHERE n.id = $1 AND n.hospitalization_id = $2`, [notaId, internacaoId]);
      return r;
    });
    if (!nota) {
      throw new NotFoundException('Registro não encontrado — ou fora do seu alcance.');
    }
    if (!nota.storage_key) throw new NotFoundException('Este registro não tem anexo.');
    const bytes = await this.arquivos.ler(nota.storage_key);
    if (!bytes) {
      /* O banco diz que existe e o disco não tem: é falha de armazenamento, e
       * precisa soar diferente de "não tem anexo". */
      throw new NotFoundException(
        'O anexo está registrado mas não foi encontrado no armazenamento. '
        + 'Avise quem cuida do servidor: é falha de disco ou de restauração.');
    }
    await this.audit.log({
      action: 'internacao.anexo.lido', actorId: user.id, institutionId: user.institutionId,
      houseId: (nota.house_id as string | null) ?? null,
      entity: 'hospitalization_note', entityId: notaId,
      detail: { tipo: nota.mime },
    });
    return {
      nome: nota.file_name ?? 'documento', tipo: nota.mime,
      conteudo: bytes.toString('base64'),
    };
  }

  async registrarMedicacao(user: AuthenticatedUser, id: string, input: {
    quando?: string; medicamento?: string; dose?: string; via?: string; observacao?: string;
  }) {
    if (!(input.medicamento ?? '').trim()) {
      throw new BadRequestException('Escreva qual medicamento o hospital administrou.');
    }
    return this.db.asUser(user.id, async (c) => {
      try {
        const { rows: [r] } = await c.query(
          `INSERT INTO hospitalization_medication (hospitalization_id, given_at, medication,
                                                   dose, route, note, recorded_by)
           VALUES ($1, coalesce($2::timestamptz, now()), $3, $4, $5, $6, $7) RETURNING id`,
          [id, input.quando ?? null, input.medicamento!.trim(),
           (input.dose ?? '').trim() || null, (input.via ?? '').trim() || null,
           (input.observacao ?? '').trim() || null, user.id]);
        return {
          id: r.id, ok: true,
          aviso: 'Registrado como administrado PELO HOSPITAL. Ele entra no histórico de '
            + 'saúde da criança com essa origem, e não na grade da casa.',
        };
      } catch (e: any) {
        if (String(e?.message ?? '').includes('row-level security')) {
          throw new ForbiddenException('Sem alcance para escrever nesta internação.');
        }
        throw e;
      }
    });
  }

  /** Designa o educador que vai acompanhar — e encerra o período do anterior. */
  async designar(user: AuthenticatedUser, id: string, input: {
    userId?: string; de?: string; observacao?: string;
  }) {
    this.soTecnicaOuCoordenacao(user);
    if (!input.userId) throw new BadRequestException('Informe quem vai acompanhar.');
    return this.db.asUser(user.id, async (c) => {
      /* A internação é lida ANTES, sob o alcance de quem pede (fase 156): o
         `UPDATE` abaixo filtrava calado, e a política só conferia o cargo — a
         coordenação de outra casa trocava quem acompanha a criança internada. */
      const { rows: [h] } = await c.query(`SELECT id FROM hospitalization WHERE id = $1`, [id]);
      if (!h) throw new NotFoundException('Internação não encontrada — ou fora do seu alcance.');
      /*
       * Fecha o período de quem estava antes. Sem isto, a lista responderia
       * que três pessoas acompanham ao mesmo tempo — e a pergunta "quem
       * estava com ela no dia 12?" voltaria a não ter resposta.
       */
      await c.query(
        `UPDATE hospitalization_companion SET to_date = app_hoje()
          WHERE hospitalization_id = $1 AND to_date IS NULL`, [id]);
      const { rows: [r] } = await c.query(
        `INSERT INTO hospitalization_companion (hospitalization_id, user_id, from_date,
                                                note, assigned_by)
         VALUES ($1, $2, coalesce($3::date, app_hoje()), $4, $5) RETURNING id`,
        [id, input.userId, input.de ?? null, (input.observacao ?? '').trim() || null, user.id]);
      return { id: r.id, ok: true };
    });
  }

  // ------------------------------------------------------------------
  // O relatório completo, em Word (fase 165)
  // ------------------------------------------------------------------

  /** Quem baixa o relatório: a lista do pedido de 25/09, a gestão e, desde a
   *  decisão de 27/09 (§10, item 12), a Enfermagem. A lista mora também no
   *  protótipo (`QUEM_BAIXA_INT`) e na tela (`Internacao.tsx`). */
  private readonly QUEM_BAIXA = ['equipe_tecnica', 'coordenador', 'lider_diurno',
    'lider_noturno_geral', 'gestor_geral', 'enfermagem'];

  private podeBaixar(user: AuthenticatedUser) {
    if (!this.QUEM_BAIXA.includes(user.role)) {
      throw new ForbiddenException(
        'O relatório da internação é baixado pela equipe técnica, pela coordenação, pelos '
        + 'líderes e pela Enfermagem. Quem acompanha a internação consulta o diário na tela.');
    }
  }

  /**
   * A folha do relatório. `desenhar` decide se os anexos entram como imagem:
   * ver na tela não desenha PDF nenhum (é pesado e a tela não precisa); o
   * arquivo em Word desenha tudo.
   */
  async folha(user: AuthenticatedUser, id: string, desenhar = false) {
    this.podeBaixar(user);
    const p = await this.abrirPeriodo(user, id);
    const casa = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT h.house_id, app_house_label(h.house_id) || ' · ' || app_house_name(h.house_id) AS unidade
           FROM hospitalization h WHERE h.id = $1`, [id]);
      return r;
    });

    /* Os anexos em ordem de registro: é a ordem em que o diário os cita. */
    const comAnexo = [...p.diario].filter((n) => n.temAnexo)
      .sort((a, b) => new Date(a.em).getTime() - new Date(b.em).getTime());
    const numero = new Map(comAnexo.map((n, i) => [n.id, i + 1]));

    const anexos: AnexoDaInternacao[] = [];
    for (const n of comAnexo) {
      const base = {
        numero: numero.get(n.id)!, categoria: n.categoriaRotulo ?? 'Documento',
        nomeDoArquivo: n.nomeDoArquivo, registradoEm: n.em, registradoPor: n.por,
      };
      if (!desenhar) { anexos.push({ ...base, paginas: [] }); continue; }
      const bytes = await this.lerChave(user, id, n.id);
      if (!bytes) { anexos.push({ ...base, paginas: [], naoReproduzido: true }); continue; }
      if (n.tipoDoArquivo === 'application/pdf') {
        const r = await paginasDoPdf(bytes);
        anexos.push({
          ...base, totalDePaginas: r.total, naoReproduzido: r.falhou || !r.paginas.length,
          paginas: r.paginas.map((pg) => ({ tipo: 'image/png', dados: new Uint8Array(pg) })),
        });
      } else {
        anexos.push({ ...base, paginas: [{ tipo: n.tipoDoArquivo ?? '', dados: new Uint8Array(bytes) }] });
      }
    }

    const folha = folhaDaInternacao({
      acolhido: p.acolhido, unidade: casa?.unidade ?? '', hospital: p.hospital,
      motivo: p.motivo, desde: p.desde, ate: p.ate, status: p.status,
      desfecho: p.desfecho, observacaoDoDesfecho: p.observacaoDoDesfecho,
      abertaPor: p.abertaPor, encerradaPor: p.encerradaPor,
      acompanhantes: [...p.acompanhantes].reverse().map((a: any) => ({
        quem: a.quem, cargo: a.cargo, de: a.de, ate: a.ate, designadoPor: a.designadoPor,
      })),
      diario: p.diario.map((n: any) => ({
        dia: String(n.dia).slice(0, 10),
        em: new Date(n.em).toISOString(), tipoRotulo: n.tipoRotulo, texto: n.texto,
        por: n.por, cargo: n.cargo, anexo: numero.get(n.id) ?? null, categoria: n.categoriaRotulo,
      })),
      medicacao: p.medicacaoNoHospital.map((m: any) => ({
        quando: new Date(m.quando).toISOString(), medicamento: m.medicamento,
        dose: m.dose, via: m.via, observacao: m.observacao,
      })),
    }, anexos, { nome: user.fullName, cargo: cargoNoDocumento(user.role) });
    return { folha, houseId: casa?.house_id as string | undefined };
  }

  async exportar(user: AuthenticatedUser, id: string, finalidade?: string) {
    const { folha, houseId } = await this.folha(user, id, true);
    return this.documentos.exportar(user, folha, {
      entidade: 'hospitalization', entidadeId: id, houseId: houseId ?? null,
      finalidade: finalidade ?? '',
    });
  }

  /** Os bytes de um anexo, sob o alcance de quem pede (a mesma leitura do diário). */
  private async lerChave(user: AuthenticatedUser, internacaoId: string, notaId: string) {
    const chave = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT storage_key FROM hospitalization_note WHERE id = $1 AND hospitalization_id = $2`,
        [notaId, internacaoId]);
      return r?.storage_key as string | undefined;
    });
    return chave ? this.arquivos.ler(chave) : null;
  }
}
