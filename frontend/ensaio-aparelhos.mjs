#!/usr/bin/env node
/**
 * OS APARELHOS (fase 222; pedido de 16/10: *"faça os testes"* de voz, ditado e
 * PDF pela câmera, por modelo de celular).
 *
 * O `ensaio:celular` mede a TELA em dois tamanhos. Este mede o que o aparelho
 * faz de diferente, e que só aparece com a mão nele:
 *
 *  * **a câmera do tamanho de cada celular.** O Chromium aceita um vídeo no
 *    lugar da câmera; o ensaio desenha uma receita fictícia e a entrega em
 *    640×480 (aparelho antigo), Full HD deitada, Full HD em pé (o celular na
 *    mão) e 12 MP (a câmera que ignora o tamanho pedido). Em cada aparelho:
 *    digitalizar três páginas, conferir o PDF que sai e as páginas;
 *  * **o reconhecimento de voz como cada navegador se comporta.** O do Safari
 *    do iPhone encerra a escuta a cada frase. O do Chrome do Android, em ditado
 *    contínuo, repete no resultado novo o que já tinha dado como certo. O
 *    microfone falso imita os dois, e o texto no campo tem de sair sem
 *    repetição e sem perder frase;
 *  * **as falhas:** aparelho sem microfone, microfone bloqueado, sem internet,
 *    silêncio e navegador sem reconhecimento de voz;
 *  * **a foto da galeria:** 12 MP com a câmera girada (EXIF), 50 MP de Android
 *    novo, e a foto HEIC do iPhone.
 *
 * O QUE ELE NÃO PROVA, e é dito no fim: o Safari de verdade (aqui só há o
 * Chromium), a voz reconhecida de verdade e o aparelho com pouca memória. Isso
 * se confere com um Android e um iPhone na mão, no servidor com HTTPS.
 *
 * Uso: ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio:aparelhos
 *      ENSAIO_APARELHOS="iPhone SE" mede um aparelho; ENSAIO_APARELHOS=extras, só o resto
 */
import { chromium } from 'playwright-core';
import { createCanvas } from '@napi-rs/canvas';
import { existsSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = process.env.ENSAIO_ARQUIVO ?? resolve(AQUI, '..', 'prototipo', 'rede-acolher-prototipo.html');
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;
if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error('ENSAIO_CHROMIUM não aponta para um executável. Rode `bash scripts/preparar-ambiente.sh`.');
  process.exit(2);
}
const PASTA = '/tmp/ensaio-aparelhos';
mkdirSync(PASTA, { recursive: true });

