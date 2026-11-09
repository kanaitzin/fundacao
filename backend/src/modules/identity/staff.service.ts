import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../kernel/audit/audit.service';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser, RoleCode } from '../../kernel/contracts';
import { randomInt } from 'node:crypto';
import { hashPassword } from '../../kernel/common/crypto';
import { FRASE_DA_SENHA, senhaAceita, senhaInicialSorteada } from '../../kernel/common/senha.regra';

/**
 * SETORES — os cargos do §5, com a descrição que a tela mostra.
 *
 * A ordem é a da casa para fora: quem está com as crianças primeiro.
 */
export const SETORES: Array<{
  code: RoleCode; label: string; descricao: string; transversal: boolean;
}> = [
  { code: 'educador', label: 'Educador social', transversal: false,
    descricao: 'Plantão, rotina, chamadas e passagem individual' },
  { code: 'lider_diurno', label: 'Líder Diurno', transversal: false,
    descricao: 'Conduz o plantão diurno e fecha a ATA da casa' },
  { code: 'equipe_tecnica', label: 'Equipe técnica', transversal: false,
    descricao: 'Perfil do acolhido, acompanhamentos, relatos lado a lado e revisão técnica' },
  { code: 'cozinha', label: 'Cozinha', transversal: false,
    descricao: 'Somente o relatório de restrições alimentares, sem acesso a perfil' },
  { code: 'portaria', label: 'Portaria', transversal: false,
    descricao: 'Somente quem pode visitar hoje, e a entrada e a saída das visitas, sem acesso a perfil' },
  { code: 'enfermagem', label: 'Enfermagem', transversal: true,
    descricao: 'Saúde das oito casas: prescrições, triagem de evoluções e Resumo de Saúde' },
  { code: 'lider_noturno_geral', label: 'Líder Noturno Geral', transversal: true,
    descricao: 'Plantão noturno das oito casas e ATA Geral Noturna' },
  { code: 'coordenador', label: 'Coordenação', transversal: false,
    descricao: 'Equipe da casa, aprovações, transferências e dados bancários com reautenticação' },
  { code: 'gestor_geral', label: 'Gestor Geral', transversal: true,
    descricao: 'Escopo institucional; abre uma casa por vez, com auditoria' },
];

const LABEL = new Map(SETORES.map((s) => [s.code, s.label]));

/** O e-mail que veio da casa fica a confirmar na promoção para todas as casas (1685). */
const FRASE_DO_EMAIL_A_CONFIRMAR = 'Confira o e-mail institucional da pessoa em Confirmar o e-mail: '
  + 'até lá, o esqueci minha senha e o convite não vão a ele.';

/**
 * SENHA INICIAL (fase 291): a regra mora no `senha.regra.ts`; aqui, o sorteio pelo
 * `randomInt` do `node:crypto` (o `Math.random` não é para segredo). A pessoa a troca no
 * primeiro acesso, e o servidor cobra.
 */
export function senhaInicial(): string {
  return senhaInicialSorteada(randomInt);
}

/**
 * GESTÃO DA EQUIPE (§5.3).
 *
 * O que este serviço deliberadamente NÃO tem: remoção de usuário. Desligado é
 * DESATIVADO (§3.3, §5.1). Apagar a conta transformaria em "usuário
 * desconhecido" tudo o que a pessoa registrou — passagens, ATAs assinadas,
 * confirmações de dose —, e num sistema de proteção saber quem escreveu o quê
 * é metade do valor do registro.
 */
