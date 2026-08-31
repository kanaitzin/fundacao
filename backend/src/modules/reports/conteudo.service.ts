import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { inicioDoDiaNaInstituicao } from '../../kernel/common/tempo';

/**
 * O QUE VAI DENTRO DO RELATÓRIO.
 *
 * Antes desta partição o relatório nascia vazio. A equipe técnica abria o
 * documento e encontrava um formulário em branco, tendo que digitar à mão o
 * que o sistema inteiro já sabia: quantas atividades aconteceram, quais doses
 * foram confirmadas, o que ficou pendente. Na prática isso empurrava a pessoa
 * de volta para o caderno, que era exatamente o que o Rede Acolher veio
 * substituir.
 *
 * Agora o sistema escreve a parte factual e a pessoa escreve a parte que só
 * ela pode escrever. A divisão importa:
 *
 *   * o SISTEMA conta o que aconteceu, com números e horários, e diz de onde
 *     tirou cada coisa. Nunca interpreta, nunca conclui, nunca avalia ninguém;
 *   * a PESSOA escreve a leitura técnica, a avaliação e o encaminhamento.
 *     Esses campos vêm em branco de propósito, e o documento diz que estão
 *     esperando alguém.
 *
 * Toda seção carrega a fonte. Numa audiência, "o sistema registrou 42
 * atividades no período" e "a técnica avalia que houve progresso" são frases
 * de peso muito diferente, e quem lê precisa saber qual é qual sem perguntar.
 *
 * O que este arquivo NUNCA faz: contar por educador, ordenar pessoas,
 * pontuar comportamento ou classificar criança. Um relatório que mostrasse
 * "quem registrou menos" viraria instrumento de cobrança na primeira reunião,
 * e equipe cobrada registra menos, não mais.
 */

export interface Secao {
  titulo: string;
  texto: string;
  fonte?: string;
  aPreencher?: boolean;
}

/** Espaços que só uma pessoa pode preencher, por tipo de relatório. */
const CAMPOS_DA_PESSOA: Record<string, string[]> = {
  judiciario: [
    'Situação atual do acolhimento',
    'Trabalho desenvolvido com a família',
    'Avaliação técnica',
    'Encaminhamentos e sugestões ao Juízo',
  ],
  audiencia: [
    'Síntese do período',
    'Avaliação técnica',
    'Encaminhamentos',
  ],
  mensal: ['Leitura do mês', 'Encaminhamentos'],
  semanal: ['Leitura da semana'],
  individual: ['Avaliação técnica', 'Encaminhamentos'],
  historico: ['Síntese institucional'],
  saude: ['Avaliação da Enfermagem'],
  reuniao_tecnica: ['Pauta', 'Deliberações', 'Responsáveis e prazos'],
  mensal_da_casa: ['Leitura da coordenação', 'Necessidades da unidade'],
  desenvolvimento: [
    'Leitura da equipe técnica sobre o período',
    'O que a criança demonstrou querer',
    'Encaminhamentos e próximos passos',
  ],
};

/**
 * Como a categoria da ocorrência aparece no papel.
 *
 * A lista existe em `incidents`, e importá-la de lá criaria dependência de
 * `reports` para `incidents`: remover o módulo de ocorrências passaria a
 * quebrar os relatórios, contra a regra das partições isoladas. Então o
 * rótulo é traduzido aqui, para leitura, e quem não estiver na lista cai no
 * embelezador abaixo. Duplicar texto de exibição custa menos do que amarrar
 * dois módulos.
 */
const CATEGORIA_LEGIVEL: Record<string, string> = {
  saida_nao_autorizada: 'Saída não autorizada',
  violencia_suspeita: 'Violência ou suspeita de violência',
  contencao: 'Contenção',
  erro_medicamento: 'Erro de medicamento',
  emergencia_saude: 'Emergência de saúde',
  autolesao: 'Autolesão',
  conflito: 'Conflito entre acolhidos',
  dano_patrimonial: 'Dano ao patrimônio',
  outro: 'Outro',
};

