import { BadRequestException, Inject, Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { chaveDaSenha, hashPassword, newSessionToken, hashToken } from '../../kernel/common/crypto';
import { AuthenticatedUser } from '../../kernel/contracts';
import { FRASE_DA_SENHA, senhaAceita } from '../../kernel/common/senha.regra';

// O tipo vive no kernel: é o vocabulário que todo módulo autenticado usa.
export type { AuthenticatedUser } from '../../kernel/contracts';

const GENERIC_FAIL = 'E-mail ou senha inválidos'; // mesma mensagem sempre: sem enumeração de contas

/** Número do `.env` que só vale inteiro e maior que zero: vazio ou mal escrito usa o padrão,
 *  em vez de virar zero (todo mundo travado) ou NaN (trava desligada sem aviso). */
export function inteiroPositivo(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return valor?.trim() && Number.isInteger(n) && n > 0 ? n : padrao;
}

/** O endereço como o banco o guarda: o IPv4 que chega escrito como IPv6 volta a ser IPv4. */
export function enderecoDaTentativa(ip?: string): string | undefined {
  if (!ip) return undefined;
  return ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip;
}

/** O próprio servidor: atrás do proxy sem `TRUST_PROXY`, é o endereço de todo mundo. */
export function daPropriaMaquina(ip: string): boolean {
  return ip === '::1' || ip.startsWith('127.');
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private get maxAttempts() { return inteiroPositivo(process.env.LOGIN_MAX_ATTEMPTS, 5); }
  private get lockMinutes() { return inteiroPositivo(process.env.LOGIN_LOCK_MINUTES, 15); }
  /** Contas diferentes que um mesmo endereço pode errar na janela (fase 291). */
  private get maxPorEndereco() { return inteiroPositivo(process.env.LOGIN_MAX_POR_ENDERECO, 20); }
  private get ttlHours() { return Number(process.env.SESSION_TTL_HOURS ?? 14); }

  async login(email: string, password: string, ipDaPorta?: string, userAgent?: string) {
    const ip = enderecoDaTentativa(ipDaPorta);
    /*
     * A SENHA CONFERIDA DENTRO DO BANCO (fase 293). O banco entrega o sal (o falso e fixo,
     * para e-mail sem conta), o servidor deriva a chave da senha digitada com ele, e a
     * `auth_entrar` faz o resto numa transação só: com a trava do e-mail e do endereço
     * tomadas, conta as tentativas (por conta e, desde a 291, pelas CONTAS diferentes de um
     * mesmo endereço), compara, anota e abre a sessão. Uma rajada em paralelo não passa do
     * limite, e o hash nunca sai do banco. O próprio servidor (sem `TRUST_PROXY`, atrás do
     * proxy, todo mundo chega como ele) não trava pelo endereço, para um engano na
     * instalação não travar as oito casas. Na auditoria, nem o endereço nem o e-mail.
     */
    email = (email ?? '').trim();
    const travaEndereco = !!ip && !daPropriaMaquina(ip);
    /* As travas antes do scrypt (1688): um endereço sozinho não entope o servidor. A resposta
       é a mesma para conta que existe e que não existe; a que vale é a de dentro da
       `auth_entrar`, e o banco segura os números num teto. */
    const { rows: [pre] } = await this.db.query(
      `SELECT auth_esta_travado($1, $2, $3, $4, $5, $6) AS travado`,
      [email, ip ?? null, travaEndereco, this.maxAttempts, this.maxPorEndereco, this.lockMinutes]);
    const chave = pre.travado ? '' : await this.chave(email, password);
    const { token, hash } = newSessionToken();
    const { rows: [r] } = await this.db.query(
      `SELECT * FROM auth_entrar($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [email, chave, ip ?? null, travaEndereco,
       this.maxAttempts, this.maxPorEndereco, this.lockMinutes,
       hash, this.ttlHours, userAgent ?? null]);

    if (r.out_status === 'conta_travada' || r.out_status === 'endereco_travado') {
      if (r.out_status === 'conta_travada') {
        await this.audit.log({ action: 'auth.login_locked', detail: { emailHash: hashToken(email.toLowerCase()) } });
      } else {
        await this.audit.log({ action: 'auth.endereco_travado' });
      }
      throw new HttpException('Muitas tentativas. Aguarde alguns minutos e tente novamente.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (r.out_status !== 'ok') {
      await this.audit.log({ action: 'auth.login_failed', detail: { emailHash: hashToken(email.toLowerCase()) } });
      throw new UnauthorizedException(GENERIC_FAIL);
    }

    await this.audit.log({
      action: 'auth.login', actorId: r.out_id, institutionId: r.out_institution_id,
      detail: { sessionId: r.out_sessao, role: r.out_role },
    });

    return {
      token,
      user: {
        id: r.out_id, email: r.out_email, fullName: r.out_nome,
        role: r.out_role, mustChangePassword: r.out_must_change,
      },
    };
  }

  /** A chave da senha digitada, com o sal que o banco entrega para este e-mail. */
  private async chave(email: string, password: string): Promise<string> {
    const { rows: [s] } = await this.db.query(`SELECT * FROM auth_sal($1)`, [email ?? '']);
    return chaveDaSenha(password ?? '', {
      n: s.out_n, r: s.out_r, p: s.out_p, sal: s.out_sal, tamanho: s.out_tamanho });
  }

  async validate(token: string): Promise<AuthenticatedUser> {
    const { rows: [s] } = await this.db.query(
      `SELECT * FROM auth_validar_sessao($1)`, [hashToken(token)]);
    if (!s) {
      throw new UnauthorizedException(
        'Sua sessão terminou. Entre de novo para continuar. O que você digitou nesta '
        + 'tela não foi salvo.');
    }

    // Identidade aplicada; RLS permite ver o próprio registro
    const user = await this.db.asUser(s.user_id, async (c) => {
      const { rows: [u] } = await c.query(
        `SELECT id, institution_id, email, full_name, role, active, must_change_password, todas_as_casas
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
      todasAsCasas: !!user.todas_as_casas,
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
  /**
   * A senha de quem já entrou, conferida de novo (na troca e na reautenticação) dentro do
   * banco, pela sessão, com a mesma trava da entrada (fases 291 e 293). O erro conta para a
   * conta como um erro de entrada.
   */
  private recusaDaConferencia(status: string, frase: string): never {
    if (status === 'conta_travada') {
      throw new HttpException('Muitas tentativas. Aguarde alguns minutos e tente novamente.', HttpStatus.TOO_MANY_REQUESTS);
    }
    throw new UnauthorizedException(frase);
  }

  async changeOwnPassword(user: AuthenticatedUser, atual: string, nova: string, ip?: string) {
    if (nova === atual) {
      throw new BadRequestException('A senha nova precisa ser diferente da atual.');
    }
    if (!senhaAceita(nova)) throw new BadRequestException(FRASE_DA_SENHA);
    const chave = await this.chave(user.email, atual ?? '');
    const hash = await hashPassword(nova);
    const { rows: [r] } = await this.db.query(
      `SELECT auth_trocar_minha_senha($1, $2, $3, $4, $5, $6) AS status`,
      [user.sessionId, chave, hash, enderecoDaTentativa(ip) ?? null, this.maxAttempts, this.lockMinutes]);
    if (r.status !== 'ok') {
      this.recusaDaConferencia(r.status,
        'A senha atual não confere. Confira e tente de novo; se você não lembra, a '
        + 'coordenação consegue enviar um novo acesso.');
    }
    await this.audit.log({
      action: 'auth.password_change', actorId: user.id, entity: 'app_user', entityId: user.id,
    });
    return { ok: true, aviso: 'Senha alterada. As outras sessões abertas foram encerradas.' };
  }

  async reauth(user: AuthenticatedUser, password: string, ip?: string) {
    const chave = await this.chave(user.email, password ?? '');
    const { rows: [r] } = await this.db.query(
      `SELECT auth_reautenticar($1, $2, $3, $4, $5) AS status`,
      [user.sessionId, chave, enderecoDaTentativa(ip) ?? null, this.maxAttempts, this.lockMinutes]);
    if (r.status !== 'ok') {
      if (r.status === 'falhou') await this.audit.log({ action: 'auth.reauth_failed', actorId: user.id });
      this.recusaDaConferencia(r.status, 'Senha incorreta');
    }
    await this.audit.log({ action: 'auth.reauth', actorId: user.id, detail: { sessionId: user.sessionId } });
    return { ok: true };
  }
}