const achados = [];
let onde = '';
const cobrar = (o, ok, detalhe = '') => {
  console.log(`    ${ok ? '✓' : '✗'} ${o}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
  if (!ok) achados.push(`[${onde}] ${o}${detalhe ? ` — ${detalhe}` : ''}`);
};

const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
};

/* A câmera de cada aparelho: o tamanho do vídeo que ele entrega à página. */
const CAMERAS = {
  antiga: { w: 640, h: 480, nome: '640×480' },
  deitada: { w: 1920, h: 1080, nome: 'Full HD deitada' },
  em_pe: { w: 1080, h: 1920, nome: 'Full HD em pé' },
  mp12: { w: 4032, h: 3024, nome: '12 MP' },
};
const APARELHOS = [
  { nome: 'Celular de 320 px', w: 320, h: 568, dpr: 2, so: 'android', camera: 'antiga' },
  { nome: 'iPhone SE', w: 375, h: 667, dpr: 2, so: 'ios', camera: 'em_pe' },
  { nome: 'Android de entrada', w: 360, h: 800, dpr: 2, so: 'android', camera: 'deitada' },
  { nome: 'iPhone 14', w: 390, h: 844, dpr: 3, so: 'ios', camera: 'mp12' },
  { nome: 'Pixel 7', w: 412, h: 915, dpr: 2.625, so: 'android', camera: 'em_pe' },
  { nome: 'iPhone Pro Max', w: 430, h: 932, dpr: 3, so: 'ios', camera: 'mp12' },
  { nome: 'Celular deitado', w: 844, h: 390, dpr: 3, so: 'ios', camera: 'deitada' },
  { nome: 'Tablet deitado', w: 1280, h: 800, dpr: 1.5, so: 'android', camera: 'deitada' },
];

/* ---------------------------------------------------- o vídeo da câmera falsa
 * Uma receita fictícia sobre a mesa: papel branco, texto escuro, sombra. O
 * formato é o Y4M (4:2:0), que o Chromium lê com `--use-file-for-fake-video-capture`. */
function videoDaCamera(chave) {
  const { w, h } = CAMERAS[chave];
  const caminho = `${PASTA}/camera-${w}x${h}.y4m`;
  if (existsSync(caminho)) return caminho;
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#5b4a3a'; g.fillRect(0, 0, w, h);
  const pw = Math.round(Math.min(w, h * 0.72) * 0.86); const ph = Math.round(pw * 1.41);
  const escala = Math.min(1, (h * 0.92) / ph);
  const W = Math.round(pw * escala); const H = Math.round(ph * escala);
  const x0 = Math.round((w - W) / 2); const y0 = Math.round((h - H) / 2);
  g.fillStyle = '#d8d2c8'; g.fillRect(x0 + 8, y0 + 8, W, H);
  g.fillStyle = '#fbfaf6'; g.fillRect(x0, y0, W, H);
  g.fillStyle = '#1a1a1a';
  const fonte = Math.max(10, Math.round(W / 26));
  g.font = `bold ${fonte * 1.3}px sans-serif`;
  g.fillText('Receita médica (fictícia)', x0 + fonte, y0 + fonte * 2.2);
  g.font = `${fonte}px sans-serif`;
  for (let i = 0, y = y0 + fonte * 4; y < y0 + H - fonte; i++, y += fonte * 1.7) {
    g.fillText(`Linha ${i + 1}: uso conforme orientação, uma vez ao dia.`, x0 + fonte, y);
  }
  const { data } = g.getImageData(0, 0, w, h);
  const Y = Buffer.alloc(w * h); const U = Buffer.alloc((w / 2) * (h / 2)); const V = Buffer.alloc((w / 2) * (h / 2));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      Y[j * w + i] = Math.round(0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]);
    }
  }
  for (let j = 0; j < h / 2; j++) {
    for (let i = 0; i < w / 2; i++) {
      const k = ((j * 2) * w + i * 2) * 4;
      const r = data[k]; const gg = data[k + 1]; const b = data[k + 2];
      U[j * (w / 2) + i] = Math.round(128 - 0.168736 * r - 0.331264 * gg + 0.5 * b);
      V[j * (w / 2) + i] = Math.round(128 + 0.5 * r - 0.418688 * gg - 0.081312 * b);
    }
  }
  const fd = openSync(caminho, 'w');
  writeSync(fd, `YUV4MPEG2 W${w} H${h} F15:1 Ip A1:1 C420jpeg\n`);
  for (let f = 0; f < 2; f++) { writeSync(fd, 'FRAME\n'); writeSync(fd, Y); writeSync(fd, U); writeSync(fd, V); }
  closeSync(fd);
  return caminho;
}

/* ----------------------------------------------------- as fotos da galeria */
/** Um JPEG com o marcador EXIF de orientação (6 = a câmera estava em pé, a foto deitada). */
function jpegComOrientacao(w, h, orientacao, qualidade = 92) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#f4efe6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#222'; g.font = `${Math.round(h / 20)}px sans-serif`;
  for (let y = h / 10; y < h; y += h / 12) g.fillText('Certidão (fictícia) · linha de texto', w / 20, y);
  /* Ruído leve, como a foto de verdade: sem ele o JPEG fica pequeno demais e não se reduz. */
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = (Math.random() - 0.5) * 30;
    img.data[i] += r; img.data[i + 1] += r; img.data[i + 2] += r;
  }
  g.putImageData(img, 0, 0);
  const jpeg = c.toBuffer('image/jpeg', qualidade);
  if (!orientacao) return jpeg;
  /* APP1 Exif com um só campo: 0x0112 Orientation. */
  const tiff = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientacao, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const corpo = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (corpo.length + 2) >> 8, (corpo.length + 2) & 0xff]), corpo]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}
/** Um HEIC fictício: só o cabeçalho que o iPhone grava (ftyp heic). Navegador nenhum fora o Safari o desenha. */
function heicFicticio() {
  const caixa = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    0x00, 0x00, 0x00, 0x00, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63]);
  return Buffer.concat([caixa, Buffer.alloc(2_400_000, 7)]);
}

/* -------------------------------------------------- o reconhecimento de voz
 * O microfone falso, em três jeitos de navegador:
 *  - `chrome`:  ditado contínuo de verdade; cada frase vem como um resultado novo;
 *  - `android`: ditado contínuo com o defeito conhecido do Chrome do Android, em
 *               que o resultado novo repete as frases já dadas como certas;
 *               sem `continuous`, uma frase por escuta, como o Safari;
 *  - `ios`:     o Safari, que ignora o `continuous` e encerra a escuta a cada frase.
 * E as falhas: `sem-microfone`, `bloqueado`, `sem-internet`, `silencio`. */
const MICROFONE = ({ jeito, falha }) => {
  window.__falas = []; window.__inicios = 0;
  localStorage.setItem('rede-acolher.acolhe.aviso-do-microfone', '1');
  if (jeito === 'nenhum') { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; return; }
  const resultado = (t, certo) => Object.assign([{ transcript: t }], { isFinal: certo });
  class Falso {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; this.vivo = false; this.lista = []; }
    start() {
      window.__inicios++;
      this.vivo = true;
      if (falha === 'sem-microfone') { setTimeout(() => { this.onerror?.({ error: 'audio-capture' }); this.onend?.(); }, 5); return; }
      if (falha === 'bloqueado') { setTimeout(() => { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }, 5); return; }
      if (falha === 'sem-internet') { setTimeout(() => { this.onerror?.({ error: 'network' }); this.onend?.(); }, 5); return; }
      if (falha === 'silencio') { setTimeout(() => { if (this.vivo) { this.onerror?.({ error: 'no-speech' }); this.onend?.(); } }, 400); return; }
      const umaPorEscuta = jeito === 'ios' || !this.continuous;
      const falar = () => {
        if (!this.vivo) return;
        const fala = window.__falas.shift();
        /* Sem fala na fila, fica ouvindo em silêncio, como o microfone de verdade. */
        if (!fala) { setTimeout(falar, 100); return; }
        if (this.interimResults) {
          const parcial = fala.slice(0, Math.ceil(fala.length / 2));
          const antes = jeito === 'android' && !umaPorEscuta ? (this.ditas ?? []).join(' ') : '';
          this.onresult?.({ resultIndex: this.lista.length, results: [...this.lista.map((t) => resultado(t, true)), resultado(`${antes} ${parcial}`.trim(), false)] });
        }
        setTimeout(() => {
          if (!this.vivo) return;
          /* O Android contínuo: o certo novo traz junto o que já era certo. */
          this.ditas = [...(this.ditas ?? []), fala];
          const texto = jeito === 'android' && !umaPorEscuta ? this.ditas.join(' ') : fala;
          this.lista.push(texto);
          this.onresult?.({ resultIndex: this.lista.length - 1, results: this.lista.map((t) => resultado(t, true)) });
          if (umaPorEscuta) { this.vivo = false; setTimeout(() => this.onend?.(), 20); } else setTimeout(falar, 60);
        }, 50);
      };
      setTimeout(falar, 40);
    }
    stop() { const estava = this.vivo; this.vivo = false; if (estava) setTimeout(() => this.onend?.(), 10); }
    abort() { this.stop(); }
  }
  window.webkitSpeechRecognition = Falso;
  if (jeito !== 'ios') window.SpeechRecognition = Falso; else delete window.SpeechRecognition;
};

/* --------------------------------------------------------------- a página */
async function abrir(navegador, aparelho, microfone) {
  const ctx = await navegador.newContext({
    viewport: { width: aparelho.w, height: aparelho.h }, deviceScaleFactor: aparelho.dpr,
    isMobile: aparelho.w < 1000, hasTouch: true, userAgent: aparelho.ua ?? UA[aparelho.so],
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', permissions: ['camera', 'microphone'],
  });
  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.addInitScript(MICROFONE, microfone);
  await pg.goto(`file://${ARQUIVO}`);
  await pg.waitForTimeout(800);
  await pg.getByRole('button', { name: 'Marcelo Barbosa', exact: true }).click();
  await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
  await pg.waitForTimeout(1100);
  await pg.locator('select.troca-cargo-sel').selectOption('equipe_tecnica');
  await pg.waitForTimeout(900);
  return { ctx, pg, erros };
}

const esp = (pg, ms) => pg.waitForTimeout(ms);

/** Abre a folha do atendimento técnico da Alice: tem campo de texto longo e anexo com câmera. */
async function folhaDoAtendimento(pg) {
  const porta = pg.getByRole('button', { name: /^Acolhidos/ }).filter({ visible: true });
  if (await porta.count()) await porta.first().click();
  else {
    await pg.locator('nav.tabbar button', { hasText: 'Mais' }).click(); await esp(pg, 300);
    await pg.locator('.overlay .sheet button.card.row', { hasText: 'Acolhidos' }).first().click();
  }
  await esp(pg, 900);
  await pg.locator('.pessoa-cartao').filter({ hasText: 'Alice' }).first().click(); await esp(pg, 1100);
  await pg.getByRole('tab', { name: /Atendimentos/ }).click(); await esp(pg, 700);
  await pg.getByRole('button', { name: 'Registrar atendimento da equipe técnica' }).click(); await esp(pg, 600);
  return pg.locator('.overlay').last();
}

/** O botão cabe na tela, tem tamanho de dedo e nada está por cima dele. */
async function tocavel(pg, loc) {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const dentro = r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
    const meio = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const livre = !!meio && (meio === el || el.contains(meio));
    const por = livre || !meio ? undefined
      : `${meio.tagName.toLowerCase()}.${String(meio.className || '').split(' ').slice(0, 2).join('.')}${meio.textContent ? ` "${meio.textContent.trim().slice(0, 30)}"` : ''}`;
    return { dentro, tamanho: Math.min(r.width, r.height), livre, ...(por ? { por } : {}) };
  });
}

