import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
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

      return {
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
}
