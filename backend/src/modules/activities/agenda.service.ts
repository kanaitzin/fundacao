import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { hojeNaInstituicao } from '../../kernel/common/tempo';

/**
 * AGENDA DA LINHA DO TEMPO (§7, §8).
 *
 * Quem marca: Líder Diurno, equipe técnica, coordenação e Enfermagem. O
 * educador executa e confirma o que está marcado; marcar compromisso futuro é
 * de quem responde pelo planejamento da casa.
 *
 * O que se marca:
 *  * para UM acolhido ou para a CASA INTEIRA (coletivo);
 *  * com data e hora exatas, semanas ou meses à frente;
 *  * uma vez, todo dia, em dias da semana escolhidos, quinzenal ou mensal;
 *  * com prazo final OU por tempo indeterminado, quando o tratamento não tem
 *    data para acabar — e aí o motivo é escrito.
 *
 * O compromisso é a REGRA; a linha do tempo do dia é a ocorrência. Marcar a
 * fono de toda terça não cria cinquenta linhas hoje: cria uma regra, e cada
 * terça vira uma linha quando a terça chega. Isso mantém a agenda futura
 * limpa e o passado intocado — mudar o horário da fono não reescreve as
 * terças que já aconteceram.
 */

export const TIPOS_COMPROMISSO = [
  { cod: 'atividade', label: 'Atividade' },
  { cod: 'saude', label: 'Saúde — consulta, exame, terapia' },
  { cod: 'tratamento', label: 'Tratamento continuado' },
  { cod: 'escola', label: 'Escola' },
  { cod: 'curso', label: 'Curso ou profissionalização' },
  { cod: 'visita', label: 'Visita ou convivência familiar' },
  { cod: 'documentacao', label: 'Documentação' },
  { cod: 'lazer', label: 'Lazer' },
  { cod: 'outro', label: 'Outro' },
] as const;

export const RECORRENCIAS = [
  { cod: 'unica', label: 'Uma vez' },
  { cod: 'diaria', label: 'Todos os dias' },
  { cod: 'semanal', label: 'Toda semana, nos dias escolhidos' },
  { cod: 'quinzenal', label: 'A cada 15 dias' },
  { cod: 'mensal', label: 'Todo mês, no mesmo dia' },
] as const;

export const DIAS_SEMANA = [
  { n: 0, label: 'Dom' }, { n: 1, label: 'Seg' }, { n: 2, label: 'Ter' },
  { n: 3, label: 'Qua' }, { n: 4, label: 'Qui' }, { n: 5, label: 'Sex' },
  { n: 6, label: 'Sáb' },
];

const QUEM_MARCA = ['lider_diurno', 'equipe_tecnica', 'coordenador', 'gestor_geral', 'enfermagem'];

export interface NovoCompromisso {
  houseId: string;
  personId?: string | null;      // ausente = coletivo
  tipo: string;
  titulo: string;
  local?: string;
  orientacoes?: string;
  inicio: string;                // YYYY-MM-DD
  hora: string;                  // HH:MM
  duracaoMin?: number;
  recorrencia: string;
  diasSemana?: number[];
  fim?: string | null;           // null = indeterminado
  motivoSemPrazo?: string;
  exigeCiencia?: boolean;
  /** 'plantao' = quem estiver de serviço no horário; 'pessoa' = alguém com nome. */
  responsavel?: 'plantao' | 'pessoa';
  responsavelId?: string;
  observacaoResponsavel?: string;
}

