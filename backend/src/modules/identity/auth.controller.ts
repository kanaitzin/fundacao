import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { InviteService } from './invite.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(InviteService) private readonly convite: InviteService,
  ) {}

  /**
   * Entrada em dois passos, passo 1. Rota pública de propósito: é ela que
   * decide se a tela pede senha ou manda a pessoa olhar o e-mail. Responde
   * igual para conta inexistente — não enumera quem trabalha aqui.
   */
  @Post('primeiro-acesso')
  primeiroAcesso(@Body() body: { email?: string }) {
    return this.convite.contaTemSenha(body?.email ?? '');
  }

  /** Confere o convite ANTES de pedir a senha nova. */
  @Post('convite/conferir')
  conferirConvite(@Body() body: { convite?: string }) {
    return this.convite.conferir(body?.convite ?? '');
  }

  /** Gasta o convite criando a senha, e já devolve a sessão. */
  @Post('convite/concluir')
  concluirConvite(@Body() body: { convite?: string; novaSenha?: string }, @Req() req: Request) {
    return this.convite.concluir(
      body?.convite ?? '', body?.novaSenha ?? '', req.ip, req.headers['user-agent']);
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }, @Req() req: Request) {
    return this.auth.login(body.email ?? '', body.password ?? '', req.ip, req.headers['user-agent']);
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.auth.logout(user);
    return { ok: true };
  }

  /** Troca da própria senha — sugerida no primeiro acesso, disponível sempre. */
  @Post('password')
  @UseGuards(SessionGuard)
  changePassword(@CurrentUser() user: AuthenticatedUser,
                 @Body() body: { senhaAtual?: string; novaSenha: string }) {
    return this.auth.changeOwnPassword(user, body?.senhaAtual ?? '', body?.novaSenha ?? '');
  }

  @Post('reauth')
  @UseGuards(SessionGuard)
  reauth(@CurrentUser() user: AuthenticatedUser, @Body() body: { password: string }) {
    return this.auth.reauth(user, body.password ?? '');
  }
}
