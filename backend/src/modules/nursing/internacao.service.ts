import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';

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
@Injectable()
export class InternacaoService {
  private readonly dir = process.env.ARQUIVOS_DIR ?? join(process.cwd(), '.arquivos');

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
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

    return this.db.asUser(user.id, async (c) => {
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
      const { rowCount } = await c.query(
        `UPDATE hospitalization
            SET status = 'encerrada', ended_at = coalesce($3::timestamptz, now()),
                outcome = $2, outcome_note = $4, closed_by = $5, closed_at = now()
          WHERE id = $1 AND status = 'em_andamento'`,
        [id, input.desfecho, input.ate ?? null, (input.observacao ?? '').trim() || null, user.id]);
      if (!rowCount) {
        throw new NotFoundException('Internação não encontrada — ou já encerrada.');
      }
      await this.audit.log({
        action: 'internacao.encerrada', actorId: user.id, institutionId: user.institutionId,
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
        `SELECT n.id, n.on_date, n.kind, n.body, n.file_name, n.storage_key IS NOT NULL AS temAnexo,
                app_user_display_name(n.written_by) AS por, n.written_at
           FROM hospitalization_note n WHERE n.hospitalization_id = $1
          ORDER BY n.on_date DESC, n.written_at DESC`, [id]);

      const { rows: meds } = await c.query(
        `SELECT m.id, m.given_at, m.medication, m.dose, m.route, m.note,
                app_user_display_name(m.recorded_by) AS registradoPor
           FROM hospitalization_medication m WHERE m.hospitalization_id = $1
          ORDER BY m.given_at DESC`, [id]);

      const { rows: acomp } = await c.query(
        `SELECT a.id, app_user_display_name(a.user_id) AS quem, a.from_date, a.to_date, a.note,
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
          por: n.por, em: n.written_at,
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
          id: a.id, quem: a.quem, de: a.from_date, ate: a.to_date,
          observacao: a.note, designadoPor: a.designadopor,
        })),
      };
    });
  }

  // -------------------------------------------------------------- Escrever

  async registrar(user: AuthenticatedUser, id: string, input: {
    dia?: string; tipo?: string; texto?: string; conteudo?: string; nomeArquivo?: string;
  }) {
    if (!(input.texto ?? '').trim()) {
      throw new BadRequestException(
        'Escreva o que aconteceu. O anexo sozinho, daqui a um ano, não diz o que foi feito.');
    }
    if (input.tipo && !this.TIPOS_DE_NOTA.some((t) => t.cod === input.tipo)) {
      throw new BadRequestException('Tipo de registro desconhecido.');
    }

    let chave: string | null = null;
    let tipoArq: string | null = null;
    if (input.conteudo) {
      const limpo = String(input.conteudo).replace(/^data:[^;]+;base64,/, '');
      const bytes = Buffer.from(limpo, 'base64');
      if (!bytes.length) throw new BadRequestException('O anexo chegou vazio.');
      if (bytes.length > 10 * 1024 * 1024) {
        throw new BadRequestException('O anexo passa de 10 MB. Digitalize em qualidade menor.');
      }
      const hex = bytes.subarray(0, 8).toString('hex');
      tipoArq = hex.startsWith('25504446') ? 'application/pdf'
        : hex.startsWith('ffd8ff') ? 'image/jpeg'
        : hex.startsWith('89504e47') ? 'image/png' : null;
      if (!tipoArq) {
        throw new BadRequestException('O anexo precisa ser PDF, JPG ou PNG.');
      }
      chave = randomUUID();
      await mkdir(this.dir, { recursive: true });
      await writeFile(join(this.dir, chave), bytes);
    }

    return this.db.asUser(user.id, async (c) => {
      try {
        const { rows: [r] } = await c.query(
          `INSERT INTO hospitalization_note (hospitalization_id, on_date, kind, body,
                                             storage_key, mime, file_name, written_by)
           VALUES ($1, coalesce($2::date, app_hoje()), coalesce($3,'relato'), $4,
                   $5, $6, $7, $8) RETURNING id`,
          [id, input.dia ?? null, input.tipo ?? null, input.texto!.trim(),
           chave, tipoArq, input.nomeArquivo ?? null, user.id]);
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
}
