import { Inject, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { janelaDoMes } from '../../kernel/common/tempo';

/**
 * PAINEL DA CASA E DO GESTOR (§18.1–§18.3).
 *
 * Duas decisões estruturam este arquivo.
 *
 * **Sem ranking** (§3.3). Não há "melhor casa", nem lista ordenada por número
 * de ocorrências. Os cartões saem sempre na ordem do código da casa. Parece
 * detalhe de apresentação e não é: uma lista ordenada por ocorrências vira,
 * em três meses, cobrança sobre a equipe que REGISTRA mais — e o efeito
 * disso é registrar menos.
 *
 * **O painel não pode ser o motivo pelo qual um módulo não pode ser removido.**
 * Ele agrega números de vários domínios (ocorrências, ATAs, arquivo), e o
 * caminho preguiçoso seria consultar as tabelas dos outros direto. Aí remover
 * `incidents` quebraria o painel do gestor, que não tem nada a ver com isso.
 * Então cada contagem é OPCIONAL: o painel pergunta ao banco se a tabela
 * existe e, quando não existe, o número simplesmente não aparece — em vez de
 * a tela inteira cair.
 */

/** Contagem que só entra se o módulo dono da tabela estiver instalado. */
interface Opcional { chave: string; tabela: string; sql: string; }

@Injectable()
export class PanelService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private async existentes(c: PoolClient, tabelas: string[]): Promise<Set<string>> {
    const { rows } = await c.query(
      `SELECT t AS tabela FROM unnest($1::text[]) t WHERE to_regclass('public.' || t) IS NOT NULL`,
      [tabelas]);
    return new Set(rows.map((r) => r.tabela));
  }

  /** Cartão por unidade no alcance — ocupação, fluxo, pendências. */
  async cards(user: AuthenticatedUser) {
    const opcionais: Opcional[] = [
      { chave: 'transferencias', tabela: 'transfer_request',
        sql: `(SELECT count(*) FROM transfer_request t
                WHERE t.to_house_id = h.id AND t.status = 'solicitada')::int` },
      { chave: 'acompanhamentos', tabela: 'followup',
        sql: `(SELECT count(*) FROM followup f
                WHERE f.house_id = h.id
                  AND f.status IN ('pendente','rascunho','em_aprovacao'))::int` },
      { chave: 'arquivoFalho', tabela: 'archive_item',
        sql: `(SELECT count(*) FROM archive_item a
                WHERE a.house_id = h.id AND a.status = 'falhou')::int` },
    ];

    return this.db.asUser(user.id, async (c) => {
      const tem = await this.existentes(c, opcionais.map((o) => o.tabela));
      const extras = opcionais.filter((o) => tem.has(o.tabela));
      const { rows } = await c.query(
        `SELECT h.id, h.code, h.name, h.capacity,
                (SELECT count(*) FROM house_stay s
                  WHERE s.house_id = h.id AND s.status = 'ativa')::int AS ativos,
                (SELECT count(*) FROM house_stay s
                  WHERE s.house_id = h.id AND s.started_at > now() - interval '30 days')::int AS entradas
                ${extras.map((o) => `, ${o.sql} AS "${o.chave}"`).join('')}
           FROM house h
          WHERE h.active
          ORDER BY h.code`);   // ordem do código, nunca do número: sem ranking (§3.3)

      return rows.map((r) => ({
        id: r.id, codigo: r.code, nome: r.name,
        ocupacao: { ativos: r.ativos, limite: r.capacity, acimaDoLimite: r.ativos > r.capacity },
        entradas30d: r.entradas,
        transferenciasAguardando: r.transferencias ?? null,
        acompanhamentosAbertos: r.acompanhamentos ?? null,
        arquivoComFalha: r.arquivoFalho ?? null,
      }));
    });
  }

  /**
   * Relatório mensal da casa (§18.3).
   *
   * Nenhum número aqui classifica pessoas ou equipes. São contagens que a
   * coordenação usa para enxergar o mês, não para avaliar quem trabalhou nele.
   * E "sem registro" continua sendo sem registro: um mês sem ocorrências não
   * é um mês bom nem ruim, é um mês sem ocorrência registrada.
   */
  async mensalDaCasa(user: AuthenticatedUser, houseId: string, mes: string) {
    const janela = janelaDoMes(mes);
    const opcionais: Opcional[] = [
      { chave: 'ocorrências', tabela: 'incident',
        sql: `(SELECT count(*) FROM incident i
                WHERE i.house_id = $1 AND i.happened_at >= p.ini_ts AND i.happened_at < p.fim_ts)::int` },
      { chave: 'acompanhamentosAprovados', tabela: 'followup',
        sql: `(SELECT count(*) FROM followup f
                WHERE f.house_id = $1 AND f.period_start >= p.ini AND f.period_start < p.fim
                  AND f.status = 'aprovado')::int` },
      { chave: 'acompanhamentosAbertos', tabela: 'followup',
        sql: `(SELECT count(*) FROM followup f
                WHERE f.house_id = $1 AND f.period_start >= p.ini AND f.period_start < p.fim
                  AND f.status IN ('pendente','rascunho','em_aprovacao'))::int` },
      { chave: 'atasFechadas', tabela: 'ata',
        sql: `(SELECT count(*) FROM ata a
                WHERE a.house_id = $1 AND a.on_date >= p.ini AND a.on_date < p.fim
                  AND a.status = 'fechada')::int` },
      { chave: 'documentosArquivados', tabela: 'archive_item',
        sql: `(SELECT count(*) FROM archive_item ar
                WHERE ar.house_id = $1 AND ar.fechado_em >= p.ini_ts AND ar.fechado_em < p.fim_ts
                  AND ar.status = 'verificado')::int` },
    ];

    return this.db.asUser(user.id, async (c) => {
      const tem = await this.existentes(c, opcionais.map((o) => o.tabela));
      const extras = opcionais.filter((o) => tem.has(o.tabela));
      const { rows: [r] } = await c.query(
        // Defeito 7: a janela do mês era cortada no fuso do SERVIDOR.
        //
        // `happened_at >= '2026-08-01'` compara timestamptz com date, e o
        // Postgres promove a date usando o TimeZone da sessão. Com o servidor
        // em UTC, agosto passava a começar às 21h do dia 31 de julho em Porto
        // Alegre: a ocorrência registrada naquela noite entrava no mês
        // seguinte e sumia do mês em que aconteceu. Três horas em cada ponta,
        // todo mês, sempre no plantão noturno — o turno que mais registra.
        //
        // As fronteiras chegam prontas do kernel (janelaDoMes), já em instante
        // UTC: o banco não precisa saber onde fica a instituição. `ini`/`fim`
        // seguem em date para as colunas que são date (period_start, on_date).
        `WITH p AS (SELECT $2::date AS ini, ($2::date + interval '1 month')::date AS fim,
                           $3::timestamptz AS ini_ts, $4::timestamptz AS fim_ts)
         SELECT
           (SELECT count(*) FROM house_stay s
             WHERE s.house_id = $1 AND s.status = 'ativa')::int AS ativos,
           (SELECT count(*) FROM house_stay s, p
             WHERE s.house_id = $1 AND s.started_at >= p.ini_ts AND s.started_at < p.fim_ts)::int AS entradas,
           (SELECT count(*) FROM house_stay s, p
             WHERE s.house_id = $1 AND s.ended_at >= p.ini_ts AND s.ended_at < p.fim_ts)::int AS saidas
           ${extras.map((o) => `, ${o.sql} AS "${o.chave}"`).join('')}
           FROM p`,
        [houseId, janela.primeiroDia, janela.inicio.toISOString(), janela.fim.toISOString()]);

      return {
        mes,
        ocupacao: { ativosHoje: r.ativos },
        fluxo: { entradas: r.entradas, saidas: r.saidas },
        ocorrências: r.ocorrências ?? null,
        acompanhamentos: {
          aprovados: r.acompanhamentosAprovados ?? null,
          abertos: r.acompanhamentosAbertos ?? null,
        },
        atasFechadas: r.atasFechadas ?? null,
        documentosArquivados: r.documentosArquivados ?? null,
        nota: 'Contagens do mês. Nenhum número aqui classifica casas, equipes ou acolhidos, e ausência de registro não é fato negativo (§3.3, §14.6).',
      };
    });
  }
}
