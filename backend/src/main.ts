import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  /* A última linha entre uma falha do banco e a educadora às onze da noite — o
     `FalhasEmPortugues` — mora no AppModule, para a suíte passar por ela também. */
  app.setGlobalPrefix('api/v1');
  await app.listen(Number(process.env.PORT ?? 3000));
  // eslint-disable-next-line no-console
  console.log(`Rede Acolher API — http://localhost:${process.env.PORT ?? 3000}/api/v1/health`);
}
bootstrap();
