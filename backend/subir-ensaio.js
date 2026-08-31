const { NestFactory } = require('@nestjs/core');
require('ts-node').register({ compilerOptions: { module: 'commonjs' }, transpileOnly: true });
const { AppModule } = require('./src/app.module.ts');
const { ValidationPipe } = require('@nestjs/common');
(async () => {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(3999);
  console.log('API NO AR');
})();
