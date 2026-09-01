import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { TIPOS_ROTINA, DIAS_DA_SEMANA } from './rotina-vocabulario';

export interface RoutineItemInput {
  kind: string;
  title: string;
  startTime: string;          // "07:00"
  endTime?: string;
  weekdays?: number[];        // 0=domingo … 6=sábado
  collective?: boolean;
  personId?: string;
  instructions?: string;
  transport?: string;
  priority?: number;
  requiresAck?: boolean;
}

/**
 * Rotina versionada da casa (§8.1).
 *
 * Alterar a rotina cria uma versão nova e copia os itens: o molde antigo
 * permanece explicando os registros que nasceram dele. A equipe técnica e a
 * coordenação editam; líderes de plantão não alteram o planejamento regular
 * — o que eles podem fazer (atividade urgente e pontual) vive em `activities`.
 */
@Injectable()
export class RoutineService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async current(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [v] } = await c.query(
        `SELECT id, number, valid_from, note FROM routine_version
         WHERE house_id = $1 AND valid_to IS NULL`, [houseId]);
      if (!v) {
        return {
          versao: null, itens: [], tipos: TIPOS_ROTINA, dias: DIAS_DA_SEMANA,
          podeAlterar: ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role),
          aviso: 'Esta casa ainda não tem rotina registrada. Enquanto não tiver, o dia nasce '
            + 'do que está na agenda e do que a equipe lançar — e não de um molde escrito.',
        };
      }

      const { rows: itens } = await c.query(
        `SELECT ri.id, ri.kind, ri.title, ri.start_time, ri.end_time, ri.weekdays,
                ri.collective, ri.person_id, ri.instructions, ri.transport,
                ri.priority, ri.requires_ack,
                app_person_display_name(ri.person_id) AS pessoa
         FROM routine_item ri
         WHERE ri.version_id = $1
         ORDER BY ri.start_time, ri.title`, [v.id]);

      return {
        versao: { id: v.id, numero: v.number, vigenteDesde: v.valid_from, nota: v.note },
        itens: itens.map(mapItem),
        tipos: TIPOS_ROTINA, dias: DIAS_DA_SEMANA,
        // Quem lê e quem ALTERA são conjuntos diferentes: a casa inteira
        // precisa saber a que horas é a janta; mudar o molde é da técnica e da
        // coordenação. A tela pergunta ao servidor em vez de repetir a lista.
        podeAlterar: ['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role),
        aviso: 'Alterar a rotina cria uma VERSÃO NOVA. A anterior continua inteira: é ela que '
          + 'explica por que o dia de dois meses atrás foi daquele jeito.',
      };
    });
  }

  async history(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT number, valid_from, valid_to, note FROM routine_version
         WHERE house_id = $1 ORDER BY number DESC`, [houseId]);
      return rows.map((r) => ({
        numero: r.number, vigenteDesde: r.valid_from, vigenteAte: r.valid_to,
        nota: r.note, atual: r.valid_to === null,
      }));
    });
  }

  /** Abre uma versão nova (copiando os itens vigentes) para poder alterar. */
  async newVersion(user: AuthenticatedUser, houseId: string, note: string) {
    /* alcance:rotina — quem altera o molde da casa. Conferido contra `alcance.ts`. */
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação alteram a rotina.');
    }
    if (!note?.trim()) throw new BadRequestException('Descreva o motivo da nova versão da rotina.');

    const v = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT * FROM app_new_routine_version($1, $2)`, [houseId, note]);
      return r;
    });
    await this.audit.log({
      action: 'routine.new_version', actorId: user.id, houseId,
      entity: 'routine_version', entityId: v.out_version_id, detail: { numero: v.out_number },
    });
    return { versaoId: v.out_version_id, numero: v.out_number };
  }

  async addItem(user: AuthenticatedUser, houseId: string, versionId: string, input: RoutineItemInput) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação alteram a rotina.');
    }
    if (!TIPOS_ROTINA.some((t) => t.code === input.kind)) {
      throw new BadRequestException('Tipo de item de rotina inválido.');
    }
    if (!/^\d{2}:\d{2}$/.test(input.startTime ?? '')) {
      throw new BadRequestException('Informe o horário de início no formato 07:00.');
    }
    if ((input.title ?? '').trim().length < 3) {
      throw new BadRequestException('Dê um nome ao item: é o que a educadora lê na linha do dia.');
    }
    /*
     * COLETIVO é o padrão, e a guarda precisa usar o MESMO padrão que o INSERT.
     *
     * Ela dizia `!input.collective`, e `undefined` é falso: omitir o campo — que
     * é a forma natural de dizer "da casa toda", e o que o próprio INSERT
     * entende assim duas linhas abaixo — era recusado como "item individual sem
     * acolhido". A rota nunca teve tela, e por isso ninguém tinha esbarrado.
     */
    const coletiva = input.collective ?? true;
    if (!coletiva && !input.personId) {
      throw new BadRequestException('Item individual precisa indicar o acolhido.');
    }
    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `INSERT INTO routine_item (version_id, house_id, kind, title, start_time, end_time,
           weekdays, collective, person_id, instructions, transport, priority, requires_ack, created_by)
         VALUES ($1,$2,$3::routine_kind,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [versionId, houseId, input.kind, input.title, input.startTime, input.endTime ?? null,
         input.weekdays ?? [0, 1, 2, 3, 4, 5, 6], coletiva, input.personId ?? null,
         input.instructions ?? null, input.transport ?? null, input.priority ?? 3,
         input.requiresAck ?? !coletiva, user.id]);
      return r.id;
    }).catch((e: any) => {
      // As travas vivem no gatilho tg_routine_item_guard (migração 0680); aqui
      // só traduzimos. A mensagem diz o que fazer, não só o que deu errado:
      // quem está com a tela aberta às 23h precisa saber o próximo passo.
      const m = String(e?.message ?? '');
      if (m.includes('versao_fechada')) {
        throw new ConflictException(
          'Esta versão da rotina já foi encerrada e não recebe itens novos — o que ela contém é o que a casa seguiu naquele período. '
          + 'Abra uma versão nova para alterar a rotina.');
      }
      if (m.includes('versao_de_outra_casa')) {
        throw new BadRequestException('Esta versão de rotina é de outra unidade.');
      }
      if (m.includes('versao_inexistente')) {
        throw new NotFoundException('Versão de rotina não encontrada.');
      }
      throw e;
    });
    await this.audit.log({
      action: 'routine.item_add', actorId: user.id, houseId,
      entity: 'routine_item', entityId: id, detail: { kind: input.kind, coletiva },
    });
    return { id };
  }
}

function mapItem(r: any) {
  return {
    id: r.id, tipo: r.kind, titulo: r.title,
    inicio: String(r.start_time).slice(0, 5),
    fim: r.end_time ? String(r.end_time).slice(0, 5) : null,
    diasSemana: r.weekdays,
    coletiva: r.collective,
    acolhido: r.person_id
      ? { id: r.person_id, nome: r.pessoa ?? '(fora do seu alcance)', visivel: r.pessoa != null }
      : null,
    instrucoes: r.instructions, transporte: r.transport,
    prioridade: r.priority, exigeCiencia: r.requires_ack,
  };
}
