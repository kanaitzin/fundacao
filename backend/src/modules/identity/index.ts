/**
 * PORTA PÚBLICA — módulo `identity`
 *
 * Autenticação, sessões, reautenticação e dados do próprio usuário.
 * Outros módulos importam SOMENTE deste arquivo. Nada de alcançar
 * `identity/auth.service` por caminho interno — o teste de fronteiras
 * (test/arquitetura.spec.ts) falha se alguém tentar.
 */
export { IdentityModule } from './identity.module';
export { SessionGuard } from './session.guard';
export { CurrentUser } from './current-user.decorator';
export { AuthService } from './auth.service';
export { DevicesService } from './devices.service';
export { StaffService, SETORES } from './staff.service';
export { EscalaService } from './escala.service';
export type { AuthenticatedUser } from '../../kernel/contracts';
