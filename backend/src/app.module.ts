import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { HousesModule } from './houses/houses.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuditModule,
    AuthModule,
    HousesModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
