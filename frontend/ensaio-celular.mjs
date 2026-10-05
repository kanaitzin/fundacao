/**
 * ENSAIO NO CELULAR (fase 184, pedido de 05/10: "veja como está pelo celular,
 * todas as telas, se tudo fica no seu devido lugar").
 *
 * O protótipo aberto como um celular de verdade: tela de 360 px (o menor
 * Android comum) e de 390 px (iPhone), com toque e densidade 2, em cada cargo,
 * por todas as abas de baixo e todas as portas do "Mais". Em cada tela mede o
 * que o olho de quem segura o celular sente primeiro:
 *
 *  - a TELA QUE ANDA PARA O LADO (largura maior que a do aparelho);
 *  - o ELEMENTO QUE PASSA DA BORDA (fora das tabelas, que rolam de propósito);
 *  - o TEXTO CORTADO com reticências, que esconde parte de um nome ou estado,
 *    e o texto que NÃO CABE no próprio botão e vaza da caixa dele;
 *  - os BOTÕES ENCOSTADOS ou um por cima do outro, na mesma linha (a régua de
 *    abas da Saúde, "EstoqueCompras", foi achada no olho e virou medida);
 *  - o BOTÃO PEQUENO DEMAIS para o dedo (menos de 24 px, o mínimo do WCAG 2.2;
 *    a conta de 24 a 40 px sai como informação, não como achado);
 *  - o que fica ESCONDIDO ATRÁS DA BARRA DE BAIXO quando se rola até o fim;
 *  - e o erro da página.
 *
 * Fotografa cada tela inteira em /tmp/ensaio-celular, para quem conferir olhar.
 * Uso: ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio:celular
 *      ENSAIO_LARGURAS=360 para uma largura só.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = process.env.ENSAIO_ARQUIVO
  ?? resolve(AQUI, '..', 'prototipo', 'rede-acolher-prototipo.html');
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;
const SAIDA = process.env.ENSAIO_SAIDA ?? '/tmp/ensaio-celular';
const LARGURAS = (process.env.ENSAIO_LARGURAS ?? '360,390').split(',').map(Number);

if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error('ENSAIO_CHROMIUM não aponta para um executável. Rode `bash scripts/preparar-ambiente.sh`.');
  process.exit(2);
}

const navegador = await chromium.launch({
  executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const achados = [];
let telas = 0;
let alvosMedios = 0;

/** O que a tela aberta agora tem de errado no celular. */
async function medir(pg) {
  return pg.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const r = { vaza: 0, fora: [], cortado: [], naoCabe: [], encostados: [], pequeno: [], medio: 0, escondido: null };
    r.vaza = document.documentElement.scrollWidth - vw;
    const visivel = (e) => {
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0;
    };
    /* Dentro de algo que rola de lado de propósito (tabela, filtros) não é achado. */
    const rolaDeLado = (e) => {
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
      }
      return false;
    };
    const nome = (e) => {
      const t = (e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || '').trim();
      return `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''} "${t.slice(0, 40).replace(/\s+/g, ' ')}"`;
    };
    for (const e of document.querySelectorAll('body *')) {
      if (!visivel(e)) continue;
      const b = e.getBoundingClientRect();
      if (b.right > vw + 1 && b.left < vw && !rolaDeLado(e) && r.fora.length < 4) r.fora.push(`${nome(e)} até ${Math.round(b.right)}px`);
      const s = getComputedStyle(e);
      if (s.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1 && r.cortado.length < 4) {
        r.cortado.push(nome(e));
      }
    }
    for (const e of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab]')) {
      if (!visivel(e) || e.disabled) continue;
      const b = e.getBoundingClientRect();
      /* A caixinha de marcar dentro do rótulo conta pelo rótulo, que é o alvo. */
      const alvo = (e.type === 'checkbox' || e.type === 'radio') && e.closest('label')
        ? e.closest('label').getBoundingClientRect() : b;
      const menor = Math.min(alvo.width, alvo.height);
      /* O texto que vaza da caixa do próprio botão, sem reticências. O selo
         posto por cima (o número de avisos) é absoluto de propósito e não conta. */
      const temSelo = [...e.querySelectorAll('*')].some(f => ['absolute', 'fixed'].includes(getComputedStyle(f).position));
      if (['BUTTON'].includes(e.tagName) && !temSelo && e.scrollWidth > e.clientWidth + 2
          && getComputedStyle(e).overflowX === 'visible' && r.naoCabe.length < 4) {
        r.naoCabe.push(`${nome(e)} ${e.scrollWidth}>${e.clientWidth}`);
      }
      if (menor < 24) { if (r.pequeno.length < 4) r.pequeno.push(`${nome(e)} ${Math.round(alvo.width)}×${Math.round(alvo.height)}`); }
      else if (menor < 40) r.medio++;
    }
    /* Botões irmãos na mesma linha: encostados (menos de 2px) ou sobrepostos.
       Dentro de quem rola de lado, a régua anda; fora, eles precisam caber. */
    const grupos = new Set([...document.querySelectorAll('button, [role=tab]')].map((b) => b.parentElement));
    for (const g of grupos) {
      if (!g || !visivel(g)) continue;
      const bs = [...g.children].filter((c) => (c.tagName === 'BUTTON' || c.getAttribute('role') === 'tab') && visivel(c))
        .map((c) => ({ c, b: c.getBoundingClientRect() }));
      for (let i = 1; i < bs.length; i++) {
        const a = bs[i - 1].b, b = bs[i].b;
        const mesmaLinha = Math.abs(a.top - b.top) < 4;
        const gs = getComputedStyle(g);
        const contiguo = gs.display.includes('flex') && (parseFloat(gs.columnGap) || 0) === 0
          && (g.classList.contains('filtros') || g.getAttribute('role') === 'tablist' || g.classList.contains('seg'));
        if (mesmaLinha && b.left - a.right < 2 && !contiguo && r.encostados.length < 4) {
          r.encostados.push(`${nome(bs[i - 1].c)} e ${nome(bs[i].c)} (${Math.round(b.left - a.right)}px)`);
        }
        if (mesmaLinha && b.left < a.right - 1 && r.encostados.length < 4) {
          r.encostados.push(`${nome(bs[i - 1].c)} por cima de ${nome(bs[i].c)}`);
        }
      }
    }
    /* O fim da tela não pode morar atrás da barra de baixo. */
    const barra = document.querySelector('nav.tabbar');
    if (barra && getComputedStyle(barra).position === 'fixed') {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const topo = barra.getBoundingClientRect().top;
      const ultimos = [...document.querySelectorAll('main.conteudo button, main.conteudo input, main.conteudo a[href], main.conteudo textarea, main.conteudo select')]
        .filter(visivel);
      const ultimo = ultimos[ultimos.length - 1];
      if (ultimo) {
        const b = ultimo.getBoundingClientRect();
        if (b.bottom > topo + 1 && b.top < vh) r.escondido = `${nome(ultimo)} embaixo da barra (${Math.round(b.bottom - topo)}px)`;
      }
      window.scrollTo(0, 0);
    }
    return r;
  });
}

