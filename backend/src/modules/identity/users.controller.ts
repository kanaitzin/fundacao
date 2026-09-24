import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser } from '../../kernel/contracts';
import { DatabaseService } from '../../kernel/database/database.service';

@Controller('users')
@UseGuards(SessionGuard)
export class UsersController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const assignments = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT a.house_id, h.code, h.name, a.role
         -- rls-join-ok (house): o vínculo listado é sempre de uma casa do próprio
         -- escopo (uha_select exige app_house_in_scope), então o par existe.
         FROM user_house_assignment a JOIN house h ON h.id = a.house_id
         WHERE a.user_id = $1 AND a.valid_to IS NULL`, [user.id]);
      return rows;
    });
    return {
      id: user.id, email: user.email, fullName: user.fullName,
      role: user.role, mustChangePassword: user.mustChangePassword,
      assignments,
    };
  }
}
