import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * OS NÚMEROS DE UMA CRIANÇA, NO PERFIL DELA (fase 221, pedido de 14/10).
 *
 * "Olha como um psicólogo, como um coordenador, como a equipe técnica": o
 * perfil é ferramenta de trabalho com aquela criança, e cada aba precisa
 * dizer, em número, como ela está. Esta rota junta o que estava espalhado
 * em seis setores (acolhimento, remédio, saúde, internação, família e vida
 * na casa) numa leitura só.
 *
 * TRÊS CUIDADOS:
 *
 *  * **os números são DELA e de mais ninguém.** Nenhuma média da casa, nenhuma
 *    posição entre as crianças: a regra de 26/09 é "nenhuma comparação entre
 *    crianças", e a contagem de uma criança existe só no perfil dela;
 *  * **toda consulta roda com a identidade de quem pede.** O banco filtra pelo
 *    cargo e pela casa como em qualquer tela. Onde o cargo NÃO lê (a internação
 *    para quem não acompanhou), a resposta é `null`, e não zero: zero diria
 *    "nunca foi internada" a quem só não pode saber (a lição da 158);
 *  * **cada tabela é opcional** (`to_regclass`), como no painel: remover um
 *    módulo tira o número, não derruba o perfil.
 *
 * O que já tem rota própria fica nela e a tela lê de lá: as visitas
 * (`/people/:id/visitas`), as chamadas e refeições (`/checks/person/:id`) e
 * os atendimentos da equipe técnica (`/people/:id/technical-sessions`).
 */

/** Quem lê a internação de qualquer criança da casa (a política `int_select`). */
const LE_INTERNACAO = ['equipe_tecnica', 'coordenador', 'gestor_geral', 'lider_diurno',
  'lider_noturno_geral', 'enfermagem'];
/** Quem lê o PIA no dossiê: a equipe técnica, a coordenação e a gestão. */
const LE_PIA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

export interface NumerosDaCrianca {
  geral: {
    acolhidaDesde: string | null;
    diasNoAcolhimento: number | null;
    episodio: number | null;
    episodios: number;
    casaDesde: string | null;
    diasNaCasa: number | null;
    casasNesteAcolhimento: number;
    /** O PIA mais recente com validade; `null` para quem não lê o PIA. */
    pia: { vence: string | null; dias: number | null } | null;
  };
  saude: {
    remediosEmUso: number;
    doses30: { previstas: number; noHorario: number; foraDoHorario: number;
               naoDadas: number; semConfirmacao: number; ausente: number };
    atendimentos90: number;
    ultimoAtendimento: { dia: string; tipo: string } | null;
    proximoRetorno: string | null;
    /** `null` para quem não lê a internação desta criança. */
    internacoes: { total: number; agora: boolean; ultima: string | null } | null;
  };
  familia: {
    convivencias90: number;
    comAFamiliaAgora: boolean;
    saidas30: number;
  };
  vida: {
    conquistas: number;
    ultimaConquista: { dia: string; tipo: string } | null;
    fotosEmQueAparece: number;
  };
}

