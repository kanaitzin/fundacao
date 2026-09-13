import {
  BadRequestException, ForbiddenException, Inject, Injectable,
  NotFoundException, HttpException, HttpStatus,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { hashPassword, hashToken, newSessionToken } from '../../kernel/common/crypto';
import { AuthenticatedUser } from '../../kernel/contracts';
import { MailGateway } from './mail.gateway';

/**
 * CONVITE DE PRIMEIRO ACESSO (§8.2).
 *
 * A coordenação convida; a pessoa cria a própria senha, no aparelho dela, uma
 * vez, dentro do prazo. Ninguém digita a senha de ninguém e nada circula em
 * grupo.
 *
 * As três travas — uso único, prazo, autor — estão no banco (migração 0700),
 * não aqui. Este arquivo faz o que só o servidor de aplicação pode fazer:
 * sortear o token, calcular hashes e escrever o e-mail. A decisão de aceitar
 * ou recusar é do banco, numa transação só.
 */

/** 24 horas. Prazo curto de propósito: convite parado é porta aberta. */
const HORAS_PADRAO = Number(process.env.CONVITE_HORAS ?? 24);

@Injectable()
export class InviteService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailGateway) private readonly mail: MailGateway,
  ) {}

  private get base() {
    return process.env.APP_BASE_URL ?? 'http://localhost:5173';
  }

  /** Passo 1 da entrada: esta conta já tem senha? */
  async contaTemSenha(email: string) {
    if (!email?.trim()) throw new BadRequestException('Informe o e-mail.');
    const { rows: [r] } = await this.db.query(
      `SELECT app_account_has_password($1) AS tem`, [email.trim()]);
    // Conta inexistente responde igual a conta com senha: quem digita um
    // e-mail errado não descobre por aqui quem trabalha na Fundação.
    return { temSenha: r.tem !== false };
  }

  /** A coordenação convida. O token existe por instantes neste processo. */
  async convidar(user: AuthenticatedUser, alvoId: string, horas = HORAS_PADRAO) {
    const { token, hash } = newSessionToken();
    // A senha atual é substituída por um valor que ninguém conhece — inclusive
    // eu, aqui: sorteado, hasheado e descartado na mesma expressão.
    const embaralhada = await hashPassword(randomBytes(32).toString('base64url'));

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [row] } = await c.query(
        `SELECT * FROM app_issue_invite($1,$2,$3,$4)`, [alvoId, hash, horas, embaralhada]);
      return row;
    }).catch((e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('usuario_inexistente')) throw new NotFoundException('Pessoa não encontrada.');
      if (m.includes('usuario_inativo')) {
        throw new BadRequestException('Esta conta está inativa. Reative antes de convidar.');
      }
      if (m.includes('cargo_nao_pode_editar')) {
        throw new ForbiddenException('Você não gerencia contas deste cargo.');
      }
      throw e;
    });

    await this.mail.enviar({
      para: r.out_email,
      assunto: 'Rede Acolher — criar sua senha',
      corpo: [
        `${r.out_nome},`,
        '',
        'A coordenação criou seu acesso ao Rede Acolher. Abra o endereço abaixo',
        'no seu próprio celular ou computador e escolha a sua senha.',
        '',
        `${this.base}/entrar?convite=${token}`,
        '',
        `O link vale por ${horas} horas e serve uma vez só. Depois disso, peça`,
        'um novo à coordenação — é rápido e não custa nada.',
        '',
        'Ninguém da Fundação, nem a coordenação, nem o suporte, vai pedir sua',
        'senha. Se pedirem, não é do sistema.',
      ].join('\n'),
    });

    await this.audit.log({
      action: 'auth.invite_sent', actorId: user.id, institutionId: user.institutionId,
      entity: 'app_user', entityId: alvoId,
      // Metadado. O token não entra aqui, nem o e-mail em claro.
      detail: { expiraEm: r.out_expira, horas },
    });

    // O token NÃO volta pela API: quem convida não vê o link. É o que impede
    // que o convite vire recado de WhatsApp por outro caminho (§3.3).
    return {
      ok: true, expiraEm: r.out_expira,
      aviso: `Convite enviado para o e-mail institucional de ${r.out_nome}. `
           + `Vale ${horas} horas e serve uma vez.`,
    };
  }

  /** A tela confere o convite antes de pedir a senha nova. */
  async conferir(token: string) {
    if (!token?.trim()) throw new BadRequestException('Convite não informado.');
    const { rows: [r] } = await this.db.query(
      `SELECT * FROM app_check_invite($1)`, [hashToken(token.trim())]);
    if (!r) {
      // Vencido, usado e inventado respondem igual: o convite inválido não
      // conta que existiu, nem de quem era.
      throw new HttpException(
        'Convite inválido ou vencido. Peça um novo à coordenação.', HttpStatus.GONE);
    }
    return { valido: true, nome: r.out_nome, email: r.out_email };
  }

  /** A pessoa cria a senha. Gastar o convite e gravar a senha é um ato só. */
  async concluir(token: string, novaSenha: string, ip?: string, userAgent?: string) {
    if (!token?.trim()) throw new BadRequestException('Convite não informado.');
    const senha = (novaSenha ?? '').trim();
    if (senha.length < 8) {
      throw new BadRequestException('A senha precisa de pelo menos 8 caracteres.');
    }

    const hash = await hashPassword(senha);
    const r = await this.db.query(
      `SELECT * FROM app_consume_invite($1,$2,$3)`,
      [hashToken(token.trim()), hash, ip ?? null],
    ).then((res) => res.rows[0]).catch((e: any) => {
      if (String(e?.message ?? '').includes('convite_invalido')) {
        throw new HttpException(
          'Convite inválido ou vencido. Peça um novo à coordenação.', HttpStatus.GONE);
      }
      throw e;
    });

    // Entra direto: a pessoa acabou de provar que tem o e-mail e escolheu a
    // senha. Mandá-la digitar tudo de novo agora não protege nada.
    const { token: sessao, hash: sessaoHash } = newSessionToken();
    /* Pela função `auth_criar_sessao` (1190): a aplicação não escreve mais
       direto em `user_session`. */
    await this.db.query(
      `SELECT auth_criar_sessao($1, $2, $3, $4, $5)`,
      [r.out_user, sessaoHash, Number(process.env.SESSION_TTL_HOURS ?? 14),
       userAgent ?? null, ip ?? null],
    );

    return { ok: true, token: sessao };
  }
}
