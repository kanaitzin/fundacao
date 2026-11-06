import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { EventBus } from '../../kernel/events/event-bus.service';

/**
 * O PRONTUÁRIO DE EDUCAÇÃO — que existia no banco e não tinha por onde ser
 * preenchido.
 *
 * `education_support` e `education_evolution` nasceram na migração 0530, do
 * "Prontuário Individual de Evolução — Educação" que a Fundação entregou em
 * 28/08 (§8.12). O relatório as LIA desde então. **Nenhuma rota as escrevia** —
 * o único INSERT do repositório estava dentro de um teste, e a varredura da
 * fase 106 (§9, item 3) encontrou as duas vazias por construção.
 *
 * O custo não era invisível: no piloto, o relatório de desenvolvimento e a
 * audiência concentrada diriam "não há" sobre escola e profissionalização
 * **para sempre**, e num documento judicial seção vazia se lê como ausência de
 * trabalho — que é exatamente o motivo de as onze seções terem virado quatro.
 *
 * QUEM ESCREVE, e não é escolha desta fase: as políticas da 0530 já diziam.
 *
 *  * o APOIO (sala de recursos, equipe multiprofissional, aprendizagem
 *    profissional) é estrutura do perfil — educador, líder, técnica e
 *    coordenação, como o resto do perfil descritivo;
 *  * a EVOLUÇÃO é do autor e **não se edita**: correção é registro novo, como
 *    no caderno. O §8.12 é explícito sobre o educador escrever aqui —
 *    *"quem acompanha a tarefa de casa é ele"*.
 */

/** Os serviços da equipe multiprofissional, como o papel os nomeia. */
export const SERVICOS_EDUCACAO = [
  { cod: 'fono', label: 'Fonoaudiologia' },
  { cod: 'pedagoga', label: 'Pedagogia' },
  { cod: 'psicopedagoga', label: 'Psicopedagogia' },
  { cod: 'outro', label: 'Outro serviço' },
];

const ESCREVEM = ['educador', 'lider_diurno', 'equipe_tecnica', 'coordenador', 'gestor_geral'];

/**
 * O CONCEITO DO BIMESTRE (1430) — três estados, e o que cada um manda fazer.
 *
 * *"Um conceito geral por período, com espaço para o porquê"* (20/09). **Não é
 * nota**: é estado do acompanhamento, e o motivo escrito ao lado é obrigatório
 * justamente para que ele não atravesse meses virando característica da pessoa.
 *
 * O rótulo fala do ACOMPANHAMENTO e nunca da criança: *"não está acompanhando"*
 * é uma frase sobre a escola dela neste bimestre; *"aluno fraco"* seria uma
 * frase sobre ela, e é a fronteira do §7.
 */
export const CONCEITOS_EDUCACAO = [
  { cod: 'acompanha', label: 'Está acompanhando o ano' },
  { cod: 'acompanha_com_apoio', label: 'Acompanha, com apoio em curso' },
  { cod: 'nao_acompanha', label: 'Não está acompanhando — pede providência' },
];
const ROTULO_CONCEITO: Record<string, string> =
  Object.fromEntries(CONCEITOS_EDUCACAO.map((c) => [c.cod, c.label]));

/**
 * OS VÍNCULOS EDUCACIONAIS (fase 282, decidido em 06/11). Os tipos, na ordem em que a
 * pessoa da Fundação os disse, e o turno. A tela lê daqui (§12.2).
 */
export const TIPOS_DE_VINCULO = [
  { cod: 'educacao_infantil', label: 'Educação infantil' },
  { cod: 'ensino_fundamental', label: 'Ensino fundamental' },
  { cod: 'ensino_medio', label: 'Ensino médio' },
  { cod: 'eja', label: 'EJA' },
  { cod: 'ensino_tecnico', label: 'Ensino técnico' },
  { cod: 'ensino_superior', label: 'Ensino superior' },
  { cod: 'educacao_integral', label: 'Educação integral' },
  { cod: 'scfv', label: 'SCFV' },
  { cod: 'aprendizagem', label: 'Aprendizagem profissional' },
  { cod: 'estagio', label: 'Estágio' },
  { cod: 'curso', label: 'Curso' },
  { cod: 'outro', label: 'Outro' },
];
export const TURNOS_DO_VINCULO = [
  { cod: 'manha', label: 'Manhã' },
  { cod: 'tarde', label: 'Tarde' },
  { cod: 'noite', label: 'Noite' },
  { cod: 'integral', label: 'Integral' },
  { cod: 'variavel', label: 'Horário variável' },
];
const ROTULO_TIPO: Record<string, string> = Object.fromEntries(TIPOS_DE_VINCULO.map((t) => [t.cod, t.label]));
const ROTULO_TURNO: Record<string, string> = Object.fromEntries(TURNOS_DO_VINCULO.map((t) => [t.cod, t.label]));
/** O aviso do fim previsto: 30 e 7 dias, fixos (decidido em 06/11). */
export const VINCULO_AVISO_DIAS = [30, 7];