async function ditar(pg, campo, falas) {
  await campo.click(); await esp(pg, 200);
  const mic = pg.getByRole('button', { name: 'Ditar neste campo' });
  if (!(await mic.count())) return { semBotao: true };
  const t = await tocavel(pg, mic);
  await pg.evaluate((f) => { window.__falas.push(...f); }, falas);
  await mic.click();
  await esp(pg, 260 * falas.length + 500);
  const parar = pg.getByRole('button', { name: 'Parar de ditar' });
  if (await parar.count()) { await parar.click(); await esp(pg, 200); }
  return { texto: await campo.inputValue(), toque: t };
}

const FALAS = ['fiz o desenho da casa', 'falou da avó com calma.', 'ficou para o próximo encontro'];
const ESPERADO = 'Fiz o desenho da casa falou da avó com calma. Ficou para o próximo encontro';

async function oAparelho(navegador, a) {
  onde = `${a.nome} · ${CAMERAS[a.camera].nome}`;
  console.log(`\n📱 ${a.nome} (${a.w}×${a.h}, ${a.so === 'ios' ? 'como o Safari do iPhone' : 'como o Chrome do Android'}, câmera ${CAMERAS[a.camera].nome})`);
  const { ctx, pg, erros } = await abrir(navegador, a, { jeito: a.so });
  const folha = await folhaDoAtendimento(pg);

  /* 1. O ditado no relato do atendimento. */
  const campo = folha.locator('#at-relato');
  const d = await ditar(pg, campo, FALAS);
  cobrar('o microfone aparece junto do campo', !d.semBotao);
  if (!d.semBotao) {
    cobrar('o microfone cabe na tela e tem tamanho de dedo, sem nada por cima',
      d.toque.dentro && d.toque.tamanho >= 24 && d.toque.livre, JSON.stringify(d.toque));
    cobrar('as três frases entram no campo, sem repetir e sem perder nenhuma', d.texto === ESPERADO, `"${d.texto}"`);
  }
  await pg.screenshot({ path: `${PASTA}/${a.nome.replace(/\W+/g, '-')}-ditado.png` });

  /* 2. A câmera do sistema, no modo documento, três páginas. */
  const digitalizar = folha.getByRole('button', { name: 'Digitalizar documento' });
  cobrar('o anexo oferece digitalizar documento', (await digitalizar.count()) === 1);
  if (await digitalizar.count()) {
    await digitalizar.click(); await esp(pg, 1800);
    const cam = pg.locator('.camera');
    const largura = await pg.evaluate(() => document.querySelector('.camera-video')?.videoWidth ?? 0);
    const altura = await pg.evaluate(() => document.querySelector('.camera-video')?.videoHeight ?? 0);
    /* O navegador pode reduzir o vídeo (o sistema pede 1920 de largura), mas não
       pode CORTAR: a proporção é a da câmera, ou a folha perde o alto e o pé. */
    const prop = CAMERAS[a.camera].w / CAMERAS[a.camera].h;
    cobrar(`a câmera entrega a imagem inteira, na proporção dela (${CAMERAS[a.camera].nome})`,
      largura > 0 && Math.abs(largura / altura - prop) < 0.01, `${largura}×${altura}`);
    for (const nome of ['Fechar a câmera', 'Fotografar a página 1']) {
      const t = await tocavel(pg, cam.getByRole('button', { name: nome }));
      cobrar(`"${nome}" cabe na tela, com tamanho de dedo e livre`, t.dentro && t.tamanho >= 24 && t.livre, JSON.stringify(t));
    }
    let tempos = [];
    for (const n of [1, 2, 3]) {
      const t0 = Date.now();
      await cam.getByRole('button', { name: `Fotografar a página ${n}` }).click();
      await cam.getByRole('button', { name: 'Guardar esta página' }).waitFor({ timeout: 8000 }).catch(() => undefined);
      tempos.push(Date.now() - t0);
      if (n === 1) {
        const t = await tocavel(pg, cam.getByRole('button', { name: 'Guardar esta página' }));
        cobrar('"Guardar esta página" cabe na tela, com tamanho de dedo e livre', t.dentro && t.tamanho >= 24 && t.livre, JSON.stringify(t));
        await pg.screenshot({ path: `${PASTA}/${a.nome.replace(/\W+/g, '-')}-camera.png` });
      }
      await cam.getByRole('button', { name: 'Guardar esta página' }).click();
      await esp(pg, 1300);
    }
    cobrar('cada página fica pronta para conferir em menos de 3 s', tempos.every((t) => t < 3000), tempos.join(' ms, ') + ' ms');
    const concluir = cam.getByRole('button', { name: /^Concluir \(3 páginas\)$/ });
    const tc = (await concluir.count()) ? await tocavel(pg, concluir) : null;
    cobrar('"Concluir (3 páginas)" cabe na tela, com tamanho de dedo e livre',
      !!tc && tc.dentro && tc.tamanho >= 24 && tc.livre, JSON.stringify(tc));
    if (await concluir.count()) await concluir.click();
    await esp(pg, 1200);
    const previa = folha.locator('.previa');
    const texto = (await previa.innerText().catch(() => '')) || '';
    const paginas = await previa.locator('.previa-paginas img').evaluateAll((imgs) =>
      imgs.map((i) => ({ w: i.naturalWidth, h: i.naturalHeight })));
    const tamanho = /· ([\d.,]+) (KB|MB) · PDF com 3 páginas/.exec(texto);
    const kb = tamanho ? Number(tamanho[1].replace(',', '.')) * (tamanho[2] === 'MB' ? 1024 : 1) : NaN;
    cobrar('sai UM PDF com as três páginas, e a prévia mostra as três', paginas.length === 3 && /PDF com 3 páginas/.test(texto), texto.slice(0, 120));
    cobrar('cada página do PDF tem no máximo 1800 px no lado maior, sem corte',
      paginas.length === 3 && paginas.every((p) => Math.max(p.w, p.h) <= 1800 && Math.abs(p.w / p.h - CAMERAS[a.camera].w / CAMERAS[a.camera].h) < 0.01),
      JSON.stringify(paginas));
    cobrar('a página sai na mesma posição da câmera (em pé ou deitada)',
      paginas.every((p) => (p.h > p.w) === (CAMERAS[a.camera].h > CAMERAS[a.camera].w)), JSON.stringify(paginas[0]));
    cobrar('o PDF de três páginas fica abaixo de 3 MB', kb < 3 * 1024, `${tamanho?.[0] ?? texto.slice(0, 80)}`);
    console.log(`      PDF: ${tamanho ? `${tamanho[1]} ${tamanho[2]}` : '?'} · páginas ${paginas.map((p) => `${p.w}×${p.h}`).join(', ')}`);
  }

  /* 3. A foto da galeria: 12 MP girada pelo EXIF. */
  /* Os botões da prévia têm de se alcançar com o dedo, acima da barra fixa do pé da folha. */
  for (const nome of ['Pôr no atendimento', 'Digitalizar de novo', 'Descartar']) {
    const b = folha.getByRole('button', { name: nome, exact: true });
    if (!(await b.count())) { cobrar(`"${nome}" aparece na prévia`, false); continue; }
    await b.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => undefined); await esp(pg, 250);
    const t = await tocavel(pg, b);
    cobrar(`"${nome}" se alcança, rolando a folha, sem a barra do pé por cima`, t.dentro && t.tamanho >= 24 && t.livre, JSON.stringify(t));
  }
  const descartar = folha.getByRole('button', { name: 'Descartar', exact: true });
  if (await descartar.count()) { await descartar.first().click({ force: true }).catch(() => undefined); await esp(pg, 300); }
  const campoArquivo = folha.locator('#at-arq-arquivo');
  if (!(await campoArquivo.count())) {
    await pg.screenshot({ path: `${PASTA}/${a.nome.replace(/\W+/g, '-')}-sem-anexo.png`, fullPage: true });
    cobrar('depois de descartar o documento, o anexo volta a oferecer a galeria e o arquivo', false,
      ((await folha.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(-300));
    await ctx.close();
    return;
  }
  await campoArquivo.setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: FOTO_12MP_GIRADA });
  await esp(pg, 2500);
  const previaFoto = folha.locator('.previa');
  const info = await previaFoto.locator('img.previa-img').evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight })).catch(() => null);
  const tf = (await previaFoto.innerText().catch(() => '')) || '';
  cobrar('a foto de 12 MP sai reduzida, com o tamanho de antes dito na prévia', /reduzida de [\d.,]+ MB/.test(tf), tf.slice(0, 140));
  cobrar('a foto tirada em pé aparece em pé (o EXIF da câmera é respeitado)', !!info && info.h > info.w && Math.max(info.w, info.h) <= 2000, JSON.stringify(info));

  cobrar('nenhuma exceção na página', erros.length === 0, erros[0]);
  await ctx.close();
}