/** Sem acento não fica bonito, mas fica legível, e nunca some do documento. */
function categoria(cod: string): string {
  if (CATEGORIA_LEGIVEL[cod]) return CATEGORIA_LEGIVEL[cod];
  const t = String(cod).replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Lista em frase, com "e" antes do último.
 *
 * O documento é lido em voz alta em audiência com alguma frequência. Uma
 * enumeração corrida se lê; uma lista de marcadores, não.
 */
function emFrase(itens: string[]): string {
  const l = itens.filter(Boolean);
  if (!l.length) return '';
  if (l.length === 1) return l[0];
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}

const F = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
});
const FH = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
  hour: '2-digit', minute: '2-digit',
});
const data = (d: Date | string) => F.format(new Date(d));
const dataHora = (d: Date | string) => FH.format(new Date(d));

@Injectable()
export class ConteudoService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * Monta as seções do relatório.
   *
   * As datas viram instantes pelo kernel, no fuso da instituição: comparar uma
   * data solta com coluna `timestamptz` faria o período começar às 21h do dia
   * anterior, e o relatório de agosto contaria a noite de 31 de julho.
   */
  async montar(user: AuthenticatedUser, params: {
    kind: string; houseId?: string | null; personId?: string | null;
    de: string; ate: string;
  }): Promise<Secao[]> {
    const ini = inicioDoDiaNaInstituicao(params.de).toISOString();
    // O último dia entra inteiro: a janela vai até o começo do dia seguinte.
    const fim = inicioDoDiaNaInstituicao(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
        .format(new Date(new Date(`${params.ate}T12:00:00Z`).getTime() + 86400_000)),
    ).toISOString();

    const secoes: Secao[] = [];
    const pessoa = params.personId ?? null;
    const casa = params.houseId ?? null;

    await this.db.asUser(user.id, async (c) => {
      // ---------- Identificação do acolhido ----------
      if (pessoa) {
        const { rows: [p] } = await c.query(
          // rls-join-ok: `person` e `house` seguem a mesma política de escopo
          // do usuário. Se ele não alcança a criança, a linha não vem; se
          // alcança, a permanência ativa dela é da casa que ele já enxerga.
          // O nome sai pela função de rótulo mínimo, não da coluna crua.
          `SELECT app_person_display_name(p.id) AS nome, p.birth_date,
                  e.number AS episodio, e.started_at,
                  h.code AS casa_codigo, h.name AS casa_nome
             FROM person p
             LEFT JOIN care_episode e ON e.person_id = p.id AND e.status = 'ativo'
             LEFT JOIN house_stay s ON s.episode_id = e.id AND s.status = 'ativa'
             -- rls-join-ok: a casa vem da permanência ATIVA da criança que
             -- este usuário já alcança; sem alcance, a linha nem chega aqui.
             LEFT JOIN house h ON h.id = s.house_id
            WHERE p.id = $1`, [pessoa]);
        if (p) {
          const idade = p.birth_date
            ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / 31557600000)
            : null;
          secoes.push({
            titulo: 'Identificação',
            fonte: 'cadastro do acolhido',
            texto: [
              `Nome: ${p.nome}`,
              idade !== null ? `Idade: ${idade} anos` : null,
              p.casa_codigo ? `Unidade: ${p.casa_codigo} ${p.casa_nome}` : null,
              p.episodio ? `Acolhimento nº ${p.episodio}, desde ${data(p.started_at)}` : null,
            ].filter(Boolean).join('\n'),
          });
        }
      }

      // ---------- Atividades ----------
      if (['diario', 'semanal', 'mensal', 'periodo', 'individual', 'atividades',
           'judiciario', 'audiencia', 'mensal_da_casa', 'historico', 'desenvolvimento'].includes(params.kind)) {
        const { rows: [t] } = await c.query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE state IN ('concluida_no_horario','concluida_com_atraso'))::int AS concluidas,
                  count(*) FILTER (WHERE state = 'sem_confirmacao')::int AS sem_confirmacao,
                  count(*) FILTER (WHERE state::text LIKE 'nao_realizada%')::int AS nao_realizadas
             FROM activity a
            WHERE a.scheduled_at >= $1 AND a.scheduled_at < $2
              AND ($3::uuid IS NULL OR a.house_id = $3)
              AND ($4::uuid IS NULL OR a.person_id = $4)`,
          [ini, fim, casa, pessoa]);

        if (t && t.total === 0) {
          // Seção que some é seção que ninguém sabe que existia. "Não houve"
          // é uma informação; a falta da seção é uma dúvida.
          secoes.push({
            titulo: 'Atividades e rotina',
            fonte: 'registros de atividade do período',
            texto: 'Não há atividades registradas no período consultado. '
                 + 'Confira as datas e a unidade antes de concluir que nada aconteceu.',
          });
        }
        if (t && t.total > 0) {
          // Contagem por SITUAÇÃO, nunca por pessoa da equipe. "Sem confirmação"
          // é falta de registro, não afirmação de que a atividade não ocorreu.
          const linhas = [
            `Atividades previstas no período: ${t.total}`,
            `Concluídas: ${t.concluidas}`,
            t.nao_realizadas > 0 ? `Não realizadas, com justificativa: ${t.nao_realizadas}` : null,
            t.sem_confirmacao > 0
              ? `Sem confirmação: ${t.sem_confirmacao}. O sistema constata ausência de registro; `
                + 'não afirma que a atividade deixou de acontecer.'
              : null,
          ].filter(Boolean);

          const { rows: excecoes } = await c.query(
            `SELECT a.title, a.scheduled_at, a.state, a.exception_note
               FROM activity a
              WHERE a.scheduled_at >= $1 AND a.scheduled_at < $2
                AND ($3::uuid IS NULL OR a.house_id = $3)
                AND ($4::uuid IS NULL OR a.person_id = $4)
                AND a.state::text LIKE 'nao_realizada%'
              ORDER BY a.scheduled_at LIMIT 30`, [ini, fim, casa, pessoa]);
          if (excecoes.length) {
            linhas.push('', 'O que não aconteceu, e por quê:');
            for (const e of excecoes) {
              linhas.push(`${data(e.scheduled_at)} ${e.title}. ${e.exception_note ?? 'Sem justificativa registrada.'}`);
            }
          }
          secoes.push({
            titulo: 'Atividades e rotina',
            fonte: 'registros de atividade do período',
            texto: linhas.join('\n'),
          });
        }
      }

      // ---------- Saúde e medicação ----------
      if (['individual', 'mensal', 'judiciario', 'audiencia', 'saude', 'medicamentos',
           'historico', 'desenvolvimento'].includes(params.kind)) {
        const { rows: [m] } = await c.query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE ma.state::text LIKE 'administrado%')::int AS confirmadas,
                  count(*) FILTER (WHERE ma.state::text = 'sem_confirmacao')::int AS sem_confirmacao,
                  count(*) FILTER (WHERE ma.state::text = 'recusado')::int AS recusadas
             FROM medication_administration ma
            WHERE ma.scheduled_at >= $1 AND ma.scheduled_at < $2
              AND ($3::uuid IS NULL OR ma.house_id = $3)
              AND ($4::uuid IS NULL OR ma.person_id = $4)`,
          [ini, fim, casa, pessoa]);
        const { rows: atendimentos } = await c.query(
          `SELECT he.happened_at, he.kind, he.place, he.specialty, he.reason, he.outcome
             FROM health_encounter he
            WHERE he.happened_at >= $1 AND he.happened_at < $2
              AND ($3::uuid IS NULL OR he.house_id = $3)
              AND ($4::uuid IS NULL OR he.person_id = $4)
            ORDER BY he.happened_at LIMIT 40`, [ini, fim, casa, pessoa]);

        if ((m && m.total > 0) || atendimentos.length) {
          const linhas: string[] = [];
          if (m && m.total > 0) {
            linhas.push(`Doses previstas: ${m.total}. Confirmadas: ${m.confirmadas}.`);
            if (m.recusadas > 0) {
              linhas.push(`Recusadas pelo acolhido: ${m.recusadas}. A recusa é registro do que `
                + 'aconteceu, e não falta de quem cuidou.');
            }
            if (m.sem_confirmacao > 0) {
              linhas.push(`Sem confirmação: ${m.sem_confirmacao}. Falta de registro, `
                + 'não afirmação de que a dose deixou de ser dada.');
            }
          }
          if (atendimentos.length) {
            linhas.push('', 'Atendimentos de saúde no período:');
            for (const a of atendimentos) {
              linhas.push(`${data(a.happened_at)} ${a.kind}`
                + `${a.specialty ? `, ${a.specialty}` : ''}${a.place ? `, ${a.place}` : ''}. `
                + `${a.reason ?? ''} ${a.outcome ?? ''}`.trim());
            }
          }
          secoes.push({
            titulo: 'Saúde e medicação',
            fonte: 'prescrições, administrações e atendimentos registrados',
            texto: linhas.join('\n'),
          });
        }
      }

      // ---------- Ocorrências ----------
      if (['diario', 'periodo', 'ocorrencias', 'judiciario', 'audiencia', 'individual',
           'mensal_da_casa', 'mensal', 'historico', 'desenvolvimento'].includes(params.kind)) {
        const { rows: ocs } = await c.query(
          `SELECT i.happened_at, i.category, i.status, i.access_level,
                  i.objective_fact, i.pendencies
             FROM incident i
            WHERE i.happened_at >= $1 AND i.happened_at < $2
              AND ($3::uuid IS NULL OR i.house_id = $3)
              AND ($4::uuid IS NULL OR EXISTS (
                    SELECT 1 FROM incident_person ip
                     WHERE ip.incident_id = i.id AND ip.person_id = $4))
            ORDER BY i.happened_at LIMIT 40`, [ini, fim, casa, pessoa]);
        if (!ocs.length) {
          secoes.push({
            titulo: 'Ocorrências',
            fonte: 'livro de ocorrências da unidade',
            texto: 'Não há ocorrências registradas no período consultado.',
          });
        }
        if (ocs.length) {
          /*
           * O relato da ocorrência restrita NÃO entra no relatório.
           *
           * A ocorrência marcada como restrita tem detalhe que foi guardado
           * sob acesso próprio, e um relatório circula: vai por e-mail, é
           * impresso, fica em cima de uma mesa. Sai a categoria, a data e a
           * situação, que é o que dá o quadro; quem precisar do inteiro teor
           * abre a ocorrência e responde pelo acesso dela.
           */
          const linhas = ocs.map((o) => {
            const cabeca = `${dataHora(o.happened_at)} ${categoria(o.category)}. `
              + `Situação: ${o.status === 'aberta' ? 'em acompanhamento' : 'encerrada'}.`;
            return o.access_level === 'restrito'
              ? `${cabeca} Relato sob acesso restrito; consulte a ocorrência.`
              : `${cabeca} ${o.objective_fact ?? ''}`.trim();
          });
          const abertas = ocs.filter((o) => o.status === 'aberta').length;
          if (abertas > 0) {
            linhas.push('', `${abertas} ocorrência(s) seguem em acompanhamento nesta data.`);
          }
          secoes.push({
            titulo: 'Ocorrências',
            fonte: 'ocorrências registradas no período',
            texto: linhas.join('\n'),
          });
        }
      }

      // ---------- Acompanhamentos aprovados ----------
      if (['judiciario', 'audiencia', 'individual', 'mensal', 'historico', 'desenvolvimento'].includes(params.kind) && pessoa) {
        const { rows: fus } = await c.query(
          `SELECT f.period_start, f.period_end, f.kind,
                  f.axis_health, f.axis_school, f.axis_coexistence, f.axis_family
             FROM followup f
            WHERE f.person_id = $1 AND f.status = 'aprovado'
              AND f.period_end >= $2::date AND f.period_start <= $3::date
            ORDER BY f.period_start LIMIT 12`, [pessoa, params.de, params.ate]);
        if (fus.length) {
          const blocos: string[] = [];
          for (const f of fus) {
            blocos.push(`Período de ${data(f.period_start)} a ${data(f.period_end)}:`);
            for (const [rot, val] of [
              ['Saúde, alimentação e medicamentos', f.axis_health],
              ['Escola, cursos e atividades', f.axis_school],
              ['Convivência e desenvolvimento', f.axis_coexistence],
              ['Família e vínculos', f.axis_family],
            ] as [string, string | null][]) {
              if (val && val.trim()) blocos.push(`${rot}: ${val.trim()}`);
            }
            blocos.push('');
          }
          secoes.push({
            titulo: 'Acompanhamento técnico do período',
            fonte: 'acompanhamentos já aprovados, transcritos sem alteração',
            texto: blocos.join('\n').trim(),
          });
        }
      }

      // ---------- Alimentação e restrições ----------
      if (['alimentacao', 'individual', 'saude', 'desenvolvimento'].includes(params.kind)) {
        const { rows: rest } = await c.query(
          `SELECT app_person_display_name(fr.person_id) AS nome, fr.restriction,
                  fr.substitution, fr.guidance
             FROM food_restriction fr
            WHERE fr.active
              AND ($1::uuid IS NULL OR fr.person_id = $1)
              AND ($2::uuid IS NULL OR EXISTS (
                    SELECT 1 FROM house_stay s
                     WHERE s.person_id = fr.person_id AND s.house_id = $2 AND s.status = 'ativa'))
            ORDER BY nome LIMIT 60`, [pessoa, casa]);
        if (rest.length) {
          secoes.push({
            titulo: 'Restrições alimentares',
            fonte: 'cadastro de saúde',
            texto: rest.map((r) => [
              `${r.nome}: ${r.restriction}`,
              r.substitution ? `Substituir por: ${r.substitution}` : null,
              r.guidance ? `Orientação: ${r.guidance}` : null,
            ].filter(Boolean).join(' ')).join('\n'),
          });
        }
      }

      // ---------- Linha do tempo corrida ----------
      /*
       * O mesmo período, agora em ordem cronológica e num bloco só.
       *
       * As seções acima separam por assunto, e isso serve para conferir cada
       * coisa. Mas quando a coordenação quer entender uma semana difícil, ela
       * lê em ordem: a consulta de terça, a ocorrência de terça à noite, a
       * dose recusada na quarta de manhã. Separadas por assunto, as três
       * parecem três fatos independentes; em ordem, viram uma história, e é a
       * história que explica o que houve com aquela criança.
       *
       * Fica limitada a 120 linhas: acima disso o relatório vira listagem, e
       * listagem ninguém lê. Quando corta, o documento avisa que cortou, em
       * vez de deixar quem lê achando que aquilo é tudo.
       */
      if (['desenvolvimento', 'individual', 'judiciario', 'audiencia', 'periodo',
           'diario', 'historico'].includes(params.kind)) {
        const { rows: eventos } = await c.query(
          `SELECT * FROM (
             SELECT a.scheduled_at AS quando, 'Atividade' AS tipo,
                    a.title AS texto, a.state::text AS situacao
               FROM activity a
              WHERE a.scheduled_at >= $1 AND a.scheduled_at < $2
                AND ($3::uuid IS NULL OR a.house_id = $3)
                AND ($4::uuid IS NULL OR a.person_id = $4)
             UNION ALL
             SELECT he.happened_at, 'Saúde',
                    concat_ws(', ', he.kind, he.specialty, he.place), he.status
               FROM health_encounter he
              WHERE he.happened_at >= $1 AND he.happened_at < $2
                AND ($3::uuid IS NULL OR he.house_id = $3)
                AND ($4::uuid IS NULL OR he.person_id = $4)
             UNION ALL
             SELECT ma.scheduled_at, 'Medicação',
                    concat_ws(' ', pr.medication, pr.dose), ma.state::text
               FROM medication_administration ma
               -- rls-join-ok: a prescrição segue a mesma política da
               -- administração; sem alcance à dose, a linha nem aparece.
               JOIN prescription pr ON pr.id = ma.prescription_id
              WHERE ma.scheduled_at >= $1 AND ma.scheduled_at < $2
                AND ($3::uuid IS NULL OR ma.house_id = $3)
                AND ($4::uuid IS NULL OR ma.person_id = $4)
                AND ma.state::text <> 'aguardando_confirmacao'
             UNION ALL
             SELECT i.happened_at, 'Ocorrência',
                    CASE WHEN i.access_level = 'restrito'
                         THEN 'Registro sob acesso restrito'
                         ELSE i.category END,
                    i.status
               FROM incident i
              WHERE i.happened_at >= $1 AND i.happened_at < $2
                AND ($3::uuid IS NULL OR i.house_id = $3)
                AND ($4::uuid IS NULL OR EXISTS (
                      SELECT 1 FROM incident_person ip
                       WHERE ip.incident_id = i.id AND ip.person_id = $4))
           ) t ORDER BY quando LIMIT 121`, [ini, fim, casa, pessoa]);

        if (eventos.length) {
          const cortou = eventos.length > 120;
          const linhas = eventos.slice(0, 120).map((e) => {
            const rotulo = e.tipo === 'Ocorrência' ? categoria(e.texto) : e.texto;
            const sit = e.situacao ? ` (${String(e.situacao).replace(/_/g, ' ')})` : '';
            return `${dataHora(e.quando)} · ${e.tipo}: ${rotulo}${sit}`;
          });
          if (cortou) {
            linhas.push('', 'A lista foi cortada em 120 registros. O período tem mais do que '
              + 'isto; consulte a linha do tempo no sistema para ver o restante.');
          }
          secoes.push({
            titulo: 'Linha do tempo do período',
            fonte: 'atividades, saúde, medicação e ocorrências, em ordem cronológica',
            texto: linhas.join('\n'),
          });
        }
      }

      // ---------- Escola, cursos e apoios ----------
      // O eixo educacional é o que a audiência pergunta logo depois da saúde,
      // e era o mais espalhado pelo sistema: matrícula no perfil, apoios numa
      // tabela, evolução em outra. Aqui vira um texto só.
      if (['desenvolvimento', 'individual', 'judiciario', 'audiencia', 'mensal',
           'historico'].includes(params.kind) && pessoa) {
        const { rows: [perfil] } = await c.query(
          `SELECT school_name, school_grade, school_shift, school_address, reference_team
             FROM profile_detail WHERE person_id = $1`, [pessoa]);
        const { rows: [apoio] } = await c.query(
          `SELECT resource_room, resource_reason, resource_teacher, service_kind,
                  service_other, service_place, service_professional, apprentice,
                  apprentice_mode, course_name, course_shift, training_unit, workplace
             FROM education_support WHERE person_id = $1 AND active`, [pessoa]);
        const { rows: evolucoes } = await c.query(
          `SELECT on_date, narrative FROM education_evolution
            WHERE person_id = $1 AND on_date BETWEEN $2::date AND $3::date
            ORDER BY on_date`, [pessoa, params.de, params.ate]);

        const linhas: string[] = [];
        if (perfil?.school_name) {
          linhas.push(`Matriculado(a) na ${perfil.school_name}`
            + `${perfil.school_grade ? `, ${perfil.school_grade}` : ''}`
            + `${perfil.school_shift ? `, turno da ${perfil.school_shift}` : ''}.`);
          if (perfil.school_address) linhas.push(`Endereço da escola: ${perfil.school_address}.`);
        } else {
          // A ausência é informação e precisa estar escrita. Relatório que
          // omite a escola deixa quem lê achando que ninguém perguntou.
          linhas.push('Não há escola registrada no cadastro deste acolhido.');
        }
        if (perfil?.reference_team) linhas.push(`Equipe de referência: ${perfil.reference_team}.`);

        if (apoio) {
          const apoios: string[] = [];
          if (apoio.resource_room) {
            apoios.push(`sala de recursos${apoio.resource_reason ? ` (${apoio.resource_reason})` : ''}`
              + `${apoio.resource_teacher ? `, com ${apoio.resource_teacher}` : ''}`);
          }
          if (apoio.service_kind) {
            apoios.push(`${apoio.service_kind === 'outro' ? apoio.service_other : apoio.service_kind}`
              + `${apoio.service_place ? ` em ${apoio.service_place}` : ''}`
              + `${apoio.service_professional ? `, com ${apoio.service_professional}` : ''}`);
          }
          if (apoio.apprentice) {
            apoios.push(`programa de aprendizagem${apoio.apprentice_mode ? ` (${apoio.apprentice_mode})` : ''}`
              + `${apoio.course_name ? `, curso de ${apoio.course_name}` : ''}`
              + `${apoio.course_shift ? `, turno da ${apoio.course_shift}` : ''}`
              + `${apoio.training_unit ? `, na unidade ${apoio.training_unit}` : ''}`
              + `${apoio.workplace ? `, com prática em ${apoio.workplace}` : ''}`);
          }
          if (apoios.length) linhas.push(`Apoios e programas em curso: ${emFrase(apoios)}.`);
        }

        if (evolucoes.length) {
          linhas.push('', 'Evolução educacional registrada no período:');
          for (const e of evolucoes) linhas.push(`${data(e.on_date)}: ${e.narrative}`);
        } else {
          linhas.push('', 'Não há evolução educacional registrada neste período.');
        }

        secoes.push({
          titulo: 'Escola, cursos e apoios',
          fonte: 'cadastro do acolhido, apoios educacionais e evoluções da equipe',
          texto: linhas.join('\n'),
        });
      }

      // ---------- Condições de saúde em acompanhamento ----------
      if (['desenvolvimento', 'individual', 'saude', 'judiciario', 'historico']
          .includes(params.kind) && pessoa) {
        const { rows: cond } = await c.query(
          `SELECT kind, description, essential_alert, started_on
             FROM health_condition WHERE person_id = $1 AND active
            ORDER BY essential_alert DESC, created_at`, [pessoa]);
        secoes.push({
          titulo: 'Condições de saúde em acompanhamento',
          fonte: 'cadastro de saúde, mantido pela Enfermagem',
          texto: cond.length
            ? cond.map((x) => `${x.description}${x.kind ? ` (${x.kind})` : ''}`
                + `${x.started_on ? `, desde ${data(x.started_on)}` : ''}`
                + `${x.essential_alert ? '. Alerta essencial: precisa ser lido por quem assume o plantão.' : '.'}`)
                .join('\n')
            : 'Não há condição de saúde em acompanhamento registrada.',
        });
      }

      // ---------- Marcos e memória ----------
      // A criança não é só o que deu problema. Um relatório feito apenas de
      // ocorrências e faltas devolve uma pessoa que não existe, e é assim que
      // o registro passa a trabalhar contra quem ele deveria proteger.
      if (['desenvolvimento', 'individual', 'historico'].includes(params.kind) && pessoa) {
        const { rows: marcos } = await c.query(
          `SELECT happened_on, event_type, description
             FROM memory_record
            WHERE person_id = $1 AND happened_on BETWEEN $2::date AND $3::date
            ORDER BY happened_on`, [pessoa, params.de, params.ate]);
        if (marcos.length) {
          secoes.push({
            titulo: 'Marcos e conquistas do período',
            fonte: 'registros de memória da equipe',
            texto: marcos.map((m) => `${data(m.happened_on)}: ${m.description}`
              + `${m.event_type ? ` (${m.event_type})` : ''}`).join('\n'),
          });
        }
      }

      // ---------- Entrada na unidade ----------
      if (['desenvolvimento', 'judiciario', 'historico', 'individual'].includes(params.kind) && pessoa) {
        const { rows: [adm] } = await c.query(
          `SELECT admitted_on, origin_city, previous_shelter, siblings_note,
                  family_reference, arrival_note
             FROM admission_record WHERE person_id = $1
            ORDER BY admitted_on DESC LIMIT 1`, [pessoa]);
        if (adm) {
          secoes.push({
            titulo: 'Entrada na unidade',
            fonte: 'registro de acolhimento',
            texto: [
              `Acolhido(a) em ${data(adm.admitted_on)}.`,
              adm.origin_city ? `Município de origem: ${adm.origin_city}.` : null,
              adm.previous_shelter ? `Serviço anterior: ${adm.previous_shelter}.` : null,
              adm.siblings_note ? `Sobre irmãos: ${adm.siblings_note}` : null,
              adm.family_reference ? `Referência familiar: ${adm.family_reference}` : null,
              adm.arrival_note ? `Na chegada: ${adm.arrival_note}` : null,
            ].filter(Boolean).join('\n'),
          });
        }
      }
    });

    /*
     * Ordem em que o documento é lido.
     *
     * Quem é a criança, como está cada área, a história do período em ordem,
     * e por último o que a equipe escreve. A linha do tempo vinha no meio dos
     * blocos temáticos por acaso, pela ordem em que o código consulta o banco,
     * e ficava estranha: a pessoa lia metade dos assuntos, atravessava a
     * cronologia inteira e voltava para os assuntos que faltavam.
     */
    const ORDEM = [
      'Identificação', 'Entrada na unidade',
      'Escola, cursos e apoios', 'Condições de saúde em acompanhamento',
      'Saúde e medicação', 'Restrições alimentares',
      'Atividades e rotina', 'Ocorrências',
      'Marcos e conquistas do período', 'Acompanhamento técnico do período',
      'Linha do tempo do período',
    ];
    secoes.sort((x, y) => {
      const a = ORDEM.indexOf(x.titulo); const b = ORDEM.indexOf(y.titulo);
      return (a === -1 ? ORDEM.length : a) - (b === -1 ? ORDEM.length : b);
    });

    // ---------- O que só uma pessoa escreve ----------
    for (const titulo of CAMPOS_DA_PESSOA[params.kind] ?? []) {
      secoes.push({
        titulo,
        aPreencher: true,
        fonte: 'a ser escrito pela equipe técnica',
        texto: '',
      });
    }

    if (!secoes.length) {
      secoes.push({
        titulo: 'Sem registros no período',
        fonte: 'consulta ao período informado',
        texto: 'Não há registros para este período com os filtros informados. '
             + 'Confira as datas e a unidade antes de concluir que nada aconteceu.',
      });
    }
    return secoes;
  }
}