for (const largura of LARGURAS) {
  const pg = await navegador.newPage({
    viewport: { width: largura, height: largura === 360 ? 780 : 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    /* Em português, como o celular da casa: a data sai dd/mm/aaaa. */
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
  });
  const erros = [];
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.goto(`file://${ARQUIVO}`);
  await pg.waitForTimeout(900);
  await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
  await pg.waitForTimeout(1200);
  const seletor = pg.locator('select.troca-cargo-sel');
  const cargos = await seletor.locator('option').evaluateAll((os) =>
    os.map((o) => ({ valor: o.value, rotulo: o.textContent.trim() })));
  console.log(`\n📱 ${largura} px — ${cargos.length} cargos`);

  const conferir = async (cargo, onde) => {
    erros.length = 0;
    const m = await medir(pg);
    telas++;
    alvosMedios += m.medio;
    const dir = `${SAIDA}/${largura}/${cargo}`;
    mkdirSync(dir, { recursive: true });
    await pg.screenshot({ path: `${dir}/${String(telas).padStart(3, '0')}-${onde.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}.png`, fullPage: true });
    const problemas = [];
    if (m.vaza > 1) problemas.push(`a tela anda ${m.vaza}px para o lado`);
    for (const f of m.fora) problemas.push(`passa da borda: ${f}`);
    for (const c of m.cortado) problemas.push(`texto cortado: ${c}`);
    for (const p of m.naoCabe) problemas.push(`texto não cabe no botão: ${p}`);
    for (const p of m.encostados) problemas.push(`botões encostados: ${p}`);
    for (const p of m.pequeno) problemas.push(`pequeno para o dedo: ${p}`);
    if (m.escondido) problemas.push(`escondido: ${m.escondido}`);
    for (const e of erros) problemas.push(`erro: ${e}`);
    for (const p of problemas) achados.push(`[${largura} · ${cargo} · ${onde}] ${p}`);
    return problemas.length;
  };

  for (const cargo of cargos) {
    await seletor.selectOption(cargo.valor);
    await pg.waitForTimeout(900);
    let n = 0;
    n += await conferir(cargo.valor, 'topo');
    const abas = (await pg.locator('nav.tabbar button').allInnerTexts())
      .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => !/Mais$/i.test(t));
    for (let i = 0; i < abas.length; i++) {
      await pg.locator('nav.tabbar button').nth(i).click();
      await pg.waitForTimeout(700);
      n += await conferir(cargo.valor, abas[i]);
    }
    if (await pg.locator('nav.tabbar button', { hasText: 'Mais' }).count()) {
      await pg.locator('nav.tabbar button', { hasText: 'Mais' }).first().click();
      await pg.waitForTimeout(350);
      n += await conferir(cargo.valor, 'folha Mais');
      const portas = await pg.locator('.overlay .sheet button.card.row b.ff').allInnerTexts();
      await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).click();
      await pg.waitForTimeout(250);
      for (let i = 0; i < portas.length; i++) {
        await pg.locator('nav.tabbar button', { hasText: 'Mais' }).first().click();
        await pg.waitForTimeout(300);
        await pg.locator('.overlay .sheet button.card.row').nth(i).click();
        await pg.waitForTimeout(800);
        n += await conferir(cargo.valor, portas[i].trim());
      }
    }
    console.log(`  ${n ? '✗' : '✓'} ${cargo.rotulo}${n ? ` — ${n} achado(s)` : ''}`);
  }
  await pg.close();
}
await navegador.close();

console.log(`\n${telas} telas conferidas no celular. Fotos em ${SAIDA}.`);
console.log(`Alvos de toque entre 24 e 40 px (informação, não achado): ${alvosMedios}.`);
if (achados.length) {
  console.log(`\n${achados.length} achado(s):`);
  for (const a of achados) console.log(`  · ${a}`);
  process.exit(1);
}
console.log('Nenhum achado: nada anda para o lado, nada passa da borda, nenhum texto cortado ou vazando do botão, nenhum botão encostado, nenhum abaixo de 24 px, nada escondido atrás da barra.');
