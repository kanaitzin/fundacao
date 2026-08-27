import { Controller, Get, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok', db: 'ok', time: new Date().toISOString() };
  }
}
