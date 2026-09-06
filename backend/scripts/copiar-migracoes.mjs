#!/usr/bin/env node
/**
 * O `tsc` NÃO COPIA `.sql`.
 *
 * As 76 migrações vivem em `src/modules/<mod>/migrations/*.sql`, e `dist/`
 * saía com ZERO delas. Quem implantasse só o `dist/` — que é o que se
 * implanta — subiria o serviço, veria `/health` responder "ok", e descobriria
 * o banco vazio. O `/health` responde ok porque o banco existe; ele não sabe
 * se as tabelas estão lá.
 *
 * Este passo roda no `postbuild` e copia os `.sql` e o timbre para dentro do
 * `dist/`. Ele CONTA os arquivos e falha se não achar nenhum: um passo de
 * construção que copia zero arquivos em silêncio é pior do que não existir.
 */
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DE = join(RAIZ, 'src', 'modules');
const PARA = join(RAIZ, 'dist', 'modules');

let copiados = 0;

for (const modulo of await readdir(DE)) {
  const dir = join(DE, modulo, 'migrations');
  if (!existsSync(dir) || !(await stat(dir)).isDirectory()) continue;
  const destino = join(PARA, modulo, 'migrations');
  await mkdir(destino, { recursive: true });
  for (const nome of await readdir(dir)) {
    if (!nome.endsWith('.sql')) continue;
    await cp(join(dir, nome), join(destino, nome));
    copiados++;
  }
}

/* O timbre é lido de `TIMBRE_PATH` ou de `assets/timbre.png` a partir do
 * diretório de execução. Sem ele o documento SAI — sem a marca da Fundação, e
 * sem avisar ninguém. */
const timbre = join(RAIZ, 'assets', 'timbre.png');
if (existsSync(timbre)) {
  await mkdir(join(RAIZ, 'dist', 'assets'), { recursive: true });
  await cp(timbre, join(RAIZ, 'dist', 'assets', 'timbre.png'));
} else {
  console.warn('⚠ assets/timbre.png não encontrado: os documentos sairão sem a marca.');
}

if (!copiados) {
  console.error('Nenhuma migração copiada. A construção está errada — não publique isto.');
  process.exit(1);
}
console.log(`✓ ${copiados} migrações copiadas para dist/modules/`);
