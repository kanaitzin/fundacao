/**
 * A migração de quem desenvolve: a MESMA de produção (`src/migrate.ts`).
 *
 * Eram dois executores, um aqui e outro em `src/`, e só o de produção dizia
 * quantas migrações aplicou; a soma de cada arquivo e a trava contra duas
 * execuções (fase 219) teriam de ser escritas duas vezes. Agora este só
 * põe o endereço do banco de desenvolvimento quando não há um, e chama o
 * de produção, que lê os `.sql` de `src/modules/…` quando roda por `tsx`.
 */
process.env.DATABASE_URL ??= 'postgres://rede_admin:dev-only-change-me@localhost:5432/rede_acolher';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { migrar } = require('../src/migrate') as { migrar: () => Promise<void> };
migrar().catch((e) => { console.error(e); process.exit(1); });