@Injectable()
export class NumerosDaCriancaService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async daCrianca(user: AuthenticatedUser, personId: string): Promise<NumerosDaCrianca> {
    return this.db.asUser(user.id, async (c) => {
      const { rows: tabs } = await c.query(
        `SELECT t FROM unnest($1::text[]) t WHERE to_regclass('public.' || t) IS NOT NULL`,
        [['medication_administration', 'prescription', 'health_evolution', 'hospitalization',
          'family_stay', 'child_outing', 'life_milestone', 'memory_photo_person', 'document']]);
      const tem = new Set(tabs.map((r: any) => r.t as string));
      const um = async (sql: string, p: unknown[] = [personId]) => (await c.query(sql, p)).rows[0] ?? {};

      /* A criança, pelo alcance de quem pede: fora dele, ela não existe. */
      const ep = await um(
        `SELECT e.number, (e.started_at AT TIME ZONE app_fuso())::date::text AS desde,
                (app_hoje() - (e.started_at AT TIME ZONE app_fuso())::date) AS dias,
                (SELECT count(*)::int FROM care_episode x WHERE x.person_id = $1) AS episodios,
                (SELECT count(*)::int FROM house_stay s WHERE s.episode_id = e.id) AS casas,
                (SELECT (s.started_at AT TIME ZONE app_fuso())::date::text FROM house_stay s
                  WHERE s.person_id = $1 AND s.status = 'ativa' LIMIT 1) AS casa_desde
           FROM care_episode e
          WHERE e.person_id = $1
          ORDER BY (e.status = 'ativo') DESC, e.started_at DESC LIMIT 1`);
      if (!ep.number) throw new NotFoundException('Acolhido não encontrado, ou fora do seu alcance.');
      const { hoje } = await um(`SELECT app_hoje()::text AS hoje`, []);
      /* Dias entre duas datas AAAA-MM-DD, ao meio-dia para o horário de verão não morder. */
      const entre = (de: string, ate: string) =>
        Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

      let pia: NumerosDaCrianca['geral']['pia'] = null;
      if (LE_PIA.includes(user.role) && tem.has('document')) {
        const r = await um(
          `SELECT max(valid_until)::text AS vence FROM document
            WHERE person_id = $1 AND checklist_key = 'pia'`);
        /* `dias` negativo é PIA vencido: a tela diz "venceu há", nunca esconde. */
        pia = { vence: r.vence ?? null, dias: r.vence ? entre(hoje, r.vence) : null };
      }

      const doses = tem.has('medication_administration') ? await um(
        `SELECT count(*)::int AS previstas,
                count(*) FILTER (WHERE state = 'administrado_no_horario')::int AS no_horario,
                count(*) FILTER (WHERE state = 'administrado_com_atraso')::int AS fora,
                count(*) FILTER (WHERE state IN ('recusado', 'nao_administrado', 'indisponivel', 'incidente'))::int AS nao_dadas,
                count(*) FILTER (WHERE state = 'aguardando_confirmacao')::int AS sem_confirmacao,
                count(*) FILTER (WHERE state = 'acolhido_ausente')::int AS ausente
           FROM medication_administration
          WHERE person_id = $1 AND scheduled_at <= now()
            AND (scheduled_at AT TIME ZONE app_fuso())::date > app_hoje() - 30`) : {};
      const remedios = tem.has('prescription') ? await um(
        `SELECT count(*)::int AS n FROM prescription
          WHERE person_id = $1 AND status = 'ativa' AND (ends_on IS NULL OR ends_on >= app_hoje())`) : {};
      const saude = tem.has('health_evolution') ? await um(
        `SELECT count(*) FILTER (WHERE (happened_at AT TIME ZONE app_fuso())::date > app_hoje() - 90)::int AS n90,
                (SELECT (h.happened_at AT TIME ZONE app_fuso())::date::text || '|' || h.kind::text
                   FROM health_evolution h WHERE h.person_id = $1 AND h.status <> 'rascunho'
                  ORDER BY h.happened_at DESC LIMIT 1) AS ultimo,
                min(return_deadline) FILTER (WHERE return_deadline >= app_hoje())::text AS retorno
           FROM health_evolution WHERE person_id = $1 AND status <> 'rascunho'`) : {};
      let internacoes: NumerosDaCrianca['saude']['internacoes'] = null;
      if (LE_INTERNACAO.includes(user.role) && tem.has('hospitalization')) {
        const r = await um(
          `SELECT count(*)::int AS total, bool_or(ended_at IS NULL) AS agora,
                  max((started_at AT TIME ZONE app_fuso())::date)::text AS ultima
             FROM hospitalization WHERE person_id = $1`);
        internacoes = { total: r.total ?? 0, agora: !!r.agora, ultima: r.ultima ?? null };
      }

      const familia = tem.has('family_stay') ? await um(
        `SELECT count(*) FILTER (WHERE (started_at AT TIME ZONE app_fuso())::date > app_hoje() - 90)::int AS n90,
                bool_or(status = 'em_andamento') AS agora
           FROM family_stay WHERE person_id = $1`) : {};
      const saidas = tem.has('child_outing') ? await um(
        `SELECT count(*)::int AS n FROM child_outing
          WHERE person_id = $1 AND (left_at AT TIME ZONE app_fuso())::date > app_hoje() - 30`) : {};

      const marcos = tem.has('life_milestone') ? await um(
        `SELECT count(*)::int AS n,
                (SELECT happened_on::text || '|' || coalesce(kind_other, kind) FROM life_milestone m
                  WHERE m.person_id = $1 ORDER BY happened_on DESC, registered_at DESC LIMIT 1) AS ultimo
           FROM life_milestone WHERE person_id = $1`) : {};
      const fotos = tem.has('memory_photo_person') ? await um(
        `SELECT count(*)::int AS n FROM memory_photo_person WHERE person_id = $1 AND removed_at IS NULL`) : {};

      const partes = (s: string | null | undefined) => (s ? s.split('|') : null);
      const ultimoAt = partes(saude.ultimo);
      const ultimoMarco = partes(marcos.ultimo);
      return {
        geral: {
          acolhidaDesde: ep.desde ?? null,
          diasNoAcolhimento: ep.dias ?? null,
          episodio: ep.number ?? null,
          episodios: ep.episodios ?? 0,
          casaDesde: ep.casa_desde ?? null,
          diasNaCasa: ep.casa_desde ? entre(ep.casa_desde, hoje) : null,
          casasNesteAcolhimento: ep.casas ?? 0,
          pia,
        },
        saude: {
          remediosEmUso: remedios.n ?? 0,
          doses30: {
            previstas: doses.previstas ?? 0, noHorario: doses.no_horario ?? 0,
            foraDoHorario: doses.fora ?? 0, naoDadas: doses.nao_dadas ?? 0,
            semConfirmacao: doses.sem_confirmacao ?? 0, ausente: doses.ausente ?? 0,
          },
          atendimentos90: saude.n90 ?? 0,
          ultimoAtendimento: ultimoAt ? { dia: ultimoAt[0], tipo: ultimoAt[1] } : null,
          proximoRetorno: saude.retorno ?? null,
          internacoes,
        },
        familia: {
          convivencias90: familia.n90 ?? 0,
          comAFamiliaAgora: !!familia.agora,
          saidas30: saidas.n ?? 0,
        },
        vida: {
          conquistas: marcos.n ?? 0,
          ultimaConquista: ultimoMarco ? { dia: ultimoMarco[0], tipo: ultimoMarco[1] } : null,
          fotosEmQueAparece: fotos.n ?? 0,
        },
      };
    });
  }
}
