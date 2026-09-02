#!/usr/bin/env node
/**
 * ENSAIO DE ACESSIBILIDADE — a tela lida no corredor, às onze da noite.
 *
 * O projeto escolheu a *Atkinson Hyperlegible* por ser desenhada para leitura
 * difícil, e nunca conferiu o resto: contraste, nome acessível dos botões,
 * rótulo dos campos, tamanho do alvo de toque. São as quatro coisas que
 * decidem se a educadora acerta o botão de primeira segurando uma criança com
 * a outra mão — e nenhuma delas aparece quando quem constrói olha a tela num
 * monitor grande, parado, com luz.
 *
 * Roda o axe-core em CADA tela que CADA cargo alcança, e agrupa o que
 * encontrar por regra, com um exemplo de onde. Contagem por regra, e não por
 * elemento: vinte linhas de uma lista com o mesmo defeito são UM defeito.
 *
 * Regras: WCAG 2.1 A e AA — o que a Fundação precisaria cumprir se alguém
 * perguntasse, e o que qualquer pessoa precisa para ler uma tela cansada.
 *
 * `ENSAIO_A11Y_TOLERADAS` lista regras conhecidas e aceitas, com motivo
 * escrito no código — nunca silenciadas em silêncio.
 *
 * Uso: ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio:acessibilidade
 */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = process.env.ENSAIO_ARQUIVO
  ?? resolve(AQUI, '..', 'prototipo', 'rede-acolher-prototipo.html');
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;

if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error('ENSAIO_CHROMIUM não aponta para um executável. Rode `bash scripts/preparar-ambiente.sh`.');
  process.exit(2);
}

const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/**
 * O que se tolera, e por quê. Uma linha aqui é uma decisão registrada.
 *
 * Vazio por enquanto: a fase 50 preferiu corrigir a listar.
 */
const TOLERADAS = new Map([
  // ['nome-da-regra', 'o motivo, por extenso'],
]);

const achados = new Map();   // regra → { impacto, ajuda, ondes: [] }

const navegador = await chromium.launch({
  executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const pg = await navegador.newPage({ viewport: { width: 420, height: 900 } });

await pg.goto(`file://${ARQUIVO}`);
await pg.waitForTimeout(900);
await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
await pg.waitForTimeout(1200);

async function conferir(onde) {
  await pg.evaluate(AXE);
  const r = await pg.evaluate(async () => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  }));
  for (const v of r.violations) {
    if (TOLERADAS.has(v.id)) continue;
    if (!achados.has(v.id)) {
      achados.set(v.id, { impacto: v.impact, ajuda: v.help, ondes: [], exemplo: null });
    }
    const a = achados.get(v.id);
    a.ondes.push(onde);
    if (!a.exemplo) a.exemplo = (v.nodes[0]?.html ?? '').slice(0, 120);
  }
}

const seletor = pg.locator('select.troca-cargo-sel');
const cargos = await seletor.locator('option').evaluateAll((os) =>
  os.map((o) => ({ valor: o.value, rotulo: o.textContent.trim() })));

console.log(`Acessibilidade — ${cargos.length} cargos\n`);
let telas = 0;

for (const cargo of cargos) {
  await seletor.selectOption(cargo.valor);
  await pg.waitForTimeout(900);

  const abas = await pg.locator('nav.tabbar button').allInnerTexts();
  const doTurno = abas.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => !/Mais$/i.test(t));

  for (let i = 0; i < doTurno.length; i++) {
    await pg.locator('nav.tabbar button').nth(i).click();
    await pg.waitForTimeout(700);
    await conferir(`${cargo.valor} · ${doTurno[i]}`); telas++;
  }

  const temMais = await pg.locator('nav.tabbar button', { hasText: 'Mais' }).count();
  if (temMais) {
    await pg.locator('nav.tabbar button', { hasText: 'Mais' }).first().click();
    await pg.waitForTimeout(350);
    /* A folha do "Mais" também é tela: ela é aberta dezenas de vezes por
     * turno, e é onde metade das funções mora. */
    await conferir(`${cargo.valor} · folha "Mais"`); telas++;
    const portas = await pg.locator('.overlay .sheet button.card.row b.ff').allInnerTexts();
    await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).click();
    await pg.waitForTimeout(250);

    for (let i = 0; i < portas.length; i++) {
      await pg.locator('nav.tabbar button', { hasText: 'Mais' }).first().click();
      await pg.waitForTimeout(300);
      await pg.locator('.overlay .sheet button.card.row').nth(i).click();
      await pg.waitForTimeout(800);
      await conferir(`${cargo.valor} · ${portas[i].trim()}`); telas++;
    }
  } else {
    await conferir(`${cargo.valor} · tela única`); telas++;
  }

  const meus = [...achados.values()].filter((a) => a.ondes.some((o) => o.startsWith(cargo.valor)));
  console.log(`  ${meus.length ? '✗' : '✓'} ${cargo.rotulo}`);
}

await navegador.close();

console.log(`\n${telas} telas conferidas.`);
if (!achados.size) {
  console.log('Nenhuma violação de WCAG 2.1 AA.');
  process.exit(0);
}

const ordem = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const lista = [...achados.entries()]
  .sort((a, b) => (ordem[a[1].impacto] ?? 9) - (ordem[b[1].impacto] ?? 9));

console.log(`\n${lista.length} regra(s) violada(s):\n`);
for (const [regra, a] of lista) {
  console.log(`  [${a.impacto}] ${regra} — ${a.ajuda}`);
  console.log(`      em ${a.ondes.length} tela(s): ${[...new Set(a.ondes)].slice(0, 4).join(', ')}`);
  console.log(`      ex.: ${a.exemplo}`);
}
process.exit(1);
