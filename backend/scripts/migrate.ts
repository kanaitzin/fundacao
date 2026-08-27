/**
 * Runner de migrações — varre as migrações DE CADA MÓDULO.
 *
 * Cada módulo guarda suas migrações em `src/modules/<mod>/migrations/*.sql`.
 * Remover um módulo é remover sua pasta: nenhuma outra partição é afetada,
 * e o histórico do que já foi aplicado continua registrado em schema_migration.
 *
 * A ordem é global pelo prefixo numérico do arquivo (0010, 0020, …), porque
 * dependências entre módulos existem no banco (chaves estrangeiras) mesmo
 * quando não existem no código.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

interface Migration { file: string; module: string; path: string; }

function discover(): Migration[] {
  const modulesDir = join(__dirname, '..', 'src', 'modules');
  const found: Migration[] = [];
  for (const mod of readdirSync(modulesDir)) {
    const dir = join(modulesDir, mod, 'migrations');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      found.push({ file, module: mod, path: join(dir, file) });
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@localhost:5432/rede_acolher';
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (
    name text PRIMARY KEY, module text, applied_at timestamptz NOT NULL DEFAULT now())`);

  for (const m of discover()) {
    const { rows } = await client.query(`SELECT 1 FROM schema_migration WHERE name = $1`, [m.file]);
    if (rows.length) { console.log(`= [${m.module}] ${m.file}`); continue; }
    console.log(`> [${m.module}] ${m.file}`);
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(m.path, 'utf8'));
      await client.query(`INSERT INTO schema_migration (name, module) VALUES ($1,$2)`, [m.file, m.module]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
  await client.end();
  console.log('Migrações concluídas.');
}
main().catch((e) => { console.error(e); process.exit(1); });
