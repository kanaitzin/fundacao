import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// ---------- Kernel: infraestrutura compartilhada, não domínio ----------
import { DatabaseModule } from './kernel/database/database.module';
import { AuditModule } from './kernel/audit/audit.module';
import { EventsModule } from './kernel/events/events.module';
import { HealthController } from './kernel/health/health.controller';

// ---------- Módulos de domínio: partições independentes ----------
// Cada linha abaixo é um módulo inteiro. Remover a linha remove o módulo do
// sistema sem tocar nos demais; adicionar um módulo novo é acrescentar uma.
// As fronteiras entre eles são verificadas por test/arquitetura.spec.ts.
import { IdentityModule } from './modules/identity';
import { HousesModule } from './modules/houses';
import { PeopleModule } from './modules/people';
import { RoutineModule } from './modules/routine';
import { ActivitiesModule } from './modules/activities';
import { ChecksModule } from './modules/checks';
import { TimelineModule } from './modules/timeline';
import { NotificationsModule } from './modules/notifications';
import { SyncModule } from './modules/sync';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuditModule,
    EventsModule,

    IdentityModule,
    HousesModule,
    PeopleModule,
    RoutineModule,
    ActivitiesModule,
    ChecksModule,
    TimelineModule,
    NotificationsModule,
    SyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