/* ------------------------------------------------------------- as falhas */
async function asFalhas(navegador) {
  const a = APARELHOS.find((x) => x.nome === 'Android de entrada');
  console.log('\n⚠️  As falhas do microfone, num Android de entrada');
  const casos = [
    { falha: 'sem-microfone', nome: 'aparelho sem microfone', frase: /microfone/i, maxInicios: 3 },
    { falha: 'bloqueado', nome: 'microfone bloqueado', frase: /bloqueado.*cadeado/i, maxInicios: 1 },
    { falha: 'sem-internet', nome: 'sem internet', frase: /Sem internet/i, maxInicios: 1 },
  ];
  for (const caso of casos) {
    onde = `falha · ${caso.nome}`;
    const { ctx, pg, erros } = await abrir(navegador, a, { jeito: 'android', falha: caso.falha });
    const folha = await folhaDoAtendimento(pg);
    const campo = folha.locator('#at-relato');
    await campo.click(); await esp(pg, 200);
    await pg.getByRole('button', { name: 'Ditar neste campo' }).click();
    await esp(pg, 2500);
    const inicios = await pg.evaluate(() => window.__inicios);
    const fala = (await pg.locator('.ditado-fala').innerText().catch(() => '')) || '';
    const ainda = await pg.getByRole('button', { name: 'Parar de ditar' }).count();
    console.log(`  ${caso.nome}: ${inicios} tentativa(s) em 2,5 s · "${fala}"`);
    cobrar('o microfone desiste, e não fica tentando sem parar', inicios <= caso.maxInicios && ainda === 0, `${inicios} tentativas, ainda ouvindo: ${ainda > 0}`);
    cobrar('a frase diz o que aconteceu', caso.frase.test(fala), `"${fala}"`);
    await campo.fill('escrevi à mão');
    cobrar('escrever no campo continua funcionando', (await campo.inputValue()) === 'escrevi à mão');
    cobrar('nenhuma exceção', erros.length === 0, erros[0]);
    await ctx.close();
  }

  onde = 'Android no modo computador';
  {
    /* O Chrome do Android com "versão para computador" esconde que é celular: o
       ditado fica contínuo, e só o aparo do repetido protege o texto. */
    const desk = { ...a, ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' };
    const { ctx, pg, erros } = await abrir(navegador, desk, { jeito: 'android' });
    const folha = await folhaDoAtendimento(pg);
    const d = await ditar(pg, folha.locator('#at-relato'), FALAS);
    console.log(`  modo computador: "${d.texto}"`);
    cobrar('no modo computador as três frases também entram sem repetir', d.texto === ESPERADO, `"${d.texto}"`);
    cobrar('nenhuma exceção', erros.length === 0, erros[0]);
    await ctx.close();
  }

  onde = 'falha · silêncio';
  {
    const { ctx, pg } = await abrir(navegador, a, { jeito: 'android', falha: 'silencio' });
    const folha = await folhaDoAtendimento(pg);
    await folha.locator('#at-relato').click(); await esp(pg, 200);
    await pg.getByRole('button', { name: 'Ditar neste campo' }).click();
    await esp(pg, 2000);
    const ainda = await pg.getByRole('button', { name: 'Parar de ditar' }).count();
    const fala = (await pg.locator('.ditado-fala').innerText().catch(() => '')) || '';
    console.log(`  silêncio: ${await pg.evaluate(() => window.__inicios)} escuta(s) em 2 s · "${fala}"`);
    cobrar('no silêncio o microfone continua ouvindo, sem frase de erro', ainda === 1 && !/bloquead|internet|microfone/i.test(fala), `"${fala}"`);
    if (ainda) await pg.getByRole('button', { name: 'Parar de ditar' }).click();
    await esp(pg, 300);
    cobrar('o Parar para de verdade', (await pg.getByRole('button', { name: 'Parar de ditar' }).count()) === 0);
    await ctx.close();
  }

  onde = 'falha · navegador sem reconhecimento de voz';
  {
    const { ctx, pg, erros } = await abrir(navegador, a, { jeito: 'nenhum' });
    const folha = await folhaDoAtendimento(pg);
    await folha.locator('#at-relato').click(); await esp(pg, 300);
    cobrar('sem reconhecimento no navegador, o microfone nem aparece', (await pg.getByRole('button', { name: 'Ditar neste campo' }).count()) === 0);
    await pg.keyboard.press('Escape');
    cobrar('nenhuma exceção', erros.length === 0, erros[0]);
    await ctx.close();
  }
}

/* ---------------------------------------------- a voz da Acolhe+AI, por SO */
async function aVozDaAcolhe(navegador) {
  console.log('\n🎙️  A Acolhe+AI pela voz, como o Safari e como o Chrome do Android');
  for (const a of [APARELHOS.find((x) => x.nome === 'iPhone 14'), APARELHOS.find((x) => x.nome === 'Android de entrada')]) {
    onde = `Acolhe+AI pela voz · ${a.nome}`;
    const { ctx, pg, erros } = await abrir(navegador, a, { jeito: a.so });
    const abrirA = pg.getByRole('button', { name: /^Abrir a Acolhe\+AI/ });
    if (await abrirA.isVisible().catch(() => false)) { await abrirA.click(); await esp(pg, 400); }
    const painel = pg.locator('.acolhe-painel');
    const mic = painel.getByRole('button', { name: 'Falar pelo microfone' });
    const t = await tocavel(pg, mic);
    cobrar('o microfone da Acolhe+AI cabe na tela, com tamanho de dedo e livre', t.dentro && t.tamanho >= 24 && t.livre, JSON.stringify(t));
    await pg.evaluate(() => { window.__falas.push('abre a chamada'); });
    await mic.click(); await esp(pg, 900);
    const parar = painel.getByRole('button', { name: 'Parar de ouvir' });
    if (await parar.count()) { await parar.click(); await esp(pg, 200); }
    const ouvido = await pg.locator('#acolhe-pergunta').inputValue();
    cobrar('o que foi dito chega inteiro à caixa da Acolhe+AI, sem repetir', /^abre a chamada$/i.test(ouvido.trim()), `"${ouvido}"`);
    await painel.getByRole('button', { name: 'Enviar' }).click(); await esp(pg, 1500);
    cobrar('a Acolhe+AI abre a Chamada', (await pg.locator('main.conteudo').getAttribute('data-tela')) === 'chamada',
      await pg.locator('main.conteudo').getAttribute('data-tela'));
    cobrar('nenhuma exceção', erros.length === 0, erros[0]);
    await ctx.close();
  }
}

/* -------------------------------------- todo formulário de folha, no fim
 * O defeito que este ensaio achou valia para TODA folha no celular: o rodapé
 * subia 68 px e cobria o fim do formulário. A varredura abre cada formulário de
 * criação marcado (`data-acolhe-abre`) das telas do cargo, rola a folha até o
 * fim e confere que o último campo ou botão antes do rodapé se toca. */
async function asFolhas(navegador) {
  const a = APARELHOS.find((x) => x.nome === 'iPhone SE');
  console.log('\n📋 Todo formulário de folha, rolado até o fim, num iPhone SE');
  for (const cargo of ['educador', 'equipe_tecnica', 'coordenador', 'enfermagem']) {
    onde = `folhas · ${cargo}`;
    const { ctx, pg, erros } = await abrir(navegador, a, { jeito: 'ios' });
    await pg.locator('select.troca-cargo-sel').selectOption(cargo); await esp(pg, 900);
    const telas = (await pg.locator('nav.tabbar button').allInnerTexts()).map((t) => t.trim()).filter((t) => t && t !== 'Mais');
    /* As telas do "Mais", lidas da folha dele. */
    const mais = pg.locator('nav.tabbar button', { hasText: 'Mais' });
    let doMais = [];
    if (await mais.count()) {
      await mais.click(); await esp(pg, 400);
      doMais = (await pg.locator('.overlay .sheet button.card.row').allInnerTexts()).map((t) => t.split('\n')[0].trim()).filter(Boolean);
      await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).click().catch(() => undefined); await esp(pg, 300);
    }
    let vistas = 0; const cobertas = [];
    for (const [tela, viaMais] of [...telas.map((t) => [t, false]), ...doMais.map((t) => [t, true])]) {
      if (viaMais) {
        await mais.click(); await esp(pg, 400);
        await pg.locator('.overlay .sheet button.card.row', { hasText: tela }).first().click().catch(() => undefined);
      } else await pg.locator('nav.tabbar button', { hasText: tela }).first().click();
      await esp(pg, 900);
      const n = await pg.locator('main.conteudo [data-acolhe-abre]').count();
      for (let i = 0; i < n; i++) {
        const b = pg.locator('main.conteudo [data-acolhe-abre]').nth(i);
        if (!(await b.isVisible().catch(() => false))) continue;
        const nome = (await b.innerText()).trim().slice(0, 50);
        await b.click().catch(() => undefined); await esp(pg, 500);
        const r = await pg.evaluate(() => {
          const sh = [...document.querySelectorAll('.overlay .sheet')].pop();
          if (!sh || !sh.querySelector('.rodape')) return null;
          sh.scrollTop = sh.scrollHeight;
          const rod = sh.querySelector('.rodape');
          const campos = [...sh.querySelectorAll('button, input:not([type=file]):not(.so-leitor), textarea, select')]
            .filter((el) => !rod.contains(el) && el.offsetParent !== null && !el.closest('.so-leitor'));
          const ult = campos.pop();
          if (!ult) return null;
          const q = ult.getBoundingClientRect();
          const meio = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
          return { livre: !!meio && (meio === ult || ult.contains(meio)), ultimo: (ult.getAttribute('aria-label') || ult.textContent || ult.id || ult.tagName).trim().slice(0, 40) };
        });
        if (r) { vistas++; if (!r.livre) cobertas.push(`${tela} › ${nome} (${r.ultimo})`); }
        for (let k = 0; k < 3 && await pg.locator('.overlay').count(); k++) {
          const f = pg.locator('.overlay .rodape button, .overlay button').filter({ hasText: /^(Cancelar|Fechar|Agora não)$/ });
          if (await f.count()) await f.last().click().catch(() => undefined); else await pg.keyboard.press('Escape');
          await esp(pg, 250);
        }
      }
    }
    console.log(`  ${cargo}: ${vistas} formulário(s) rolados até o fim`);
    cobrar('o fim de cada formulário se toca, sem o rodapé por cima', vistas > 0 && cobertas.length === 0,
      cobertas.slice(0, 4).join('; ') || `${vistas} vistos`);
    cobrar('nenhuma exceção', erros.length === 0, erros[0]);
    await ctx.close();
  }
}

