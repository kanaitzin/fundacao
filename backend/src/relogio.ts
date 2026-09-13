#!/usr/bin/env node
/**
 * O RELÓGIO, para o cron chamar (fase 103).
 *
 * Roda NO SERVIDOR, como o migrador: `npm run relogio`. Não é uma rota, e isso
 * é decisão — uma rota exigiria guardar no `crontab` uma credencial com alcance
 * nas oito casas, capaz de gerar dose e disparar aviso. Aqui não há credencial:
 * quem consegue rodar isto já está dentro do servidor.
 *
 * Sai com código 1 se alguma rotina falhar, para o cron poder avisar. Continua
 * pelas outras casas de qualquer jeito: numa instituição de oito, parar na
 * segunda deixaria seis sem o dia gerado.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RelogioService } from './modules/relogio';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const relogio = app.get(RelogioService);
    const quem = await relogio.quemSou();
    const r = await relogio.rodarODia(quem, process.argv[2]);
    console.log(`relógio · ${r.dia} · ${r.casas} casa(s) · ${r.rodadas} rotina(s)`);
    for (const f of r.falhas) console.error(`  ✗ ${f}`);
    if (r.falhas.length) {
      console.error(`${r.falhas.length} rotina(s) falharam — o dia pode estar incompleto.`);
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(`relógio NÃO rodou: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
