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
import { FRASE_DA_SENHA, senhaAceita } from '../../kernel/common/senha.regra';

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

/** O link do esqueci minha senha vale uma hora (decisão de 05/10). */
const MINUTOS_ESQUECI = 60;

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

  /**
   * Passo 1 da entrada: esta conta já tem senha? A tela não usa mais este passo, e a resposta
   * é sempre a mesma (fase 293): perguntar depois do esqueci minha senha contava quais
   * e-mails têm conta. Quem tem convite entra pelo link, que já traz o token.
   */
  async contaTemSenha(email: string) {
    if (!email?.trim()) throw new BadRequestException('Informe o e-mail.');
    return { temSenha: true };
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
      /* O e-mail que veio da casa, na conta promovida para todas as casas (1685). */
      if (m.includes('email_a_confirmar')) {
        throw new BadRequestException(
          'Confirme o e-mail desta pessoa em Confirmar o e-mail antes de enviar o convite.');
      }
      // As recusas do gatilho de quem administra a conta (identity/1681 e 1682).
      if (m.includes('nao_administra_a_si_mesmo')) {
        throw new ForbiddenException('A sua própria conta é alterada por quem administra a equipe.');
      }
      if (m.includes('conta_de_toda_a_instituicao')) {
        throw new ForbiddenException(
          'A conta de quem atende todas as casas é alterada pelo Gestor Geral ou pela Coordenação Geral.');
      }
      /* A casa da pessoa, conferida no banco desde a 1570 (fase 156): antes a
         coordenação de outra casa embaralhava a senha de quem não é da equipe dela. */
      if (m.includes('fora_de_escopo')) {
        throw new ForbiddenException('Esta pessoa trabalha numa casa fora do seu alcance.');
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

  /**
   * ESQUECI MINHA SENHA (fase 188). A resposta é a mesma para e-mail
   * cadastrado ou não, e também quando o e-mail não sai: dizer "não
   * conseguimos enviar" contaria que a conta existe. Quem cuida do servidor
   * vê a falha do e-mail na saúde da implantação.
   */
  async esqueci(email: string) {
    const aviso = 'Se este e-mail estiver cadastrado, enviamos para ele um link para criar uma senha '
      + 'nova. O link vale uma hora e serve uma vez. Confira também a caixa de spam. Se não chegar, '
      + 'a coordenação pode reenviar o seu acesso.';
    if (!email?.trim()) throw new BadRequestException('Informe o e-mail.');
    const { token, hash } = newSessionToken();
    const { rows: [r] } = await this.db.query(
      `SELECT * FROM auth_pedir_nova_senha($1, $2, $3)`, [email.trim(), hash, MINUTOS_ESQUECI]);
    /* Sem esperar o envio (fase 293): esperar o SMTP só quando a conta existe contava, pelo
       tempo, que ela existe. A falha fica na saúde da implantação. */
    if (r) {
      void this.mail.enviar({
        para: r.out_email,
        assunto: 'Rede Acolher: criar uma senha nova',
        corpo: [
          `${r.out_nome},`,
          '',
          'Recebemos um pedido para criar uma senha nova para o seu acesso ao Rede Acolher.',
          'Abra o endereço abaixo no seu próprio celular ou computador e escolha a senha:',
          '',
          `${this.base}/entrar?convite=${token}`,
          '',
          'O link vale uma hora e serve uma vez só. A sua senha atual continua valendo até',
          'você criar a nova.',
          '',
          'Se não foi você quem pediu, ignore esta mensagem e avise a coordenação.',
          'Ninguém da Fundação vai pedir a sua senha.',
        ].join('\n'),
      }).catch(() => { /* a mesma resposta: ver o comentário acima */ });
    }
    return { ok: true, aviso };
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
    return { valido: true, nome: r.out_nome, email: r.out_email, motivo: r.out_motivo as 'convite' | 'esqueci' };
  }

  /** A pessoa cria a senha. Gastar o convite e gravar a senha é um ato só. */
  async concluir(token: string, novaSenha: string, ip?: string, userAgent?: string) {
    if (!token?.trim()) throw new BadRequestException('Convite não informado.');
    const senha = (novaSenha ?? '').trim();
    if (!senhaAceita(senha)) throw new BadRequestException(FRASE_DA_SENHA);

    /* O convite conferido ANTES do scrypt (revisão de segurança da 295): o hash pesa
       32 MiB e um quarto do servidor, e com convites inventados em fila ninguém entrava
       nem abria foto. O banco confere de novo ao gastar, na mesma função que grava. */
    const { rows: [vale] } = await this.db.query(
      `SELECT 1 FROM app_check_invite($1)`, [hashToken(token.trim())]);
    if (!vale) {
      throw new HttpException(
        'Convite inválido ou vencido. Peça um novo à coordenação.', HttpStatus.GONE);
    }
    const hash = await hashPassword(senha);
    /* SEM identidade na sessão, de propósito (`db.query`, e não `asUser`): o gatilho de
       quem administra a conta (identity/1681) não confere nada sem identidade. Com a
       identidade de outra pessoa, gastar o convite de quem atende todas as casas seria
       recusado, e o primeiro acesso da Enfermagem quebraria. */
    /* O convite gasto e a sessão aberta na mesma função (fase 293): a sessão só nasce para
       a conta do convite. */
    const { token: sessao, hash: sessaoHash } = newSessionToken();
    await this.db.query(
      `SELECT * FROM auth_concluir_convite($1,$2,$3,$4,$5,$6)`,
      [hashToken(token.trim()), hash, ip ?? null, sessaoHash,
       Number(process.env.SESSION_TTL_HOURS ?? 14), userAgent ?? null],
    ).catch((e: any) => {
      if (String(e?.message ?? '').includes('convite_invalido')) {
        throw new HttpException(
          'Convite inválido ou vencido. Peça um novo à coordenação.', HttpStatus.GONE);
      }
      throw e;
    });

    // Entra direto: a pessoa acabou de provar que tem o e-mail e escolheu a
    // senha. Mandá-la digitar tudo de novo agora não protege nada.
    return { ok: true, token: sessao };
  }
}
