import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';

/**
 * A SENHA INICIAL SÓ ABRE A TROCA (fase 291; decisão do dono do projeto em 08/11).
 *
 * A senha inicial é escolhida ou lida por quem cadastrou a conta, e até a pessoa trocar,
 * quem a conhece entra no lugar dela. Antes a tela só sugeria a troca; agora o servidor
 * recusa tudo, menos as rotas marcadas com este decorador: saber quem é, trocar a senha e
 * sair. Rota nova que a tela precise ANTES da troca ganha a marca, e o teste da fase
 * (`a-senha-e-a-entrada`) cobra que a lista é só esta.
 */
export const ANTES_DE_TROCAR_A_SENHA = 'rede:antes-de-trocar-a-senha';
export const PodeAntesDeTrocarASenha = () => SetMetadata(ANTES_DE_TROCAR_A_SENHA, true);

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      /* A frase diz o que FAZER, e não o estado interno. "Sessão ausente" é
       * verdade e não ajuda ninguém — sobretudo quem vê isso no meio de um
       * registro, às onze da noite, e precisa saber que basta entrar de novo. */
      throw new UnauthorizedException(
        'Sua sessão terminou. Entre de novo para continuar. O que você digitou nesta '
        + 'tela não foi salvo.');
    }
    req.user = await this.auth.validate(header.slice(7));
    if (req.user.mustChangePassword
        && !this.reflector.getAllAndOverride<boolean>(ANTES_DE_TROCAR_A_SENHA, [ctx.getHandler(), ctx.getClass()])) {
      throw new ForbiddenException(
        'Antes de continuar, crie a sua senha. A senha que você recebeu serve só para a primeira entrada.');
    }
    return true;
  }
}
