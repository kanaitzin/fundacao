#!/usr/bin/env node
/**
 * ENSAIO DE NAVEGADOR — o protótipo aberto, cargo a cargo, tela a tela.
 *
 * Por que ele existe: `tsc --noEmit` diz que o código COMPILA; ele não diz que
 * a tela RENDERIZA. Já aconteceu duas vezes de uma tela ficar em branco no
 * lugar certo sem que nada acusasse erro — o perfil desenhando um campo que
 * ninguém conseguia escrever, e a aba de relatórios caindo inteira num
 * `.map()` de campo que o servidor não devolvia. Nenhum dos dois dava erro na
 * cara de ninguém.
 *
 * O que este ensaio cobra, para cada tela que cada cargo alcança:
 *   1. nenhum erro de página (exceção não tratada dentro do React);
 *   2. nenhum erro de console — menos os de REDE, que aqui são só as fontes
 *      buscadas fora (decisão em aberto do §7.8; ver ENSAIO_MOSTRAR_REDE);
 *   3. a tela escreveu alguma coisa: `main.conteudo` em branco é o defeito
 *      silencioso que este arquivo existe para pegar;
 *   4. nada de `undefined`, `NaN`, `[object Object]` ou `Invalid Date`
 *      escapando para o texto que a educadora lê.
 *
 * A lista de cargos, as abas da barra e as portas de "Mais" são lidas DO
 * PRÓPRIO PROTÓTIPO, nunca copiadas para cá: um roteiro com a lista escrita à
 * mão envelhece calado, e passaria a não ensaiar exatamente a tela nova.
 *
 * Uso:
 *   ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio
 *   (o `scripts/preparar-ambiente.sh` resolve o binário e imprime a variável)
 *
 * Variáveis:
 *   ENSAIO_CHROMIUM      caminho do executável do Chromium — obrigatório
 *   ENSAIO_ARQUIVO       .html a ensaiar (padrão: o protótipo do repositório)
 *   ENSAIO_SAIDA         onde gravar as fotos (padrão: /tmp/ensaio)
 *   ENSAIO_CARGOS        subconjunto de cargos, separados por vírgula
 *   ENSAIO_MOSTRAR_REDE  =1 para não silenciar os erros de rede
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = process.env.ENSAIO_ARQUIVO
  ?? resolve(AQUI, '..', 'prototipo', 'rede-acolher-prototipo.html');
const SAIDA = process.env.ENSAIO_SAIDA ?? '/tmp/ensaio';
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;
const MOSTRAR_REDE = process.env.ENSAIO_MOSTRAR_REDE === '1';

/* Erro de rede num arquivo que roda SEM servidor é esperado: o `@import` das
 * fontes é a única saída para fora que o protótipo faz. Silenciar aqui, e não
 * no navegador, mantém o achado visível para quem quiser vê-lo. */
const eDeRede = (t) => /net::|Failed to load resource|ERR_/i.test(t);

if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error(
    'ENSAIO_CHROMIUM não aponta para um executável.\n' +
    'Rode `bash scripts/preparar-ambiente.sh` — ele baixa o Chromium e imprime a variável.',
  );
  process.exit(2);
}
if (!existsSync(ARQUIVO)) {
  console.error(`Protótipo não encontrado em ${ARQUIVO}. Rode antes: npm run prototipo`);
  process.exit(2);
}

const achados = [];
const anota = (cargo, tela, o_que) => achados.push({ cargo, tela, o_que });

/** Espera o React assentar depois de uma troca de tela. */
const assentar = (pg) => pg.waitForTimeout(650);

/** Nome de arquivo sem acento, espaço nem barra — vai para o disco. */
const emArquivo = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);

/**
 * Confere UMA tela já aberta. Os erros chegam pelos ouvintes de página; o que
 * se faz aqui é olhar o que ficou escrito.
 */
async function conferir(pg, cargo, tela) {
  const conteudo = pg.locator('main.conteudo');
  const texto = (await conteudo.count()) ? await conteudo.innerText() : '';

  if (texto.trim().length < 40) {
    anota(cargo, tela, `tela praticamente em branco (${texto.trim().length} caracteres)`);
  }
  for (const veneno of ['undefined', 'NaN', '[object Object]', 'Invalid Date']) {
    if (texto.includes(veneno)) anota(cargo, tela, `o texto da tela mostra "${veneno}"`);
  }

  await mkdir(join(SAIDA, emArquivo(cargo)), { recursive: true });
  await pg.screenshot({ path: join(SAIDA, emArquivo(cargo), `${emArquivo(tela)}.png`), fullPage: true });
  return texto;
}

