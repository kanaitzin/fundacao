/**
 * NADA POR CIMA DE NADA, NADA VAZANDO (fase 314, pedido de 11/11: "veja se nenhum
 * botão ou texto fica em cima de outro texto ou botão, se nada está vazando,
 * confira telas de computador e celular de diferentes modelos").
 *
 * O protótipo aberto em catorze tamanhos de aparelho, do celular de 320 px ao
 * monitor de 1920, com tablets em pé e deitados, em cada cargo, por todas as
 * telas e pelas abas de dentro. Em cada uma mede o que os outros ensaios não medem:
 *
 *  - BOTÃO, CAMPO OU PÍLULA POR CIMA DE OUTRO;
 *  - TEXTO POR CIMA DE TEXTO, ou por cima de um botão (linha a linha, pelo
 *    retângulo de cada linha do texto, e não pela caixa do elemento);
 *  - o que VAZA da tela, do cartão ou da folha, e o texto que não cabe no botão;
 *  - a tela que anda para o lado, e o erro de página.
 *
 * O que está recolhido (o Como funciona fechado), o que rola por dentro e o que
 * é fixo por cima da tela (o botão da Acolhe+AI, que o ensaio do celular mede)
 * ficam de fora. A primeira rodada achou, em celulares de 320 a 390 px, o nome
 * coberto pela pílula vizinha em sete telas: defeito antigo, que nenhum ensaio via.
 *
 * Uso: ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio:por-cima
 *      ENSAIO_APARELHOS="iPhone SE antigo:320:568,Notebook 1366:1366:768" mede só esses.
 *      ENSAIO_CARGOS=educador,portaria mede só esses cargos.
 *      ENSAIO_PROVA=1 provoca sobreposições de propósito: a régua TEM de acusar.
 * A rodada inteira passa de 6.500 telas: divida os aparelhos em processos paralelos.
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQ = process.env.ENSAIO_ARQUIVO ?? resolve(AQUI, '..', 'prototipo', 'rede-acolher-prototipo.html');
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;
if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error('ENSAIO_CHROMIUM não aponta para um executável. Rode `bash scripts/preparar-ambiente.sh`.');
  process.exit(2);
}
const TODOS = 'iPhone SE antigo:320:568,Android pequeno:360:740,iPhone SE:375:667,iPhone 12 a 15:390:844,'
  + 'Pixel 7:412:915,iPhone Pro Max:430:932,iPad em pé:768:1024,iPad Air:820:1180,iPad deitado:1024:768,'
  + 'Notebook pequeno:1080:700,Notebook 1280:1280:720,Notebook 1366:1366:768,Notebook 1536:1536:864,Monitor Full HD:1920:1080';
const APARELHOS = (process.env.ENSAIO_APARELHOS ?? TODOS).split(',').map((a) => { const [n, w, h] = a.split(':'); return { n, w: +w, h: +h }; });
const CARGOS = process.env.ENSAIO_CARGOS ? process.env.ENSAIO_CARGOS.split(',') : null;
const nav = await chromium.launch({ executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const achados = new Map(); let telas = 0;
const medir = (pg) => pg.evaluate(() => {
  const r = [];
  const vw = document.documentElement.clientWidth;
  const doc = document.documentElement;
  if (doc.scrollWidth > vw + 1) r.push(`a tela anda ${doc.scrollWidth - vw}px para o lado`);
  const visivel = (e) => { if (e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return false; if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return false; const c = e.getBoundingClientRect(); return c.width > 1 && c.height > 1; };
  const overlay = document.querySelector('.overlay');
  const raiz = overlay ?? document.querySelector('.app') ?? document.body;
  // quem rola por dentro (abas que rolam de lado, tabela): o que está fora da janela dele não conta
  const dentroDaRolagem = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX + s.overflowY)) { const a = p.getBoundingClientRect(), c = e.getBoundingClientRect(); if (c.right > a.right + 1 || c.left < a.left - 1 || c.bottom > a.bottom + 1 || c.top < a.top - 1) return false; } } return true; };
  const fixo = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p).position; if (s === 'fixed' || s === 'sticky') return true; } return false; };
  const nome = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${(e.innerText || e.value || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 28)}"`;
  const controles = [...raiz.querySelectorAll('button, a[href], input, select, textarea, .pill, .cargo-chip, summary')]
    .filter((e) => visivel(e) && dentroDaRolagem(e) && (overlay || !fixo(e)) && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.troca-cargo') && e.type !== 'hidden' && !(e.tagName === 'INPUT' && e.type === 'file'));
  // 1) controle por cima de controle
  for (let i = 0; i < controles.length; i++) for (let j = i + 1; j < controles.length; j++) {
    const a = controles[i], b = controles[j];
    if (a.contains(b) || b.contains(a)) continue;
    if (a.classList.contains('cargo-chip') && b.classList.contains('cargo-chip')) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const sx = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), sy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (sx > 3 && sy > 3) r.push(`um por cima do outro: ${nome(a)} × ${nome(b)}`);
  }
  // 2) texto por cima de controle ou de outro texto (linha a linha)
  const folhas = [];
  const tw = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const pai = n.parentElement; if (!pai || !visivel(pai) || !dentroDaRolagem(pai) || (!overlay && fixo(pai))) continue;
    const s = getComputedStyle(pai); if (s.visibility === 'hidden' || +s.opacity === 0 || pai.closest('.troca-cargo, [aria-hidden=true]')) continue;
    if (s.clip !== 'auto' || s.clipPath !== 'none') continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const c of rg.getClientRects()) if (c.width > 2 && c.height > 2) folhas.push({ pai, c, t: n.nodeValue.trim().slice(0, 26) });
  }
  for (let i = 0; i < folhas.length; i++) for (let j = i + 1; j < folhas.length; j++) {
    const a = folhas[i], b = folhas[j];
    if (a.pai === b.pai || a.pai.contains(b.pai) || b.pai.contains(a.pai)) continue;
    const sx = Math.min(a.c.right, b.c.right) - Math.max(a.c.left, b.c.left), sy = Math.min(a.c.bottom, b.c.bottom) - Math.max(a.c.top, b.c.top);
    if (sx > 3 && sy > 4) r.push(`texto por cima de texto: "${a.t}" × "${b.t}"`);
  }
  for (const f of folhas) for (const k of controles) {
    if (k.contains(f.pai) || f.pai.contains(k)) continue;
    if (f.pai.closest('label') && f.pai.closest('label').contains(k)) continue;
    const c = k.getBoundingClientRect();
    const sx = Math.min(f.c.right, c.right) - Math.max(f.c.left, c.left), sy = Math.min(f.c.bottom, c.bottom) - Math.max(f.c.top, c.top);
    if (sx > 3 && sy > 4) r.push(`texto por cima de botão: "${f.t}" × ${nome(k)}`);
  }
  // 3) vazando: da tela, do cartão ou da folha; e texto que não cabe no botão
  for (const k of controles) {
    const c = k.getBoundingClientRect();
    if (c.right > vw + 1 || c.left < -1) r.push(`passa da borda da tela: ${nome(k)}`);
    const caixa = k.closest('.card, .sheet, .cartao-linha, .notice');
    if (caixa && caixa !== k) { const q = caixa.getBoundingClientRect(); if (c.right > q.right + 1 || c.left < q.left - 1) r.push(`vaza do cartão: ${nome(k)}`); }
    if (/^(BUTTON|A)$/.test(k.tagName) || k.classList.contains('pill')) {
      if (k.classList.contains('iconbtn')) continue; /* o número do sino fica fora do botão de propósito */
      if (k.scrollWidth > k.clientWidth + 2 && getComputedStyle(k).overflow !== 'visible') r.push(`texto cortado dentro de: ${nome(k)}`);
      else if (k.scrollWidth > k.clientWidth + 2) r.push(`texto vaza de: ${nome(k)}`);
    }
  }
  for (const f of folhas) { if (f.c.right > vw + 1) r.push(`texto passa da borda da tela: "${f.t}"`); }
  return [...new Set(r)];
});
for (const ap of APARELHOS) {
  const cel = ap.w < 1080;
  const pg = await nav.newPage({ viewport: { width: ap.w, height: ap.h }, isMobile: cel, hasTouch: cel, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  /* A COLUNA CURTA (fase 315): sob o ensaio a coluna nasce inteira, para o percurso achar
     todas as portas; `ENSAIO_MENU=curto` mede a coluna como a pessoa a vê. */
  if (process.env.ENSAIO_MENU) {
    await pg.addInitScript((modo) => { try { localStorage.setItem('rede-acolher.menu', modo); } catch { /* sem armazenamento */ } },
      process.env.ENSAIO_MENU);
  }
  const erros = [];
  pg.on('pageerror', (e) => erros.push('erro de página: ' + e.message.slice(0, 140)));
  await pg.goto(`file://${ARQ}`);
  await pg.waitForTimeout(900);
  const anotar = async (onde) => { telas++; for (const x of [...(await medir(pg)), ...erros.splice(0)]) { const k = `${x}`; if (!achados.has(k)) achados.set(k, []); achados.get(k).push(`${ap.n} ${ap.w}px · ${onde}`); } };
  await anotar('entrada');
  await pg.getByRole('button', { name: 'Marcelo Barbosa' }).click();
  await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
  await pg.waitForTimeout(1500);
  const sel = pg.locator('select.troca-cargo-sel');
  if (process.env.ENSAIO_PROVA) await pg.addStyleTag({ content: '.conteudo .btn{ margin-top:-34px !important } .conteudo .pill{ margin-left:-40px !important }' });
  await sel.waitFor({ state: 'attached', timeout: 30000 });
  const cargos = (await sel.locator('option').evaluateAll((os) => os.map((o) => o.value))).filter((c) => !CARGOS || CARGOS.includes(c));
  const tocar = async (loc) => { await loc.click({ timeout: 4000 }).catch(() => loc.evaluate((e) => e.click()).catch(() => {})); };
  const abasDeDentro = async (base) => {
    const q = 'main.conteudo [role=tab], main.conteudo > .filtros button';
    const n = Math.min(await pg.locator(q).count(), 7);
    for (let k = 0; k < n; k++) {
      const a = pg.locator(q).nth(k);
      if (!(await a.isVisible().catch(() => false))) continue;
      const t = (await a.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      await tocar(a); await pg.waitForTimeout(380);
      await anotar(`${base} · ${t}`);
    }
  };
  for (const cargo of cargos) {
    await sel.selectOption(cargo);
    await pg.waitForTimeout(1000);
    await anotar(`${cargo} · entrada`);
    if (!cel) {
      const n = await pg.locator('.navegacao button').count();
      for (let i = 0; i < n; i++) {
        const b = pg.locator('.navegacao button').nth(i);
        if (!(await b.isVisible().catch(() => false))) continue;
        const t = (await b.innerText()).replace(/\s+/g, ' ').trim();
        await tocar(b); await pg.waitForTimeout(550);
        await anotar(`${cargo} · ${t}`); await abasDeDentro(`${cargo} · ${t}`);
      }
    } else {
      const nb = await pg.locator('nav.tabbar button').count();
      for (let i = 0; i < nb; i++) {
        const b = pg.locator('nav.tabbar button').nth(i);
        if (!(await b.isVisible().catch(() => false))) continue;
        const t = (await b.innerText()).replace(/\s+/g, ' ').trim();
        if (/Mais$/i.test(t)) continue;
        await tocar(b); await pg.waitForTimeout(550);
        await anotar(`${cargo} · ${t}`); await abasDeDentro(`${cargo} · ${t}`);
      }
      const mais = pg.locator('nav.tabbar button', { hasText: 'Mais' }).filter({ visible: true });
      if (await mais.count()) {
        await tocar(mais.first()); await pg.waitForTimeout(350);
        await anotar(`${cargo} · folha Mais`);
        const np = await pg.locator('.overlay .sheet button.card.row').count();
        await tocar(pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ })); await pg.waitForTimeout(200);
        for (let i = 0; i < np; i++) {
          await tocar(mais.first()); await pg.waitForTimeout(280);
          const p = pg.locator('.overlay .sheet button.card.row').nth(i);
          const t = (await p.locator('b.ff').innerText().catch(() => '?')).trim();
          await tocar(p); await pg.waitForTimeout(600);
          await anotar(`${cargo} · ${t}`); await abasDeDentro(`${cargo} · ${t}`);
        }
      }
      // a folha da conta, no celular
      const conta = pg.locator('button.conta-celular');
      if (await conta.count()) { await tocar(conta); await pg.waitForTimeout(400); await anotar(`${cargo} · Minha conta`); await tocar(pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).first()); await pg.waitForTimeout(200); }
    }
  }
  await pg.close();
  console.log(`✓ ${ap.n} (${ap.w}×${ap.h}) — ${telas} telas até aqui, ${achados.size} tipo(s) de achado`);
}
await nav.close();
console.log(`\n${telas} telas e abas medidas em ${APARELHOS.length} tamanho(s) de aparelho.`);
if (achados.size) {
  console.log(`${achados.size} achado(s) diferentes:`);
  for (const [a, onde] of [...achados].sort((x, y) => y[1].length - x[1].length)) console.log(` · ${a}  [${onde.length} vez(es); por exemplo: ${onde[0]}]`);
  process.exit(1);
}
console.log('Nenhum achado: nada por cima de nada, nada vazando da tela nem do cartão, nenhum texto fora do botão.');
