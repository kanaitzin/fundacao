/**
 * O VAZIO QUE MENTE (fase 260, do relatório 5 da equipe de design).
 *
 * Toda tela pede o dado ao abrir. Enquanto ele não chega, a lista está vazia, e
 * se a tela não distingue "ainda não chegou" de "não há", ela diz "Nenhuma
 * chamada aberta hoje" ou "Nada esperando você" por um instante. No protótipo o
 * instante é de 120 ms e ninguém vê; no servidor, num celular com sinal fraco às
 * 23h, ele dura o tempo da rede, e a educadora lê como verdade.
 *
 * Este ensaio alonga a pausa do protótipo (`__pausaDoPrototipo`, no `mock.ts`),
 * abre cada aba e cada porta do "Mais" de cada cargo, a 390 px, e lê o texto da
 * tela duas vezes enquanto o dado ainda não chegou. Depois espera não haver
 * pedido no ar (`__pedidosNoAr`) e lê de novo. Frase de vazio, ou número zero,
 * que estava na tela antes e sumiu depois é achado: ela disse que não havia, e
 * havia.
 *
 * O que NÃO é achado: "Carregando", "Abrindo", "Buscando" e o esqueleto, que
 * dizem a verdade; e o vazio que continua depois, que é o vazio de verdade.
 *
 * Uso: ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio:vazio
 *      ENSAIO_CARGOS=educador para um cargo só; ENSAIO_PAUSA=1500 (ms).
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = process.env.ENSAIO_ARQUIVO
  ?? resolve(AQUI, '..', 'prototipo', 'rede-acolher-prototipo.html');
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;
const PAUSA = Number(process.env.ENSAIO_PAUSA ?? 1500);
const SO = process.env.ENSAIO_CARGOS ? process.env.ENSAIO_CARGOS.split(',') : null;

if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error('ENSAIO_CHROMIUM não aponta para um executável. Rode `bash scripts/preparar-ambiente.sh`.');
  process.exit(2);
}

/* A frase que diz que não há, e o zero que conta antes de o dado chegar ("Pedidos do
   período · 0"). Carregando e esqueleto dizem a verdade e ficam de fora. */
const VAZIO = /\b(nenhum|nenhuma|nada|ningu[eé]m|n[aã]o h[aá]|ainda n[aã]o|sem (registro|aviso|chamada|dose|visita|ocorr|crian|pedido|plant|linha|documento|atividade|pend)|vazi[ao])\b|(^|\s)0 (crian|chamad|aviso|dose|visita|pend|ocorr|registro|pedido|plant|unidade|item|nota|foto|rem[eé]dio|lanche|refei)|·\s*0(\s|$)|^0$/i;

