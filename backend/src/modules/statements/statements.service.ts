import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * RELATOS INDEPENDENTES (§12.2, §13.4).
 *
 * Cada profissional informa o que presenciou, com as próprias palavras. O
 * sistema não concilia versões nem escolhe a "verdadeira": guarda todas,
 * atribuídas e imutáveis, e entrega o conjunto a quem tem função de analisar.
 *
 * O que ESTE serviço nunca faz: comparar relatos automaticamente, apontar
 * contradição, pontuar credibilidade ou concluir qualquer coisa. Isso é
 * trabalho humano e está fora do sistema por decisão (§3.3).
 */
@Injectable()
export class StatementsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Opções de testemunho — as mesmas na passagem e na ocorrência. */
  async opcoes() {
    // Vocabulário fixo, sem dado de pessoa: não precisa de identidade.
    const { rows } = await this.db.query(
      `SELECT code, label, pendente FROM witness_option ORDER BY ordem`);
    return rows.map((r) => ({ code: r.code, label: r.label, pendente: r.pendente as boolean }));
  }

  async create(user: AuthenticatedUser, input: {
    houseId: string; context: string; entity: string; entityId: string;
    personId?: string | null; witness: string; body: string;
    restrito?: boolean; complementaId?: string | null;
    happenedAt?: string; offline?: boolean; clientOpId?: string;
  }) {
    const opcoes = await this.opcoes();
    const opcao = opcoes.find((o) => o.code === input.witness);
    if (!opcao) {
      throw new BadRequestException(
        `Informe como você participou do fato: ${opcoes.map((o) => o.label).join('; ')}.`);
    }
    // "Sem informação adicional" é uma resposta legítima e dispensa texto.
    // As demais afirmam algo sobre um fato e precisam dizer o quê.
    const exigeTexto = input.witness !== 'sem_informacao_adicional';
    if (exigeTexto && (input.body ?? '').trim().length < 10) {
      throw new BadRequestException(
        'Descreva o fato observado. Registre o que aconteceu, não uma avaliação da pessoa.');
    }

    const id = await this.db.asUser(user.id, async (c) => {
      if (input.clientOpId) {
        const { rows: [dup] } = await c.query(
          `SELECT id FROM statement WHERE client_op_id = $1`, [input.clientOpId]);
        if (dup) return dup.id as string;
      }
      const { rows: [r] } = await c.query(
        `INSERT INTO statement (house_id, context, entity, entity_id, person_id, author_id,
           witness, body, restricted, supplements_id, happened_at, offline, client_op_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, coalesce($11::timestamptz, now()), $12,$13)
         RETURNING id`,
        [input.houseId, input.context, input.entity, input.entityId,
         input.personId ?? null, user.id, input.witness, (input.body ?? '').trim(),
         input.restrito ?? true, input.complementaId ?? null,
         input.happenedAt ?? null, input.offline ?? false, input.clientOpId ?? null]);
      return r.id as string;
    });

    await this.audit.log({
      action: 'statement.create', actorId: user.id, houseId: input.houseId,
      entity: 'statement', entityId: id,
      // Metadados apenas — o conteúdo do relato nunca vai para o log (§20).
      detail: { contexto: input.context, sobre: input.entity, testemunho: input.witness,
                restrito: input.restrito ?? true, complemento: !!input.complementaId },
    });

    return {
      id,
      testemunho: opcao.label,
      restrito: input.restrito ?? true,
      pendenteDeComplemento: opcao.pendente,
      aviso: opcao.pendente
        ? 'Registrado como pendente de complemento. O original permanece; o complemento entra como novo registro.'
        : 'Registro gravado. O original não pode ser reescrito — correções entram como complemento.',
    };
  }

  /**
   * Relatos de um fato. O que cada um enxerga já vem decidido pelo banco:
   * o autor vê o seu, a equipe técnica vê todos lado a lado, o colega vê
   * apenas o que não é narrativa pessoal (§26.2 #11 e #12).
   */
  async listFor(user: AuthenticatedUser, entity: string, entityId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT s.id, s.witness, w.label AS testemunho, s.body, s.restricted,
                s.happened_at, s.created_at, s.supplements_id, s.person_id,
                app_user_display_name(s.author_id) AS autor,
                (s.author_id = app_current_user()) AS meu
         FROM statement s JOIN witness_option w ON w.code = s.witness
         WHERE s.entity = $1 AND s.entity_id = $2
         ORDER BY s.happened_at, s.created_at`, [entity, entityId]);
      return rows;
    });

    const ladoALado = ['equipe_tecnica', 'coordenador'].includes(user.role);
    if (ladoALado && rows.length) {
      await this.audit.log({
        action: 'statement.read_side_by_side', actorId: user.id,
        entity, entityId, detail: { relatos: rows.length },
      });
    }

    return {
      // A tela precisa saber POR QUE a lista tem o tamanho que tem.
      modo: ladoALado ? 'lado_a_lado' : 'restrito_ao_proprio',
      nota: ladoALado
        ? 'Todos os relatos deste fato, na ordem em que aconteceram. Nenhum foi alterado.'
        : 'Você vê o seu relato e os registros abertos à equipe. Narrativas pessoais de colegas não são exibidas.',
      relatos: rows.map((r) => ({
        id: r.id, autor: r.autor, meu: r.meu,
        testemunho: r.testemunho, codigoTestemunho: r.witness,
        relato: r.body, restrito: r.restricted,
        acolhidoId: r.person_id,
        quando: r.happened_at, registradoEm: r.created_at,
        complementaId: r.supplements_id,
      })),
    };
  }

  /**
   * Leitura excepcional pelo Gestor Geral, com finalidade declarada (§26.2 #29).
   * A checagem e o registro acontecem dentro do comando: não há rota que
   * devolva o conteúdo sem antes gravar quem leu, o quê e para quê.
   */
  async readExceptional(user: AuthenticatedUser, id: string, finalidade: string) {
    try {
      const row = await this.db.asUser(user.id, async (c) => {
        const { rows: [r] } = await c.query(
          `SELECT * FROM app_read_statement($1, $2)`, [id, finalidade ?? '']);
        return r;
      });
      return {
        id: row.id, relato: row.body, testemunho: row.witness,
        quando: row.happened_at,
        finalidadeRegistrada: finalidade.trim(),
        aviso: 'Leitura excepcional registrada em auditoria, com a finalidade informada.',
      };
    } catch (e: any) {
      const m = e?.message ?? '';
      if (m.includes('finalidade_insuficiente')) {
        throw new BadRequestException(
          'Descreva a finalidade da leitura (mínimo 15 caracteres). Ela fica registrada junto com o acesso.');
      }
      if (m.includes('acesso_excepcional_negado')) {
        throw new ForbiddenException(
          'Narrativa pessoal não é dado de gestão. A leitura lado a lado cabe à equipe técnica e à coordenação.');
      }
      if (m.includes('relato_inexistente')) throw new NotFoundException('Relato não encontrado.');
      throw e;
    }
  }

  /** Quantos relatos existem sobre um fato — usado por plantão e ocorrências. */
  async countFor(user: AuthenticatedUser, entity: string, entityId: string): Promise<number> {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT count(*)::int AS n FROM statement WHERE entity = $1 AND entity_id = $2`,
        [entity, entityId]);
      return r.n as number;
    });
  }
}
