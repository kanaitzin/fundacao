import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';

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

/** Quem digita o conceito — decisão da Fundação em 21/09/2026, por extenso. */
const DIGITAM_CONCEITO = ['equipe_tecnica', 'coordenador', 'lider_diurno'];

@Injectable()
export class EducacaoService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  vocabulario() {
    return {
      servicos: SERVICOS_EDUCACAO,
      modos: [{ cod: 'presencial', label: 'Presencial' }, { cod: 'online', label: 'Online' }],
      /* A lista do conceito vem do SERVIDOR, como a dos serviços — §12.2: a tela
         não inventa a sua lista, e foi por inventar uma que a fase 130 existiu. */
      conceitos: CONCEITOS_EDUCACAO,
      bimestres: [1, 2, 3, 4].map((n) => ({ cod: n, label: `${n}º bimestre` })),
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

      return {
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
        'Escreva o que aconteceu — o que a criança fez, ou o que a escola disse. '
        + 'Uma linha curta demais não conta nada a quem ler daqui a um ano.');
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
        + 'característica da criança — o motivo é o que o mantém sendo sobre o bimestre.');
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
          'Este bimestre ainda não terminou de acontecer. Escrever o conceito dele agora seria '
          + 'escrever sobre o que não houve — e o painel contaria.');
      }
      if (m.includes('motivo_insuficiente')) {
        throw new BadRequestException('Escreva por que o conceito é esse (mínimo 10 caracteres).');
      }
      throw e;
    }

    await this.audit.log({
      action: 'education.concept', actorId: user.id,
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
}
