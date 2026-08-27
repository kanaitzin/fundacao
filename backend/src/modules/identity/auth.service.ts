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
    const { rows: [attempts] } = await this.db.query(
      `SELECT count(*)::int AS fails FROM login_attempt
       WHERE email = lower($1) AND success = false AND at > now() - ($2 || ' minutes')::interval`,
      [email, this.lockMinutes],
    );
    if (attempts.fails >= this.maxAttempts) {
      await this.audit.log({ action: 'auth.login_locked', detail: { emailHash: hashToken(email.toLowerCase()) } });
      throw new HttpException('Muitas tentativas. Aguarde alguns minutos e tente novamente.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const { rows: [user] } = await this.db.query(`SELECT * FROM auth_find_user($1)`, [email]);
    const ok = user && user.active && (await verifyPassword(password, user.password_hash));

    await this.db.query(
      `INSERT INTO login_attempt (email, ip, success) VALUES (lower($1), $2, $3)`,
      [email, ip ?? null, !!ok],
    );

    if (!ok) {
      await this.audit.log({ action: 'auth.login_failed', detail: { emailHash: hashToken(email.toLowerCase()) } });
      throw new UnauthorizedException(GENERIC_FAIL);
    }

    const { token, hash } = newSessionToken();
    const { rows: [session] } = await this.db.query(
      `INSERT INTO user_session (user_id, token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, now() + ($3 || ' hours')::interval, $4, $5) RETURNING id`,
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
      `UPDATE user_session SET last_used_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       RETURNING id, user_id, last_reauth_at`,
      [hashToken(token)],
    );
    if (!s) throw new UnauthorizedException('Sessão inválida ou expirada');

    // Identidade aplicada; RLS permite ver o próprio registro
    const user = await this.db.asUser(s.user_id, async (c) => {
      const { rows: [u] } = await c.query(
        `SELECT id, institution_id, email, full_name, role, active, must_change_password
         FROM app_user WHERE id = $1`, [s.user_id]);
      return u;
    });
    if (!user || !user.active) throw new UnauthorizedException('Conta desativada');

    return {
      id: user.id, institutionId: user.institution_id, email: user.email,
      fullName: user.full_name, role: user.role, sessionId: s.id,
      lastReauthAt: s.last_reauth_at, mustChangePassword: user.must_change_password,
    };
  }

  async logout(user: AuthenticatedUser) {
    await this.db.query(
      `UPDATE user_session SET revoked_at = now(), revoked_reason = 'logout' WHERE id = $1`,
      [user.sessionId],
    );
    await this.audit.log({ action: 'auth.logout', actorId: user.id, detail: { sessionId: user.sessionId } });
  }

  /** Revoga TODAS as sessões do usuário (aparelho perdido, desligamento). */
  async revokeAll(userId: string, reason: string, actor: AuthenticatedUser) {
    await this.db.query(
      `UPDATE user_session SET revoked_at = now(), revoked_reason = $2
       WHERE user_id = $1 AND revoked_at IS NULL`, [userId, reason]);
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
    if (!(await ok)) throw new UnauthorizedException('Senha atual incorreta.');

    const hash = await hashPassword(nova);
    await this.db.asUser(user.id, async (c) => {
      await c.query(
        `UPDATE app_user SET password_hash = $2, must_change_password = false, updated_at = now()
          WHERE id = $1`, [user.id, hash]);
      await c.query(
        `UPDATE user_session SET revoked_at = now(), revoked_reason = 'senha_alterada_pelo_usuario'
          WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`, [user.id, user.sessionId]);
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
    await this.db.query(`UPDATE user_session SET last_reauth_at = now() WHERE id = $1`, [user.sessionId]);
    await this.audit.log({ action: 'auth.reauth', actorId: user.id, detail: { sessionId: user.sessionId } });
    return { ok: true };
  }
}
