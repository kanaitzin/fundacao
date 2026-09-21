import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser, DocumentClosed, EscalationRequest } from '../../kernel/contracts';

/**
 * ACOMPANHAMENTOS SEMANAIS E MENSAIS (§14.1–§14.4).
 *
 * A automação faz uma coisa só: criar a pendência. Ela não escreve avaliação,
 * não puxa observação do dia para dentro do texto e não transforma ausência de
 * registro em fato negativo — "sem registro" é sem registro, não é "semana
 * ruim".
 *
 * As fontes são escolhidas por gente. O sistema lista o que é elegível com
 * origem, autor, data e classificação; quem redige decide o que entra, e a
 * referência ao original fica guardada para quem ler depois.
 */

const EIXOS = {
  axis_health: 'saúde, alimentação e medicamentos',
  axis_school: 'escola, cursos e atividades',
  axis_coexistence: 'convivência e desenvolvimento',
  axis_family: 'família, rede e situação judicial',
} as const;

const CAMPOS: Record<string, keyof typeof EIXOS> = {
  saude: 'axis_health', escola: 'axis_school',
  convivencia: 'axis_coexistence', familia: 'axis_family',
};

@Injectable()
export class FollowupsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  /** Eixos obrigatórios (§14.3) — a tela não inventa a lista. */
  eixos() {
    return Object.entries(CAMPOS).map(([cod, col]) => ({ cod, label: EIXOS[col] }));
  }

  /**
   * Gera as pendências do período. Idempotente: rodar de novo não duplica,
   * e quem chegou hoje entra na conta.
   */
  async gerar(user: AuthenticatedUser, houseId: string, data?: string) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_generate_followups($1,$2)`, [houseId, data ?? null]);
      return row;
    }).catch((e: any) => {
      if (String(e?.message).includes('sem_permissao_gerar')) {
        throw new ForbiddenException('Sem permissão para gerar acompanhamentos nesta unidade.');
      }
      throw e;
    });
    await this.audit.log({
      action: 'followup.generate', actorId: user.id, institutionId: user.institutionId,
      houseId, entity: 'followup_batch', detail: { criadas: r.criadas },
    });
    return {
      criadas: r.criadas, jaExistiam: r.ja_existiam,
      aviso: 'A automação criou as pendências. O texto é humano — o sistema não escreve avaliação.',
    };
  }

  /** Pendências abertas da casa, por tipo. */
  async pendentes(user: AuthenticatedUser, houseId: string, kind?: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT f.id, f.kind, f.status, f.period_start, f.period_end, f.version,
                app_person_display_name(f.person_id) AS pessoa, f.person_id,
                app_user_display_name(f.written_by) AS redator
           FROM followup f
          WHERE f.house_id = $1
            AND f.status IN ('pendente','rascunho','em_aprovacao')
            AND ($2::text IS NULL OR f.kind = $2)
          ORDER BY f.kind, f.period_start DESC, pessoa`, [houseId, kind ?? null]);
      return rows.map((r) => ({
        id: r.id, tipo: r.kind, situacao: r.status, pessoa: r.pessoa, personId: r.person_id,
        periodo: { de: r.period_start, ate: r.period_end }, versao: r.version, redator: r.redator,
      }));
    });
  }

  /** Um acompanhamento com seus eixos e as fontes escolhidas. */
  async abrir(user: AuthenticatedUser, id: string) {
    const dados = await this.db.asUser(user.id, async (c) => {
      const { rows: [f] } = await c.query(
        `SELECT f.*, app_person_display_name(f.person_id) AS pessoa,
                app_user_display_name(f.approved_by) AS aprovador,
                app_user_display_name(f.written_by) AS redator
           FROM followup f
          WHERE f.id = $1`, [id]);
      if (!f) return null;
      const { rows: fontes } = await c.query(
        `SELECT entity, entity_id, origem, autor, registrado_em, classificacao, escolhido_em
           FROM followup_source WHERE followup_id = $1 ORDER BY registrado_em`, [id]);
      return { f, fontes };
    });
    if (!dados) throw new NotFoundException('Acompanhamento não encontrado.');
    const { f, fontes } = dados;
    return {
      id: f.id, tipo: f.kind, situacao: f.status, pessoa: f.pessoa, personId: f.person_id,
      periodo: { de: f.period_start, ate: f.period_end },
      versao: f.version, substitui: f.supersedes_id,
      eixos: {
        saude: f.axis_health, escola: f.axis_school,
        convivencia: f.axis_coexistence, familia: f.axis_family,
      },
      redator: f.redator, aprovador: f.aprovador, aprovadoEm: f.approved_at,
      notaAprovacao: f.approval_note,
      fontes: fontes.map((s) => ({
        entidade: s.entity, id: s.entity_id, origem: s.origem, autor: s.autor,
        registradoEm: s.registrado_em, classificacao: s.classificacao,
      })),
    };
  }

  /** Salvar rascunho dos eixos. Só quem redige — e nunca sobre o aprovado. */
  async salvar(user: AuthenticatedUser, id: string, eixos: Record<string, string>) {
    /* alcance:acompanhamentos — quem redige. Conferido contra `alcance.ts`. */
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação redigem acompanhamentos.');
    }
    const sets: string[] = []; const vals: (string | null)[] = [id];
    for (const [k, v] of Object.entries(eixos ?? {})) {
      const col = CAMPOS[k];
      if (!col) continue;
      vals.push(v?.trim() ? v.trim() : null);
      sets.push(`${col} = $${vals.length}`);
    }
    if (!sets.length) throw new BadRequestException('Nenhum eixo informado.');

    const n = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE followup
            SET ${sets.join(', ')}, written_by = app_current_user(),
                status = CASE WHEN status = 'pendente' THEN 'rascunho' ELSE status END
          WHERE id = $1 AND status IN ('pendente','rascunho')`, vals);
      return rowCount;
    }).catch((e: any) => {
      if (String(e?.message).includes('aprovado_e_imutavel')) {
        throw new ConflictException(
          'Este acompanhamento já foi aprovado. Para corrigir, gere uma nova versão — a aprovada continua sendo o retrato daquele momento.');
      }
      throw e;
    });
    if (!n) throw new ConflictException('Acompanhamento não está aberto para edição.');
    return { salvo: true };
  }

  /**
   * O QUE PODE VIRAR FONTE DESTE ACOMPANHAMENTO (§14.4, resposta de 20/09).
   *
   * A pergunta §10.7 era de onde a técnica escolhe, e a resposta foi **as três
   * numa lista só** — linha do tempo, ocorrências e evoluções de saúde do
   * período —, com filtro por tipo. Três listas separadas obrigariam quem
   * escreve a lembrar de visitar as três; uma lista só, ordenada por data, é a
   * semana da criança na ordem em que ela aconteceu.
   *
   * O `POST /followups/:id/sources` existe desde a 0490 e **nunca teve quem o
   * chamasse**: a escolha de fonte pedia `entidade` e `entityId` digitados à
   * mão, que ninguém tem. Era um dos casos do §9 — rota pronta sem porta.
   *
   * O TEXTO RESTRITO NÃO ENTRA NA LISTA, só a referência. É o precedente da
   * fase 121, e a razão é a mesma: **este documento tem folha, e folha se
   * imprime, se anexa e se esquece em cima de uma mesa.** Quem precisa ler a
   * ocorrência restrita a lê na tela dela, onde cada abertura fica registrada —
   * e aqui vê que ela existe, com data e autor, o bastante para decidir
   * referenciá-la. Esconder que existe faria a técnica procurar noutro lugar.
   *
   * O período é o do ACOMPANHAMENTO, e não o de hoje: um acompanhamento de
   * agosto aberto em setembro precisa das fontes de agosto.
   *
   * Cada fonte é opcional por `to_regclass`, como o painel: o módulo dono pode
   * ser removido, e aí aquela origem some da lista em vez de derrubar a tela.
   */
  async fontesCandidatas(user: AuthenticatedUser, id: string, tipo?: string) {
    /* alcance:acompanhamentos — quem redige. Conferido contra `alcance.ts`. */
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação redigem acompanhamentos.');
    }
    return this.db.asUser(user.id, async (c) => {
      const { rows: [f] } = await c.query(
        `SELECT person_id, period_start, period_end, status FROM followup WHERE id = $1`, [id]);
      if (!f) throw new NotFoundException('Acompanhamento não encontrado.');

      const { rows: existe } = await c.query(
        `SELECT t AS tabela FROM unnest($1::text[]) t
          WHERE to_regclass('public.' || t) IS NOT NULL`,
        [['activity', 'incident', 'health_evolution']]);
      const tem = new Set(existe.map((r: any) => r.tabela));

      const { rows: escolhidas } = await c.query(
        `SELECT entity, entity_id FROM followup_source WHERE followup_id = $1`, [id]);
      const jaEscolhida = new Set(escolhidas.map((r: any) => `${r.entity}:${r.entity_id}`));

      const candidatos: any[] = [];

      if (tem.has('activity')) {
        const { rows } = await c.query(
          `SELECT a.id, a.title, a.scheduled_at AS quando, a.state,
                  app_user_display_name(a.created_by) AS autor
             FROM activity a
            WHERE a.person_id = $1
              AND (a.scheduled_at AT TIME ZONE app_fuso())::date BETWEEN $2 AND $3
            ORDER BY a.scheduled_at DESC LIMIT 200`, [f.person_id, f.period_start, f.period_end]);
        for (const r of rows) {
          candidatos.push({
            entidade: 'activity', id: r.id, tipo: 'atividade',
            origem: 'Linha do tempo', titulo: r.title, quando: r.quando,
            autor: r.autor, classificacao: 'operacional',
            /* O estado é o resumo: "não aconteceu" é informação de acompanhamento
               tanto quanto "aconteceu", e é o que a técnica procura. */
            resumo: r.state,
          });
        }
      }

      if (tem.has('incident')) {
        const { rows } = await c.query(
          `SELECT i.id, i.category, i.happened_at AS quando, i.access_level,
                  i.objective_fact, app_user_display_name(i.opened_by) AS autor
             FROM incident i
             -- rls-join-ok: incident_person não tem política própria; quem lê a
             -- ocorrência é quem decide, e é a política de incident que decide.
             JOIN incident_person ip ON ip.incident_id = i.id
            WHERE ip.person_id = $1
              AND (i.happened_at AT TIME ZONE app_fuso())::date BETWEEN $2 AND $3
            ORDER BY i.happened_at DESC LIMIT 200`, [f.person_id, f.period_start, f.period_end]);
        for (const r of rows) {
          const restrito = r.access_level === 'restrito';
          candidatos.push({
            entidade: 'incident', id: r.id, tipo: 'ocorrencia',
            origem: 'Ocorrências', titulo: r.category, quando: r.quando,
            autor: r.autor, classificacao: restrito ? 'restrito' : 'operacional',
            // O fato objetivo não sai daqui quando é restrito: esta folha circula.
            resumo: restrito ? null : r.objective_fact,
          });
        }
      }

      if (tem.has('health_evolution')) {
        const { rows } = await c.query(
          `SELECT e.id, e.kind, e.happened_at AS quando, e.state_return, e.status,
                  app_user_display_name(e.accompanied_by) AS autor
             FROM health_evolution e
            WHERE e.person_id = $1
              AND (e.happened_at AT TIME ZONE app_fuso())::date BETWEEN $2 AND $3
            ORDER BY e.happened_at DESC LIMIT 200`, [f.person_id, f.period_start, f.period_end]);
        for (const r of rows) {
          candidatos.push({
            entidade: 'health_evolution', id: r.id, tipo: 'saude',
            origem: 'Evoluções de saúde', titulo: r.kind, quando: r.quando,
            autor: r.autor, classificacao: 'operacional', resumo: r.state_return,
          });
        }
      }

      const lista = candidatos
        .filter((x) => !tipo || x.tipo === tipo)
        .map((x) => ({ ...x, jaEscolhida: jaEscolhida.has(`${x.entidade}:${x.id}`) }))
        .sort((a, b) => String(b.quando).localeCompare(String(a.quando)));

      return {
        periodo: { de: f.period_start, ate: f.period_end },
        /* Aprovado não recebe fonte nova — a tela precisa saber antes de
           oferecer o botão, e não depois da recusa. */
        aberto: f.status !== 'aprovado',
        tipos: [
          { cod: 'atividade', label: 'Linha do tempo' },
          { cod: 'ocorrencia', label: 'Ocorrências' },
          { cod: 'saude', label: 'Evoluções de saúde' },
        ],
        candidatos: lista,
        aviso: 'O acompanhamento guarda a REFERÊNCIA ao registro, nunca a cópia. '
          + 'O conteúdo de ocorrência restrita não aparece aqui: esta folha se imprime, '
          + 'e quem precisa lê na tela da ocorrência, onde cada abertura fica registrada.',
      };
    });
  }

  /**
   * Escolher uma fonte (§14.4). Guarda a referência ao original, com origem,
   * autor, data e classificação — nunca a cópia do texto restrito.
   */
  async escolherFonte(user: AuthenticatedUser, id: string, fonte: {
    entidade: string; entityId: string; origem: string;
    autor?: string; registradoEm?: string; classificacao?: string;
  }) {
    if (!fonte?.entidade || !fonte?.entityId) {
      throw new BadRequestException('Informe a fonte que está sendo escolhida.');
    }
    await this.db.asUser(user.id, async (c) => {
      await c.query(
        `INSERT INTO followup_source (followup_id, entity, entity_id, origem, autor,
                                      registrado_em, classificacao, escolhido_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7, app_current_user())
         ON CONFLICT (followup_id, entity, entity_id) DO NOTHING`,
        [id, fonte.entidade, fonte.entityId, fonte.origem,
         fonte.autor ?? null, fonte.registradoEm ?? null, fonte.classificacao ?? 'operacional']);
    });
    return {
      escolhida: true,
      aviso: fonte.classificacao === 'restrito'
        ? 'Fonte restrita: o acompanhamento guarda a referência, não a narrativa. Copiar o texto é decisão sua, feita à mão.'
        : null,
    };
  }

  /** Enviar para aprovação. O mensal exige revisão da coordenação (§14.2). */
  async enviarParaAprovacao(user: AuthenticatedUser, id: string) {
    // A validação mora DENTRO da transação. Antes, o UPDATE já tinha sido
    // comitado quando a checagem dos eixos falhava: o acompanhamento vazio
    // ficava preso em `em_aprovacao`, fora do rascunho de quem escreveu e na
    // fila de quem revisa, sem caminho de volta. O erro na tela dizia
    // "preencha um eixo" e o botão de preencher já não existia mais.
    // Agora ou os dois acontecem, ou nenhum: o `throw` desfaz o UPDATE (§4.4).
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [atual] } = await c.query(
        `SELECT id, status,
                coalesce(axis_health,'') || coalesce(axis_school,'')
                || coalesce(axis_coexistence,'') || coalesce(axis_family,'') AS texto
           FROM followup WHERE id = $1 FOR UPDATE`, [id]);
      if (!atual) throw new NotFoundException('Acompanhamento não encontrado.');
      if (!['rascunho', 'pendente'].includes(atual.status)) {
        throw new ConflictException('Acompanhamento não está em rascunho.');
      }
      if (!String(atual.texto).trim()) {
        throw new BadRequestException('Preencha ao menos um eixo antes de enviar para aprovação.');
      }

      const { rows: [row] } = await c.query(
        `UPDATE followup
            SET status = 'em_aprovacao', submitted_at = now(),
                written_by = coalesce(written_by, app_current_user())
          WHERE id = $1 AND status IN ('rascunho','pendente')
          RETURNING id, kind, house_id, person_id`, [id]);
      return row;
    });
    if (!r) throw new ConflictException('Acompanhamento não está em rascunho.');

    const pedido: EscalationRequest = {
      level: 'tecnica_coordenacao', entity: 'followup', entityId: r.id,
      reason: 'acompanhamento aguardando aprovação',
      title: r.kind === 'mensal' ? 'Acompanhamento mensal para revisar' : 'Acompanhamento semanal para revisar',
      body: 'Um acompanhamento está aguardando revisão e aprovação da coordenação.',
      priority: 'normal', groupKey: `followup:${r.house_id}`,
    };
    await this.bus.publish('escalation.requested', pedido, { actorId: user.id, houseId: r.house_id });
    await this.audit.log({
      action: 'followup.submit', actorId: user.id, institutionId: user.institutionId,
      houseId: r.house_id, entity: 'followup', entityId: r.id, detail: { tipo: r.kind },
    });
    return { situacao: 'em_aprovacao' };
  }

  /** Aprovar. Quem redigiu não aprova o próprio texto. */
  async aprovar(user: AuthenticatedUser, id: string, nota?: string) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_approve_followup($1,$2)`, [id, nota ?? null]);
      return row;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('autor_nao_aprova')) {
        throw new ForbiddenException(
          'Quem redigiu não aprova o próprio texto. A equipe técnica redige, a coordenação revisa (§14.2).');
      }
      if (m.includes('somente_coordenacao_aprova')) {
        throw new ForbiddenException('Somente a coordenação e o Gestor Geral aprovam acompanhamentos.');
      }
      if (m.includes('nao_esta_em_aprovacao')) {
        throw new ConflictException('Este acompanhamento não está aguardando aprovação.');
      }
      if (m.includes('fora_de_escopo')) throw new NotFoundException('Acompanhamento não encontrado.');
      if (m.includes('inexistente')) throw new NotFoundException('Acompanhamento não encontrado.');
      throw e;
    });
    await this.audit.log({
      action: 'followup.approve', actorId: user.id, institutionId: user.institutionId,
      entity: 'followup', entityId: id, detail: { versao: r.versao },
    });
    /*
     * Aprovado é fechado: entra na fila do arquivo (§16.2), com a VERSÃO no
     * nome. Uma correção depois vira V2 e nasce como cópia própria, ao lado —
     * o arquivo guarda as duas, e é assim que se sabe o que foi entregue e o
     * que foi corrigido depois.
     */
    // `app_approve_followup` devolve só (aprovado, versao); a casa vem daqui,
    // sob a mesma RLS que já deixou aprovar.
    const casa = await this.db.asUser(user.id, async (c) => {
      const { rows: [f] } = await c.query(`SELECT house_id FROM followup WHERE id = $1`, [id]);
      return f?.house_id ?? null;
    });
    const copia: DocumentClosed = {
      categoria: 'acompanhamento', entidade: 'followup', entityId: id,
      houseId: casa, restrita: true,
      versao: Number(r.versao) > 1 ? `V${r.versao}_ADENDO` : 'V1',
    };
    await this.bus.publish('document.closed', copia, { actorId: user.id, houseId: casa });

    return {
      aprovado: true, versao: r.versao,
      aviso: 'Aprovado. A partir daqui é retrato daquele momento: corrigir cria uma nova versão, sem apagar esta.',
    };
  }

  /** Correção depois de aprovado: nova versão, nova aprovação (§14.2). */
  async novaVersao(user: AuthenticatedUser, id: string, motivo: string) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(`SELECT * FROM app_amend_followup($1,$2)`, [id, motivo]);
      return row;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('motivo_insuficiente')) {
        throw new BadRequestException('Descreva o motivo da correção (mínimo 15 caracteres).');
      }
      if (m.includes('somente_aprovado_gera_versao')) {
        throw new ConflictException('Só um acompanhamento aprovado gera nova versão.');
      }
      if (m.includes('fora_de_escopo')) throw new NotFoundException('Acompanhamento não encontrado.');
      if (m.includes('inexistente')) throw new NotFoundException('Acompanhamento não encontrado.');
      throw e;
    });
    await this.audit.log({
      action: 'followup.amend', actorId: user.id, institutionId: user.institutionId,
      entity: 'followup', entityId: id, detail: { novaVersao: r.versao },
    });
    return {
      id: r.novo_id, versao: r.versao,
      aviso: 'Nova versão criada em rascunho. A versão aprovada continua legível como estava.',
    };
  }
}
