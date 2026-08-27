import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.service';
import { isValidCpf, normalizeCpf, maskCpf } from '../common/cpf';

export type CpfSituacao = 'livre' | 'ativo_mesma_casa' | 'no_acervo' | 'ativo_outra_casa';

export interface CpfCheck {
  situacao: CpfSituacao;
  personId: string | null;
  /** O que o sistema propõe fazer — decisão permanece humana. */
  acao: string;
}

const ACOES: Record<CpfSituacao, string> = {
  livre: 'Cadastrar novo acolhido',
  ativo_mesma_casa: 'Abrir o perfil existente nesta casa',
  no_acervo: 'Iniciar retorno — novo episódio no mesmo perfil',
  ativo_outra_casa: 'Acolhido ativo em outra unidade. Iniciar solicitação de transferência.',
};

@Injectable()
export class PeopleService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Verificação obrigatória antes de cadastrar (§6.1).
   * Nunca cria duplicata silenciosa e nunca revela conteúdo de pessoa
   * que esteja ativa em outra casa — devolve apenas o estado e a ação.
   */
  async checkCpf(user: AuthenticatedUser, cpfInput: string): Promise<CpfCheck> {
    const cpf = normalizeCpf(cpfInput);
    if (!isValidCpf(cpf)) throw new BadRequestException('CPF inválido. Confira os números digitados.');

    const row = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT * FROM app_check_cpf($1, $2)`, [user.institutionId, cpf]);
      return r;
    });
    await this.audit.log({
      action: 'person.cpf_check', actorId: user.id, institutionId: user.institutionId,
      detail: { situacao: row.situacao },   // metadado; o CPF não vai ao log (§20)
    });
    return { situacao: row.situacao, personId: row.person_id ?? null, acao: ACOES[row.situacao as CpfSituacao] };
  }

  /** Cadastro de novo acolhido: pessoa + episódio 1 + permanência na casa. */
  async admit(user: AuthenticatedUser, input: {
    houseId: string; fullName: string; socialName?: string; birthDate: string;
    cpf?: string; provisionalReason?: string;
  }) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação cadastram acolhidos.');
    }
    const cpf = input.cpf ? normalizeCpf(input.cpf) : null;
    if (cpf && !isValidCpf(cpf)) throw new BadRequestException('CPF inválido.');
    if (!cpf && !input.provisionalReason) {
      // Ingresso urgente sem CPF exige motivo e vira pendência (§6.1)
      throw new BadRequestException('Sem CPF, informe o motivo do ingresso urgente para gerar ID provisório com pendência.');
    }
    if (cpf) {
      const check = await this.checkCpf(user, cpf);
      if (check.situacao !== 'livre') throw new ConflictException(check.acao);
    }

    // Comando de sistema (migração 005): pessoa + episódio + permanência +
    // perfil numa transição atômica. A visibilidade nasce da permanência, então
    // criar em partes deixaria o próprio autor sem enxergar o que criou.
    const provisorio = cpf ? null : `PROV-${Date.now().toString(36).toUpperCase()}`;
    return this.db.asUser(user.id, async (c) => {
      let r: { person_id: string; episode_id: string; episode_number: number };
      try {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_admit_person($1,$2,$3,$4,$5,$6)`,
          [input.houseId, input.fullName, input.socialName ?? null, input.birthDate, cpf, provisorio]);
        r = row;
      } catch (e: any) {
        if (e?.message?.includes('cpf_ja_cadastrado')) {
          throw new ConflictException('Já existe cadastro com este CPF nesta instituição.');
        }
        if (e?.message?.includes('sem_permissao_para_admitir')) {
          throw new ForbiddenException('Sem permissão para cadastrar nesta unidade.');
        }
        throw e;
      }

      await this.audit.log({
        action: 'person.admit', actorId: user.id, institutionId: user.institutionId,
        houseId: input.houseId, entity: 'person', entityId: r.person_id,
        detail: { episodio: r.episode_number, cpfPendente: !cpf },
      });
      return { personId: r.person_id, episodeId: r.episode_id, episodio: r.episode_number, cpfPendente: !cpf };
    });
  }

  /**
   * Retorno (§15.3): novo episódio no MESMO perfil, sem apagar versões antigas.
   * Medicamentos e restrições anteriores permanecem no histórico e devem ser
   * revistos pela Enfermagem antes de serem reativados — o sistema não reativa
   * nada automaticamente.
   */
  async readmit(user: AuthenticatedUser, personId: string, houseId: string) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação registram retorno.');
    }
    return this.db.asUser(user.id, async (c) => {
      let r: { episode_id: string; episode_number: number };
      try {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_readmit_person($1,$2)`, [personId, houseId]);
        r = row;
      } catch (e: any) {
        if (e?.message?.includes('episodio_ativo_existente')) {
          throw new ConflictException('Este acolhido já possui episódio ativo.');
        }
        if (e?.message?.includes('pessoa_fora_de_escopo')) {
          throw new NotFoundException('Perfil não encontrado.');
        }
        if (e?.message?.includes('sem_permissao_para_admitir')) {
          throw new ForbiddenException('Sem permissão para registrar retorno nesta unidade.');
        }
        throw e;
      }

      await this.audit.log({
        action: 'person.readmit', actorId: user.id, institutionId: user.institutionId,
        houseId, entity: 'person', entityId: personId, detail: { episodio: r.episode_number },
      });
      return {
        personId, episodeId: r.episode_id, episodio: r.episode_number,
        aviso: 'Revise medicamentos, alergias e restrições com a Enfermagem antes de reativá-los.',
      };
    });
  }

  /** Saída: encerra permanência e episódio; perfil vai ao Acervo Histórico (§15.2). */
  async discharge(user: AuthenticatedUser, personId: string, reason: string) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente equipe técnica e coordenação registram saída.');
    }
    if (!reason?.trim()) throw new BadRequestException('Informe o motivo da saída.');
    return this.db.asUser(user.id, async (c) => {
      const houseId = await currentHouse(c, personId);
      const { rowCount } = await c.query(
        `UPDATE house_stay SET status='encerrada', ended_at=now(), end_reason='encerramento_episodio'
         WHERE person_id=$1 AND status='ativa'`, [personId]);
      if (!rowCount) throw new NotFoundException('Acolhido não encontrado entre os ativos.');
      await c.query(
        `UPDATE care_episode SET status='encerrado', ended_at=now(), end_reason=$2
         WHERE person_id=$1 AND status='ativo'`, [personId, reason]);

      await this.audit.log({
        action: 'person.discharge', actorId: user.id, institutionId: user.institutionId,
        houseId, entity: 'person', entityId: personId, detail: { motivo: reason },
      });
      return { ok: true, acervo: true };
    });
  }

  /** Lista operacional da casa — “visão dos 20” (§9). */
  async listByHouse(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT p.id, p.full_name, p.social_name, p.birth_date, p.cpf, p.cpf_pending,
                date_part('year', age(p.birth_date))::int AS idade,
                (SELECT count(*)::int FROM health_condition h
                   WHERE h.person_id = p.id AND h.active AND h.essential_alert) AS alertas,
                (SELECT count(*)::int FROM food_restriction f
                   WHERE f.person_id = p.id AND f.active) AS restricoes
         FROM person p
         JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'
         WHERE s.house_id = $1
         ORDER BY coalesce(nullif(p.social_name,''), p.full_name)`, [houseId]);
      return rows.map(publicPerson);
    });
  }
}

/** Casa atual — usada para carimbar a auditoria antes de encerrar a permanência. */
export async function currentHouse(c: PoolClient, personId: string): Promise<string | null> {
  const { rows: [r] } = await c.query(
    `SELECT house_id FROM house_stay WHERE person_id = $1 AND status = 'ativa'`, [personId]);
  return r?.house_id ?? null;
}

/** Projeção segura: CPF sempre mascarado na exibição operacional (§3.1). */
export function publicPerson(r: any) {
  return {
    id: r.id,
    nome: r.social_name || r.full_name,   // nome social nas telas operacionais (§6.1)
    nomeCivil: r.full_name,
    idade: r.idade,
    nascimento: r.birth_date,
    cpf: maskCpf(r.cpf),
    cpfPendente: r.cpf_pending,
    alertasEssenciais: r.alertas,
    restricoesAlimentares: r.restricoes,
  };
}