/* ------------------------------------------------- a galeria, os extremos */
async function aGaleria(navegador) {
  const a = APARELHOS.find((x) => x.nome === 'Pixel 7');
  console.log('\n🖼️  A galeria: 50 MP de Android novo e a foto HEIC do iPhone');
  onde = 'galeria · 50 MP';
  {
    const { ctx, pg, erros } = await abrir(navegador, a, { jeito: 'android' });
    const folha = await folhaDoAtendimento(pg);
    const t0 = Date.now();
    await folha.locator('#at-arq-arquivo').setInputFiles({ name: 'PXL_20261016.jpg', mimeType: 'image/jpeg', buffer: FOTO_50MP });
    await folha.locator('.previa').waitFor({ timeout: 20000 }).catch(() => undefined);
    const ms = Date.now() - t0;
    const tf = (await folha.locator('.previa').innerText().catch(() => '')) || '';
    const dim = await folha.locator('.previa img.previa-img').evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight })).catch(() => null);
    console.log(`  50 MP: ${(FOTO_50MP.length / 1048576).toFixed(1)} MB lida e reduzida em ${ms} ms · ${JSON.stringify(dim)}`);
    cobrar('a foto de 50 MP sai reduzida a no máximo 2000 px', !!dim && Math.max(dim.w, dim.h) <= 2000 && /reduzida de/.test(tf), tf.slice(0, 120));
    cobrar('nenhuma exceção', erros.length === 0, erros[0]);
    await ctx.close();
  }
  onde = 'galeria · HEIC do iPhone';
  {
    const { ctx, pg, erros } = await abrir(navegador, APARELHOS.find((x) => x.nome === 'iPhone 14'), { jeito: 'ios' });
    const folha = await folhaDoAtendimento(pg);
    await folha.locator('#at-arq-arquivo').setInputFiles({ name: 'IMG_4512.HEIC', mimeType: 'image/heic', buffer: heicFicticio() });
    await esp(pg, 1500);
    const tudo = (await folha.innerText()) || '';
    const previa = (await folha.locator('.previa').innerText().catch(() => '')) || '';
    const erro = (await folha.locator('[role=alert]').allInnerTexts()).join(' ');
    console.log(`  HEIC: prévia "${previa.slice(0, 120)}" · aviso "${erro.slice(0, 160)}"`);
    cobrar('a foto HEIC não quebra a tela: ou entra com a prévia dita, ou a recusa diz o que fazer',
      (previa.length > 0 && !/undefined|NaN/.test(previa)) || /HEIC|JPG|JPEG|foto/i.test(erro), (previa || erro || tudo).slice(0, 160));
    cobrar('nenhuma exceção', erros.length === 0, erros[0]);
    await ctx.close();
  }
}