/** As portas de "Mais" que este cargo tem, na ordem em que aparecem. */
async function portasDoMais(pg) {
  const aba = pg.locator('nav.tabbar button', { hasText: 'Mais' });
  /* `.first()` de propósito: o "⋯" de uma linha de atividade também tem "Mais"
   * no nome acessível, e um ensaio que pegue o outro "passa" navegando para
   * lugar nenhum. */
  if (!(await aba.count())) return [];
  await aba.first().click();
  await pg.waitForTimeout(350);
  const titulos = await pg.locator('.overlay .sheet button.card.row b.ff').allInnerTexts();
  await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).click();
  await pg.waitForTimeout(250);
  return titulos.map((t) => t.trim()).filter(Boolean);
}

async function abrirDoMais(pg, indice) {
  await pg.locator('nav.tabbar button', { hasText: 'Mais' }).first().click();
  await pg.waitForTimeout(350);
  await pg.locator('.overlay .sheet button.card.row').nth(indice).click();
  await assentar(pg);
}

const navegador = await chromium.launch({
  executablePath: EXECUTAVEL,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
/* Largura de celular: é onde o sistema é usado. Uma tela que só cabe no
 * monitor da coordenação não serve para quem registra no corredor. */
const pg = await navegador.newPage({ viewport: { width: 420, height: 900 } });

let ondeEstou = { cargo: 'entrada', tela: 'login' };
pg.on('pageerror', (e) => anota(ondeEstou.cargo, ondeEstou.tela, `exceção na página: ${e.message}`));
pg.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (!MOSTRAR_REDE && eDeRede(m.text())) return;
  anota(ondeEstou.cargo, ondeEstou.tela, `erro de console: ${m.text()}`);
});

const inicio = Date.now();
await pg.goto(`file://${ARQUIVO}`);
await pg.waitForTimeout(900);
await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
await pg.waitForTimeout(1200);

const seletor = pg.locator('select.troca-cargo-sel');
if (!(await seletor.count())) {
  console.error('O seletor "Ver como" não apareceu — o arquivo foi construído sem VITE_PROTOTIPO=1?');
  await navegador.close();
  process.exit(2);
}
const cargos = await seletor.locator('option').evaluateAll((os) =>
  os.map((o) => ({ valor: o.value, rotulo: o.textContent.trim() })));

const pedidos = (process.env.ENSAIO_CARGOS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const aEnsaiar = pedidos.length ? cargos.filter((c) => pedidos.includes(c.valor)) : cargos;

console.log(`Ensaio de ${aEnsaiar.length} cargo(s) sobre ${ARQUIVO}\n`);

for (const cargo of aEnsaiar) {
  ondeEstou = { cargo: cargo.valor, tela: '(troca de cargo)' };
  await seletor.selectOption(cargo.valor);
  await pg.waitForTimeout(900);

  const abas = await pg.locator('nav.tabbar button').allInnerTexts();
  /* `text-transform: uppercase` no CSS quebra comparação sensível a
   * maiúsculas: o nome que volta daqui pode não ser o que está no código. */
  const doTurno = abas.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => !/Mais$/i.test(t));
  const telas = [];

  for (let i = 0; i < doTurno.length; i++) {
    ondeEstou = { cargo: cargo.valor, tela: doTurno[i] };
    await pg.locator('nav.tabbar button').nth(i).click();
    await assentar(pg);
    await conferir(pg, cargo.valor, doTurno[i]);
    telas.push(doTurno[i]);
  }

  const portas = await portasDoMais(pg);
  for (let i = 0; i < portas.length; i++) {
    ondeEstou = { cargo: cargo.valor, tela: portas[i] };
    await abrirDoMais(pg, i);
    await conferir(pg, cargo.valor, portas[i]);
    telas.push(portas[i]);
  }

  /*
   * O cargo de uma tela só não tem barra: com uma aba, a barra seria uma
   * decoração que ocupa o rodapé da Cozinha. A primeira versão deste ensaio
   * lia a barra para saber o que percorrer e, por isso, ensaiava ZERO tela
   * justamente no cargo cuja tela única é a razão de ele existir. Sem barra,
   * o que está aberto é a tela do cargo — e é ela que se confere.
   */
  if (!telas.length) {
    ondeEstou = { cargo: cargo.valor, tela: 'tela única' };
    await conferir(pg, cargo.valor, 'tela única');
    telas.push('tela única');
  }

  const meus = achados.filter((a) => a.cargo === cargo.valor).length;
  console.log(
    `${meus ? '✗' : '✓'} ${cargo.rotulo.padEnd(20)} ${String(telas.length).padStart(2)} telas` +
    `${meus ? `  — ${meus} achado(s)` : ''}\n   ${telas.join(' · ')}`,
  );
}

await navegador.close();

const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
console.log(`\nFotos em ${SAIDA} · ${segundos}s`);

if (!achados.length) {
  console.log('Nenhum achado.');
  process.exit(0);
}
console.log(`\n${achados.length} ACHADO(S):`);
for (const a of achados) console.log(`  [${a.cargo} · ${a.tela}] ${a.o_que}`);
process.exit(1);
