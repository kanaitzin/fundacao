import { Inject, MiddlewareConsumer, Module, NestModule, OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
/* O limite do corpo (fase 179): o anexo em base64 passa dos 100 KB do padrão.
   Importado AQUI para valer no servidor que sobe e na suíte, que monta por aqui. */
import './kernel/common/corpo-da-requisicao';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { FalhasEmPortugues } from './kernel/common/falhas-em-portugues';
import { CasaDaConsulta } from './kernel/common/casa-da-consulta.interceptor';
import {
  cabecalhosDeSeguranca, confiancaNoProxy, corsDaInstituicao,
} from './kernel/common/porta-da-internet';
import { ConfigModule } from '@nestjs/config';

// ---------- Kernel: infraestrutura compartilhada, não domínio ----------
import { DatabaseModule } from './kernel/database/database.module';
import { AuditModule } from './kernel/audit/audit.module';
import { EventsModule } from './kernel/events/events.module';
import { DocumentosModule } from './kernel/documentos/documentos.module';
import { ArquivosModule } from './kernel/arquivos/arquivos.module';
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
import { AssistenteModule } from './modules/assistente';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuditModule,
    EventsModule,
    DocumentosModule,
    ArquivosModule,

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
    AssistenteModule,
  ],
  controllers: [HealthController],
  /* O filtro das falhas em português mora AQUI, e não no `main.ts`: é o que faz
     a suíte, que monta o app por este módulo, testar o servidor que sobe. */
  providers: [
    { provide: APP_FILTER, useClass: FalhasEmPortugues },
    /* E a casa que vem pela consulta, pela mesma razão (fase 170). */
    { provide: APP_INTERCEPTOR, useClass: CasaDaConsulta },
  ],
})
export class AppModule implements NestModule, OnApplicationBootstrap {
  /* `@Inject` explícito, como no resto do servidor: o `tsx` (o `npm run dev` e
     a simulação) não gera o metadado de tipo, e sem ele o NestJS injeta nada.
     Da 179 à 190 o servidor não subia pelo `tsx` por causa desta linha. */
  constructor(@Inject(HttpAdapterHost) private readonly adaptador: HttpAdapterHost) {}

  /* A porta para a internet (fase 179): cabeçalhos e CORS no módulo, e não no
     `main.ts`, para a suíte passar por eles também. */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(corsDaInstituicao(), cabecalhosDeSeguranca).forRoutes('*');
  }

  onApplicationBootstrap() {
    const proxy = confiancaNoProxy();
    const express = this.adaptador.httpAdapter?.getInstance?.();
    if (proxy !== undefined && typeof express?.set === 'function') express.set('trust proxy', proxy);
  }
}