/* ------------------------------------------------------------- a rodada */
console.log('Preparando as câmeras e as fotos (uma vez só)…');
const FOTO_12MP_GIRADA = jpegComOrientacao(4032, 3024, 6);
const FOTO_50MP = jpegComOrientacao(8160, 6144, 0, 90);
for (const k of Object.keys(CAMERAS)) videoDaCamera(k);

const porCamera = new Map();
for (const a of APARELHOS) porCamera.set(a.camera, [...(porCamera.get(a.camera) ?? []), a]);
const lancar = (camera) => chromium.launch({
  executablePath: EXECUTAVEL,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${videoDaCamera(camera)}`],
});

const filtro = process.env.ENSAIO_APARELHOS;
for (const [camera, lista] of porCamera) {
  const nav = await lancar(camera);
  for (const a of lista) {
    if (filtro && !a.nome.toLowerCase().includes(filtro.toLowerCase())) continue;
    try { await oAparelho(nav, a); } catch (e) { onde = a.nome; cobrar('o percurso do aparelho chegou ao fim', false, String(e?.message ?? e).split('\n')[0]); }
  }
  await nav.close();
}
/* `ENSAIO_APARELHOS=extras` roda só as falhas, a voz, as folhas e a galeria. */
if (!filtro || filtro === 'extras') {
  const nav = await lancar('deitada');
  for (const f of [asFalhas, aVozDaAcolhe, asFolhas, aGaleria]) {
    try { await f(nav); } catch (e) { cobrar(`${f.name} chegou ao fim`, false, String(e?.message ?? e).split('\n')[0]); }
  }
  await nav.close();
}

console.log(`\nFotos em ${PASTA}.`);
console.log('NÃO provado daqui: o Safari de verdade, a voz reconhecida de verdade e o aparelho com pouca memória.');
if (achados.length) {
  console.log(`\n${achados.length} achado(s):`);
  for (const a of achados) console.log(`  · ${a}`);
  process.exit(1);
}
console.log('\nNenhum achado nos aparelhos simulados.');
