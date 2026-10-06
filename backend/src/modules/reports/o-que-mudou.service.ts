import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { ROTULO_DA_CATEGORIA } from './periodo.service';
import { QUEM_LE_O_QUE_MUDOU } from './o-que-mudou.regra';

/**
 * O QUE MUDOU DESDE O MEU ÚLTIMO PLANTÃO (fase 186, ideia 1 de 30/09;
 * o que entra decidido em 05/10: ocorrências, a ATA anterior e remédio novo,
 * suspenso ou mudado).
 *
 * Quem volta de dois dias de folga precisava ler a passagem, as ocorrências e
 * a saúde para saber o que mudou na casa. Esta folha junta o que já está
 * registrado, sem inteligência artificial, e SEM NADA que a pessoa não pudesse
 * ler de qualquer jeito: toda consulta roda com a identidade dela, e o banco
 * filtra pelo cargo e pela casa como em qualquer outra tela.
 *
 * DESDE QUANDO: o fim do último turno dela na escala desta casa, nas duas
 * últimas semanas. Quem não está na escala (a técnica, a coordenação) vê as
 * últimas 24 horas. E nunca mais de sete dias para trás: de férias, a folha
 * viraria um relatório, e o relatório já existe (o período da casa).
 *
 * O QUE ELA NÃO TRAZ, de propósito: o texto da ocorrência, o motivo da
 * suspensão de um remédio e qualquer linha restrita da ATA. A folha avisa e
 * aponta; o detalhe se lê na tela de cada coisa, que registra quem abriu o
 * que precisa ser registrado.
 */

const SITUACAO: Record<string, string> = {
  aberta: 'aberta', em_acompanhamento: 'em acompanhamento', reaberta: 'reaberta',
  encerrada_operacional: 'encerrada pelo plantão', aguardando_revisao_tecnica: 'esperando a técnica',
  fechada: 'fechada',
};

export interface OQueMudou {
  desde: string;
  base: 'plantao' | 'ultimas_24h';
  /** Quando o último plantão foi há mais de sete dias, a folha começa sete dias atrás. */
  limitado: boolean;
  ocorrencias: { id: string; rotulo: string; quando: string; situacao: string; restrita: boolean; criancas: string | null }[];
  ata: null | {
    data: string; turno: string; situacao: string; fechadaPor: string | null;
    pendencias: string | null; linhas: number;
    ultimas: { quem: string | null; quando: string; texto: string }[];
  };
  remedios: { tipo: 'novo' | 'suspenso' | 'terminou' | 'so_enfermagem' | 'liberado'; crianca: string;
    medicamento: string; dose: string | null; quando: string }[];
}

