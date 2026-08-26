/**
 * Runner de migrações: aplica db/migrations/*.sql em ordem, uma única vez,
 * registrando em schema_migration. Conecta como ADMIN (dono das tabelas).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgres://rede_admin:dev-only-change-me@localhost:5432/rede_acolher';
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

  const dir = join(__dirname, '..', 'db', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const { rows } = await client.query(`SELECT 1 FROM schema_migration WHERE name = $1`, [f]);
    if (rows.length) { console.log(`= ${f} (já aplicada)`); continue; }
    console.log(`> ${f}`);
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(join(dir, f), 'utf8'));
      await client.query(`INSERT INTO schema_migration (name) VALUES ($1)`, [f]);
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
