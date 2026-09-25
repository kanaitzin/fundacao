import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { cifrarSegredo, decifrarSegredo, dicaDe } from '../../kernel/common/segredo';

/**
 * COFRE DE CREDENCIAIS DO ACOLHIDO (§6.10).
 *
 * A Fundação decidiu que os acessos das crianças — gov.br, INSS, CTPS, banco,
 * portal da escola — ficam no sistema, com a coordenação da casa. A alternativa
 * real não era "não existir": era continuar numa planilha compartilhada, sem
 * cifra, sem controle de quem abriu e sem registro.
 *
 * Então o cofre existe, e existe com quatro cuidados que a planilha não tem:
 *
 *  1. o segredo é cifrado antes de sair daqui (AES-256-GCM), com chave que
 *     mora no ambiente e não no banco;
 *  2. o papel da aplicação não consegue ler a coluna cifrada — ver a senha
 *     passa por um comando que registra antes de devolver;
 *  3. cada abertura pede finalidade e vira evento com nome e hora;
 *  4. a lista mostra uma DICA (primeira letra, tamanho, última letra), que
 *     resolve a maior parte das conferências sem abrir nada.
 *
 * Reautenticação recente é exigida, como no resto da área bancária: uma
 * sessão esquecida aberta num aparelho não pode virar acesso ao cofre.
 */
const REAUTH_JANELA_MIN = 5;

export const TIPOS_CREDENCIAL = [
  { cod: 'gov_br', label: 'gov.br' },
  { cod: 'inss', label: 'INSS / Meu INSS' },
  { cod: 'ctps', label: 'Carteira de Trabalho Digital' },
  { cod: 'banco', label: 'Banco / poupança social' },
  { cod: 'escola', label: 'Portal da escola' },
  /*
   * A CHAVE DE ACESSO AO PROCESSO ENTRA AQUI, e não no cadastro.
   *
   * A coordenação pediu, em 03/09/2026, para guardar tudo o que hoje vive na
   * lista que a equipe técnica mantém à mão — inclusive a chave de acesso ao
   * processo judicial de cada criança. Está certa: hoje essa chave circula
   * num arquivo de texto anexado a mensagens.
   *
   * O que muda é ONDE ela fica. Essa chave abre o processo inteiro da
   * criança: é da mesma natureza da senha do gov.br, e não de um número de
   * documento. No cadastro comum ela apareceria para quem abrisse o perfil;
   * aqui ela é cifrada, aberta só pelo coordenador da casa e pelo Gestor
   * Geral, com reautenticação e um registro por visualização (§11.4).
   */
  { cod: 'processo_judicial', label: 'Chave de acesso ao processo' },
  { cod: 'outro', label: 'Outro acesso' },
] as const;

