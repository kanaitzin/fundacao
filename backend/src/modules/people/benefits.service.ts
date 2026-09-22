import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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

/**
 * OS TIPOS DE BENEFÍCIO, e as três situações em que um deles pode estar.
 *
 * `benefit_type` é texto livre no banco (0020), e texto livre digitado por
 * vinte pessoas diferentes vira "BPC", "B.P.C.", "bpc" e "benefício de
 * prestação continuada" na mesma casa — quatro coisas para o sistema, uma só
 * para quem cuida. A lista sai daqui, do servidor, e a tela não inventa a dela.
 *
 * "Em regularização" é a situação que mais aparece na prática e a que mais
 * some das planilhas: o benefício existe, está travado em algum lugar da rede,
 * e alguém precisa lembrar disso.
 */
export const TIPOS_BENEFICIO = [
  { cod: 'bpc', label: 'BPC — Benefício de Prestação Continuada' },
  { cod: 'pensao', label: 'Pensão' },
  { cod: 'poupanca_institucional', label: 'Poupança institucional' },
  { cod: 'bolsa_familia', label: 'Bolsa Família / transferência de renda' },
  { cod: 'auxilio_judicial', label: 'Valor depositado por decisão judicial' },
  { cod: 'outro', label: 'Outro benefício ou conta' },
] as const;

export const SITUACOES_BENEFICIO = [
  { cod: 'ativo', label: 'Ativo' },
  { cod: 'em_regularizacao', label: 'Em regularização' },
  { cod: 'encerrado', label: 'Encerrado' },
] as const;

