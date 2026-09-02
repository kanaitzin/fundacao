/**
 * globalSetup do Jest: recria o banco do zero antes da suíte.
 *
 * Os testes de aceite exercitam fluxos que MUTAM o estado (transferência,
 * retorno, saída) — por isso cada execução parte de um banco limpo, aplicando
 * migrações e seeds fictícios. Execução reproduzível é requisito (§29).
 */
import { Client } from 'pg';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export default async function reset() {
  const url = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';
  const c = new Client({ connectionString: url });
  await c.connect();
  /*
   * O papel rede_app é do cluster (não do schema) e sobrevive ao DROP — por
   * isso o GRANT abaixo funciona em qualquer máquina que já tenha rodado as
   * migrações uma vez. Numa máquina VIRGEM ele não existe ainda: quem o cria
   * é a migração 0010, que só roda depois daqui, e a suíte inteira morria no
   * setup antes do primeiro teste, com uma mensagem que não diz isso. A
   * criação repetida do mesmo passo da 0010 é o preço de o setup ser o
   * primeiro a falar com o banco.
   */
  await c.query(`DROP SCHEMA public CASCADE`);
  await c.query(`CREATE SCHEMA public`);
  await c.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rede_app') THEN
        CREATE ROLE rede_app LOGIN PASSWORD 'dev-only-change-me-app';
      END IF;
    END $$;
  `);
  await c.query(`GRANT USAGE ON SCHEMA public TO rede_app`);
  await c.end();

  const backend = join(__dirname, '..', '..');
  const run = (script: string) =>
    execFileSync('npx', ['tsx', join('scripts', script)], { cwd: backend, stdio: 'pipe', env: process.env });
  run('migrate.ts');
  run('seed.ts');
  run('seed-fase2.ts');
  // Medicamentos fictícios: sem eles a demonstração mostra a parte fácil, e o
  // módulo onde o erro custa mais caro fica de fora do ensaio (§33.3).
  run('seed-fase4.ts');
}
