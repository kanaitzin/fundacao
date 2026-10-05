import { BadRequestException, Inject, Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { verifyPassword, hashPassword, newSessionToken, hashToken } from '../../kernel/common/crypto';
import { AuthenticatedUser } from '../../kernel/contracts';
import { cifrarSegredo, decifrarSegredo } from '../../kernel/common/segredo';
import {
  novoSegredo, conferirCodigo, enderecoDoAutenticador, codigosDeReserva, normalizarReserva,
} from '../../kernel/common/totp';

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

    /*
     * AS DUAS ETAPAS (fase 187). Quem ligou não recebe a sessão com a senha:
     * recebe um desafio de cinco minutos, e a sessão só sai com o código do
     * aplicativo ou um código de reserva (`loginSegundaEtapa`).
     */
    const { rows: [fator] } = await this.db.query(`SELECT * FROM auth_segunda_etapa_de($1)`, [user.id]);
    if (fator) {
      const desafio = newSessionToken();
      await this.db.query(`SELECT auth_criar_desafio($1, $2)`, [user.id, desafio.hash]);
      return { segundaEtapa: true as const, desafio: desafio.token };
    }
    return this.abrirSessao(user, ip, userAgent);
  }

  private async abrirSessao(user: any, ip?: string, userAgent?: string, detalhe: Record<string, unknown> = {}) {
    const { token, hash } = newSessionToken();
    const { rows: [session] } = await this.db.query(
      `SELECT auth_criar_sessao($1, $2, $3, $4, $5) AS id`,
      [user.id, hash, this.ttlHours, userAgent ?? null, ip ?? null],
    );
    await this.audit.log({
      action: 'auth.login', actorId: user.id, institutionId: user.institution_id,
      detail: { sessionId: session.id, role: user.role, ...detalhe },
    });

    return {
      token,
      user: {
        id: user.id, email: user.email, fullName: user.full_name,
        role: user.role, mustChangePassword: user.must_change_password,
      },
    };
  }

  /**
   * A SEGUNDA ETAPA DA ENTRADA (fase 187): o código de seis dígitos do
   * aplicativo, ou um dos códigos de reserva. O desafio vale cinco minutos e
   * cinco tentativas, e cada código do aplicativo entra uma vez só.
   */
  async loginSegundaEtapa(desafio: string, codigo: string, ip?: string, userAgent?: string) {
    const { rows: [d] } = await this.db.query(`SELECT * FROM auth_tentar_desafio($1)`, [hashToken(desafio ?? '')]);
    if (!d) {
      throw new UnauthorizedException(
        'O tempo para digitar o código acabou, ou foram tentativas demais. Entre de novo com a senha.');
    }
    const user = await this.db.asUser(d.user_id, async (c) => (await c.query(
      `SELECT id, institution_id, email, full_name, role, active, must_change_password
         FROM app_user WHERE id = $1`, [d.user_id])).rows[0]);
    if (!user?.active) throw new UnauthorizedException(GENERIC_FAIL);

    const { rows: [fator] } = await this.db.query(`SELECT * FROM auth_segunda_etapa_de($1)`, [d.user_id]);
    let como: 'aplicativo' | 'reserva' | null = null;
    if (!fator) {
      /* Desligada por quem administra enquanto a pessoa digitava: a senha já conferiu. */
      como = 'aplicativo';
    } else {
      const passo = conferirCodigo(decifrarSegredo(fator.secret_enc), codigo);
      if (passo !== null) {
        const { rows: [a] } = await this.db.query(`SELECT auth_aceitar_passo($1, $2) AS ok`, [fator.factor_id, passo]);
        if (a.ok) como = 'aplicativo';
      } else if (normalizarReserva(codigo).length === 10) {
        const { rows: [r] } = await this.db.query(
          `SELECT auth_usar_codigo_reserva($1, $2) AS ok`, [fator.factor_id, hashToken(normalizarReserva(codigo))]);
        if (r.ok) como = 'reserva';
      }
    }
    if (!como) {
      /* O código errado conta na MESMA trava da senha: sem isto, quem tem a
         senha pediria desafios novos e chutaria códigos sem parar. */
      await this.db.query(`SELECT auth_registrar_tentativa($1, $2, false)`, [user.email, ip ?? null]);
      await this.audit.log({ action: 'auth.segunda_etapa_falhou', actorId: d.user_id });
      throw new UnauthorizedException(
        'O código não confere. Confira se é o desta conta no aplicativo e digite o que está na tela agora.');
    }
    await this.db.query(`SELECT auth_gastar_desafio($1)`, [d.challenge_id]);
    if (como === 'reserva') {
      await this.audit.log({ action: 'auth.codigo_reserva_usado', actorId: d.user_id });
    }
    return this.abrirSessao(user, ip, userAgent, { segundaEtapa: como });
  }

  // ------------------------------------------- a própria pessoa liga e desliga

  async minhaSegundaEtapa(user: AuthenticatedUser) {
    const r = await this.db.asUser(user.id, async (c) =>
      (await c.query(`SELECT * FROM app_minha_segunda_etapa()`)).rows[0]);
    return { ligada: !!r?.ligada, desde: r?.desde ?? null, reservasRestantes: r?.reservas_restantes ?? 0 };
  }

  private async conferirSenha(user: AuthenticatedUser, senha: string) {
    const { rows: [u] } = await this.db.query(`SELECT * FROM auth_find_user($1)`, [user.email]);
    if (!u || !(await verifyPassword(senha ?? '', u.password_hash))) {
      await this.audit.log({ action: 'auth.reauth_failed', actorId: user.id });
      throw new UnauthorizedException('Senha incorreta.');
    }
  }

  /** Começa a ligar: pede a senha, e devolve o segredo para o aplicativo. */
  async iniciarSegundaEtapa(user: AuthenticatedUser, senha: string) {
    await this.conferirSenha(user, senha);
    const segredo = novoSegredo();
    try {
      await this.db.asUser(user.id, (c) => c.query(`SELECT app_iniciar_segunda_etapa($1)`, [cifrarSegredo(segredo)]));
    } catch (e: any) {
      if (String(e?.message).includes('segunda_etapa_ja_ligada')) {
        throw new BadRequestException('As duas etapas já estão ligadas nesta conta.');
      }
      throw e;
    }
    return {
      segredo: segredo.replace(/(.{4})/g, '$1 ').trim(),
      endereco: enderecoDoAutenticador(segredo, user.email),
    };
  }

  /** Liga de fato com o primeiro código certo, e entrega os códigos de reserva UMA vez. */
  async confirmarSegundaEtapa(user: AuthenticatedUser, codigo: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows: [p] } = await c.query(`SELECT * FROM app_segunda_etapa_pendente()`);
      if (!p) throw new BadRequestException('Comece de novo: não há ligação de duas etapas em andamento.');
      const passo = conferirCodigo(decifrarSegredo(p.secret_enc), codigo);
      if (passo === null) {
        throw new BadRequestException(
          'O código não confere. Confira se o aplicativo leu a conta certa e digite o que está na tela agora.');
      }
      const reservas = codigosDeReserva();
      await c.query(`SELECT app_confirmar_segunda_etapa($1, $2, $3)`,
        [p.factor_id, passo, reservas.map((r) => hashToken(normalizarReserva(r)))]);
      await this.audit.log({ action: 'auth.segunda_etapa_ligada', actorId: user.id });
      return {
        ok: true, reservas,
        aviso: 'Guarde estes códigos num lugar seguro, fora do celular. Cada um entra uma vez, '
          + 'se o celular se perder. Eles não aparecem de novo.',
      };
    });
  }

  async desligarMinhaSegundaEtapa(user: AuthenticatedUser, senha: string) {
    await this.conferirSenha(user, senha);
    const ok = await this.db.asUser(user.id, async (c) =>
      (await c.query(`SELECT app_desligar_minha_segunda_etapa() AS ok`)).rows[0].ok);
    if (ok) await this.audit.log({ action: 'auth.segunda_etapa_desligada', actorId: user.id });
    return { ok: true, desligada: !!ok };
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