@Injectable()
export class BenefitsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** O vocabulário é do servidor. A tela desenha o que vier daqui. */
  vocabulario() {
    return {
      tipos: TIPOS_BENEFICIO, situacoes: SITUACOES_BENEFICIO,
      aviso: 'Esta área exige a sua senha de novo e registra cada visualização, alteração e '
        + 'exportação, com a finalidade que você declarar. Nada daqui aparece em linha do '
        + 'tempo, ATA, notificação, relatório geral ou busca.',
    };
  }

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
      action: 'benefits.denied', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'person', entityId: personId,
      detail: { papel: user.role, motivo },
    });
    throw new ForbiddenException(
      'Somente a coordenação da casa atual do acolhido e o Gestor Geral acessam esta área.');
  }

  async list(user: AuthenticatedUser, personId: string, finalidade: string) {
    if (!['coordenador', 'gestor_geral'].includes(user.role)) {
      // Auditar a tentativa: acesso negado a dado sensível é informação relevante.
      await this.audit.log({
        action: 'benefits.denied', actorId: user.id,
        houseId: await this.audit.casaDoAcolhido(user.id, personId),
        entity: 'person', entityId: personId,
        detail: { papel: user.role },
      });
      throw new ForbiddenException('Somente a coordenação da casa atual e o Gestor Geral acessam esta área.');
    }
    if (!finalidade?.trim()) throw new BadRequestException('Informe a finalidade do acesso.');
    this.exigirReauth(user);
    if (!(await this.podeVer(user, personId))) await this.negar(user, personId, 'fora_da_casa_atual');

    // A leitura e o registro da leitura acontecem na MESMA transação: nesta
    // área, "quem viu, quando e para quê" não pode ficar separado do ato de ver.
    const rows = await this.db.asUser(user.id, async (c) => {
      // A migração 055 acrescentou as colunas que a planilha real usa — número
      // do benefício, operação, nome da agência e, sobretudo, a PENDÊNCIA
      // BANCÁRIA, que é o motivo de a planilha existir. O serviço nunca as leu
      // nem as gravou: o sistema tinha as colunas e continuava sem responder
      // "o que falta resolver no banco desta criança?".
      const { rows } = await c.query(
        `SELECT id, benefit_type, benefit_number, bank_name, agency, agency_name, account,
                account_op, status, notes, bank_pending, pending_note,
                has_gov_access, gov_access_holder, gov_access_note, updated_at,
                app_user_display_name(updated_by) AS atualizado_por
         FROM benefit_record WHERE person_id = $1
         -- Pendência primeiro: é o que alguém precisa resolver.
         ORDER BY bank_pending DESC, benefit_type`, [personId]);

      // Log por VISUALIZAÇÃO, com finalidade declarada (§6.10)
      await this.audit.log({
        action: 'benefits.view', actorId: user.id, entity: 'person', entityId: personId,
        purpose: finalidade, houseId: null,
        detail: { registros: rows.length },   // nunca o conteúdo bancário
      }, c);
      return rows;
    });

    const ultimoAcesso = await this.lastAccess(personId, user.id);
    const registros = rows.map((r) => ({
      id: r.id,
      tipo: r.benefit_type,
      tipoRotulo: TIPOS_BENEFICIO.find((t) => t.cod === r.benefit_type)?.label ?? r.benefit_type,
      numero: r.benefit_number,
      banco: r.bank_name, agencia: r.agency, agenciaNome: r.agency_name,
      conta: r.account, operacao: r.account_op,
      situacao: r.status,
      situacaoRotulo: SITUACOES_BENEFICIO.find((s) => s.cod === r.status)?.label ?? r.status,
      pendenciaBancaria: r.bank_pending,
      pendenciaNota: r.pending_note,
      observacoes: r.notes,
      // A EXISTÊNCIA da credencial e quem responde por ela. Nunca o segredo:
      // ele fica no cofre cifrado, que é outra porta com outro registro.
      temAcessoGov: r.has_gov_access,
      responsavelPeloAcesso: r.gov_access_holder,
      ondeEstaGuardado: r.gov_access_note,
      atualizadoEm: r.updated_at, atualizadoPor: r.atualizado_por,
    }));
    return {
      registros,
      pendencias: registros.filter((r) => r.pendenciaBancaria).length,
      ultimoAcesso,
      aviso: 'Cada visualização, edição, impressão e exportação desta área é registrada.',
    };
  }

  /**
   * QUEM ABRIU ESTA ÁREA, QUANDO E PARA QUÊ.
   *
   * O cofre de credenciais já tinha esse histórico; os benefícios, não — e sem
   * ele o log existia só para quem lê auditoria, que é área restrita. A
   * coordenação, que responde pela criança, não tinha como saber quem andou
   * olhando a conta dela.
   */
  async historico(user: AuthenticatedUser, personId: string) {
    if (!['coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente a coordenação da casa atual e o Gestor Geral acessam esta área.');
    }
    this.exigirReauth(user);
    if (!(await this.podeVer(user, personId))) await this.negar(user, personId, 'fora_da_casa_atual');

    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_benefit_history($1)`, [personId]);
      return rows;
    });
    const ACAO: Record<string, string> = {
      'benefits.view': 'consulta', 'benefits.create': 'cadastro',
      'benefits.update': 'alteração', 'benefits.export': 'exportação',
      'benefits.denied': 'tentativa recusada',
    };
    return rows.map((r) => ({
      quando: r.quando, quem: r.quem, finalidade: r.finalidade,
      acao: ACAO[r.acao] ?? r.acao,
      // A tentativa recusada NÃO some do histórico: quem responde pela criança
      // precisa saber que alguém tentou entrar e não pôde.
      recusada: r.acao === 'benefits.denied',
    }));
  }

  async upsert(user: AuthenticatedUser, personId: string, input: {
    id?: string; tipo: string; numero?: string; banco?: string; agencia?: string;
    agenciaNome?: string; conta?: string; operacao?: string;
    situacao?: string; observacoes?: string;
    pendenciaBancaria?: boolean; pendenciaNota?: string;
    temAcessoGov?: boolean; responsavelPeloAcesso?: string; ondeEstaGuardado?: string;
    finalidade: string;
  }) {
    if (!['coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Sem permissão para editar benefícios.');
    }
    if (!input.finalidade?.trim()) throw new BadRequestException('Informe a finalidade da alteração.');
    if (!TIPOS_BENEFICIO.some((t) => t.cod === input.tipo)) {
      throw new BadRequestException(
        `Escolha o tipo do benefício: ${TIPOS_BENEFICIO.map((t) => t.label).join(', ')}.`);
    }
    if (input.situacao && !SITUACOES_BENEFICIO.some((s) => s.cod === input.situacao)) {
      throw new BadRequestException('Situação inválida.');
    }
    // Pendência sem uma linha dizendo QUAL é não ajuda ninguém: seis meses
    // depois, "pendente" sozinho é uma caixa marcada que ninguém sabe resolver.
    if (input.pendenciaBancaria && !input.pendenciaNota?.trim()) {
      throw new BadRequestException(
        'Escreva qual é a pendência bancária. "Pendente" sozinho não diz a ninguém o que '
        + 'falta fazer — e é justamente isso que precisa passar de uma coordenação para a '
        + 'próxima.');
    }
    // O sistema registra que a credencial EXISTE e quem responde por ela. A
    // senha fica no cofre cifrado (§6.10, §22), e o CHECK da 055 já recusa algo
    // com cara de senha nos campos de texto — aqui a recusa vira uma frase.
    const comCaraDeSenha = /(senha|password|passwd)\s*[:=]/i;
    for (const [campo, valor] of Object.entries({
      observacoes: input.observacoes, pendenciaNota: input.pendenciaNota,
      ondeEstaGuardado: input.ondeEstaGuardado,
    })) {
      if (valor && comCaraDeSenha.test(valor)) {
        throw new BadRequestException(
          `O campo "${campo}" parece conter uma senha. A senha tem lugar próprio e cifrado no `
          + 'cofre de acessos; aqui fica só ONDE ela está guardada e quem responde por ela.');
      }
    }
    this.exigirReauth(user);
    if (!(await this.podeVer(user, personId))) await this.negar(user, personId, 'fora_da_casa_atual');

    const res = await this.db.asUser(user.id, async (c) => {
      if (input.id) {
        // O `id` do registro precisa PERTENCER a este acolhido. Antes, a
        // autorização era conferida pelo personId da URL e o UPDATE usava só o
        // id do registro: com um id de outro acolhido da mesma casa — que passa
        // pelo RLS — a conta bancária de uma criança era sobrescrita com os
        // dados de outra, e a auditoria registrava o `entityId` de uma com o
        // `personId` da outra. Na área mais sensível do sistema, o log contava
        // outra história.
        const { rows: [antes] } = await c.query(
          `SELECT benefit_type, benefit_number, bank_name, agency, agency_name, account,
                  account_op, status, bank_pending, has_gov_access
             FROM benefit_record WHERE id = $1 AND person_id = $2`, [input.id, personId]);
        if (!antes) {
          throw new NotFoundException('Registro de benefício não encontrado para este acolhido.');
        }
        const { rows: [r] } = await c.query(
          `UPDATE benefit_record SET benefit_type=$2, benefit_number=$3, bank_name=$4,
             agency=$5, agency_name=$6, account=$7, account_op=$8,
             status=coalesce($9,status), notes=$10,
             bank_pending=coalesce($11,bank_pending), pending_note=$12,
             has_gov_access=coalesce($13,has_gov_access), gov_access_holder=$14,
             gov_access_note=$15, updated_at=now(), updated_by=$16
           WHERE id = $1 AND person_id = $17 RETURNING id`,
          [input.id, input.tipo, input.numero ?? null, input.banco ?? null,
           input.agencia ?? null, input.agenciaNome ?? null, input.conta ?? null,
           input.operacao ?? null, input.situacao ?? null, input.observacoes ?? null,
           input.pendenciaBancaria ?? null, input.pendenciaNota ?? null,
           input.temAcessoGov ?? null, input.responsavelPeloAcesso ?? null,
           input.ondeEstaGuardado ?? null, user.id, personId]);
        if (!r?.id) throw new NotFoundException('Registro de benefício não encontrado para este acolhido.');
        return { id: r.id, criado: false, mudouCampos: camposAlterados(antes, input) };
      }
      const { rows: [r] } = await c.query(
        `INSERT INTO benefit_record (person_id, benefit_type, benefit_number, bank_name,
           agency, agency_name, account, account_op, status, notes,
           bank_pending, pending_note, has_gov_access, gov_access_holder, gov_access_note,
           created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9,'ativo'),$10,
                 coalesce($11,false),$12,coalesce($13,false),$14,$15,$16,$16) RETURNING id`,
        [personId, input.tipo, input.numero ?? null, input.banco ?? null,
         input.agencia ?? null, input.agenciaNome ?? null, input.conta ?? null,
         input.operacao ?? null, input.situacao ?? null, input.observacoes ?? null,
         input.pendenciaBancaria ?? null, input.pendenciaNota ?? null,
         input.temAcessoGov ?? null, input.responsavelPeloAcesso ?? null,
         input.ondeEstaGuardado ?? null, user.id]);
      return { id: r.id, criado: true, mudouCampos: [] as string[] };
    });

    await this.audit.log({
      action: res.criado ? 'benefits.create' : 'benefits.update',
      actorId: user.id, houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'benefit_record', entityId: res.id,
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
      action: 'benefits.export', actorId: user.id,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'person', entityId: personId,
      purpose: finalidade, detail: { formato },
    });
    return { ok: true, formato, aviso: 'Exportação registrada em auditoria com finalidade declarada.' };
  }

  private async lastAccess(personId: string, exceptActor: string) {
    const { rows: [r] } = await this.db.query(
      `SELECT a.at, app_user_display_name(a.actor_id) AS full_name FROM audit_event a
       WHERE a.entity_id = $1 AND a.action IN ('benefits.view','benefits.update','benefits.export')
         AND a.actor_id <> $2
       ORDER BY a.at DESC LIMIT 1`, [personId, exceptActor]);
    return r ? { por: r.full_name, em: r.at } : null;
  }
}

function camposAlterados(antes: Record<string, unknown> | undefined, depois: Record<string, unknown>): string[] {
  if (!antes) return [];
  const mapa: Record<string, string> = {
    benefit_type: 'tipo', benefit_number: 'numero', bank_name: 'banco', agency: 'agencia',
    agency_name: 'agenciaNome', account: 'conta', account_op: 'operacao', status: 'situacao',
    bank_pending: 'pendenciaBancaria', has_gov_access: 'temAcessoGov',
  };
  return Object.entries(mapa)
    .filter(([col, campo]) => depois[campo] !== undefined && depois[campo] !== antes[col])
    .map(([, campo]) => campo);
}
