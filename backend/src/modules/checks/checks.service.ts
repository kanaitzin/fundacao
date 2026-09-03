import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { EventBus } from '../../kernel/events/event-bus.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * Opções por tipo de chamada (§10). "Normal/Compareceu/Participou" é o curso
 * esperado; as demais são exceções que exigem justificativa objetiva.
 *
 * Cada opção descreve o FATO, nunca a criança. Não há opção que classifique
 * a pessoa — só o que aconteceu naquela refeição, aula ou atividade.
 */
export const OPCOES: Record<string, { code: string; label: string; excecao: boolean }[]> = {
  alimentacao: [
    { code: 'normal', label: 'Normal', excecao: false },
    { code: 'parcial', label: 'Parcial', excecao: true },
    { code: 'recusou', label: 'Recusou', excecao: true },
    { code: 'ausente_externa', label: 'Ausente / atividade externa', excecao: true },
    { code: 'dieta_adaptada', label: 'Dieta adaptada', excecao: false },
    { code: 'desconforto', label: 'Desconforto', excecao: true },
    { code: 'nao_aplicavel', label: 'Não aplicável', excecao: false },
    { code: 'outro', label: 'Outro', excecao: true },
  ],
  escola: [
    { code: 'compareceu', label: 'Compareceu', excecao: false },
    { code: 'atraso', label: 'Atraso', excecao: true },
    { code: 'ausencia_saude', label: 'Ausência por saúde', excecao: true },
    { code: 'transporte', label: 'Transporte', excecao: true },
    { code: 'cancelamento', label: 'Cancelamento', excecao: true },
    { code: 'decisao_institucional', label: 'Decisão institucional', excecao: true },
    { code: 'outro', label: 'Outro', excecao: true },
  ],
  lazer: [
    { code: 'participou', label: 'Participou', excecao: false },
    { code: 'preferiu_nao', label: 'Preferiu não participar', excecao: false },
    { code: 'outra_atividade', label: 'Estava em outra atividade', excecao: false },
    { code: 'doenca', label: 'Doença', excecao: true },
    { code: 'restricao_saude', label: 'Restrição de saúde', excecao: true },
    { code: 'transporte_indisponivel', label: 'Transporte indisponível', excecao: true },
    { code: 'decisao_institucional', label: 'Decisão institucional', excecao: true },
    { code: 'outro', label: 'Outro', excecao: true },
  ],
  chamada_final: [
    { code: 'sem_alteracao', label: 'Sem alteração relevante', excecao: false },
    { code: 'com_registro', label: 'Com registro no plantão', excecao: true },
  ],
};
const PADRAO = OPCOES.alimentacao;

/**
 * OS TIPOS DE CHAMADA, com o nome que a casa usa (§10).
 *
 * A lista vive AQUI, e não na tela, pelo mesmo motivo das opções: o `kind` é
 * um enum do banco (`check_type`), e uma tela que inventa o vocabulário
 * escreve `"jantar"` num campo que só aceita oito valores — e descobre isso
 * na casa, às sete da noite, com a chamada aberta pela metade.
 *
 * O `titulo` é sugestão, não regra: quem abre pode escrever "Janta de sexta"
 * ou "Almoço — passeio no parque". Ele é o que a próxima pessoa lê na lista.
 */
export const TIPOS_DE_CHAMADA: { cod: string; label: string; sugestao: string }[] = [
  { cod: 'acordar', label: 'Acordar', sugestao: 'Acordar' },
  { cod: 'alimentacao', label: 'Refeição', sugestao: 'Refeição' },
  { cod: 'escola', label: 'Escola', sugestao: 'Saída para a escola' },
  { cod: 'banho', label: 'Banho', sugestao: 'Banho' },
  { cod: 'lazer', label: 'Lazer ou atividade', sugestao: 'Atividade de lazer' },
  { cod: 'dormir', label: 'Rotina de dormir', sugestao: 'Rotina de dormir' },
  { cod: 'chamada_final', label: 'Chamada final do turno', sugestao: 'Chamada final do turno' },
  { cod: 'outro', label: 'Outra conferência', sugestao: '' },
];

