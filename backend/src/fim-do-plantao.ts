#!/usr/bin/env node
/**
 * A MEIA HORA ANTES DO FIM DO PLANTÃO, para o cron chamar (fase 180).
 *
 * Roda de dez em dez minutos, com a mesma conta do relógio do dia
 * (`RELOGIO_USER_EMAIL`), e avisa quem da escala ainda não assinou a passagem,
 * e o líder do turno. Rodar de novo não repete o aviso: a marca é do turno.
 * Mesmo desenho do `relogio.ts`: não é rota, e não guarda credencial.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RelogioService } from './modules/relogio';
import { ShiftsService } from './modules/shifts';
import { DatabaseService } from './kernel/database/database.service';
import { anotarImplantacao } from './kernel/implantacao/anotar';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const quem = await app.get(RelogioService).quemSou();
    const r = await app.get(ShiftsService).avisarFimDoPlantao(quem);
    console.log(`fim do plantão · ${r.casas} casa(s) · ${r.turnos} turno(s) avisado(s) · ${r.avisos} aviso(s)`);
    await anotarImplantacao(app.get(DatabaseService), 'fim_do_plantao', true,
      { casas: r.casas, turnos: r.turnos, avisos: r.avisos });
  } catch (e) {
    console.error(`fim do plantão NÃO rodou: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
    await anotarImplantacao(app.get(DatabaseService), 'fim_do_plantao', false, { motivo: 'nao_rodou' });
  } finally {
    await app.close();
  }
}
main();
