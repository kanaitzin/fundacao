/**
 * A MIGRAÇÃO QUE RODA EM PRODUÇÃO.
 *
 * `scripts/migrate.ts` roda por `tsx`, lendo os `.sql` de `src/modules/…`.
 * Isso funciona na máquina de quem desenvolve e **não funciona no servidor**,
 * por duas razões que só aparecem lá:
 *
 *  1. `tsx` é dependência de DESENVOLVIMENTO. Uma instalação de produção
 *     (`npm ci --omit=dev`) não a tem, e o comando falha com "tsx: not found";
 *  2. `scripts/` e `src/` não vão para o servidor. O que se implanta é
 *     `dist/` — e o `tsc` não copia arquivo `.sql`, então as 76 migrações
 *     simplesmente não existem lá.
 *
 * O resultado seria descobrir isso no dia da implantação, com a casa
 * esperando: o serviço sobe, responde `/health`, e o banco está vazio.
 *
 * Este arquivo é compilado junto com o resto (`dist/migrate.js`) e lê os
 * `.sql` de `dist/modules/…`, para onde o `postbuild` os copia. Roda com
 * `node dist/migrate.js`, sem nenhuma dependência de desenvolvimento.
 */
import { readdirSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * A raiz das migrações.
 *
 * Compilado, este arquivo está em `dist/`, e os `.sql` em `dist/modules/…`.
 * Rodando por `tsx` a partir de `src/`, ficam em `src/modules/…`. O mesmo
 * código serve aos dois — e é isso que impede a versão de produção de
 * envelhecer sozinha, sem ninguém a exercitar.
 */
const RAIZ = join(__dirname, 'modules');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definida. A migração roda como o DONO do banco '
      + '(rede_admin), e não como a aplicação (rede_app).');
    process.exit(1);
  }
  if (!existsSync(RAIZ)) {
    console.error(`Não encontrei as migrações em ${RAIZ}.\n`
      + 'Se este é um servidor, a construção não copiou os .sql — rode `npm run build`, '
      + 'que executa o passo `postbuild`.');
    process.exit(1);
  }

  const c = new Client({ connectionString: url });
  await c.connect();

  await c.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name       text PRIMARY KEY,
      module     text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const { rows } = await c.query(`SELECT name FROM schema_migration`);
  const jaAplicadas = new Set(rows.map((r) => r.name));

  /*
   * A ORDEM É PELO NÚMERO DO ARQUIVO, ATRAVESSANDO OS MÓDULOS.
   *
   * As partições são isoladas no código e NÃO no banco: a 0770 de `identity`
   * mexe em tabela que a 0490 de `reports` criou. Ordenar por módulo e depois
   * por número aplicaria as coisas fora de ordem e quebraria numa máquina
   * nova — que é exatamente onde a migração precisa funcionar.
   */
  const todas: Array<{ nome: string; modulo: string; caminho: string }> = [];
  for (const modulo of readdirSync(RAIZ)) {
    const dir = join(RAIZ, modulo, 'migrations');
    if (!existsSync(dir)) continue;
    for (const nome of readdirSync(dir)) {
      if (nome.endsWith('.sql')) todas.push({ nome, modulo, caminho: join(dir, nome) });
    }
  }
  todas.sort((a, b) => a.nome.localeCompare(b.nome));

  if (!todas.length) {
    console.error(`Nenhum .sql em ${RAIZ}. A construção não copiou as migrações.`);
    process.exit(1);
  }

  let novas = 0;
  for (const m of todas) {
    if (jaAplicadas.has(m.nome)) {
      console.log(`= [${m.modulo}] ${m.nome}`);
      continue;
    }
    console.log(`> [${m.modulo}] ${m.nome}`);
    const sql = await readFile(m.caminho, 'utf8');
    /* Cada migração numa transação: uma que falha no meio não deixa metade
     * aplicada e o registro dizendo que aplicou. */
    await c.query('BEGIN');
    try {
      await c.query(sql);
      await c.query(
        `INSERT INTO schema_migration (name, module) VALUES ($1, $2)`, [m.nome, m.modulo]);
      await c.query('COMMIT');
      novas++;
    } catch (e) {
      await c.query('ROLLBACK');
      console.error(`\nFalhou em ${m.nome}:`, e instanceof Error ? e.message : e);
      await c.end();
      process.exit(1);
    }
  }

  console.log(`\nMigrações concluídas — ${todas.length} no total, ${novas} nova(s).`);
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