@Injectable()
export class AgendaService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  opcoes() {
    return {
      tipos: TIPOS_COMPROMISSO, recorrencias: RECORRENCIAS, diasSemana: DIAS_SEMANA,
      responsaveis: [
        { cod: 'plantao', label: 'Quem estiver no plantão do horário',
          ajuda: 'Para a rotina e o que qualquer educador de serviço faz.' },
        { cod: 'pessoa', label: 'Um educador com nome',
          ajuda: 'Para o que precisa de preparo — consulta, saída, audiência.' },
      ],
    };
  }

  /**
   * Quem pode ser nomeado, com o sinal de quem está na escala daquele
   * horário. O sinal ordena a lista e alimenta o aviso da tela; não impede
   * nomear quem está de folga — escala muda, e troca de plantão existe.
   */
  async equipeDisponivel(user: AuthenticatedUser, houseId: string, data: string, hora: string) {
    const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM app_staff_for_commitment($1,$2::smallint,$3::time)`,
        [houseId, diaSemana, hora]);
      return rows;
    });
    return rows.map((r) => ({
      id: r.user_id, nome: r.nome, cargo: r.cargo, naEscala: r.na_escala,
    }));
  }

  async marcar(user: AuthenticatedUser, input: NovoCompromisso) {
    if (!QUEM_MARCA.includes(user.role)) {
      throw new ForbiddenException(
        'Marcar compromisso é do Líder Diurno, da equipe técnica, da coordenação e da Enfermagem.');
    }
    if (!input?.titulo?.trim()) throw new BadRequestException('Dê um nome ao compromisso.');
    if (!TIPOS_COMPROMISSO.some((t) => t.cod === input.tipo)) {
      throw new BadRequestException('Tipo de compromisso desconhecido.');
    }
    if (!RECORRENCIAS.some((r) => r.cod === input.recorrencia)) {
      throw new BadRequestException('Repetição desconhecida.');
    }
    if (!input.inicio || !input.hora) {
      throw new BadRequestException('Informe a data e o horário.');
    }
    const dias = input.diasSemana ?? [];
    if (['semanal', 'quinzenal'].includes(input.recorrencia) && dias.length === 0) {
      throw new BadRequestException('Escolha em quais dias da semana o compromisso acontece.');
    }
    if (dias.some((d) => d < 0 || d > 6)) throw new BadRequestException('Dia da semana inválido.');

    // Uma vez começa e termina no mesmo dia — a tela não precisa perguntar.
    const fim = input.recorrencia === 'unica' ? input.inicio : (input.fim ?? null);

    // Sem prazo é permitido e pede a frase. É o que separa "indeterminado
    // porque o laudo é contínuo" de "indeterminado porque ninguém sabia".
    if (!fim && (input.motivoSemPrazo ?? '').trim().length < 10) {
      throw new BadRequestException(
        'Sem data para terminar, descreva o motivo (mínimo 10 caracteres) — ex.: tratamento contínuo conforme laudo. '
        + 'Fica visível para quem for revisar a agenda depois.');
    }

    // Responsável: por plantão (o padrão) ou com nome.
    const modo = input.responsavel === 'pessoa' ? 'pessoa' : 'plantao';
    if (modo === 'pessoa' && !input.responsavelId) {
      throw new BadRequestException('Escolha o educador responsável, ou deixe para o plantão do horário.');
    }

    // Aviso, não bloqueio: nomear quem não está na escala daquele horário é
    // legítimo — a saída pode ter sido combinada justamente assim.
    let foraDaEscala: string | null = null;
    if (modo === 'pessoa') {
      const equipe = await this.equipeDisponivel(user, input.houseId, input.inicio, input.hora);
      const escolhido = equipe.find((e) => e.id === input.responsavelId);
      if (!escolhido) {
        throw new BadRequestException('Esta pessoa não está na equipe desta casa.');
      }
      if (!escolhido.naEscala) foraDaEscala = escolhido.nome;
    }

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `INSERT INTO commitment (house_id, person_id, kind, title, place, instructions,
                                 start_date, time_of_day, duration_min, recurrence, weekdays,
                                 end_date, open_ended_reason, requires_ack,
                                 responsible_mode, responsible_id, responsible_note,
                                 created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::smallint[],$12,$13,$14,$15,$16,$17,
                 app_current_user(), app_current_user())
         RETURNING id`,
        [input.houseId, input.personId ?? null, input.tipo, input.titulo.trim(),
         input.local ?? null, input.orientacoes ?? null, input.inicio, input.hora,
         input.duracaoMin ?? null, input.recorrencia, dias, fim,
         fim ? null : input.motivoSemPrazo!.trim(), input.exigeCiencia ?? true,
         modo, modo === 'pessoa' ? input.responsavelId : null,
         input.observacaoResponsavel ?? null]);
      return row;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('row-level security')) {
        throw new ForbiddenException('Sem permissão para marcar compromisso nesta unidade.');
      }
      if (m.includes('ck_commitment_indeterminado')) {
        throw new BadRequestException('Sem data para terminar, o motivo é obrigatório.');
      }
      if (m.includes('ck_commitment_semanal')) {
        throw new BadRequestException('Escolha os dias da semana.');
      }
      throw e;
    });

    // Se o compromisso já vale hoje, ele aparece na linha do tempo agora.
    const hoje = hojeNaInstituicao();
    if (input.inicio <= hoje) {
      await this.db.asUser(user.id, async (c) => {
        await c.query(`SELECT app_generate_commitments($1,$2)`, [input.houseId, hoje]);
      });
    }

    await this.audit.log({
      action: 'commitment.create', actorId: user.id, institutionId: user.institutionId,
      houseId: input.houseId, entity: 'commitment', entityId: r.id,
      detail: {
        tipo: input.tipo, recorrencia: input.recorrencia,
        coletivo: !input.personId, indeterminado: !fim, responsavel: modo,
      },
    });

    const avisos = [
      !fim
        ? 'Marcado por tempo indeterminado. Vai continuar aparecendo até alguém encerrar — e o motivo que você escreveu fica visível para quem revisar.'
        : 'Marcado. Aparece na linha do tempo no dia e no horário, inclusive semanas à frente.',
      modo === 'pessoa'
        ? 'O responsável recebe isto em "Minhas responsabilidades" no dia, e pode se organizar desde já.'
        : 'Sem nome: quem estiver no plantão daquele horário assume.',
      foraDaEscala
        ? `Atenção: ${foraDaEscala} não está na escala deste dia e horário. Se foi combinado assim, tudo bem — o registro fica com esse nome.`
        : null,
    ].filter(Boolean);

    return {
      id: r.id,
      coletivo: !input.personId,
      indeterminado: !fim,
      responsavel: modo,
      foraDaEscala,
      aviso: avisos.join(' '),
    };
  }

  /**
   * A agenda de um período — projeção, sem criar nada.
   *
   * É como se olha para outubro em agosto: os dias em que cada compromisso
   * cai, sem encher o banco de linhas que ninguém pediu.
   */
  async agenda(user: AuthenticatedUser, houseId: string, de: string, ate: string, personId?: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT a.*, app_person_display_name(a.person_id) AS pessoa
           FROM app_commitment_agenda($1,$2,$3) a
          WHERE ($4::uuid IS NULL OR a.person_id = $4)
          ORDER BY a.em, a.hora`, [houseId, de, ate, personId ?? null]);
      return rows;
    });
    return rows.map((r) => ({
      compromissoId: r.commitment_id, em: r.em, hora: String(r.hora).slice(0, 5),
      duracaoMin: r.duracao, tipo: r.tipo, titulo: r.titulo, local: r.local,
      personId: r.person_id, pessoa: r.coletivo ? 'Casa toda' : r.pessoa,
      coletivo: r.coletivo, recorrencia: r.recorrencia, indeterminado: r.indeterminado,
    }));
  }

  /** Compromissos vigentes da casa, para revisão. */
  async vigentes(user: AuthenticatedUser, houseId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT c.id, c.kind, c.title, c.place, c.start_date, c.end_date, c.time_of_day,
                c.duration_min, c.recurrence, c.weekdays, c.open_ended_reason,
                c.person_id, app_person_display_name(c.person_id) AS pessoa,
                c.responsible_mode, c.responsible_note,
                r.full_name AS responsavel, u.full_name AS autor, c.created_at
           FROM commitment c
           -- rls-join-ok: o nome do acolhido vem de app_person_display_name; app_user não tem RLS de linha.
           LEFT JOIN app_user u ON u.id = c.created_by
           LEFT JOIN app_user r ON r.id = c.responsible_id
          WHERE c.house_id = $1 AND c.active
          ORDER BY c.time_of_day, c.title`, [houseId]);
      return rows;
    });
    return rows.map((r) => ({
      id: r.id, tipo: r.kind, titulo: r.title, local: r.place,
      pessoa: r.person_id ? r.pessoa : 'Casa toda', coletivo: !r.person_id,
      inicio: r.start_date, fim: r.end_date, indeterminado: r.end_date === null,
      motivoSemPrazo: r.open_ended_reason,
      hora: String(r.time_of_day).slice(0, 5), duracaoMin: r.duration_min,
      recorrencia: r.recurrence, diasSemana: r.weekdays,
      responsavel: r.responsible_mode === 'pessoa' ? r.responsavel : 'Plantão do horário',
      responsavelNomeado: r.responsible_mode === 'pessoa',
      observacaoResponsavel: r.responsible_note,
      marcadoPor: r.autor, marcadoEm: r.created_at,
    }));
  }

  /** Materializa o dia: a agenda vira linha do tempo. Idempotente. */
  async gerarDoDia(user: AuthenticatedUser, houseId: string, data?: string) {
    const dia = data ?? hojeNaInstituicao();
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(`SELECT * FROM app_generate_commitments($1,$2)`,
        [houseId, dia]);
      return row;
    }).catch((e: any) => {
      if (String(e?.message).includes('casa_fora_de_escopo')) {
        throw new NotFoundException('Casa não encontrada.');
      }
      throw e;
    });
    return { criadas: r.criadas, dia };
  }

  /** Encerrar um compromisso: sai da agenda, fica no histórico. */
  async cancelar(user: AuthenticatedUser, id: string, motivo: string) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(`SELECT * FROM app_cancel_commitment($1,$2)`,
        [id, motivo]);
      return row;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('motivo_obrigatorio')) {
        throw new BadRequestException('Descreva por que o compromisso foi encerrado.');
      }
      if (m.includes('sem_permissao_cancelar')) {
        throw new ForbiddenException('Sem permissão para encerrar este compromisso.');
      }
      if (m.includes('compromisso_inexistente')) {
        throw new NotFoundException('Compromisso não encontrado.');
      }
      throw e;
    });
    await this.audit.log({
      action: 'commitment.cancel', actorId: user.id, institutionId: user.institutionId,
      entity: 'commitment', entityId: id, detail: { futurasRemovidas: r.futuras_removidas },
    });
    return {
      cancelado: true, futurasRemovidas: r.futuras_removidas,
      aviso: 'Compromisso encerrado. O que já aconteceu continua na linha do tempo; o que estava marcado para a frente saiu da agenda.',
    };
  }
}
