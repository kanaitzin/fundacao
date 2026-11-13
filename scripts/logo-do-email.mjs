#!/usr/bin/env node
// Reescreve o logo que vai dentro do e-mail a partir do logo da tela.
// Uso: node scripts/logo-do-email.mjs   (depois de trocar frontend/src/assets/logo.png)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'backend/src/modules/identity/logo-do-email.ts');
const b64 = readFileSync(join(raiz, 'frontend/src/assets/logo.png')).toString('base64');
const linhas = b64.match(/.{1,100}/g).map((l) => `  '${l}',`).join('\n');
const atual = readFileSync(destino, 'utf8');
const novo = atual.replace(/Buffer\.from\(\[\n[\s\S]*?\n\]\.join/, `Buffer.from([\n${linhas}\n].join`);
writeFileSync(destino, novo);
console.log(novo === atual ? 'o logo do e-mail já era o da tela' : 'logo do e-mail reescrito');
