import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  /* O CORS, os cabeçalhos de segurança e o `trust proxy` moram no AppModule
     desde a fase 179 (`kernel/common/porta-da-internet.ts`): antes o CORS
     ficava aqui, aberto a qualquer origem quando faltava a variável. */
  /* A última linha entre uma falha do banco e a educadora às onze da noite — o
     `FalhasEmPortugues` — mora no AppModule, para a suíte passar por ela também. */
  app.setGlobalPrefix('api/v1');
  /* Só por dentro da máquina (fase 291): o proxy fala com o servidor pelo 127.0.0.1, e quem
     chegasse direto na porta escreveria o `X-Forwarded-For` que quisesse, e com ele o
     endereço que a trava das tentativas conta. Outro endereço, só escrevendo `HOST`. */
  await app.listen(Number(process.env.PORT ?? 3000), process.env.HOST?.trim() || '127.0.0.1');
  // eslint-disable-next-line no-console
  console.log(`Rede Acolher API — http://localhost:${process.env.PORT ?? 3000}/api/v1/health`);
}
bootstrap();
