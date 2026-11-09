/**
 * OS CABEÇALHOS DA TELA, MEDIDOS (fase 295; o M3 da análise geral de 08/11).
 *
 * A API manda os cabeçalhos de segurança dela; a tela é arquivo servido pelo Caddy, e
 * só ele pode mandar os dela (`scripts/servidor/Caddyfile`, o bloco
 * `cabecalhos_da_tela`). Uma regra de CSP escrita de cabeça quebra o que ninguém
 * abriu: a leitura do papel roda o wasm num trabalhador nascido de um `blob:`, a foto
 * e a prévia são `data:` e `blob:`, e a câmera e o microfone pedem licença.
 *
 * Este ensaio:
 *  1. lê os cabeçalhos DO PRÓPRIO Caddyfile (o que se mede é o que vai ao ar);
 *  2. serve a tela construída com eles e repassa `/api` ao servidor de verdade;
 *  3. confere que cada cabeçalho chega;
 *  4. entra com uma conta de cada cargo, abre cada aba e cada porta, e anota toda
 *     recusa da CSP (o evento `securitypolicyviolation` e o console);
 *  5. abre a câmera e lê o texto de um papel no aparelho, no dossiê, os dois
 *     caminhos que a CSP mais pode quebrar (o dossiê ganha um bilhete fictício).
 *
 * Precisa do servidor no ar (`npm run dev -w backend`, banco com a semente) e da tela
 * construída (`npm run build -w frontend`, ou `ENSAIO_DIST=pasta`).
 *
 *   node ensaio-cabecalhos.mjs
 *   ENSAIO_API=http://127.0.0.1:3000  ENSAIO_DIST=dist  ENSAIO_PORTA=4174
 *   ENSAIO_SO_PAPEL=1  só a câmera e a leitura do papel, sem percorrer as telas
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CADDYFILE = resolve(AQUI, '../scripts/servidor/Caddyfile');
const DIST = resolve(AQUI, process.env.ENSAIO_DIST ?? 'dist');
const API = new URL(process.env.ENSAIO_API ?? 'http://127.0.0.1:3000');
const PORTA = Number(process.env.ENSAIO_PORTA ?? 4174);
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM || undefined;
const SENHA = process.env.ENSAIO_SENHA ?? 'senha-dev-123';
const CONTAS = [
  ['Educador', 'educador.ai3@paodospobres.dev'],
  ['Equipe técnica', 'tecnica.ai3@paodospobres.dev'],
  ['Coordenação', 'coord.ai3@paodospobres.dev'],
  ['Líder', 'lider.ai3@paodospobres.dev'],
  ['Líder noturno', 'lider.noturno@paodospobres.dev'],
  ['Enfermagem', 'enfermagem@paodospobres.dev'],
  ['Cozinha', 'cozinha.ai3@paodospobres.dev'],
  ['Gestor Geral', 'gestor@paodospobres.dev'],
];

/* 1. Os cabeçalhos, lidos do bloco `(cabecalhos_da_tela)` do Caddyfile. */
const caddy = readFileSync(CADDYFILE, 'utf8');
const bloco = /\(cabecalhos_da_tela\)\s*\{\s*header\s*\{([\s\S]*?)\n\t\}/.exec(caddy)?.[1];
if (!bloco) { console.error('O Caddyfile não tem o bloco (cabecalhos_da_tela).'); process.exit(1); }
const CABECALHOS = Object.fromEntries([...bloco.matchAll(/^\s*([A-Za-z-]+)\s+"([^"]*)"/gm)].map((m) => [m[1], m[2]]));
if (!/import cabecalhos_da_tela/.test(caddy)) { console.error('O bloco existe e ninguém o importa.'); process.exit(1); }
if (!existsSync(join(DIST, 'index.html'))) { console.error(`Sem a tela construída em ${DIST}.`); process.exit(1); }

/* 2. A tela servida como o Caddy serve: arquivo, ou o index.html; a API repassada. */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.json': 'application/json', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.ico': 'image/x-icon' };
const servidor = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const ida = http.request({ host: API.hostname, port: API.port, path: req.url, method: req.method,
      headers: { ...req.headers, host: API.host } }, (volta) => {
      res.writeHead(volta.statusCode ?? 502, volta.headers);
      volta.pipe(res);
    });
    ida.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(ida);
    return;
  }
  let arq = join(DIST, decodeURIComponent(u.pathname));
  if (!arq.startsWith(DIST) || !existsSync(arq) || statSync(arq).isDirectory()) arq = join(DIST, 'index.html');
  res.writeHead(200, { ...CABECALHOS, 'Content-Type': TIPOS[extname(arq)] ?? 'application/octet-stream' });
  res.end(readFileSync(arq));
});
await new Promise((ok) => servidor.listen(PORTA, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${PORTA}`;

const achados = [];
const anota = (quem, onde, o) => achados.push(`${quem} · ${onde}: ${o}`);
let cobrancas = 0;
const cobrar = (nome, ok, extra = '') => {
  cobrancas++;
  if (!ok) achados.push(`REPROVOU · ${nome}${extra ? ` (${String(extra).slice(0, 200)})` : ''}`);
  console.log(`${ok ? '✓' : '✗'} ${nome}`);
};

/* 3. Cada cabeçalho chega. */
const r = await fetch(`${BASE}/`);
for (const [nome, valor] of Object.entries(CABECALHOS)) {
  cobrar(`a tela chega com ${nome}`, r.headers.get(nome) === valor, r.headers.get(nome));
}
cobrar('a CSP não deixa a tela dentro de outra página', /frame-ancestors 'none'/.test(CABECALHOS['Content-Security-Policy'] ?? ''));
cobrar('a CSP não aceita script de outro endereço nem embutido',
  !/script-src[^;]*('unsafe-inline'|https?:|\*)/.test(CABECALHOS['Content-Security-Policy'] ?? ''));
cobrar('ninguém pede a localização', /geolocation=\(\)/.test(CABECALHOS['Permissions-Policy'] ?? ''));

const navegador = await chromium.launch({ executablePath: EXECUTAVEL,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

async function abrir(quem) {
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['camera', 'microphone'] });
  const pg = await ctx.newPage();
  const estado = { onde: 'entrada' };
  await pg.addInitScript(() => {
    window.__recusas = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__recusas.push(`${e.violatedDirective} recusou ${e.blockedURI || '(embutido)'}`);
    });
  });
  pg.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) anota(quem, estado.onde, `console: ${m.text().slice(0, 220)}`);
  });
  pg.on('pageerror', (e) => anota(quem, estado.onde, `exceção: ${e.message.slice(0, 200)}`));
  pg.on('worker', (w) => w.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) anota(quem, estado.onde, `trabalhador: ${m.text().slice(0, 220)}`);
  }));
  return { ctx, pg, estado };
}
const recolher = async (pg, quem, estado) => {
  const rs = await pg.evaluate(() => window.__recusas.splice(0)).catch(() => []);
  for (const x of rs) anota(quem, estado.onde, x);
};
async function entrar(pg, email) {
  await pg.goto(BASE);
  await pg.waitForTimeout(1200);
  await pg.fill('#email', email);
  await pg.fill('#senha', SENHA);
  await pg.getByRole('button', { name: /Entrar no sistema/ }).click();
  await pg.waitForTimeout(2200);
  return (await pg.locator('main.conteudo').count()) > 0;
}

/* 4. Cada cargo, cada aba, cada porta. */
let telas = 0;
for (const [quem, email] of process.env.ENSAIO_SO_PAPEL ? [] : CONTAS) {
  const { ctx, pg, estado } = await abrir(quem);
  if (!(await entrar(pg, email))) { anota(quem, 'entrada', 'não chegou à tela inicial'); await ctx.close(); continue; }
  await recolher(pg, quem, estado);
  const portas = pg.locator('nav.portas-lateral button');
  const n = await portas.count();
  for (let i = 0; i < n; i++) {
    estado.onde = (await portas.nth(i).innerText().catch(() => `porta ${i}`)).replace(/\s+/g, ' ').trim();
    await pg.keyboard.press('Escape');
    await portas.nth(i).click({ timeout: 8000 }).catch(() => undefined);
    await pg.waitForTimeout(900);
    const abas = pg.locator('main.conteudo [role="tab"]');
    const k = Math.min(await abas.count(), 8);
    for (let j = 0; j < k; j++) { await abas.nth(j).click({ timeout: 3000 }).catch(() => undefined); await pg.waitForTimeout(400); }
    await recolher(pg, quem, estado);
    telas++;
  }
  await ctx.close();
}
if (!process.env.ENSAIO_SO_PAPEL) cobrar(`as telas de cada cargo abrem sem recusa da CSP (${telas} telas)`, telas > 40 && !achados.some((a) => !a.startsWith('REPROVOU')));

/* 5. A leitura do papel e a câmera, como técnica, no dossiê da primeira criança.
   (A linha da ATA só existe com a ATA do turno aberta; o dossiê está sempre.) */
{
  const quem = 'Equipe técnica';
  const { ctx, pg, estado } = await abrir(quem);
  await entrar(pg, 'tecnica.ai3@paodospobres.dev');
  const bilhete = Buffer.from(await pg.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 300;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1200, 300);
    g.fillStyle = '#111'; g.font = '48px Arial';
    g.fillText('Escola Municipal Primavera', 60, 120);
    g.fillText('Reunião de pais na sexta-feira.', 60, 220);
    return c.toDataURL('image/png').split(',')[1];
  }), 'base64');
  estado.onde = 'dossiê';
  await pg.getByRole('button', { name: /^Acolhidos/ }).filter({ visible: true }).first().click();
  await pg.waitForTimeout(1500);
  await pg.locator('.pessoa-cartao').first().click(); await pg.waitForTimeout(1500);
  await pg.getByRole('tab', { name: /Documentos/ }).click(); await pg.waitForTimeout(900);
  await pg.getByRole('button', { name: /Dossiê: documentos e vivências/ }).click(); await pg.waitForTimeout(1500);
  await pg.locator('main.conteudo button', { hasText: 'Anexar' }).first().click(); await pg.waitForTimeout(700);
  estado.onde = 'câmera';
  const camera = pg.locator('.overlay').getByRole('button', { name: /Abrir a câmera|Tirar uma foto|Tirar foto agora/ }).first();
  if (await camera.count()) {
    await camera.click().catch(() => undefined);
    await pg.waitForTimeout(3000);
    const videoAndando = await pg.evaluate(() => [...document.querySelectorAll('video')]
      .some((v) => v.readyState >= 2 && v.videoWidth > 0));
    cobrar('a câmera liga com a CSP e a Permissions-Policy da tela', videoAndando);
    await recolher(pg, quem, estado);
    /* A foto tirada vira prévia em `data:`; depois a câmera se fecha. */
    await pg.getByRole('button', { name: 'Fotografar' }).click().catch(() => undefined);
    await pg.waitForTimeout(900);
    cobrar('a foto tirada aparece na prévia', await pg.getByRole('button', { name: 'Usar esta foto' }).count() === 1);
    await recolher(pg, quem, estado);
    await pg.getByRole('button', { name: 'Fechar a câmera' }).click().catch(() => undefined);
    await pg.waitForTimeout(600);
  } else {
    cobrar('o Anexar do dossiê oferece a câmera', false);
  }
  estado.onde = 'leitura do papel';
  if (!(await pg.locator('#anx-arq-arquivo').count())) {
    await pg.locator('main.conteudo button', { hasText: 'Anexar' }).first().click().catch(() => undefined);
    await pg.waitForTimeout(700);
  }
  await pg.locator('#anx-arq-arquivo').setInputFiles({ name: 'bilhete-295.png', mimeType: 'image/png', buffer: bilhete });
  await pg.waitForTimeout(900);
  await pg.locator('#anx-tit').fill('Bilhete da escola (ensaio dos cabeçalhos)');
  await pg.locator('.overlay .rodape button').last().click(); await pg.waitForTimeout(1800);
  await recolher(pg, quem, estado);
  const botaoDoDoc = pg.getByRole('button', { name: /Conferir agora|Abrir/ });
  await pg.locator('main.conteudo div').filter({ hasText: 'bilhete-295.png', has: botaoDoDoc })
    .last().locator(botaoDoDoc).first().click().catch(() => undefined);
  await pg.waitForTimeout(1500);
  await pg.getByRole('button', { name: 'Ler o texto do papel' }).click().catch(() => undefined);
  await pg.locator('#ler-texto-caixa').waitFor({ timeout: 120000 }).catch(() => undefined);
  const lido = await pg.locator('#ler-texto-caixa').inputValue().catch(() => '');
  cobrar('a leitura do papel funciona com a CSP da tela', /Primavera/.test(lido), lido || 'nada lido');
  await recolher(pg, quem, estado);
  estado.onde = 'aviso no celular';
  const sw = await pg.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration?.()));
  cobrar('o trabalhador da tela (o aviso e a casca) se registra', sw);
  await recolher(pg, quem, estado);
  await ctx.close();
}

await navegador.close();
servidor.close();
const sobra = achados.filter((a) => !a.startsWith('REPROVOU'));
for (const a of achados) console.log(`  · ${a}`);
console.log(`\n${cobrancas} cobranças, ${achados.filter((a) => a.startsWith('REPROVOU')).length} reprovadas, ${sobra.length} recusas anotadas.`);
process.exit(achados.length ? 1 : 0);
