import { BadRequestException, Inject, Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { verifyPassword, hashPassword, newSessionToken, hashToken } from '../../kernel/common/crypto';
import { AuthenticatedUser } from '../../kernel/contracts';

// O tipo vive no kernel: é o vocabulário que todo módulo autenticado usa.
export type { AuthenticatedUser } from '../../kernel/contracts';

const GENERIC_FAIL = 'E-mail ou senha inválidos'; // mesma mensagem sempre: sem enumeração de contas

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private get maxAttempts() { return Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5); }
  private get lockMinutes() { return Number(process.env.LOGIN_LOCK_MINUTES ?? 15); }
  private get ttlHours() { return Number(process.env.SESSION_TTL_HOURS ?? 14); }

  async login(email: string, password: string, ip?: string, userAgent?: string) {
    // Proteção contra força bruta por conta (persistida: vale entre instâncias)
    /* Pelas funções `auth_*` (1190): a aplicação não alcança mais as tabelas de
       sessão e de tentativa, e o `WHERE` que protege mora no banco. */
    const { rows: [attempts] } = await this.db.query(
      `SELECT auth_tentativas_recentes($1, $2) AS fails`, [email, this.lockMinutes]);
    if (attempts.fails >= this.maxAttempts) {
      await this.audit.log({ action: 'auth.login_locked', detail: { emailHash: hashToken(email.toLowerCase()) } });
      throw new HttpException('Muitas tentativas. Aguarde alguns minutos e tente novamente.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const { rows: [user] } = await this.db.query(`SELECT * FROM auth_find_user($1)`, [email]);
    const ok = user && user.active && (await verifyPassword(password, user.password_hash));

    await this.db.query(
      `SELECT auth_registrar_tentativa($1, $2, $3)`,
      [email, ip ?? null, !!ok],
    );

    if (!ok) {
      await this.audit.log({ action: 'auth.login_failed', detail: { emailHash: hashToken(email.toLowerCase()) } });
      throw new UnauthorizedException(GENERIC_FAIL);
    }

    const { token, hash } = newSessionToken();
    const { rows: [session] } = await this.db.query(
      `SELECT auth_criar_sessao($1, $2, $3, $4, $5) AS id`,
      [user.id, hash, this.ttlHours, userAgent ?? null, ip ?? null],
    );
    await this.audit.log({
      action: 'auth.login', actorId: user.id, institutionId: user.institution_id,
      detail: { sessionId: session.id, role: user.role },
    });

    return {
      token,
      user: {
        id: user.id, email: user.email, fullName: user.full_name,
        role: user.role, mustChangePassword: user.must_change_password,
      },
    };
  }

  async validate(token: string): Promise<AuthenticatedUser> {
    const { rows: [s] } = await this.db.query(
      `SELECT * FROM auth_validar_sessao($1)`, [hashToken(token)]);
    if (!s) {
      throw new UnauthorizedException(
        'Sua sessão terminou. Entre de novo para continuar — o que você digitou nesta '
        + 'tela não foi salvo.');
    }

    // Identidade aplicada; RLS permite ver o próprio registro
    const user = await this.db.asUser(s.user_id, async (c) => {
      const { rows: [u] } = await c.query(
        `SELECT id, institution_id, email, full_name, role, active, must_change_password
         FROM app_user WHERE id = $1`, [s.user_id]);
      return u;
    });
    if (!user || !user.active) {
      /* "Conta desativada" soa como castigo; quase sempre é troca de equipe ou
       * fim de contrato, e quem lê precisa saber a quem pedir. */
      throw new UnauthorizedException(
        'Esta conta não está mais ativa. Se você continua na equipe, fale com a '
        + 'coordenação para reativarem o seu acesso.');
    }

    return {
      id: user.id, institutionId: user.institution_id, email: user.email,
      fullName: user.full_name, role: user.role, sessionId: s.id,
      lastReauthAt: s.last_reauth_at, mustChangePassword: user.must_change_password,
    };
  }

  async logout(user: AuthenticatedUser) {
    await this.db.query(
      `SELECT auth_revogar_sessoes($1, NULL, 'logout', NULL)`,
      [user.sessionId],
    );
    await this.audit.log({ action: 'auth.logout', actorId: user.id, detail: { sessionId: user.sessionId } });
  }

  /** Revoga TODAS as sessões do usuário (aparelho perdido, desligamento). */
  async revokeAll(userId: string, reason: string, actor: AuthenticatedUser) {
    await this.db.query(
      `SELECT auth_revogar_sessoes(NULL, $1, $2, NULL)`, [userId, reason]);
    await this.audit.log({ action: 'auth.revoke_all', actorId: actor.id, entity: 'app_user', entityId: userId, detail: { reason } });
  }

  /**
   * Reautenticação para ações altamente sensíveis (§4.5): nova confirmação
   * da senha, registrada na sessão. Consumidores checam janela recente.
   */
  /**
   * Troca da PRÓPRIA senha (§5.1). Exige a senha atual: sem isso, uma sessão
   * esquecida aberta num aparelho vira uma troca de dono da conta.
   *
   * Trocar a senha derruba as OUTRAS sessões e mantém a atual — quem trocou
   * continua trabalhando; quem estava com a conta aberta em outro lugar, não.
   */
  async changeOwnPassword(user: AuthenticatedUser, atual: string, nova: string) {
    if ((nova ?? '').length < 6) {
      throw new BadRequestException('A senha precisa de pelo menos 6 caracteres.');
    }
    if (nova === atual) {
      throw new BadRequestException('A senha nova precisa ser diferente da atual.');
    }
    const ok = await this.db.asUser(user.id, async (c) => {
      const { rows: [u] } = await c.query(`SELECT password_hash FROM app_user WHERE id = $1`, [user.id]);
      return u ? verifyPassword(atual ?? '', u.password_hash) : false;
    });
    if (!(await ok)) {
      throw new UnauthorizedException(
        'A senha atual não confere. Confira e tente de novo; se você não lembra, a '
        + 'coordenação consegue enviar um novo acesso.');
    }

    const hash = await hashPassword(nova);
    await this.db.asUser(user.id, async (c) => {
      await c.query(
        `UPDATE app_user SET password_hash = $2, must_change_password = false, updated_at = now()
          WHERE id = $1`, [user.id, hash]);
      /* Todas MENOS a atual: quem trocou a própria senha continua trabalhando. */
      await c.query(
        `SELECT auth_revogar_sessoes(NULL, $1, 'senha_alterada_pelo_usuario', $2)`,
        [user.id, user.sessionId]);
    });
    await this.audit.log({
      action: 'auth.password_change', actorId: user.id, entity: 'app_user', entityId: user.id,
    });
    return { ok: true, aviso: 'Senha alterada. As outras sessões abertas foram encerradas.' };
  }

  async reauth(user: AuthenticatedUser, password: string) {
    const { rows: [u] } = await this.db.query(`SELECT * FROM auth_find_user($1)`, [user.email]);
    if (!u || !(await verifyPassword(password, u.password_hash))) {
      await this.audit.log({ action: 'auth.reauth_failed', actorId: user.id });
      throw new UnauthorizedException('Senha incorreta');
    }
    await this.db.query(`SELECT auth_marcar_reautenticacao($1)`, [user.sessionId]);
    await this.audit.log({ action: 'auth.reauth', actorId: user.id, detail: { sessionId: user.sessionId } });
    return { ok: true };
  }
}
