import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// ---------- Kernel: infraestrutura compartilhada, não domínio ----------
import { DatabaseModule } from './kernel/database/database.module';
import { AuditModule } from './kernel/audit/audit.module';
import { EventsModule } from './kernel/events/events.module';
import { DocumentosModule } from './kernel/documentos/documentos.module';
import { HealthController } from './kernel/health/health.controller';

// ---------- Módulos de domínio: partições independentes ----------
// Cada linha abaixo é um módulo inteiro. Remover a linha remove o módulo do
// sistema sem tocar nos demais; adicionar um módulo novo é acrescentar uma.
// As fronteiras entre eles são verificadas por test/arquitetura.spec.ts.
import { IdentityModule } from './modules/identity';
import { HousesModule } from './modules/houses';
import { PeopleModule } from './modules/people';
import { RoutineModule } from './modules/routine';
import { AlignmentsModule } from './modules/alignments';
import { ActivitiesModule } from './modules/activities';
import { ChecksModule } from './modules/checks';
import { TimelineModule } from './modules/timeline';
import { NotificationsModule } from './modules/notifications';
import { SyncModule } from './modules/sync';
import { RelogioModule } from './modules/relogio';
import { MedicationsModule } from './modules/medications';
import { NursingModule } from './modules/nursing';
import { StatementsModule } from './modules/statements';
import { ShiftsModule } from './modules/shifts';
import { IncidentsModule } from './modules/incidents';
import { ReportsModule } from './modules/reports';
import { ArchiveModule } from './modules/archive';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuditModule,
    EventsModule,
    DocumentosModule,

    IdentityModule,
    HousesModule,
    PeopleModule,
    RoutineModule,
    AlignmentsModule,
    ActivitiesModule,
    ChecksModule,
    TimelineModule,
    NotificationsModule,
    SyncModule,
    RelogioModule,
    MedicationsModule,
    NursingModule,
    StatementsModule,
    ShiftsModule,
    IncidentsModule,
    ReportsModule,
    ArchiveModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
