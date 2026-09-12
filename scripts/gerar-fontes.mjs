#!/usr/bin/env node
/**
 * AS FONTES, EMBUTIDAS NO PROTÓTIPO (fase 97, decisão §10.10).
 *
 * O protótipo é entregue como UM arquivo, aberto por duas vias que não têm
 * internet garantida: o anexo baixado no celular e o arquivo no computador da
 * casa. Até aqui o CSS buscava as duas famílias no Google, e sem rede a letra
 * caía para a do sistema — não é a que a equipe vai ver, e a *Atkinson
 * Hyperlegible* foi escolhida justamente por ser desenhada para leitura
 * difícil, que é o caso de quem lê um alerta no corredor às onze da noite.
 * Com rede, cada abertura mandava o IP de quem abriu para um terceiro.
 *
 * A decisão estava em aberto por causa do custo: o documento estimava 300 KB.
 * Medido, com o subconjunto LATINO e só os pesos que o CSS usa, são 87 KB de
 * arquivo e ~116 KB em base64. Em vez de opinar sobre o custo, mediu-se.
 *
 * O subconjunto é o latino INTEIRO, e não os caracteres que hoje aparecem nas
 * telas: o protótipo tem campos onde a pessoa digita, e um nome com Ñ ou Ü sai
 * na letra errada se o subconjunto for recortado pelo texto atual.
 *
 * Gera `frontend/src/fontes.css`, que o `styles.css` importa. O arquivo é
 * gerado no build e ignorado pelo git — 116 KB de base64 versionado não se lê,
 * não se revisa, e envelhece.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

/* Peso e estilo saem do que o `styles.css` de fato usa: 400 e 700 na Atkinson
   (mais o itálico das linhas de procedência das folhas), 600/700/800 na
   Jakarta. Pedir mais pesos é pagar por letra que ninguém desenha. */
const FONTES = [
  { familia: 'Atkinson Hyperlegible', pacote: 'atkinson-hyperlegible', peso: 400, estilo: 'normal' },
  { familia: 'Atkinson Hyperlegible', pacote: 'atkinson-hyperlegible', peso: 700, estilo: 'normal' },
  { familia: 'Atkinson Hyperlegible', pacote: 'atkinson-hyperlegible', peso: 400, estilo: 'italic' },
  { familia: 'Plus Jakarta Sans', pacote: 'plus-jakarta-sans', peso: 600, estilo: 'normal' },
  { familia: 'Plus Jakarta Sans', pacote: 'plus-jakarta-sans', peso: 700, estilo: 'normal' },
  { familia: 'Plus Jakarta Sans', pacote: 'plus-jakarta-sans', peso: 800, estilo: 'normal' },
];

const blocos = [];
let bytes = 0;
for (const f of FONTES) {
  const arquivo = join(RAIZ, 'node_modules', '@fontsource', f.pacote, 'files',
    `${f.pacote}-latin-${f.peso}-${f.estilo}.woff2`);
  if (!existsSync(arquivo)) {
    console.error(`✗ falta ${arquivo}\n  rode: npm install`);
    process.exit(1);
  }
  const dados = readFileSync(arquivo);
  bytes += dados.length;
  blocos.push(`@font-face {
  font-family: "${f.familia}";
  font-style: ${f.estilo};
  font-weight: ${f.peso};
  font-display: swap;
  src: url(data:font/woff2;base64,${dados.toString('base64')}) format("woff2");
}`);
}

const saida = join(RAIZ, 'frontend', 'src', 'fontes.css');
writeFileSync(saida, `/* GERADO por scripts/gerar-fontes.mjs — não edite à mão.
   Subconjunto latino, só os pesos que o styles.css usa. Ver §10.10. */
${blocos.join('\n\n')}
`);
console.log(`✓ ${FONTES.length} fontes embutidas · ${(bytes / 1024).toFixed(0)} KB de woff2 `
  + `→ ${(readFileSync(saida).length / 1024).toFixed(0)} KB de CSS`);
