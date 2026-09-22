import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/** Assinatura mínima compartilhada por `Pool` e `PoolClient`. */
type QueryFn = (text: string, params?: unknown[]) => Promise<unknown>;

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  institutionId?: string | null;
  houseId?: string | null;
  entity?: string;
  entityId?: string;
  purpose?: string;
  /** Somente METADADOS (ids, estados, contadores). Nunca CPF, relato, receita, diagnóstico. */
  detail?: Record<string, unknown>;
}

/**
 * AS TABELAS DE ONDE A CASA DE UM REGISTRO PODE SER LIDA (fase 149).
 *
 * Lista escrita, e não nome vindo de fora: a consulta abaixo interpola o nome
 * da tabela, e interpolar o que chega de qualquer lugar é como se abre buraco
 * em SQL. Aqui o nome vem SEMPRE de uma constante do servidor, e esta lista é a
 * prova disso — tabela nova entra aqui, escrita, ou a leitura recusa.
 *
 * Toda tabela desta lista tem `house_id` e `id`, e está aqui porque ALGUÉM a
 * pede — nome sem uso viraria enfeite. Quem não tem casa própria não entra (a
 * nota da internação lê a casa pela internação, no serviço dela), e quem já lê
 * a casa no próprio `RETURNING` também não precisa de linha aqui.
 */
export const TABELAS_COM_CASA = new Set([
  'activity', 'archive_item', 'ata_episode', 'collective_check', 'commitment',
  'external_communication', 'followup', 'house_statute',
  'notification', 'shift_assignment', 'statement', 'sync_conflict', 'team_agreement',
]);

/**
 * Auditoria (§20): append-only (trigger no banco impede UPDATE/DELETE),
 * apoia apuração humana e nunca decide culpa.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * Grava o evento.
   *
   * `client` opcional, e importa: passando o cliente da transação em curso, a
   * auditoria vira parte do MESMO ato — ou os dois existem, ou nenhum dos dois.
   * Sem ele, o INSERT usa outra conexão do pool, e aí duas coisas podem sair
   * torto: uma operação revertida deixa rastro de algo que não aconteceu, e uma
   * falha ao auditar depois do COMMIT devolve erro sobre uma escrita que ficou.
   *
   * Regra prática: **acesso a dado sensível audita dentro da transação.** Quem
   * abre um documento, vê dados bancários ou lê narrativa restrita não pode ter
   * o registro do acesso separado do acesso.
   */
  async log(e: AuditEntry, client?: { query: QueryFn }): Promise<void> {
    const executor = client ?? this.db;
    await executor.query(
      `INSERT INTO audit_event (action, actor_id, institution_id, house_id, entity, entity_id, purpose, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [e.action, e.actorId ?? null, e.institutionId ?? null, e.houseId ?? null,
       e.entity ?? null, e.entityId ?? null, e.purpose ?? null, JSON.stringify(e.detail ?? {})],
    );
  }

  /**
   * A CASA DE UM ACOLHIDO, para a linha de auditoria (fase 149).
   *
   * Existe porque a `audit_select` (0920) dá à coordenação o que tem casa —
   * `NULL = ANY(app_casas_no_alcance())` é NULL, e NULL não é verdadeiro —, e a
   * maior parte do que se audita é ato SOBRE UMA CRIANÇA, não sobre uma casa:
   * o dossiê aberto, a dose confirmada, o dado bancário consultado. Sem esta
   * resposta, cada serviço inventava a sua, ou não punha casa nenhuma.
   *
   * LÊ SOB O RLS DE QUEM AGIU, e isto foi um falso verde meu antes de ser uma
   * decisão: a primeira versão usava o `db.query`, que é a consulta SEM
   * identidade — e sem identidade o `stay_select` não devolve linha nenhuma.
   * `SELECT count(*) FROM house_stay` como a aplicação sem usuário dá **zero**,
   * então as cinquenta e três correções desta fase devolviam `null` calado,
   * exatamente o defeito que elas existem para consertar. *Quem escreve uma
   * resposta nova confere que ela responde, e não que ela compila.*
   *
   * Quem age alcança a criança de quem age, inclusive nas RECUSAS que mais
   * importam registrar: o educador que tentou abrir dados bancários é da casa
   * dela — o que ele não tem é a permissão daquela área. Quem está fora da casa
   * recebe `null`, e aí a linha sem casa é a resposta certa: para a casa, aquele
   * ato é de um estranho, e é a gestão geral que o lê.
   *
   * `client` para quem já está numa transação: a casa vem da mesma conexão, e
   * não de outra que não veria a linha ainda não confirmada.
   *
   * A ÚLTIMA CASA vale quando não há atual. Criança desligada continua tendo
   * história, e a coordenação que respondeu por ela é quem responde pelo rastro.
   */
  async casaDoAcolhido(userId: string, personId?: string | null,
                       client?: { query: QueryFn }): Promise<string | null> {
    if (!personId) return null;
    const consulta = async (c: { query: QueryFn }) => {
      const { rows } = await c.query(
        `SELECT house_id FROM house_stay WHERE person_id = $1
          ORDER BY (status = 'ativa') DESC, started_at DESC LIMIT 1`,
        [personId]) as { rows: { house_id: string | null }[] };
      return rows[0]?.house_id ?? null;
    };
    return client ? consulta(client) : this.db.asUser(userId, consulta);
  }

  /**
   * A CASA DE UM REGISTRO, lida da tabela dele (fase 149).
   *
   * O mesmo motivo do `casaDoAcolhido`, para o que não é sobre uma criança e
   * sim sobre um registro da casa: o combinado revogado, o compromisso
   * encerrado, a atividade delegada. Lê sob o RLS de quem agiu, pelo motivo
   * escrito acima, e nada daqui volta para a tela.
   *
   * O nome da tabela vem de `TABELAS_COM_CASA`, e nome fora da lista devolve
   * `null` em vez de consultar: a linha fica sem casa, o que é ruim, mas menos
   * do que interpolar nome de tabela que alguém possa influenciar.
   */
  async casaDoRegistro(userId: string, tabela: string, id?: string | null,
                       client?: { query: QueryFn }): Promise<string | null> {
    if (!id || !TABELAS_COM_CASA.has(tabela)) return null;
    const consulta = async (c: { query: QueryFn }) => {
      const { rows } = await c.query(
        `SELECT house_id FROM ${tabela} WHERE id = $1`, [id]) as
        { rows: { house_id: string | null }[] };
      return rows[0]?.house_id ?? null;
    };
    return client ? consulta(client) : this.db.asUser(userId, consulta);
  }
}