@Injectable()
export class ChecksService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  opcoes(kind: string) {
    return OPCOES[kind] ?? PADRAO;
  }

  /**
   * O vocabulário da chamada, para a tela não inventar nenhum dos dois lados:
   * nem o tipo (enum do banco), nem as opções de marcação por acolhido.
   */
  tipos() {
    return {
      tipos: TIPOS_DE_CHAMADA.map((t) => ({ ...t, opcoes: this.opcoes(t.cod) })),
      aviso: 'A chamada confere UMA pessoa por vez. Não existe marcar todos de uma vez: '
        + 'a conferência coletiva é justamente o que impede que alguém passe despercebido.',
    };
  }

  async open(user: AuthenticatedUser, input: { houseId: string; kind: string; titulo: string; referenceAt?: string }) {
    /*
     * O tipo é conferido AQUI, antes do banco.
     *
     * `p_kind::check_type` com um valor fora do enum devolve um erro de
     * conversão do PostgreSQL — que chegaria à educadora como "invalid input
     * value for enum check_type". A recusa precisa ser uma frase, e precisa
     * dizer o que fazer.
     */
    const tipo = TIPOS_DE_CHAMADA.find((t) => t.cod === input?.kind);
    if (!tipo) {
      throw new BadRequestException(
        `Escolha o tipo da chamada: ${TIPOS_DE_CHAMADA.map((t) => t.label).join('; ')}.`);
    }
    const titulo = (input.titulo ?? '').trim() || tipo.sugestao;
    if (titulo.length < 3) {
      throw new BadRequestException(
        'Dê um nome à chamada — é o que a próxima pessoa lê na lista do dia.');
    }
    input = { ...input, titulo };

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_open_check($1,$2,$3, coalesce($4::timestamptz, now()))`,
        [input.houseId, input.kind, input.titulo, input.referenceAt ?? null]);
      return row;
    });
    await this.audit.log({
      action: 'check.open', actorId: user.id, houseId: input.houseId,
      entity: 'collective_check', entityId: r.check_id,
      detail: { tipo: input.kind, esperados: r.esperados },
    });
    return { id: r.check_id, esperados: Number(r.esperados), opcoes: this.opcoes(input.kind) };
  }

  /** Estado da chamada: quem já foi conferido e quem falta. */
  async get(user: AuthenticatedUser, checkId: string) {
    const data = await this.db.asUser(user.id, async (c) => {
      const { rows: [k] } = await c.query(
        `SELECT * FROM collective_check WHERE id = $1`, [checkId]);
      if (!k) return null;
      // A lista é a UNIÃO de quem está ativo agora com quem já foi conferido:
      // uma criança que chegou depois da abertura precisa aparecer para ser
      // olhada, e uma que saiu no meio não pode sumir com o registro dela.
      const { rows } = await c.query(
        `WITH efetivo AS (
           SELECT s.person_id FROM house_stay s
            WHERE s.house_id = $2 AND s.status = 'ativa'
           UNION
           SELECT r.person_id FROM check_result r WHERE r.check_id = $1
         )
         SELECT e.person_id,
                app_person_display_name(e.person_id) AS nome,
                app_person_age(e.person_id) AS idade,
                EXISTS (SELECT 1 FROM house_stay s
                         WHERE s.person_id = e.person_id AND s.house_id = $2
                           AND s.status = 'ativa') AS ativo,
                r.option_code, r.note, r.happened_at, r.bulk_id,
                app_user_display_name(r.recorded_by) AS por,
                -- O alerta sai daqui já legível: "Alergia a Dipirona", nunca
                -- só "Dipirona" (§6.4, migração 0600).
                (SELECT string_agg(app_condition_label(h.kind, h.description), ' · ')
                   FROM health_condition h
                  WHERE h.person_id = e.person_id AND h.active AND h.essential_alert) AS alertas,
                (SELECT string_agg(f.restriction, ' · ') FROM food_restriction f
                  WHERE f.person_id = e.person_id AND f.active) AS restricoes
         FROM efetivo e
         LEFT JOIN check_result r ON r.check_id = $1 AND r.person_id = e.person_id
         ORDER BY app_person_display_name(e.person_id)`, [checkId, k.house_id]);
      // As conferências de mesa desta chamada — o ato, com nome e horário.
      // rls-join-ok: cb_select já exige app_house_in_scope da chamada.
      const { rows: mesas } = await c.query(
        `SELECT b.id, b.option_code, b.quantos, b.happened_at,
                app_user_display_name(b.recorded_by) AS por
           FROM check_bulk b WHERE b.check_id = $1 ORDER BY b.happened_at`, [checkId]);
      return { k, rows, mesas };
    });
    if (!data) throw new NotFoundException('Chamada não encontrada');

    const linhas = data.rows.map((r: any) => ({
      acolhidoId: r.person_id, nome: r.nome ?? '(fora do seu alcance)', idade: r.idade,
      // Quem saiu no meio da chamada continua listado com o que foi registrado,
      // mas não é cobrado no fechamento.
      ativo: r.ativo,
      // Alertas essenciais aparecem na hora de marcar — é onde eles importam.
      alertas: r.alertas, restricoes: r.restricoes,
      resultado: r.option_code, justificativa: r.note,
      registradoPor: r.por, registradoEm: r.happened_at,
      // A tela precisa poder dizer "conferido na mesa" em vez de deixar
      // parecer que alguém olhou esta criança sozinha. É a diferença inteira
      // entre um registro honesto e uma marcação em lote silenciosa.
      naConferenciaDeMesa: r.bulk_id != null,
    }));
    const conferidos = linhas.filter((l: any) => l.resultado).length;
    // `faltam` é medido contra o EFETIVO VIVO, não contra o número congelado
    // na abertura: era essa diferença que deixava a chamada fechar com uma
    // criança recém-chegada sem conferir, ou travar quando alguém saía.
    const pendentes = linhas.filter((l: any) => l.ativo && !l.resultado);
    return {
      id: data.k.id, tipo: data.k.kind, titulo: data.k.title,
      status: data.k.status,
      esperados: linhas.filter((l: any) => l.ativo).length,
      esperadosNaAbertura: data.k.expected,
      conferidos,
      faltam: pendentes.length,
      quemFalta: pendentes.map((l: any) => l.nome),
      opcoes: this.opcoes(data.k.kind),
      linhas,
      /*
       * A CONFERÊNCIA DE MESA (§10) — o que a casa faz de verdade no almoço.
       *
       * A regra é "sem marcação em lote SILENCIOSA", e a do banco é "nada que
       * preencha o que NÃO foi olhado". Conferir a mesa e registrar de uma vez
       * o que se olhou de uma vez não é nenhuma das duas — desde que fique
       * gravado que foi assim, que é o que `check_bulk` faz.
       *
       * A chamada final do turno é a exceção: ela existe justamente para
       * alguém contar as crianças uma a uma antes de dormir.
       */
      aceitaConferenciaDeMesa: data.k.kind !== 'chamada_final' && data.k.status === 'aberta',
      opcaoDaMesa: this.opcoes(data.k.kind).find((o) => !o.excecao)?.code ?? null,
      conferenciasDeMesa: (data.mesas ?? []).map((b: any) => ({
        id: b.id, opcao: b.option_code, quantos: b.quantos,
        por: b.por, quando: b.happened_at,
      })),
      avisoDaMesa: data.k.kind === 'chamada_final'
        ? 'A chamada final do turno é um a um: ela existe para alguém contar as crianças '
          + 'antes de dormir, e "todos" aqui seria suposição, não observação.'
        : 'Conferir a mesa registra, de uma vez, o que você olhou de uma vez — com o seu nome, '
          + 'o horário e quantos. Quem já foi marcado NÃO é sobrescrito, e exceção continua '
          + 'sendo uma a uma, com o motivo escrito.',
    };
  }

  /**
   * A CONFERÊNCIA DE MESA (§10).
   *
   * Marca de uma vez, com a opção não-exceção do tipo, TODOS os que ainda não
   * têm registro — e grava o ato: quem, quando, quantos. As travas moram no
   * `app_bulk_check` (migração 0780), e não aqui: nenhum caminho de escrita
   * escapa delas. Este método traduz a recusa do banco em frase de gente.
   */
  async bulk(user: AuthenticatedUser, checkId: string) {
    const k = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT kind, house_id, status FROM collective_check WHERE id = $1`, [checkId]);
      return row;
    });
    if (!k) throw new NotFoundException('Chamada não encontrada');

    const opcao = this.opcoes(k.kind).find((o) => !o.excecao);
    if (!opcao) {
      throw new BadRequestException('Este tipo de chamada não tem uma opção comum a conferir em bloco.');
    }

    let r: any;
    try {
      r = await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_bulk_check($1, $2)`, [checkId, opcao.code]);
        return row;
      });
    } catch (e: any) {
      const m = String(e?.message ?? '');
      if (m.includes('chamada_final_e_um_a_um')) {
        throw new BadRequestException(
          'A chamada final do turno é um a um. Ela existe para alguém contar as crianças antes '
          + 'de dormir — "todos" aqui seria suposição, não observação.');
      }
      if (m.includes('chamada_confirmada')) {
        throw new BadRequestException(
          'Chamada já confirmada. Correções entram como adendo pela equipe técnica.');
      }
      if (m.includes('ninguem_pendente')) {
        throw new BadRequestException(
          'Todos já foram conferidos nesta chamada — não há o que marcar em bloco.');
      }
      throw e;
    }

    await this.audit.log({
      action: 'check.bulk', actorId: user.id, houseId: k.house_id,
      entity: 'collective_check', entityId: checkId,
      detail: { opcao: opcao.code, quantos: r.marcados, jaTinham: r.ja_tinham },
    });

    return {
      id: r.bulk_id, marcados: r.marcados, jaTinham: r.ja_tinham, opcao: opcao.label,
      aviso: `Conferência de mesa registrada: ${r.marcados} como "${opcao.label}", com o seu nome `
        + 'e o horário. Quem já estava marcado não foi tocado. Se alguém não estiver assim, '
        + 'abra o nome dessa criança e corrija — a correção guarda o que constava antes.',
    };
  }

  /**
   * Marca UM acolhido. Não existe endpoint que marque vários de uma vez:
   * a conferência é individual por definição (§10, §11.2).
   */
  async mark(user: AuthenticatedUser, checkId: string, input: {
    personId: string; opcao: string; nota?: string; offline?: boolean;
    clientOpId?: string; happenedAt?: string;
  }) {
    const kind = await this.db.asUser(user.id, async (c) => {
      const { rows: [k] } = await c.query(`SELECT kind, house_id, status FROM collective_check WHERE id=$1`, [checkId]);
      return k;
    });
    if (!kind) throw new NotFoundException('Chamada não encontrada');
    if (kind.status === 'confirmada') {
      throw new BadRequestException('Chamada já confirmada. Correções entram como adendo pela equipe técnica.');
    }

    const opcao = this.opcoes(kind.kind).find((o) => o.code === input.opcao);
    if (!opcao) throw new BadRequestException('Opção inválida para este tipo de chamada.');
    if (opcao.excecao && !input.nota?.trim()) {
      throw new BadRequestException(
        `"${opcao.label}" exige justificativa objetiva: descreva o fato e o contexto, sem rótulo.`);
    }

    let corrigido = false;
    try {
      const dup = await this.db.asUser(user.id, async (c) => {
        if (!input.clientOpId) return false;
        const { rows: [d] } = await c.query(
          `SELECT id FROM check_result WHERE client_op_id = $1`, [input.clientOpId]);
        return !!d;
      });
      if (dup) return { ok: true, duplicada: true, opcao: opcao.label };

      // Defeito 5: a correção continua permitida — quem clicou errado precisa
      // consertar no meio do plantão —, mas o valor anterior não morre. O
      // gatilho tg_check_result_amend (migração 0670) copia o que constava
      // para check_result_amendment ANTES da troca, com autor e horário.
      // A trava está no banco: nenhum caminho de escrita escapa dela.
      corrigido = await this.db.asUser(user.id, async (c) => {
        const { rows: [antes] } = await c.query(
          `SELECT option_code, note FROM check_result
            WHERE check_id = $1 AND person_id = $2 FOR UPDATE`, [checkId, input.personId]);
        await c.query(
          `INSERT INTO check_result (check_id, person_id, option_code, note, recorded_by, offline, client_op_id, happened_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7, coalesce($8::timestamptz, now()))
           ON CONFLICT (check_id, person_id) DO UPDATE
             SET option_code = EXCLUDED.option_code, note = EXCLUDED.note,
                 recorded_by = EXCLUDED.recorded_by, recorded_at = now(),
                 -- Corrigir uma linha que veio da conferência de mesa a torna
                 -- INDIVIDUAL: alguém olhou aquela criança. A procedência não
                 -- pode continuar dizendo "na mesa" depois disso.
                 bulk_id = NULL`,
          [checkId, input.personId, input.opcao, input.nota ?? null, user.id,
           input.offline ?? false, input.clientOpId ?? null, input.happenedAt ?? null]);
        return !!antes && (antes.option_code !== input.opcao || (antes.note ?? null) !== (input.nota ?? null));
      });
    } catch (e: any) {
      // A política do banco (migração 0150) só aceita acolhido com permanência
      // ativa na casa da chamada — inclusive depois de uma transferência.
      if (e?.code === '42501' || /row-level security/i.test(e?.message ?? '')) {
        throw new BadRequestException(
          'Este acolhido não está ativo nesta casa. A conferência alcança apenas quem está na unidade.');
      }
      throw e;
    }
    if (corrigido) {
      await this.audit.log({
        action: 'check.amend', actorId: user.id, houseId: kind.house_id,
        entity: 'check_result', entityId: checkId,
        detail: { acolhidoId: input.personId, opcao: input.opcao },
      });
      return {
        ok: true, opcao: opcao.label, corrigido: true,
        aviso: 'Correção registrada. O que constava antes fica no histórico desta chamada, com autor e horário.',
      };
    }
    return { ok: true, opcao: opcao.label };
  }

  /** Confirmação final: só passa com todos conferidos individualmente. */
  async confirm(user: AuthenticatedUser, checkId: string) {
    try {
      const r = await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(`SELECT * FROM app_confirm_check($1)`, [checkId]);
        return row;
      });
      await this.audit.log({
        action: 'check.confirm', actorId: user.id, entity: 'collective_check', entityId: checkId,
        detail: { conferidos: r.conferidos, esperados: r.esperados },
      });
      await this.bus.publish('check.confirmed',
        { checkId, conferidos: Number(r.conferidos) }, { actorId: user.id });
      return {
        ok: true, conferidos: Number(r.conferidos), esperados: Number(r.esperados),
        aviso: `${r.conferidos} registros individuais criados no perfil de cada acolhido.`,
      };
    } catch (e: any) {
      if (e?.message?.includes('conferencia_incompleta')) {
        const quem = (e.message.split('conferencia_incompleta:')[1] ?? '').trim();
        throw new BadRequestException(
          quem
            ? `Ainda falta conferir: ${quem}. Todos os acolhidos ativos precisam ser conferidos individualmente.`
            : 'Ainda há acolhidos sem conferência. Todos os ativos precisam ser conferidos individualmente.');
      }
      if (e?.message?.includes('chamada_inexistente')) throw new NotFoundException('Chamada não encontrada');
      throw e;
    }
  }

  async listDay(user: AuthenticatedUser, houseId: string, date: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        // Defeito 11: a lista do dia mostrava `expected`, congelado na abertura,
        // enquanto o detalhe e o fechamento já contavam o efetivo VIVO. A casa
        // que recebeu uma criança às 15h via "12/15" na lista e "12/12" ao
        // abrir a mesma chamada — e a equipe ia procurar três crianças que
        // ninguém tinha deixado de conferir. É a mesma contagem de
        // app_confirm_check: quem está ativo na casa AGORA.
        `SELECT k.id, k.kind, k.title, k.reference_at, k.status, k.expected,
                (SELECT count(*)::int FROM check_result r WHERE r.check_id = k.id) AS conferidos,
                (SELECT count(*)::int FROM house_stay s
                  WHERE s.house_id = k.house_id AND s.status = 'ativa') AS ativos
         FROM collective_check k
         WHERE k.house_id = $1
           -- O DIA COMO FAIXA, e não como conversão da coluna.
           --
           -- Escrever '(reference_at AT TIME ZONE 'America/Sao_Paulo')::date = $2'
           -- é a forma natural de perguntar "o que é de hoje", e ela custou
           -- 8,4 SEGUNDOS com um ano de registros. O motivo não é o volume: sob
           -- RLS, o Postgres só empurra para o índice os predicados
           -- LEAKPROOF, e 'timezone()' e o cast para 'date' não são. O filtro
           -- do dia ficava, então, DEPOIS da política de segurança — e
           -- 'app_person_in_scope()' era chamada uma vez para cada uma das
           -- vinte mil chamadas do ano daquela casa.
           --
           -- Comparação de 'timestamptz' é leakproof. Convertendo o
           -- PARÂMETRO em vez da coluna, a faixa entra no índice, a política
           -- roda só nas linhas do dia, e a resposta cai para milissegundos.
           -- A fronteira é a mesma: meia-noite local, meia-noite local do dia
           -- seguinte.
           AND k.reference_at >= ($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
           AND k.reference_at <  (($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
         ORDER BY k.reference_at`, [houseId, date]);
      return rows.map((r) => ({
        id: r.id, tipo: r.kind, titulo: r.title, horario: r.reference_at,
        status: r.status, esperados: r.ativos, esperadosNaAbertura: r.expected,
        conferidos: r.conferidos,
      }));
    });
  }
}
