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

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const quem = await app.get(RelogioService).quemSou();
    const r = await app.get(ShiftsService).avisarFimDoPlantao(quem);
    console.log(`fim do plantão · ${r.casas} casa(s) · ${r.turnos} turno(s) avisado(s) · ${r.avisos} aviso(s)`);
  } catch (e) {
    console.error(`fim do plantão NÃO rodou: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}
main();
