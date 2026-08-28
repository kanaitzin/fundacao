import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { isValidCpf, normalizeCpf } from '../../kernel/common/cpf';

/**
 * CADASTRO COMPLETO DO ACOLHIDO (§6.1, §13.1).
 *
 * Quem cadastra: equipe técnica e coordenação. É a regra da Fundação e é
 * também a regra do banco — o comando `app_admit_person_full` recusa qualquer
 * outro cargo, então uma tela mal protegida não vira porta.
 *
 * O formulário tem três blocos e eles não têm o mesmo público. O bloco
 * judicial — motivo do acolhimento, guia, processo, vara — é área restrita:
 * quem cuida no dia a dia não lê. Não é desconfiança do educador; é que saber
 * por que a criança foi retirada de casa muda como se olha para ela, e essa
 * informação existe para decidir o caso, não para acompanhar o banho.
 */

export const MOTIVOS_ACOLHIMENTO = [
  { cod: 'negligencia', label: 'Negligência' },
  { cod: 'abandono', label: 'Abandono' },
  { cod: 'violencia_fisica', label: 'Violência física' },
  { cod: 'violencia_psicologica', label: 'Violência psicológica' },
  { cod: 'violencia_sexual', label: 'Violência sexual' },
  { cod: 'trabalho_infantil', label: 'Trabalho infantil' },
  { cod: 'situacao_de_rua', label: 'Situação de rua' },
  { cod: 'dependencia_quimica_do_responsavel', label: 'Dependência química do responsável' },
  { cod: 'dependencia_quimica_propria', label: 'Dependência química do acolhido' },
  { cod: 'orfandade', label: 'Orfandade' },
  { cod: 'ausencia_de_responsavel', label: 'Ausência de responsável' },
  { cod: 'entrega_voluntaria', label: 'Entrega voluntária' },
  { cod: 'ordem_judicial_outra', label: 'Ordem judicial — outro fundamento' },
  { cod: 'outro', label: 'Outro' },
] as const;

export const ORGAOS_DETERMINANTES = [
  { cod: 'vara_da_infancia', label: 'Vara da Infância e Juventude' },
  { cod: 'conselho_tutelar', label: 'Conselho Tutelar' },
  { cod: 'ministerio_publico', label: 'Ministério Público' },
  { cod: 'delegacia', label: 'Delegacia' },
  { cod: 'outro', label: 'Outro' },
] as const;

export const TIPOS_MEDIDA = [
  { cod: 'acolhimento_institucional', label: 'Acolhimento institucional' },
  { cod: 'acolhimento_familiar', label: 'Acolhimento familiar' },
  { cod: 'medida_protetiva_outra', label: 'Outra medida protetiva' },
] as const;

const CARGOS_QUE_CADASTRAM = ['equipe_tecnica', 'coordenador', 'gestor_geral'];
const CARGOS_AREA_RESTRITA = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

export interface CadastroCompleto {
  houseId: string;
  pessoa: Record<string, string | undefined>;
  acolhimento: Record<string, string | undefined>;
  judicial: Record<string, string | undefined>;
}