const navegador = await chromium.launch({
  executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const pg = await navegador.newPage({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
});
const erros = [];
pg.on('pageerror', (e) => erros.push(e.message));
await pg.goto(`file://${ARQUIVO}`);
await pg.waitForTimeout(900);
await pg.getByRole('button', { name: 'Marcelo Barbosa' }).click();
await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
await pg.waitForTimeout(1500);

/* As frases da tela, cada uma uma vez: o texto dos blocos que não têm bloco dentro. */
const frases = () => pg.evaluate(() => {
  const main = document.querySelector('main.conteudo') ?? document.body;
  const fora = (el) => el.closest('.overlay, nav.tabbar, .acolhe-faixa, .appbar');
  const r = new Set();
  for (const el of main.querySelectorAll('p, li, td, span, div, b, h2, h3, small, em, strong')) {
    if (fora(el) || !el.offsetParent) continue;
    if (el.querySelector('p, li, div, td, h2, h3')) continue;
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (t && t.length < 220) r.add(t);
  }
  return [...r];
});
const noAr = () => pg.evaluate(() => globalThis.__pedidosNoAr ?? 0);
const esperarChegar = async () => {
  const fim = Date.now() + PAUSA * 12;
  let calmo = 0;
  while (Date.now() < fim) {
    await pg.waitForTimeout(150);
    calmo = (await noAr()) === 0 ? calmo + 150 : 0;
    if (calmo >= 450) return true;
  }
  return false;
};

const achados = [];
const semSossego = [];
let telas = 0;
const medir = async (cargo, onde, abrir) => {
  await esperarChegar();
  await pg.evaluate((p) => { globalThis.__pausaDoPrototipo = p; }, PAUSA);
  erros.length = 0;
  await abrir();
  const antes = new Set();
  for (const espera of [Math.round(PAUSA * 0.2), Math.round(PAUSA * 0.5)]) {
    await pg.waitForTimeout(espera);
    for (const f of await frases()) antes.add(f);
  }
  const chegou = await esperarChegar();
  const depois = new Set(await frases());
  await pg.evaluate(() => { globalThis.__pausaDoPrototipo = 120; });
  telas++;
  for (const f of antes) {
    if (depois.has(f) || !VAZIO.test(f)) continue;
    achados.push(`[${cargo} · ${onde}] antes do dado: "${f.slice(0, 120)}"`);
  }
  /* Tela que se atualiza sozinha (a Portaria, de tempos em tempos) nunca fica sem
     pedido no ar: lê-se depois de doze pausas, e isso é informação, não achado. */
  if (!chegou) semSossego.push(`${cargo} · ${onde}`);
  for (const e of erros) achados.push(`[${cargo} · ${onde}] erro: ${e}`);
};

const seletor = pg.locator('select.troca-cargo-sel');
const cargos = (await seletor.locator('option').evaluateAll((os) =>
  os.map((o) => ({ valor: o.value, rotulo: o.textContent.trim() }))))
  .filter((c) => !SO || SO.includes(c.valor));
console.log(`\n⏳ O vazio que mente: ${cargos.length} cargos, pausa de ${PAUSA} ms`);

for (const cargo of cargos) {
  const antes = achados.length;
  await medir(cargo.valor, 'ao entrar', async () => { await seletor.selectOption(cargo.valor); });
  const abas = (await pg.locator('nav.tabbar button').allInnerTexts())
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => !/Mais$/i.test(t));
  for (let i = 0; i < abas.length; i++) {
    /* Sai para outra aba antes, para a tela nascer de novo e pedir o dado. */
    await medir(cargo.valor, abas[i], async () => {
      await pg.locator('nav.tabbar button').nth(i === 0 ? 1 : 0).click();
      await pg.waitForTimeout(50);
      await pg.locator('nav.tabbar button').nth(i).click();
    });
  }
  if (await pg.locator('nav.tabbar button', { hasText: 'Mais' }).count()) {
    await pg.locator('nav.tabbar button', { hasText: 'Mais' }).first().click();
    await pg.waitForTimeout(350);
    const portas = await pg.locator('.overlay .sheet button.card.row b.ff').allInnerTexts();
    await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).click();
    await pg.waitForTimeout(250);
    for (let i = 0; i < portas.length; i++) {
      await medir(cargo.valor, portas[i].trim(), async () => {
        await pg.locator('nav.tabbar button').first().click();
        await pg.waitForTimeout(50);
        await pg.locator('nav.tabbar button', { hasText: 'Mais' }).first().click();
        await pg.waitForTimeout(300);
        await pg.locator('.overlay .sheet button.card.row').nth(i).click();
      });
    }
  }
  const n = achados.length - antes;
  console.log(`  ${n ? '✗' : '✓'} ${cargo.rotulo}${n ? ` — ${n} frase(s) de vazio antes do dado` : ''}`);
}
await navegador.close();

console.log(`\n${telas} telas abertas com a rede lenta.`);
if (semSossego.length) console.log(`Telas que se atualizam sozinhas, lidas depois de ${PAUSA * 12} ms (informação): ${semSossego.join(', ')}.`);
if (achados.length) {
  console.log(`\n${achados.length} achado(s):`);
  for (const a of achados) console.log(`  · ${a}`);
  process.exit(1);
}
console.log('Nenhuma tela diz que não há antes de o dado chegar.');