@Injectable()
export class StaffService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Setores que ESTE usuário pode cadastrar — a tela não oferece o que ele não pode. */
  async setores(user: AuthenticatedUser) {
    const { permitidos, todas } = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT grantable_role FROM staff_role_grant WHERE creator_role = app_current_role()`);
      const { rows: [eu] } = await c.query(`SELECT app_eu_alcanco_toda_a_instituicao() AS todas`);
      return { permitidos: new Set(rows.map((r) => r.grantable_role as string)), todas: !!eu?.todas };
    });
    /* Cargo que alcança todas as casas só é oferecido a quem também alcança todas: o Gestor
       Geral e a Coordenação Geral (decisão de 08/11, identity/1683). */
    return SETORES
      .filter((s) => permitidos.has(s.code) && (!s.transversal || todas))
      .map((s) => ({ ...s, exigeCasa: !s.transversal }));
  }

  async list(user: AuthenticatedUser) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_staff_list()`);
      return rows;
    });
    return rows.map((r) => ({
      id: r.id,
      nome: r.full_name,
      email: r.email,
      cargo: r.role,
      setor: LABEL.get(r.role as RoleCode) ?? r.role,
      transversal: SETORES.find((s) => s.code === r.role)?.transversal ?? false,
      casa: r.house_code,
      casaId: r.house_id,
      corDaLinha: r.line_color ?? null,
      ativo: r.active,
      ultimoAcesso: r.last_login,
      senhaInicialPendente: r.must_change_password,
      editavel: r.editavel,
      proprio: r.id === user.id,
      todasAsCasas: !!r.todas_as_casas,
      emailAConfirmar: !!r.email_a_confirmar,
    }));
  }

  async create(user: AuthenticatedUser, input: {
    nome: string; email: string; cargo: RoleCode; casaId?: string; senhaInicial?: string;
    todasAsCasas?: boolean;
  }) {
    if (input.todasAsCasas && (input.cargo !== 'coordenador' || input.casaId)) {
      throw new BadRequestException(
        'A Coordenação Geral é uma coordenação sem casa: escolha o cargo Coordenação e deixe a casa em branco.');
    }
    const senha = (input.senhaInicial ?? '').trim() || senhaInicial();
    if (!senhaAceita(senha)) throw new BadRequestException(FRASE_DA_SENHA);
    const hash = await hashPassword(senha);

    /* A Coordenação Geral nasce sem casa, por uma função só dela (1634): o
       cadastro comum exige casa para coordenador, e inventar uma deixaria no
       histórico uma passagem que não houve. */
    const id = input.todasAsCasas
      ? await this.comando(user, 'app_create_coordenacao_geral($1,$2,$3)',
          [input.email ?? '', input.nome ?? '', hash])
      : await this.comando(user, 'app_create_staff($1,$2,$3::role_code,$4,$5)',
          [input.email ?? '', input.nome ?? '', input.cargo, input.casaId ?? null, hash]);
    return {
      id: id.out_id,
      senhaInicial: senha,
      aviso: 'Entregue esta senha à pessoa. Ela é mostrada uma única vez, e no primeiro '
           + 'acesso a pessoa cria a senha dela antes de começar.',
    };
  }

  async update(user: AuthenticatedUser, id: string, input: {
    nome?: string; cargo?: RoleCode; casaId?: string;
  }) {
    /*
     * A SENHA DE ANTES NÃO ACOMPANHA A CONTA para um cargo que quem a sabia não
     * administra (1683), nem para outra casa (1685): da casa para todas as casas, de
     * educador para coordenação, ou da Casa 03 para a Casa 04. O banco encerra a senha,
     * as sessões e os convites na mudança; aqui, na mesma transação, a senha nova é
     * redefinida por quem fez a mudança e volta só para ela.
     */
    const r = await this.naConta(user, async (c) => {
      await c.query(`SELECT * FROM app_update_staff($1,$2,$3::role_code,$4)`,
        [id, input.nome ?? null, input.cargo ?? null, input.casaId ?? null]);
      return this.depoisDaMudanca(c, id);
    });
    if (!r.senha) return { ok: true, ...(r.emailAConfirmar ? { emailAConfirmar: r.emailAConfirmar } : {}) };
    return {
      ok: true,
      senhaInicial: r.senha,
      ...(r.emailAConfirmar ? { emailAConfirmar: r.emailAConfirmar } : {}),
      aviso: 'A senha de antes deixou de valer e as sessões abertas foram encerradas, porque '
           + 'quem a conhecia não administra mais esta conta. Entregue esta senha nova à '
           + 'pessoa; ela é mostrada uma única vez.'
           + (r.emailAConfirmar ? ` ${FRASE_DO_EMAIL_A_CONFIRMAR}` : ''),
    };
  }

  /**
   * Depois de uma mudança de cargo ou de casa: se o banco encerrou a senha de antes,
   * redefine na mesma transação e devolve a senha nova a quem mudou; e diz o e-mail que
   * ficou a confirmar, quando a conta passou a atender todas as casas.
   */
  private async depoisDaMudanca(c: any, id: string): Promise<{ senha: string | null; emailAConfirmar: string | null }> {
    const { rows: [m] } = await c.query(`SELECT app_acesso_encerrado($1) AS encerrado`, [id]);
    let senha: string | null = null;
    if (m?.encerrado) {
      senha = senhaInicial();
      await c.query(`SELECT * FROM app_reset_staff_password($1,$2)`, [id, await hashPassword(senha)]);
    }
    const { rows: [l] } = await c.query(
      `SELECT email, email_a_confirmar FROM app_staff_list() WHERE id = $1`, [id]);
    return { senha, emailAConfirmar: l?.email_a_confirmar ? l.email : null };
  }

  /**
   * O E-MAIL DA PROMOÇÃO (decisão de 09/11, 1685): a conta que passou a atender todas as
   * casas fica com o e-mail que a casa digitou até o Gestor Geral ou a Coordenação Geral
   * confirmar ou trocar. Até lá, o esqueci minha senha não manda nada e o convite é recusado.
   */
  async confirmarEmail(user: AuthenticatedUser, id: string, email?: string) {
    const r = await this.naConta(user, async (c) => {
      const { rows: [row] } = await c.query(`SELECT * FROM app_confirmar_email($1,$2)`, [id, email ?? '']);
      return row;
    });
    return {
      ok: true,
      aviso: r.out_trocou
        ? `E-mail de ${r.out_nome} trocado e confirmado. O esqueci minha senha e o convite passam a ir para ele.`
        : `E-mail de ${r.out_nome} confirmado. O esqueci minha senha e o convite passam a ir para ele.`,
    };
  }

  /**
   * A COORDENAÇÃO GERAL (decisão de 28/09, 1634): coordenador que alcança as
   * oito casas. Só o Gestor Geral marca ou desmarca, e fica na auditoria.
   */
  async marcarCoordenacaoGeral(user: AuthenticatedUser, id: string, todas: boolean) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_marcar_coordenacao_geral($1, $2)`, [id, !!todas]);
      /* A senha de antes não acompanha a conta para as oito casas (1683), e o e-mail
         que veio da casa fica a confirmar (1685). */
      return { ...row, ...(await this.depoisDaMudanca(c, id)) };
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('so_o_gestor_marca_coordenacao_geral')) {
        throw new ForbiddenException('Só o Gestor Geral define quem é a Coordenação Geral.');
      }
      if (m.includes('coordenacao_geral_so_para_coordenador')) {
        throw new BadRequestException('A Coordenação Geral é do cargo Coordenação. Troque o cargo antes.');
      }
      if (m.includes('usuario_inexistente')) throw new NotFoundException('Pessoa não encontrada.');
      throw e;
    });
    await this.audit.log({
      action: 'staff.coordenacao_geral', actorId: user.id, institutionId: user.institutionId,
      entity: 'app_user', entityId: id, detail: { todasAsCasas: !!todas },
    });
    return {
      ok: true, todasAsCasas: !!todas,
      ...(r.senha ? { senhaInicial: r.senha } : {}),
      ...(r.emailAConfirmar ? { emailAConfirmar: r.emailAConfirmar } : {}),
      aviso: todas
        ? `${r.out_nome} passa a coordenar as oito casas. O vínculo com a casa em que estava foi encerrado, e o histórico continua.`
          + (r.senha ? ' A senha de antes deixou de valer e as sessões abertas foram encerradas. Entregue esta senha nova à pessoa; ela é mostrada uma única vez.' : '')
          + (r.emailAConfirmar ? ` ${FRASE_DO_EMAIL_A_CONFIRMAR}` : '')
        : `${r.out_nome} deixa de coordenar as oito casas. Para voltar a uma casa, lance o vínculo na equipe dela.`,
    };
  }

  async setActive(user: AuthenticatedUser, id: string, ativo: boolean, motivo?: string) {
    await this.comando(user, 'app_set_staff_active($1,$2,$3)', [id, ativo, motivo ?? null]);
    return {
      ok: true, ativo,
      aviso: ativo
        ? 'Reativado. O histórico dele nunca deixou de existir.'
        : 'Desativado, e as sessões abertas foram encerradas. O histórico e a autoria '
          + 'de tudo o que registrou permanecem — o sistema não apaga pessoas.',
    };
  }

  async resetPassword(user: AuthenticatedUser, id: string, nova?: string) {
    const senha = (nova ?? '').trim() || senhaInicial();
    if (!senhaAceita(senha)) throw new BadRequestException(FRASE_DA_SENHA);
    await this.comando(user, 'app_reset_staff_password($1,$2)', [id, await hashPassword(senha)]);
    return {
      senhaInicial: senha,
      aviso: 'Senha redefinida e sessões encerradas. Entregue a senha à pessoa; '
           + 'ela é mostrada uma única vez.',
    };
  }

  // ------------------------------------------------------------------

  private async comando(user: AuthenticatedUser, sql: string, params: unknown[]): Promise<any> {
    return this.naConta(user, async (c) => {
      const { rows: [row] } = await c.query(`SELECT * FROM ${sql}`, params);
      return row;
    });
  }

  /** Roda na conta de quem pede e traduz as recusas do banco. */
  private async naConta<T>(user: AuthenticatedUser, fn: (c: any) => Promise<T>): Promise<T> {
    try {
      return await this.db.asUser(user.id, fn);
    } catch (e: any) {
      const m: string = e?.message ?? '';
      if (e?.code === '23505' || /app_user_email_key/.test(m)) {
        throw new ConflictException('Já existe uma conta com este e-mail.');
      }
      /*
       * Cargo que não existe no banco devolvia 500 — erro interno na cara de
       * quem só digitou algo fora da lista. Encontrado no ensaio de uso, e a
       * causa foi instrutiva: a matriz de permissões documentava "Educador
       * volante" como cargo, e ele nunca existiu no enum. Documento e código
       * discordavam, e quem pagava era a tela.
       */
      if (e?.code === '22P02' || /invalid input value for enum role_code/.test(m)) {
        const cargos = [...LABEL.entries()].map(([c, l]) => `${l} (${c})`).join('; ');
        throw new BadRequestException(`Cargo desconhecido. Os cargos são: ${cargos}.`);
      }
      if (m.includes('cargo_nao_pode_criar:') || m.includes('cargo_nao_pode_editar:')) {
        const cargo = m.split(':').pop()?.trim() ?? '';
        throw new ForbiddenException(
          `Seu cargo não cadastra nem altera "${LABEL.get(cargo as RoleCode) ?? cargo}". `
          + 'Contas de escopo institucional são criadas pelo Gestor Geral.');
      }
      if (m.includes('cargo_exige_casa')) {
        throw new BadRequestException('Escolha a casa deste profissional.');
      }
      if (m.includes('aparelho_institucional_e_do_gestor')) {
        throw new ForbiddenException('O aparelho institucional é registrado pelo Gestor Geral.');
      }
      // As recusas do gatilho de quem administra a conta (identity/1681 e 1682).
      if (m.includes('nao_administra_a_si_mesmo')) {
        throw new ForbiddenException('A sua própria conta é alterada por quem administra a equipe.');
      }
      if (m.includes('vinculo_de_quem_atende_todas')) {
        throw new BadRequestException('Quem atende todas as casas fica sem casa de trabalho: deixe a casa em branco.');
      }
      if (m.includes('conta_de_toda_a_instituicao')) {
        throw new ForbiddenException(
          'A conta de quem atende todas as casas é criada e alterada pelo Gestor Geral ou pela Coordenação Geral.');
      }
      if (m.includes('fora_de_escopo')) {
        throw new ForbiddenException('Esta casa não está no seu alcance.');
      }
      if (m.includes('so_o_gestor_marca_coordenacao_geral')) {
        throw new ForbiddenException('Só o Gestor Geral define quem é a Coordenação Geral.');
      }
      if (m.includes('nome_insuficiente')) throw new BadRequestException('Informe o nome completo.');
      if (m.includes('email_invalido')) throw new BadRequestException('E-mail institucional inválido.');
      if (m.includes('email_em_uso')) throw new ConflictException('Já existe uma conta com este e-mail.');
      if (m.includes('motivo_insuficiente')) {
        throw new BadRequestException('Informe o motivo da desativação. Ele fica registrado.');
      }
      if (m.includes('nao_desativa_a_si_mesmo')) {
        throw new BadRequestException('Você não pode desativar a própria conta.');
      }
      if (m.includes('usuario_inexistente')) throw new NotFoundException('Usuário não encontrado.');
      throw e;
    }
  }
  /** Que cores já estão em uso na casa — para a tela não oferecer o que o
   *  servidor vai recusar. */
  async coresEmUso(user: AuthenticatedUser, houseId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_cores_em_uso($1)`, [houseId]);
      return rows.map((r) => ({ cor: r.cor, deQuem: r.de_quem, userId: r.user_id }));
    });
  }

  /**
   * A cor da linha de alguém. `cor: null` devolve ao tom automático.
   *
   * Quem escolhe é a técnica ou a coordenação, não a própria pessoa: se cada um
   * escolhesse a sua, o primeiro a entrar levaria o azul e a distinção viraria
   * ordem de chegada.
   */
  async definirCor(user: AuthenticatedUser, id: string, cor: string | null) {
    let r: any;
    try {
      r = await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(
          `SELECT * FROM app_definir_cor_da_linha($1,$2)`, [id, cor]);
        return row;
      });
    } catch (e: any) {
      /*
       * A frase do banco precisa chegar em PORTUGUÊS a quem clicou.
       *
       * Sem esta tradução a recusa voltava 500 "Internal server error": a
       * coordenação via um erro genérico, tentava outro tom, e o nome de quem
       * já tem a cor — que é o que torna a recusa útil — morria no log. É a
       * mesma família de defeito que a auditoria de mensagens corrigiu, e ela
       * voltou pela porta de uma função nova.
       */
      const m = String(e?.message ?? '');
      const dona = /cor_ja_usada_por_(.+)$/.exec(m);
      if (dona) {
        throw new ConflictException(
          `Esta cor já é de ${dona[1]}. Escolha outra. Duas pessoas da mesma casa `
          + 'não podem ter a mesma cor de linha.');
      }
      if (m.includes('sem_permissao_cor')) {
        throw new ForbiddenException(
          'Só a equipe técnica ou a coordenação definem a cor da linha de alguém.');
      }
      if (m.includes('fora_de_escopo')) {
        throw new NotFoundException('Pessoa não encontrada nesta casa.');
      }
      if (m.includes('ck_app_user_line_color')) {
        throw new BadRequestException(
          'Este tom não está na paleta conferida. Escolha um dos oito oferecidos.');
      }
      throw e;
    }
    await this.audit.log({
      action: 'staff.line_color', actorId: user.id, institutionId: user.institutionId,
      entity: 'app_user', entityId: id, detail: { cor },
    });
    return { definida: true, cor: r.cor ?? null };
  }

}