@Injectable()
export class AdmissionService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Listas fechadas do formulário — vêm do servidor para não divergirem do CHECK. */
  opcoes() {
    return {
      motivos: MOTIVOS_ACOLHIMENTO, orgaos: ORGAOS_DETERMINANTES, medidas: TIPOS_MEDIDA,
    };
  }

  async admitFull(user: AuthenticatedUser, input: CadastroCompleto) {
    if (!CARGOS_QUE_CADASTRAM.includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação cadastram acolhidos.');
    }
    const pessoa = { ...input.pessoa };
    const acolhimento = { ...input.acolhimento };
    const judicial = { ...input.judicial };

    if (!pessoa.fullName?.trim()) throw new BadRequestException('Informe o nome completo.');
    if (!pessoa.birthDate) throw new BadRequestException('Informe a data de nascimento.');

    const cpf = pessoa.cpf ? normalizeCpf(pessoa.cpf) : '';
    if (cpf && !isValidCpf(cpf)) throw new BadRequestException('CPF inválido. Confira os números digitados.');
    if (!cpf) {
      // Ingresso urgente: entra sem CPF, mas com pendência que não se perde (§6.1).
      if (!acolhimento.provisionalReason?.trim()) {
        throw new BadRequestException(
          'Sem CPF, descreva o motivo do ingresso urgente — o cadastro entra com ID provisório e pendência.');
      }
      pessoa.provisionalId = `PROV-${Date.now().toString(36).toUpperCase()}`;
    }
    pessoa.cpf = cpf;

    if (!judicial.reasonCategory) {
      throw new BadRequestException('Informe o motivo do acolhimento.');
    }
    if (!MOTIVOS_ACOLHIMENTO.some((m) => m.cod === judicial.reasonCategory)) {
      throw new BadRequestException('Motivo do acolhimento inválido.');
    }
    if (!judicial.determiningBody) {
      throw new BadRequestException('Informe quem determinou o acolhimento.');
    }
    if (!ORGAOS_DETERMINANTES.some((o) => o.cod === judicial.determiningBody)) {
      throw new BadRequestException('Órgão determinante inválido.');
    }

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_admit_person_full($1,$2::jsonb,$3::jsonb,$4::jsonb)`,
        [input.houseId, JSON.stringify(pessoa), JSON.stringify(acolhimento), JSON.stringify(judicial)]);
      return row;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('casa_no_limite')) {
        throw new ConflictException(
          'A casa está no limite de vagas. Para acolher assim mesmo, descreva a justificativa '
          + '(mínimo 15 caracteres) — ela fica registrada. Se o limite mudou de verdade, a '
          + 'coordenação pode alterá-lo na tela da unidade.');
      }
      if (m.includes('cpf_ja_cadastrado')) {
        throw new ConflictException('Já existe cadastro com este CPF. Abra o perfil existente em vez de duplicar.');
      }
      if (m.includes('sem_permissao_para_admitir')) {
        throw new ForbiddenException('Sem permissão para cadastrar nesta unidade.');
      }
      throw e;
    });

    // O log guarda IDs e metadados. Motivo judicial, guia e processo não vão
    // para o log da aplicação (§20) — ficam na área restrita, onde a leitura
    // tem policy.
    await this.audit.log({
      action: 'person.admit_full', actorId: user.id, institutionId: user.institutionId,
      houseId: input.houseId, entity: 'person', entityId: r.person_id,
      detail: {
        episodio: r.episode_number, cpfPendente: !cpf,
        acimaDoLimite: r.acima_do_limite, capacidade: r.capacidade, ocupadas: r.ocupadas,
      },
    });

    return {
      personId: r.person_id, episodeId: r.episode_id, episodio: r.episode_number,
      cpfPendente: !cpf, acimaDoLimite: r.acima_do_limite,
      capacidade: r.capacidade, ocupadas: r.ocupadas,
      aviso: r.acima_do_limite
        ? `Cadastro feito com a casa acima do limite (${r.ocupadas} de ${r.capacidade}). A justificativa ficou registrada.`
        : null,
    };
  }

  /** Bloco do acolhimento — quem cuida enxerga. */
  async acolhimento(user: AuthenticatedUser, personId: string) {
    const row = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT a.admitted_on, a.brought_by, a.origin_city, a.previous_shelter,
                a.siblings_note, a.family_reference, a.arrival_note,
                a.over_capacity, a.capacity_reason
           FROM admission_record a
           -- rls-join-ok: care_episode não tem policy própria; quem filtra é adm_select.
           JOIN care_episode e ON e.id = a.episode_id AND e.status = 'ativo'
          WHERE a.person_id = $1
          ORDER BY a.admitted_on DESC LIMIT 1`, [personId]);
      return r;
    });
    if (!row) throw new NotFoundException('Cadastro de acolhimento não encontrado.');
    return {
      ingressoEm: row.admitted_on, conduzidoPor: row.brought_by, municipioOrigem: row.origin_city,
      acolhimentoAnterior: row.previous_shelter, irmaos: row.siblings_note,
      referenciaFamiliar: row.family_reference, chegada: row.arrival_note,
      acimaDoLimite: row.over_capacity, justificativaLimite: row.capacity_reason,
    };
  }

  /**
   * Bloco judicial — área restrita (§13.1).
   *
   * A policy do banco já recusa a leitura para quem não é equipe técnica,
   * coordenação ou Gestor Geral. A verificação aqui existe para devolver uma
   * frase honesta em vez de um vazio ambíguo.
   */
  async judicial(user: AuthenticatedUser, personId: string) {
    if (!CARGOS_AREA_RESTRITA.includes(user.role)) {
      throw new ForbiddenException(
        'Motivo do acolhimento e dados judiciais ficam em área restrita à equipe técnica e à coordenação.');
    }
    const row = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT j.reason_category, j.reason_detail, j.measure_type, j.determining_body,
                j.court_name, j.process_number, j.guide_number, j.guide_date,
                j.determined_on, j.legal_status, j.notes, j.updated_at
           FROM judicial_record j
           -- rls-join-ok: quem filtra o acesso é a policy jud_select de judicial_record.
           JOIN care_episode e ON e.id = j.episode_id AND e.status = 'ativo'
          WHERE j.person_id = $1
          ORDER BY j.updated_at DESC LIMIT 1`, [personId]);
      return r;
    });
    if (!row) throw new NotFoundException('Registro judicial não encontrado.');

    await this.audit.log({
      action: 'person.judicial_view', actorId: user.id, institutionId: user.institutionId,
      entity: 'person', entityId: personId, detail: {},   // metadado; conteúdo não vai ao log
    });

    const rotulo = (lista: readonly { cod: string; label: string }[], cod: string) =>
      lista.find((x) => x.cod === cod)?.label ?? cod;
    return {
      motivo: rotulo(MOTIVOS_ACOLHIMENTO, row.reason_category),
      motivoCodigo: row.reason_category,
      detalhe: row.reason_detail,
      medida: rotulo(TIPOS_MEDIDA, row.measure_type),
      orgao: rotulo(ORGAOS_DETERMINANTES, row.determining_body),
      vara: row.court_name, processo: row.process_number,
      guia: row.guide_number, guiaEm: row.guide_date, determinadoEm: row.determined_on,
      situacao: row.legal_status, observacoes: row.notes, atualizadoEm: row.updated_at,
    };
  }

  /** Atualizar a situação judicial — o caso anda, e o registro precisa andar junto. */
  async atualizarJudicial(user: AuthenticatedUser, personId: string, campos: Record<string, string | null>) {
    if (!CARGOS_AREA_RESTRITA.includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação atualizam a área judicial.');
    }
    const PERMITIDOS: Record<string, string> = {
      detalhe: 'reason_detail', vara: 'court_name', processo: 'process_number',
      guia: 'guide_number', situacao: 'legal_status', observacoes: 'notes',
    };
    const sets: string[] = [];
    const vals: (string | null)[] = [personId];
    for (const [k, v] of Object.entries(campos)) {
      const col = PERMITIDOS[k];
      if (!col) continue;
      vals.push(v === '' ? null : v);
      sets.push(`${col} = $${vals.length}`);
    }
    if (!sets.length) throw new BadRequestException('Nenhum campo alterável informado.');

    const ok = await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE judicial_record SET ${sets.join(', ')} WHERE person_id = $1`, vals);
      return rowCount;
    });
    if (!ok) throw new NotFoundException('Registro judicial não encontrado.');

    await this.audit.log({
      action: 'person.judicial_update', actorId: user.id, institutionId: user.institutionId,
      entity: 'person', entityId: personId, detail: { campos: Object.keys(campos) },
    });
    return { atualizado: true };
  }
}