@Injectable()
export class OQueMudouService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async desdeOMeuPlantao(user: AuthenticatedUser, houseId: string): Promise<OQueMudou> {
    /* alcance:o_que_mudou — quem trabalha no plantão da casa. */
    if (!QUEM_LE_O_QUE_MUDOU.includes(user.role)) {
      throw new ForbiddenException('Esta folha é de quem trabalha no plantão da casa.');
    }
    return this.db.asUser(user.id, async (c) => {
      const { rows: [d] } = await c.query(
        `SELECT max(j.ate) AS ate
           FROM shift_assignment a
          CROSS JOIN LATERAL app_janela_do_turno(a.house_id, a.on_date, a.period) j
          WHERE a.user_id = app_current_user() AND a.house_id = $1 AND a.revoked_at IS NULL
            AND a.on_date >= app_hoje() - 14 AND j.ate <= now()`, [houseId]);
      const agora = Date.now();
      const fimDoPlantao = d?.ate ? new Date(d.ate).getTime() : null;
      const base: OQueMudou['base'] = fimDoPlantao ? 'plantao' : 'ultimas_24h';
      const semana = agora - 7 * 86_400_000;
      const inicio = fimDoPlantao ?? agora - 86_400_000;
      const desde = new Date(Math.max(inicio, semana)).toISOString();

      const { rows: oc } = await c.query(
        `SELECT i.id, i.category, i.happened_at, i.status, i.access_level,
                CASE WHEN i.access_level = 'restrito' THEN NULL ELSE
                  -- rls-join-ok (person): a criança da ocorrência é da mesma casa, que já
                  -- passou pela pergunta de alcance; o nome que o cargo não lê fica de fora.
                  (SELECT string_agg(coalesce(p.social_name, p.full_name), ', ' ORDER BY p.full_name)
                     FROM incident_person ip JOIN person p ON p.id = ip.person_id
                    WHERE ip.incident_id = i.id) END AS criancas
           FROM incident i
          WHERE i.house_id = $1 AND i.opened_at > $2
          ORDER BY i.happened_at`, [houseId, desde]);

      const { rows: [anterior] } = await c.query(`SELECT shift_id FROM app_ata_anterior($1, now())`, [houseId]);
      let ata: OQueMudou['ata'] = null;
      if (anterior?.shift_id) {
        const { rows: [a] } = await c.query(
          `SELECT a.id, a.on_date, a.period, a.status, a.pendencies, app_user_display_name(a.closed_by) AS fechou,
                  (SELECT count(*)::int FROM ata_note n WHERE n.ata_id = a.id AND NOT n.restricted) AS linhas
             FROM ata a WHERE a.shift_id = $1`, [anterior.shift_id]);
        if (a) {
          const { rows: ultimas } = await c.query(
            `SELECT app_user_display_name(n.author_id) AS quem, coalesce(n.happened_at, n.created_at) AS quando,
                    left(n.body, 240) AS texto
               FROM ata_note n WHERE n.ata_id = $1 AND NOT n.restricted
              ORDER BY coalesce(n.happened_at, n.created_at) DESC LIMIT 3`, [a.id]);
          ata = {
            data: a.on_date, turno: a.period,
            situacao: a.status === 'rascunho' ? 'ainda aberta'
              : a.status === 'fechada_com_pendencia' ? 'fechada com pendência' : a.status === 'reaberta' ? 'reaberta' : 'fechada',
            fechadaPor: a.fechou, pendencias: a.pendencies?.trim() || null, linhas: a.linhas,
            ultimas: ultimas.map((u) => ({ quem: u.quem, quando: u.quando, texto: u.texto })),
          };
        }
      }

      const { rows: rem } = await c.query(
        `SELECT x.*, coalesce(pe.social_name, pe.full_name) AS crianca FROM (
           SELECT 'novo' AS tipo, p.person_id, p.medication, p.dose, coalesce(p.signed_at, p.created_at) AS quando
             FROM prescription p
            WHERE p.house_id = $1 AND p.status = 'ativa' AND coalesce(p.signed_at, p.created_at) > $2
           UNION ALL
           SELECT 'suspenso', p.person_id, p.medication, p.dose, p.suspended_at
             FROM prescription p
            WHERE p.house_id = $1 AND p.suspended_at > $2
           UNION ALL
           SELECT 'terminou', p.person_id, p.medication, p.dose, (p.ends_on + 1)::timestamp AT TIME ZONE app_fuso()
             FROM prescription p
            WHERE p.house_id = $1 AND p.status = 'ativa' AND p.ends_on IS NOT NULL
              AND p.ends_on >= ($2::timestamptz AT TIME ZONE app_fuso())::date AND p.ends_on < app_hoje()
           UNION ALL
           SELECT CASE WHEN r.is_nurse_only THEN 'so_enfermagem' ELSE 'liberado' END,
                  p.person_id, p.medication, p.dose, r.changed_at
             -- rls-join-ok (prescription): a mudança só aparece se o cargo lê o remédio;
             -- sumir aqui é o certo, e não o defeito da 152.
             FROM prescription_restriction_change r JOIN prescription p ON p.id = r.prescription_id
            WHERE r.house_id = $1 AND r.changed_at > $2
         ) x
         -- rls-join-ok (person): o nome da criança do remédio que o cargo já leu, da mesma casa.
         JOIN person pe ON pe.id = x.person_id
         ORDER BY coalesce(pe.social_name, pe.full_name), x.quando`, [houseId, desde]);

      return {
        desde, base, limitado: inicio < semana,
        ocorrencias: oc.map((o) => ({
          id: o.id,
          rotulo: o.access_level === 'restrito' ? 'Ocorrência de acesso restrito' : (ROTULO_DA_CATEGORIA[o.category] ?? 'Ocorrência'),
          quando: o.happened_at, situacao: SITUACAO[o.status] ?? o.status,
          restrita: o.access_level === 'restrito', criancas: o.criancas,
        })),
        ata,
        remedios: rem.map((r) => ({
          tipo: r.tipo, crianca: r.crianca, medicamento: r.medication,
          dose: r.dose, quando: r.quando instanceof Date ? r.quando.toISOString() : String(r.quando),
        })),
      };
    });
  }
}
