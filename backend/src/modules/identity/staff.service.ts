import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser, RoleCode } from '../../kernel/contracts';
import { hashPassword } from '../../kernel/common/crypto';

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
    descricao: 'Somente o relatório de restrições alimentares — sem acesso a perfil' },
  { code: 'enfermagem', label: 'Enfermagem', transversal: true,
    descricao: 'Saúde das oito casas: prescrições, triagem de evoluções e Resumo de Saúde' },
  { code: 'lider_noturno_geral', label: 'Líder Noturno Geral', transversal: true,
    descricao: 'Plantão noturno das oito casas e ATA Geral Noturna' },
  { code: 'coordenador', label: 'Coordenação', transversal: false,
    descricao: 'Equipe da casa, aprovações, transferências e dados bancários com reautenticação' },
  { code: 'gestor_geral', label: 'Gestor Geral', transversal: true,
    descricao: 'Escopo institucional; abre uma casa por vez, com auditoria' },
  { code: 'admin_tecnico', label: 'Administração técnica', transversal: true,
    descricao: 'Infraestrutura e suporte; sem acesso comum ao conteúdo do acolhimento' },
];

const LABEL = new Map(SETORES.map((s) => [s.code, s.label]));

/** Senha inicial legível: fácil de ditar por telefone, trocada no primeiro acesso. */
function senhaInicial(): string {
  const palavras = ['acolher', 'cuidado', 'plantao', 'unidade', 'equipe', 'rotina', 'abrigo'];
  const p = palavras[Math.floor(Math.random() * palavras.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${p}-${n}`;
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
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /** Setores que ESTE usuário pode cadastrar — a tela não oferece o que ele não pode. */
  async setores(user: AuthenticatedUser) {
    const permitidos = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT grantable_role FROM staff_role_grant WHERE creator_role = app_current_role()`);
      return new Set(rows.map((r) => r.grantable_role as string));
    });
    return SETORES
      .filter((s) => permitidos.has(s.code))
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
      ativo: r.active,
      ultimoAcesso: r.last_login,
      senhaInicialPendente: r.must_change_password,
      editavel: r.editavel,
      proprio: r.id === user.id,
    }));
  }

  async create(user: AuthenticatedUser, input: {
    nome: string; email: string; cargo: RoleCode; casaId?: string; senhaInicial?: string;
  }) {
    const senha = (input.senhaInicial ?? '').trim() || senhaInicial();
    if (senha.length < 6) {
      throw new BadRequestException('A senha inicial precisa de pelo menos 6 caracteres.');
    }
    const hash = await hashPassword(senha);

    const id = await this.comando(user, 'app_create_staff($1,$2,$3::role_code,$4,$5)',
      [input.email ?? '', input.nome ?? '', input.cargo, input.casaId ?? null, hash]);

    return {
      id: id.out_id,
      senhaInicial: senha,
      aviso: 'Entregue esta senha à pessoa — ela é mostrada uma única vez. '
           + 'No primeiro acesso o sistema sugere que ela crie uma senha própria.',
    };
  }

  async update(user: AuthenticatedUser, id: string, input: {
    nome?: string; cargo?: RoleCode; casaId?: string;
  }) {
    await this.comando(user, 'app_update_staff($1,$2,$3::role_code,$4)',
      [id, input.nome ?? null, input.cargo ?? null, input.casaId ?? null]);
    return { ok: true };
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
    if (senha.length < 6) {
      throw new BadRequestException('A senha precisa de pelo menos 6 caracteres.');
    }
    await this.comando(user, 'app_reset_staff_password($1,$2)', [id, await hashPassword(senha)]);
    return {
      senhaInicial: senha,
      aviso: 'Senha redefinida e sessões encerradas. Entregue a senha à pessoa; '
           + 'ela é mostrada uma única vez.',
    };
  }

  // ------------------------------------------------------------------

  private async comando(user: AuthenticatedUser, sql: string, params: unknown[]): Promise<any> {
    try {
      return await this.db.asUser(user.id, async (c) => {
        const { rows: [row] } = await c.query(`SELECT * FROM ${sql}`, params);
        return row;
      });
    } catch (e: any) {
      const m: string = e?.message ?? '';
      if (e?.code === '23505' || /app_user_email_key/.test(m)) {
        throw new ConflictException('Já existe uma conta com este e-mail.');
      }
      if (m.includes('cargo_nao_pode_criar:') || m.includes('cargo_nao_pode_editar:')) {
        const cargo = m.split(':').pop()?.trim() ?? '';
        throw new ForbiddenException(
          `Seu cargo não cadastra nem altera "${LABEL.get(cargo as RoleCode) ?? cargo}". `
          + 'Criar contas de escopo institucional é do Gestor Geral — do contrário, bastaria '
          + 'uma conta nova para enxergar as oito casas.');
      }
      if (m.includes('cargo_exige_casa')) {
        throw new BadRequestException('Escolha a casa deste profissional.');
      }
      if (m.includes('aparelho_institucional_e_do_gestor')) {
        throw new ForbiddenException('O aparelho institucional é registrado pelo Gestor Geral.');
      }
      if (m.includes('fora_de_escopo')) {
        throw new ForbiddenException('Esta casa não está no seu alcance.');
      }
      if (m.includes('nome_insuficiente')) throw new BadRequestException('Informe o nome completo.');
      if (m.includes('email_invalido')) throw new BadRequestException('E-mail institucional inválido.');
      if (m.includes('motivo_insuficiente')) {
        throw new BadRequestException('Informe o motivo da desativação — ele fica registrado.');
      }
      if (m.includes('nao_desativa_a_si_mesmo')) {
        throw new BadRequestException('Você não pode desativar a própria conta.');
      }
      if (m.includes('usuario_inexistente')) throw new NotFoundException('Usuário não encontrado.');
      throw e;
    }
  }
}
