import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      /* A frase diz o que FAZER, e não o estado interno. "Sessão ausente" é
       * verdade e não ajuda ninguém — sobretudo quem vê isso no meio de um
       * registro, às onze da noite, e precisa saber que basta entrar de novo. */
      throw new UnauthorizedException(
        'Sua sessão terminou. Entre de novo para continuar — o que você digitou nesta '
        + 'tela não foi salvo.');
    }
    req.user = await this.auth.validate(header.slice(7));
    return true;
  }
}
