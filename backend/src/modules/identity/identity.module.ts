import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { UsersController } from './users.controller';
import { DevicesController } from './devices.controller';
import { StaffController } from './staff.controller';
import { EscalaController } from './escala.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { DevicesService } from './devices.service';
import { StaffService } from './staff.service';
import { EscalaService } from './escala.service';
import { InviteService } from './invite.service';
import { MailGateway } from './mail.gateway';

/**
 * Módulo `identity` — quem é a pessoa e o que ela ainda pode fazer nesta sessão.
 *
 * Depende de: kernel (banco, auditoria, cripto).
 * É dependência de: todos os módulos com rotas autenticadas — por isso sua
 * porta pública é deliberadamente estreita (guard, decorator, serviço).
 */
@Module({
  controllers: [AuthController, UsersController, DevicesController, StaffController, EscalaController],
  providers: [AuthService, SessionGuard, DevicesService, StaffService, EscalaService, InviteService, MailGateway],
  exports: [AuthService, SessionGuard, DevicesService, StaffService, EscalaService, InviteService],
})
export class IdentityModule {}
