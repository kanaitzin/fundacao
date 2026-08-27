import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';

/**
 * Benefícios e dados bancários (§6.10) — a área mais sensível do sistema.
 *
 * Regras que este serviço garante:
 *  * acesso somente à coordenação da casa ATUAL e ao Gestor Geral (o RLS repete);
 *  * reautenticação recente obrigatória para ver, editar, imprimir ou exportar;
 *  * TODA abertura, consulta, alteração, impressão e exportação vira log próprio;
 *  * nunca aparece em linha do tempo, ATA, notificação, relatório geral ou busca;
 *  * após transferência aceita, origem perde e destino ganha o acesso.
 */
const REAUTH_JANELA_MIN = 5;

@Injectable()
export class BenefitsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private exigirReauth(user: AuthenticatedUser) {
    const at = user.lastReauthAt ? new Date(user.lastReauthAt).getTime() : 0;
    if (Date.now() - at > REAUTH_JANELA_MIN * 60_000) {
      throw new ForbiddenException(
        'Confirme sua senha para acessar benefícios e dados bancários.');
    }
  }

  /**
   * Confirma no BANCO se este usuário ainda responde por esta pessoa.
   * Após uma transferência aceita, a coordenação de origem deixa de responder
   * — e a resposta precisa ser uma negativa explícita, não uma lista vazia:
   * lista vazia convidaria a sondagem e esconderia a perda de acesso (§6.10).
   */
  private async podeVer(user: AuthenticatedUser, personId: string): Promise<boolean> {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(`SELECT app_can_see_benefits($1) AS pode`, [personId]);
      return r?.pode === true;
    });
  }

  private async negar(user: AuthenticatedUser, personId: string, motivo: string): Promise<never> {
    await this.audit.log({
      action: 'benefits.denied', actorId: user.id, entity: 'person', entityId: personId,
      detail: { papel: user.role, motivo },
    });
    throw new ForbiddenException(
      'Somente a coordenação da casa atual do acolhido e o Gestor Geral acessam esta área.');
  }

  async list(user: AuthenticatedUser, personId: string, finalidade: string) {
    if (!['coordenador', 'gestor_geral'].includes(user.role)) {
      // Auditar a tentativa: acesso negado a dado sensível é informação relevante.
      await this.audit.log({
        action: 'benefits.denied', actorId: user.id, entity: 'person', entityId: personId,
        detail: { papel: user.role },
      });
      throw new ForbiddenException('Somente a coordenação da casa atual e o Gestor Geral acessam esta área.');
    }
    if (!finalidade?.trim()) throw new BadRequestException('Informe a finalidade do acesso.');
    this.exigirReauth(user);
    if (!(await this.podeVer(user, personId))) await this.negar(user, personId, 'fora_da_casa_atual');

    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT id, benefit_type, bank_name, agency, account, status, notes, updated_at
         FROM benefit_record WHERE person_id = $1 ORDER BY benefit_type`, [personId]);
      return rows;
    });

    // Log por VISUALIZAÇÃO, com finalidade declarada (§6.10)
    await this.audit.log({
      action: 'benefits.view', actorId: user.id, entity: 'person', entityId: personId,
      purpose: finalidade, houseId: null,
      detail: { registros: rows.length },   // nunca o conteúdo bancário
    });

    const ultimoAcesso = await this.lastAccess(personId, user.id);
    return {
      registros: rows.map((r) => ({
        id: r.id, tipo: r.benefit_type, banco: r.bank_name, agencia: r.agency,
        conta: r.account, situacao: r.status, observacoes: r.notes, atualizadoEm: r.updated_at,
      })),
      ultimoAcesso,
      aviso: 'Cada visualização, edição, impressão e exportação desta área é registrada.',
    };
  }

  async upsert(user: AuthenticatedUser, personId: string, input: {
    id?: string; tipo: string; banco?: string; agencia?: string; conta?: string;
    situacao?: string; observacoes?: string; finalidade: string;
  }) {
    if (!['coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Sem permissão para editar benefícios.');
    }
    if (!input.finalidade?.trim()) throw new BadRequestException('Informe a finalidade da alteração.');
    this.exigirReauth(user);
    if (!(await this.podeVer(user, personId))) await this.negar(user, personId, 'fora_da_casa_atual');

    const res = await this.db.asUser(user.id, async (c) => {
      if (input.id) {
        const { rows: [antes] } = await c.query(
          `SELECT benefit_type, bank_name, agency, account, status FROM benefit_record WHERE id = $1`, [input.id]);
        const { rows: [r] } = await c.query(
          `UPDATE benefit_record SET benefit_type=$2, bank_name=$3, agency=$4, account=$5,
             status=coalesce($6,status), notes=$7, updated_at=now(), updated_by=$8
           WHERE id = $1 RETURNING id`,
          [input.id, input.tipo, input.banco ?? null, input.agencia ?? null, input.conta ?? null,
           input.situacao ?? null, input.observacoes ?? null, user.id]);
        return { id: r?.id, criado: false, mudouCampos: camposAlterados(antes, input) };
      }
      const { rows: [r] } = await c.query(
        `INSERT INTO benefit_record (person_id, benefit_type, bank_name, agency, account, status, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,coalesce($6,'ativo'),$7,$8,$8) RETURNING id`,
        [personId, input.tipo, input.banco ?? null, input.agencia ?? null, input.conta ?? null,
         input.situacao ?? null, input.observacoes ?? null, user.id]);
      return { id: r.id, criado: true, mudouCampos: [] as string[] };
    });

    await this.audit.log({
      action: res.criado ? 'benefits.create' : 'benefits.update',
      actorId: user.id, entity: 'benefit_record', entityId: res.id,
      purpose: input.finalidade,
      detail: { personId, campos: res.mudouCampos },   // quais campos, nunca os valores
    });
    return { id: res.id, ok: true };
  }

  /** Impressão/exportação: mesma fricção da visualização, log próprio (§6.10). */
  async export(user: AuthenticatedUser, personId: string, formato: string, finalidade: string) {
    if (!['coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Sem permissão para exportar esta área.');
    }
    if (!finalidade?.trim()) throw new BadRequestException('Informe a finalidade da exportação.');
    this.exigirReauth(user);
    if (!(await this.podeVer(user, personId))) await this.negar(user, personId, 'fora_da_casa_atual');
    await this.audit.log({
      action: 'benefits.export', actorId: user.id, entity: 'person', entityId: personId,
      purpose: finalidade, detail: { formato },
    });
    return { ok: true, formato, aviso: 'Exportação registrada em auditoria com finalidade declarada.' };
  }

  private async lastAccess(personId: string, exceptActor: string) {
    const { rows: [r] } = await this.db.query(
      `SELECT a.at, u.full_name FROM audit_event a
       LEFT JOIN app_user u ON u.id = a.actor_id
       WHERE a.entity_id = $1 AND a.action IN ('benefits.view','benefits.update','benefits.export')
         AND a.actor_id <> $2
       ORDER BY a.at DESC LIMIT 1`, [personId, exceptActor]);
    return r ? { por: r.full_name, em: r.at } : null;
  }
}

function camposAlterados(antes: Record<string, unknown> | undefined, depois: Record<string, unknown>): string[] {
  if (!antes) return [];
  const mapa: Record<string, string> = {
    benefit_type: 'tipo', bank_name: 'banco', agency: 'agencia', account: 'conta', status: 'situacao',
  };
  return Object.entries(mapa)
    .filter(([col, campo]) => depois[campo] !== undefined && depois[campo] !== antes[col])
    .map(([, campo]) => campo);
}
