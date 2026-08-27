import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { UsersController } from './users.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';

/**
 * Módulo `identity` — quem é a pessoa e o que ela ainda pode fazer nesta sessão.
 *
 * Depende de: kernel (banco, auditoria, cripto).
 * É dependência de: todos os módulos com rotas autenticadas — por isso sua
 * porta pública é deliberadamente estreita (guard, decorator, serviço).
 */
@Module({
  controllers: [AuthController, UsersController],
  providers: [AuthService, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class IdentityModule {}