/** Os campos do vínculo como a tela os manda, e como o banco os guarda. */
const CAMPOS_DO_VINCULO: Record<string, string> = {
  tipo: 'kind', tipoOutro: 'kind_other', instituicao: 'institution', curso: 'course',
  serie: 'grade', turma: 'class_group', turno: 'shift', dias: 'weekdays',
  unidade: 'training_unit', empresa: 'company', endereco: 'address',
  inicio: 'starts_on', fimPrevisto: 'expected_end',
};

/** Quem digita o conceito — decisão da Fundação em 21/09/2026, por extenso. */
const DIGITAM_CONCEITO = ['equipe_tecnica', 'coordenador', 'lider_diurno'];

@Injectable()
export class EducacaoService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  vocabulario() {
    return {
      servicos: SERVICOS_EDUCACAO,
      modos: [{ cod: 'presencial', label: 'Presencial' }, { cod: 'online', label: 'Online' }],
      /* A lista do conceito vem do SERVIDOR, como a dos serviços — §12.2: a tela
         não inventa a sua lista, e foi por inventar uma que a fase 130 existiu. */
      conceitos: CONCEITOS_EDUCACAO,
      bimestres: [1, 2, 3, 4].map((n) => ({ cod: n, label: `${n}º bimestre` })),
      tiposDeVinculo: TIPOS_DE_VINCULO,
      turnos: TURNOS_DO_VINCULO,
      aviso: 'O que ficar em branco aqui sai como "não há" no relatório e na audiência — e num '
        + 'documento judicial, seção vazia se lê como ausência de trabalho.',
    };
  }

  /** O apoio vigente e a evolução, de uma criança. O RLS faz o recorte. */
  async doAcolhido(user: AuthenticatedUser, personId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [apoio] } = await c.query(
        `SELECT id, resource_room, resource_reason, resource_teacher,
                service_kind, service_other, service_place, service_professional,
                apprentice, apprentice_mode, course_name, course_start, course_end,
                course_shift, training_unit, workplace, workplace_address,
                updated_at, app_user_display_name(updated_by) AS atualizado_por
           FROM education_support
          WHERE person_id = $1 AND active`, [personId]);

      const { rows: evolucoes } = await c.query(
        `SELECT id, on_date, narrative, created_at,
                app_user_display_name(created_by) AS por
           FROM education_evolution
          WHERE person_id = $1
          ORDER BY on_date DESC, created_at DESC
          LIMIT 60`, [personId]);

      /*
       * O CONCEITO POR BIMESTRE (1430, decisão de 20 e 21/09).
       *
       * Vem junto do apoio e da evolução porque é a mesma pergunta da casa —
       * *"como está a escola dele?"* —, e fazer três chamadas para responder uma
       * pergunta é o que faz a tela demorar no meio do turno.
       *
       * As versões SUBSTITUÍDAS vêm também, e de propósito: quem lê precisa ver
       * que houve correção e quem a fez. Esconder a anterior seria sobrescrever
       * com outro nome.
       */
      const { rows: conceitos } = await c.query(
        `SELECT id, ano, bimestre, conceito, motivo, created_at, substituido_em,
                substitui_id, app_user_display_name(created_by) AS por
           FROM education_concept
          WHERE person_id = $1
          ORDER BY ano DESC, bimestre DESC, created_at DESC
          LIMIT 40`, [personId]);

      /*
       * OS VÍNCULOS (fase 282): todos, vigentes e encerrados, com o histórico de cada
       * um e as notas. A tela põe em ordem; o servidor só entrega inteiro.
       */
      const { rows: vinculos } = await c.query(
        `SELECT l.*, l.starts_on::text AS inicio, l.expected_end::text AS fim_previsto,
                l.ended_on::text AS encerrado_em,
                app_user_display_name(l.created_by) AS criado_por,
                app_user_display_name(l.updated_by) AS mudado_por
           FROM education_link l
          WHERE l.person_id = $1
          ORDER BY l.starts_on DESC, l.created_at DESC`, [personId]);
      const ids = vinculos.map((v) => v.id);
      const { rows: mudancas } = ids.length ? await c.query(
        `SELECT id, link_id, kind, before, reason, changed_at,
                app_user_display_name(changed_by) AS por
           FROM education_link_change WHERE link_id = ANY($1::uuid[])
          ORDER BY changed_at DESC`, [ids]) : { rows: [] as any[] };
      const { rows: notas } = ids.length ? await c.query(
        `SELECT id, link_id, period, subject, grade, note, replaces_id, replaced_at, created_at,
                app_user_display_name(created_by) AS por
           FROM education_grade WHERE link_id = ANY($1::uuid[])
          ORDER BY created_at DESC`, [ids]) : { rows: [] as any[] };

      return {
        vinculos: vinculos.map((v) => ({
          id: v.id, tipo: v.kind, tipoRotulo: v.kind === 'outro' ? (v.kind_other ?? 'Outro') : ROTULO_TIPO[v.kind],
          tipoOutro: v.kind_other, instituicao: v.institution, curso: v.course, serie: v.grade,
          turma: v.class_group, turno: v.shift, turnoRotulo: v.shift ? ROTULO_TURNO[v.shift] : null,
          dias: (v.weekdays ?? []).map(Number), unidade: v.training_unit, empresa: v.company,
          endereco: v.address, inicio: v.inicio, fimPrevisto: v.fim_previsto,
          encerradoEm: v.encerrado_em, motivoDoEncerramento: v.end_reason,
          vigente: v.encerrado_em == null,
          criadoPor: v.criado_por, criadoEm: v.created_at,
          mudadoPor: v.mudado_por, mudadoEm: v.updated_at,
          historico: mudancas.filter((m) => m.link_id === v.id).map((m) => ({
            id: m.id, tipo: m.kind, antes: m.before, motivo: m.reason, em: m.changed_at, por: m.por,
          })),
          notas: notas.filter((n) => n.link_id === v.id).map((n) => ({
            id: n.id, periodo: n.period, disciplina: n.subject, nota: n.grade, observacao: n.note,
            corrigeUmaAnterior: n.replaces_id != null, substituida: n.replaced_at != null,
            em: n.created_at, por: n.por,
          })),
        })),
        conceitos: conceitos.map((k) => ({
          id: k.id, ano: k.ano, bimestre: k.bimestre,
          conceito: k.conceito, rotulo: ROTULO_CONCEITO[k.conceito] ?? k.conceito,
          motivo: k.motivo, por: k.por, escritoEm: k.created_at,
          /* Substituído não é apagado: a tela mostra em cinza, como histórico. */
          substituido: k.substituido_em != null,
          corrigeUmAnterior: k.substitui_id != null,
        })),
        apoio: apoio ? {
          id: apoio.id,
          salaDeRecursos: apoio.resource_room,
          motivoDaSala: apoio.resource_reason, professorDaSala: apoio.resource_teacher,
          servico: apoio.service_kind, servicoOutro: apoio.service_other,
          servicoLocal: apoio.service_place, servicoProfissional: apoio.service_professional,
          aprendiz: apoio.apprentice, modo: apoio.apprentice_mode,
          curso: apoio.course_name, cursoInicio: apoio.course_start, cursoFim: apoio.course_end,
          turno: apoio.course_shift, unidade: apoio.training_unit,
          empresa: apoio.workplace, enderecoDaEmpresa: apoio.workplace_address,
          atualizadoEm: apoio.updated_at, atualizadoPor: apoio.atualizado_por,
        } : null,
        evolucoes: evolucoes.map((e) => ({
          id: e.id, em: e.on_date, texto: e.narrative, por: e.por, escritoEm: e.created_at,
        })),
      };
    });
  }

  /**
   * Grava o apoio. **Substitui o vigente**, e o anterior não some: a linha
   * antiga é desativada, com data e autor — mudar de escola ou sair do curso é
   * história da criança, e o relatório do ano que vem vai perguntar.
   */
  async salvarApoio(user: AuthenticatedUser, personId: string, houseId: string, input: any) {
    if (!ESCREVEM.includes(user.role)) {
      throw new ForbiddenException(
        'Quem escreve o apoio educacional é a equipe da casa: educador, líder, técnica ou coordenação.');
    }
    if (input?.servico && !SERVICOS_EDUCACAO.some((s) => s.cod === input.servico)) {
      throw new BadRequestException('Serviço da equipe multiprofissional inválido.');
    }
    if (input?.aprendiz && !String(input.curso ?? '').trim()) {
      throw new BadRequestException(
        'Aprendizagem profissional sem o nome do curso não diz nada a quem ler o relatório.');
    }
    if (input?.salaDeRecursos && !String(input.motivoDaSala ?? '').trim()) {
      throw new BadRequestException(
        'Sala de recursos exige o motivo: é ele que a escola e a audiência perguntam.');
    }

    const id = await this.db.asUser(user.id, async (c) => {
      await c.query(
        `UPDATE education_support SET active = false, updated_at = now(), updated_by = $2
          WHERE person_id = $1 AND active`, [personId, user.id]);
      const { rows: [r] } = await c.query(
        `INSERT INTO education_support
           (person_id, house_id, resource_room, resource_reason, resource_teacher,
            service_kind, service_other, service_place, service_professional,
            apprentice, apprentice_mode, course_name, course_start, course_end,
            course_shift, training_unit, workplace, workplace_address,
            created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::date,$14::date,$15,$16,$17,$18,$19,$19)
         RETURNING id`,
        [personId, houseId,
         input?.salaDeRecursos === true, input?.motivoDaSala ?? null, input?.professorDaSala ?? null,
         input?.servico ?? null, input?.servicoOutro ?? null, input?.servicoLocal ?? null,
         input?.servicoProfissional ?? null,
         input?.aprendiz === true, input?.modo ?? null, input?.curso ?? null,
         input?.cursoInicio || null, input?.cursoFim || null, input?.turno ?? null,
         input?.unidade ?? null, input?.empresa ?? null, input?.enderecoDaEmpresa ?? null,
         user.id]);
      return r.id as string;
    });

    await this.audit.log({
      action: 'education.support', actorId: user.id, houseId,
      entity: 'education_support', entityId: id, detail: { personId },
    });
    return { id, aviso: 'Apoio educacional registrado. O anterior continua no histórico.' };
  }

  /**
   * A evolução do dia. **Não se edita** — correção é registro novo, e a policy
   * da 0530 nem oferece UPDATE.
   */
  async registrarEvolucao(user: AuthenticatedUser, personId: string, houseId: string, input: any) {
    if (!ESCREVEM.includes(user.role)) {
      throw new ForbiddenException('Quem escreve a evolução educacional é a equipe da casa.');
    }
    const texto = String(input?.texto ?? '').trim();
    if (texto.length < 10) {
      throw new BadRequestException(
        'Escreva o que aconteceu: o que a criança fez, ou o que a escola disse, de um jeito '
        + 'que quem ler daqui a um ano entenda.');
    }

    const id = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `INSERT INTO education_evolution (person_id, house_id, on_date, narrative, created_by)
         VALUES ($1,$2, coalesce($3::date, app_hoje()), $4, $5) RETURNING id`,
        [personId, houseId, input?.em || null, texto, user.id]);
      return r.id as string;
    });

    await this.audit.log({
      action: 'education.evolution', actorId: user.id, houseId,
      entity: 'education_evolution', entityId: id, detail: { personId },
    });
    return { id, aviso: 'Evolução registrada com o seu nome e a data. Ela não se edita — '
      + 'correção é um registro novo, como no caderno.' };
  }

  /**
   * O CONCEITO DO BIMESTRE (1430).
   *
   * Quem digita é a equipe técnica, a coordenação e o Líder Diurno — decisão da
   * Fundação em 21/09/2026. A conferência de cargo mora no BANCO (a função
   * recusa), e a daqui existe para a recusa chegar em português à pessoa que
   * está digitando às 19h; as duas dizem a mesma coisa de propósito.
   *
   * Corrigir não altera a linha anterior: insere outra, apontando para ela. As
   * duas ficam legíveis, com o nome de quem escreveu cada uma.
   */
  async registrarConceito(user: AuthenticatedUser, personId: string, input: {
    ano?: number; bimestre?: number; conceito?: string; motivo?: string;
  }) {
    if (!DIGITAM_CONCEITO.includes(user.role)) {
      throw new ForbiddenException(
        'Quem escreve o conceito do bimestre é a equipe técnica, a coordenação ou o Líder '
        + 'Diurno. Quem acompanha a lição de casa registra a evolução educacional, logo acima.');
    }
    const conceito = String(input?.conceito ?? '');
    if (!CONCEITOS_EDUCACAO.some((c) => c.cod === conceito)) {
      throw new BadRequestException('Escolha um dos conceitos da lista.');
    }
    const motivo = String(input?.motivo ?? '').trim();
    if (motivo.length < 10) {
      throw new BadRequestException(
        'Escreva por que o conceito é esse. Um conceito sozinho atravessa meses e vira '
        + 'característica da criança. O motivo é o que o mantém sendo sobre o bimestre.');
    }
    const ano = Number(input?.ano);
    const bimestre = Number(input?.bimestre);
    if (!Number.isInteger(ano) || !Number.isInteger(bimestre) || bimestre < 1 || bimestre > 4) {
      throw new BadRequestException('Informe o ano e o bimestre (1 a 4).');
    }

    let r: any;
    try {
      r = await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_registrar_conceito_educacional($1,$2,$3,$4,$5)`,
          [personId, ano, bimestre, conceito, motivo]);
        return row;
      });
    } catch (e: any) {
      const m = e?.message ?? '';
      if (m.includes('somente_tecnica_coordenacao_ou_lider')) {
        throw new ForbiddenException(
          'Quem escreve o conceito do bimestre é a equipe técnica, a coordenação ou o Líder Diurno.');
      }
      if (m.includes('acolhido_fora_de_escopo')) throw new NotFoundException('Acolhido não encontrado.');
      if (m.includes('bimestre_no_futuro')) {
        throw new BadRequestException(
          'Este bimestre ainda não terminou. O conceito dele se escreve quando o bimestre acabar.');
      }
      if (m.includes('motivo_insuficiente')) {
        throw new BadRequestException('Escreva por que o conceito é esse (mínimo 10 caracteres).');
      }
      throw e;
    }

    await this.audit.log({
      action: 'education.concept', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'education_concept', entityId: r.out_id,
      /* Metadado, nunca o motivo: o conteúdo não vai para o log (§20). */
      detail: { personId, ano, bimestre, corrigiu: r.out_substituiu != null },
    });

    return {
      id: r.out_id,
      substituiu: r.out_substituiu ?? null,
      aviso: r.out_substituiu
        ? 'Conceito corrigido. O anterior continua legível, com o nome de quem o escreveu — '
          + 'nada se apaga.'
        : 'Conceito registrado com o seu nome. Ele fala do acompanhamento neste bimestre, '
          + 'e não da criança.',
    };
  }

  /* ===================== OS VÍNCULOS (fase 282) ===================== */

  private conferirEscreve(user: AuthenticatedUser) {
    if (!ESCREVEM.includes(user.role)) {
      throw new ForbiddenException(
        'Quem cadastra e corrige os vínculos educacionais é a equipe da casa: educador, líder, '
        + 'técnica ou coordenação.');
    }
  }

  /** Confere e traduz o corpo da tela para o que o banco guarda. */
  private vinculoDoCorpo(input: any, parcial: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [daTela, doBanco] of Object.entries(CAMPOS_DO_VINCULO)) {
      if (input?.[daTela] !== undefined) out[doBanco] = input[daTela];
    }
    if (!parcial || out.kind !== undefined) {
      if (!TIPOS_DE_VINCULO.some((t) => t.cod === out.kind)) {
        throw new BadRequestException('Escolha o tipo do vínculo: escola, SCFV, aprendizagem, estágio ou outro da lista.');
      }
      if (out.kind === 'outro' && String(out.kind_other ?? '').trim().length < 2) {
        throw new BadRequestException('Diga qual é o vínculo, já que ele não está na lista.');
      }
    }
    if (!parcial || out.institution !== undefined) {
      if (String(out.institution ?? '').trim().length < 2) {
        throw new BadRequestException('Escreva o nome da escola, do serviço ou da empresa.');
      }
    }
    if (out.shift != null && out.shift !== '' && !TURNOS_DO_VINCULO.some((t) => t.cod === out.shift)) {
      throw new BadRequestException('Escolha o turno da lista.');
    }
    if (out.weekdays !== undefined) {
      const dias = Array.isArray(out.weekdays) ? out.weekdays.map(Number) : [];
      if (dias.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
        throw new BadRequestException('Os dias do vínculo vão de segunda a domingo.');
      }
      out.weekdays = [...new Set(dias)].sort();
    }
    const data = /^\d{4}-\d{2}-\d{2}$/;
    if (!parcial || out.starts_on !== undefined) {
      if (!data.test(String(out.starts_on ?? ''))) {
        throw new BadRequestException('Diga quando o vínculo começou.');
      }
    }
    if (out.expected_end != null && out.expected_end !== '' && !data.test(String(out.expected_end))) {
      throw new BadRequestException('A previsão de término precisa ser uma data.');
    }
    return out;
  }

  private emPortugues(e: any): never {
    const m = String(e?.message ?? '');
    if (m.includes('sem_permissao_vinculo')) {
      throw new ForbiddenException('Quem cadastra e corrige os vínculos educacionais é a equipe da casa.');
    }
    if (m.includes('acolhido_fora_de_escopo') || m.includes('vinculo_inexistente')) {
      throw new NotFoundException('Vínculo ou acolhido não encontrado.');
    }
    if (m.includes('motivo_curto')) throw new BadRequestException('Escreva o motivo, em poucas palavras.');
    if (m.includes('vinculo_ja_encerrado')) throw new BadRequestException('Este vínculo já foi encerrado.');
    if (m.includes('encerramento_antes_do_inicio')) {
      throw new BadRequestException('O encerramento não pode ser antes do começo do vínculo.');
    }
    if (m.includes('encerramento_no_futuro')) {
      throw new BadRequestException('Encerre no dia em que terminou. Para um fim que ainda vem, use a previsão de término.');
    }
    if (m.includes('vinculo_fim_depois_do_inicio')) {
      throw new BadRequestException('A previsão de término não pode ser antes do começo.');
    }
    if (m.includes('nota_inexistente')) throw new NotFoundException('Nota não encontrada neste vínculo.');
    if (m.includes('nota_ja_corrigida')) throw new BadRequestException('Esta nota já foi corrigida. Corrija a mais nova.');
    throw e;
  }

  async cadastrarVinculo(user: AuthenticatedUser, personId: string, input: any) {
    this.conferirEscreve(user);
    const corpo = this.vinculoDoCorpo(input, false);
    let id: string;
    try {
      id = await this.db.asUser(user.id, async (c) => (await c.query(
        `SELECT app_cadastrar_vinculo_educacional($1, $2::jsonb) AS id`,
        [personId, JSON.stringify(corpo)])).rows[0].id);
    } catch (e) { this.emPortugues(e); }
    await this.audit.log({
      action: 'education.link.created', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'education_link', entityId: id!, detail: { personId, tipo: corpo.kind },
    });
    return { id: id!, aviso: 'Vínculo cadastrado com o seu nome.' };
  }

  async corrigirVinculo(user: AuthenticatedUser, linkId: string, input: any) {
    this.conferirEscreve(user);
    const corpo = this.vinculoDoCorpo(input, true);
    const motivo = String(input?.motivo ?? '').trim();
    if (motivo.length < 5) throw new BadRequestException('Escreva o motivo da correção, em poucas palavras.');
    let houseId: string;
    try {
      houseId = await this.db.asUser(user.id, async (c) => (await c.query(
        `SELECT app_corrigir_vinculo_educacional($1, $2::jsonb, $3) AS casa`,
        [linkId, JSON.stringify(corpo), motivo])).rows[0].casa);
    } catch (e) { this.emPortugues(e); }
    await this.audit.log({
      action: 'education.link.corrected', actorId: user.id, houseId: houseId!,
      entity: 'education_link', entityId: linkId, detail: { campos: Object.keys(corpo) },
    });
    return { ok: true, aviso: 'Vínculo corrigido. O que constava antes ficou no histórico, com o motivo.' };
  }

  async encerrarVinculo(user: AuthenticatedUser, linkId: string, input: any) {
    this.conferirEscreve(user);
    const em = String(input?.em ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(em)) throw new BadRequestException('Diga em que dia o vínculo terminou.');
    const motivo = String(input?.motivo ?? '').trim();
    if (motivo.length < 5) throw new BadRequestException('Escreva por que terminou: concluiu, mudou de escola, desistiu.');
    let houseId: string;
    try {
      houseId = await this.db.asUser(user.id, async (c) => (await c.query(
        `SELECT app_encerrar_vinculo_educacional($1, $2::date, $3) AS casa`,
        [linkId, em, motivo])).rows[0].casa);
    } catch (e) { this.emPortugues(e); }
    await this.audit.log({
      action: 'education.link.ended', actorId: user.id, houseId: houseId!,
      entity: 'education_link', entityId: linkId, detail: { em },
    });
    return { ok: true, aviso: 'Vínculo encerrado. Ele continua na linha da criança.' };
  }

  async lancarNota(user: AuthenticatedUser, linkId: string, input: any) {
    this.conferirEscreve(user);
    const periodo = String(input?.periodo ?? '').trim();
    const disciplina = String(input?.disciplina ?? '').trim();
    const nota = String(input?.nota ?? '').trim();
    if (periodo.length < 2) throw new BadRequestException('Diga o período da nota: 1º trimestre de 2026, por exemplo.');
    if (disciplina.length < 2) throw new BadRequestException('Diga a disciplina ou a área.');
    if (!nota) throw new BadRequestException('Escreva a nota como a escola deu.');
    const substitui = input?.substitui ? String(input.substitui) : null;
    if (substitui && !/^[0-9a-f-]{36}$/i.test(substitui)) throw new BadRequestException('Nota a corrigir inválida.');
    let id: string;
    try {
      id = await this.db.asUser(user.id, async (c) => (await c.query(
        `SELECT app_lancar_nota_educacional($1, $2, $3, $4, $5, $6) AS id`,
        [linkId, periodo, disciplina, nota, input?.observacao ?? null, substitui])).rows[0].id);
    } catch (e) { this.emPortugues(e); }
    const houseId = await this.db.asUser(user.id, async (c) => (await c.query(
      `SELECT house_id FROM education_grade WHERE id = $1`, [id!])).rows[0]?.house_id);
    await this.audit.log({
      action: 'education.grade', actorId: user.id, houseId,
      entity: 'education_grade', entityId: id!, detail: { linkId, corrigiu: substitui != null },
    });
    return { id: id!, aviso: substitui
      ? 'Nota corrigida. A anterior continua legível, com o nome de quem a lançou.'
      : 'Nota lançada com o seu nome.' };
  }

  /** O relógio do dia: o fim previsto de um vínculo chegando, a 30 e a 7 dias. */
  async avisarVinculosDaCasa(user: AuthenticatedUser, houseId: string) {
    const linhas = await this.db.asUser(user.id, async (c) => (await c.query(
      `SELECT out_vinculo, out_pessoa, out_nome, out_instituicao, out_fim::text AS fim, out_dias
         FROM app_vinculos_terminando($1)`, [houseId])).rows);
    for (const r of linhas) {
      const dia = `${r.fim.slice(8, 10)}/${r.fim.slice(5, 7)}`;
      const quando = Number(r.out_dias) === 7 ? 'na última semana' : 'no último mês';
      const aviso = {
        entity: 'education_link', entityId: r.out_vinculo,
        reason: 'vinculo_educacional_terminando',
        title: `O vínculo de ${r.out_nome} com ${r.out_instituicao} está ${quando}`,
        body: `A previsão de término é ${dia}. Combine com a criança e com quem acompanha o que vem `
          + 'depois, e encerre ou corrija o vínculo na aba Educação do perfil quando souber.',
        priority: 'normal' as const, groupKey: `vinculo:${r.out_vinculo}:${r.out_dias}`,
      };
      await this.bus.publish('escalation.requested', { ...aviso, level: 'tecnica_coordenacao' },
        { actorId: user.id, houseId });
      await this.bus.publish('escalation.requested', { ...aviso, level: 'lider' },
        { actorId: user.id, houseId });
    }
    return { ok: true, avisados: linhas.length };
  }
}