@Injectable()
export class CredentialsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  tipos() { return TIPOS_CREDENCIAL; }

  private exigirReauth(user: AuthenticatedUser) {
    const at = user.lastReauthAt ? new Date(user.lastReauthAt).getTime() : 0;
    if (Date.now() - at > REAUTH_JANELA_MIN * 60_000) {
      throw new ForbiddenException('Confirme sua senha para abrir o cofre de acessos.');
    }
  }

  private exigirCoordenacao(user: AuthenticatedUser) {
    if (user.role !== 'coordenador') {
      throw new ForbiddenException(
        'O cofre de acessos é da coordenação da casa. O Gestor Geral tem acesso excepcional e justificado.');
    }
  }

  /**
   * Lista as credenciais de um acolhido — SEM o segredo.
   *
   * A dica devolvida aqui é gerada no cadastro e guardada; recalcular exigiria
   * decifrar a cada listagem, e o cofre só se abre quando alguém pede.
   */
  async listar(user: AuthenticatedUser, personId: string) {
    /* alcance:cofre — quem abre o cofre de acessos. Conferido contra `alcance.ts`. */
    if (!['coordenador', 'gestor_geral'].includes(user.role)) {
      await this.audit.log({
        action: 'credential.denied', actorId: user.id, institutionId: user.institutionId,
        houseId: await this.audit.casaDoAcolhido(user.id, personId),
        entity: 'person', entityId: personId, detail: { papel: user.role },
      });
      throw new ForbiddenException('Somente a coordenação da casa acessa o cofre de acessos.');
    }
    this.exigirReauth(user);

    const rows = await this.db.asUser(user.id, async (c) => {
      // Nunca `SELECT *`: a coluna cifrada não é legível por este papel, e o
      // erro que ela provocaria seria confundido com defeito.
      const { rows } = await c.query(
        `SELECT id, kind, kind_other, login, secret_hint, holder, notes, updated_at
           FROM person_credential WHERE person_id = $1 ORDER BY kind`, [personId]);
      return rows;
    });

    await this.audit.log({
      action: 'credential.list', actorId: user.id, institutionId: user.institutionId,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'person', entityId: personId, detail: { registros: rows.length },
    });

    return rows.map((r) => ({
      id: r.id,
      tipo: TIPOS_CREDENCIAL.find((t) => t.cod === r.kind)?.label ?? r.kind,
      tipoCodigo: r.kind, qual: r.kind_other,
      login: r.login, dica: r.secret_hint, responsavel: r.holder,
      observacao: r.notes, atualizadoEm: r.updated_at,
    }));
  }

  /** Guardar ou trocar um acesso. Trocar não apaga: substitui e fica datado. */
  async guardar(user: AuthenticatedUser, personId: string, input: {
    tipo: string; qual?: string; login?: string; senha: string;
    responsavel?: string; observacao?: string;
  }) {
    this.exigirCoordenacao(user);
    this.exigirReauth(user);
    if (!TIPOS_CREDENCIAL.some((t) => t.cod === input?.tipo)) {
      throw new BadRequestException('Tipo de acesso desconhecido.');
    }
    if (!input?.senha?.trim()) throw new BadRequestException('Informe a senha a guardar.');
    if (input.tipo === 'outro' && !input.qual?.trim()) {
      throw new BadRequestException('Descreva qual é o acesso.');
    }

    const cifrado = cifrarSegredo(input.senha);
    const dica = dicaDe(input.senha);

    const r = await this.db.asUser(user.id, async (c) => {
      // Sem ON CONFLICT com xmax: ler xmax exigiria SELECT na tabela inteira, e
      // é justamente o SELECT amplo que o privilégio por coluna nega aqui.
      const { rows: [existente] } = await c.query(
        `SELECT id FROM person_credential
          WHERE person_id = $1 AND kind = $2 AND coalesce(kind_other,'') = coalesce($3,'')`,
        [personId, input.tipo, input.qual ?? null]);

      if (existente) {
        const { rows: [row] } = await c.query(
          `UPDATE person_credential
              SET login = $2, secret_enc = $3, secret_hint = $4, holder = $5, notes = $6,
                  updated_at = now(), updated_by = app_current_user()
            WHERE id = $1 RETURNING id`,
          [existente.id, input.login ?? null, cifrado, dica,
           input.responsavel ?? null, input.observacao ?? null]);
        return { id: row.id, substituiu: true };
      }

      const { rows: [row] } = await c.query(
        `INSERT INTO person_credential (person_id, kind, kind_other, login, secret_enc,
                                        secret_hint, holder, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, app_current_user(), app_current_user())
         RETURNING id`,
        [personId, input.tipo, input.qual ?? null, input.login ?? null, cifrado, dica,
         input.responsavel ?? null, input.observacao ?? null]);
      return { id: row.id, substituiu: false };
    }).catch((e: any) => {
      if (String(e?.message).includes('row-level security')) {
        throw new ForbiddenException('Este acolhido não está na sua casa.');
      }
      throw e;
    });

    // O log guarda o tipo e o ato. Nunca a senha, nem a dica (§20).
    await this.audit.log({
      action: r.substituiu ? 'credential.replace' : 'credential.create',
      actorId: user.id, institutionId: user.institutionId,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'person_credential', entityId: r.id, detail: { tipo: input.tipo },
    });

    return {
      id: r.id, substituiu: r.substituiu,
      aviso: r.substituiu
        ? 'Acesso atualizado. A troca fica registrada com a data e o seu nome.'
        : 'Acesso guardado e cifrado. Só a coordenação desta casa abre — e cada abertura fica registrada.',
    };
  }

  /**
   * Abrir: devolve a senha em claro, UMA vez, com finalidade declarada.
   *
   * O registro acontece dentro do comando do banco, antes de o segredo sair.
   */
  async revelar(user: AuthenticatedUser, credentialId: string, finalidade: string) {
    this.exigirReauth(user);
    if (!finalidade?.trim()) {
      throw new BadRequestException('Informe para que precisa deste acesso.');
    }

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_reveal_credential($1,$2)`, [credentialId, finalidade]);
      return row;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('sem_permissao_credencial')) {
        throw new ForbiddenException('Somente a coordenação da casa atual abre este acesso.');
      }
      if (m.includes('finalidade_excepcional_insuficiente')) {
        throw new BadRequestException(
          'Acesso excepcional do Gestor Geral: descreva o motivo institucional (mínimo 20 caracteres). Fica registrado como exceção.');
      }
      if (m.includes('finalidade_obrigatoria')) {
        throw new BadRequestException('Descreva para que precisa deste acesso (mínimo 5 caracteres).');
      }
      if (m.includes('credencial_inexistente')) throw new NotFoundException('Acesso não encontrado.');
      throw e;
    });

    let senha: string;
    try {
      senha = decifrarSegredo(r.segredo);
    } catch {
      // Chave trocada ou dado alterado: dizer a verdade em vez de devolver lixo.
      throw new BadRequestException(
        'Não foi possível abrir este acesso: o segredo não confere com a chave atual do sistema. '
        + 'Cadastre a senha novamente — e avise a coordenação da casa.');
    }

    return {
      senha, excepcional: r.excepcional,
      aviso: r.excepcional
        ? 'Acesso excepcional do Gestor Geral registrado como exceção, com o motivo informado.'
        : 'Abertura registrada com o seu nome, o horário e a finalidade.',
    };
  }

  /** Quem abriu o quê, e para quê. A coordenação enxerga o próprio cofre. */
  async historico(user: AuthenticatedUser, personId: string) {
    if (!['coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('Somente a coordenação da casa acessa o cofre de acessos.');
    }
    const rows = await this.db.asUser(user.id, async (c) => {
      /* Fora do alcance responde como inexistente, e não com lista vazia
         (fase 156): vazia se lê "ninguém abriu o cofre desta criança". */
      const { rows: [p] } = await c.query(
        `SELECT app_can_see_credentials($1) OR app_current_role() = 'gestor_geral' AS pode`,
        [personId]);
      if (!p?.pode) return null;
      const { rows } = await c.query(`SELECT * FROM app_credential_history($1)`, [personId]);
      return rows;
    });
    if (!rows) throw new NotFoundException('Acolhido não encontrado — ou fora do seu alcance.');
    return rows.map((r) => ({
      quando: r.quando, quem: r.quem, finalidade: r.finalidade,
      acao: r.acao === 'credential.reveal_exceptional' ? 'abertura excepcional'
          : r.acao === 'credential.reveal' ? 'abertura'
          : r.acao === 'credential.replace' ? 'troca de senha' : 'cadastro',
      excepcional: r.acao === 'credential.reveal_exceptional',
    }));
  }
}
