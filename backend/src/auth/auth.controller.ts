import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, AuthenticatedUser } from './auth.service';
import { SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

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

  @Post('reauth')
  @UseGuards(SessionGuard)
  reauth(@CurrentUser() user: AuthenticatedUser, @Body() body: { password: string }) {
    return this.auth.reauth(user, body.password ?? '');
  }
}
