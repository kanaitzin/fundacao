#!/usr/bin/env node
/**
 * ENSAIO CONTRA O SERVIDOR DE VERDADE (fase 173).
 *
 * Os outros ensaios abrem o PROTÓTIPO, que traz um servidor de mentira dentro
 * (`src/mock.ts`). É o que permite rodá-los sem banco, e é também o ponto cego
 * deles: quando a tela manda uma coisa e o servidor espera outra, o mock aceita
 * e o ensaio passa. A simulação de noventa dias achou assim o botão Gerar
 * pendências mandando o corpo sem a casa: no protótipo criava, no sistema de
 * verdade respondia que tinha criado e não criava nada.
 *
 * Este ensaio abre as MESMAS telas, pelo navegador, contra o servidor e o banco
 * de verdade, entrando com as contas de verdade da casa simulada. Para cada
 * tela que cada pessoa alcança ele anota:
 *   1. exceção na página e erro de console;
 *   2. toda resposta da API com erro (500 sempre é achado; 4xx é anotado com a
 *      rota, porque a tela não deveria pedir o que vai ser recusado);
 *   3. tela em branco, e `undefined`, `NaN`, `[object Object]`, `Invalid Date`
 *      no texto que a pessoa lê.
 *
 * Quem sobe o servidor, o banco no dia certo e o Vite é o
 * `scripts/simulacao-da-casa.sh`, depois da simulação. Não é para rodar solto.
 *
 * Variáveis:
 *   ENSAIO_CHROMIUM   o executável do Chromium (obrigatório)
 *   ENSAIO_URL        onde o Vite serve a tela (padrão http://localhost:5173)
 *   ENSAIO_AGORA      o instante que o navegador vive (o mesmo do banco)
 *   ENSAIO_CONTAS     JSON: [{ email, senha, quem }]
 *   ENSAIO_SAIDA      onde gravar fotos e achados (padrão /tmp/ensaio-servidor)
 *   ENSAIO_CAIXA      a caixa de e-mail do servidor (EMAIL_DIR), para abrir o
 *                     link do esqueci minha senha que chegou nela (fase 190)
 *
 * DESDE A FASE 190, além das portas, cada conta abre no tamanho de CELULAR a
 * folha Minha conta, onde mora o aviso no celular (fase 189), e no fim uma
 * pessoa pede o esqueci minha senha (fase 188), abre o link que chegou na caixa
 * e confere a tela de criar a senha nova, sem criar: a conta segue a mesma.
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const URL_BASE = process.env.ENSAIO_URL ?? 'http://localhost:5173';
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;
const SAIDA = process.env.ENSAIO_SAIDA ?? '/tmp/ensaio-servidor';
const AGORA = process.env.ENSAIO_AGORA ? new Date(process.env.ENSAIO_AGORA) : null;
const CONTAS = JSON.parse(process.env.ENSAIO_CONTAS ?? '[]');
const [LARG, ALT] = (process.env.ENSAIO_VIEWPORT ?? '1440x900').split('x').map(Number);

if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error('ENSAIO_CHROMIUM não aponta para um executável.');
  process.exit(2);
}
if (!CONTAS.length) {
  console.error('ENSAIO_CONTAS vazio: este ensaio é chamado pela simulação da casa.');
  process.exit(2);
}

const achados = [];
const vistos = new Set();
const anota = (quem, tela, o_que) => {
  const chave = `${quem}|${tela}|${o_que}`;
  if (vistos.has(chave)) return;
  vistos.add(chave);
  achados.push({ quem, tela, o_que });
};
const assentar = (pg) => pg.waitForTimeout(900);
const emArquivo = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);

async function conferir(pg, quem, tela) {
  const conteudo = pg.locator('main.conteudo');
  const texto = (await conteudo.count()) ? await conteudo.innerText() : '';
  if (texto.trim().length < 40) anota(quem, tela, `tela praticamente em branco (${texto.trim().length} caracteres)`);
  for (const veneno of ['undefined', 'NaN', '[object Object]', 'Invalid Date']) {
    if (texto.includes(veneno)) {
      const i = texto.indexOf(veneno);
      anota(quem, tela, `o texto da tela mostra "${veneno}": …${texto.slice(Math.max(0, i - 60), i + 20).replace(/\s+/g, ' ')}…`);
    }
  }
  await mkdir(join(SAIDA, emArquivo(quem)), { recursive: true });
  await pg.screenshot({ path: join(SAIDA, emArquivo(quem), `${emArquivo(tela)}.png`), fullPage: true });
}

async function portas(pg) {
  const coluna = pg.locator('nav.portas-lateral button');
  if (await coluna.first().isVisible().catch(() => false)) {
    return (await coluna.locator('.rotulo').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

const navegador = await chromium.launch({ executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const inicio = Date.now();

for (const conta of CONTAS) {
  const ctx = await navegador.newContext({ viewport: { width: LARG, height: ALT } });
  const pg = await ctx.newPage();
  if (AGORA) await pg.clock.setFixedTime(AGORA);
  let onde = 'entrada';
  pg.on('pageerror', (e) => anota(conta.quem, onde, `exceção na página: ${e.message}`));
  pg.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;   // a resposta já é anotada abaixo, com a rota
    anota(conta.quem, onde, `erro de console: ${m.text().slice(0, 200)}`);
  });
  pg.on('response', async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith('/api/') || r.status() < 400) return;
    let msg = '';
    try { msg = JSON.stringify((await r.json())?.message ?? '').slice(0, 160); } catch { /* sem corpo */ }
    anota(conta.quem, onde, `${r.status()} em ${r.request().method()} ${u.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')}${u.search ? '?…' : ''} ${msg}`);
  });

  await pg.goto(URL_BASE);
  await pg.waitForTimeout(1200);
  /* E-mail e senha juntos, numa tela só (fase 188). */
  await pg.fill('#email', conta.email);
  await pg.fill('#senha', conta.senha);
  await pg.getByRole('button', { name: /Entrar no sistema/ }).click();
  await pg.waitForTimeout(2000);
  if (!(await pg.locator('main.conteudo').count())) {
    anota(conta.quem, 'entrada', 'não chegou à tela inicial depois de entrar');
    await ctx.close();
    continue;
  }

  /* A sugestão de trocar a senha provisória, no primeiro acesso, fica para depois. */
  const adiar = pg.getByRole('button', { name: /Continuar com a senha atual/ });
  if (await adiar.isVisible().catch(() => false)) { await adiar.click(); await pg.waitForTimeout(400); }

  const telas = [];
  const abas = (await pg.locator('nav.tabbar button').allInnerTexts())
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => !/Mais$/i.test(t));
  for (let i = 0; i < abas.length; i++) {
    onde = abas[i];
    if (!(await pg.locator('nav.tabbar button').nth(i).isVisible().catch(() => false))) continue;
    await pg.keyboard.press('Escape');
    await pg.locator('nav.tabbar button').nth(i).click({ timeout: 8000 }).catch((e) => anota(conta.quem, onde, `não abriu: ${e.message.split('\n')[0]}`));
    await assentar(pg);
    await conferir(pg, conta.quem, onde);
    telas.push(onde);
  }
  const lista = await portas(pg);
  for (let i = 0; i < lista.length; i++) {
    onde = lista[i];
    await pg.keyboard.press('Escape');
    await pg.locator('nav.portas-lateral button').nth(i).click({ timeout: 8000 }).catch((e) => anota(conta.quem, onde, `não abriu: ${e.message.split('\n')[0]}`));
    await assentar(pg);
    await conferir(pg, conta.quem, onde);
    telas.push(onde);
  }
  if (!telas.length) { onde = 'tela única'; await conferir(pg, conta.quem, onde); telas.push(onde); }

  /* A ACOLHE+AI (fase 192): sem a chave na instalação, ela responde pelo guia,
     e diz isso; a pergunta não pode gerar recusa da API. */
  onde = 'Acolhe+AI';
  const abrirAcolhe = pg.getByRole('button', { name: /^Abrir a Acolhe\+AI/ });
  if (await abrirAcolhe.isVisible().catch(() => false)) {
    await abrirAcolhe.click();
    await pg.waitForTimeout(800);
    await pg.locator('#acolhe-pergunta').fill('o que você faz?');
    await pg.locator('.acolhe-painel').getByRole('button', { name: 'Enviar' }).click();
    await pg.waitForTimeout(1200);
    const conversa = await pg.locator('.acolhe-painel').innerText().catch(() => '');
    if (!/modo guia/i.test(conversa)) anota(conta.quem, onde, `sem a chave, a Acolhe+AI não disse que está no modo guia: ${conversa.slice(0, 160).replace(/\s+/g, ' ')}`);
    await pg.getByRole('button', { name: 'Minimizar a Acolhe+AI' }).click().catch(() => {});
    await pg.waitForTimeout(300);
    telas.push(onde);
  } else {
    anota(conta.quem, onde, 'o botão da Acolhe+AI não aparece');
  }

  /* O AVISO NESTE COMPUTADOR, no monitor (fase 191): na folha da senha. */
  onde = 'folha da senha (computador)';
  const chave = pg.getByRole('button', { name: 'Trocar minha senha' });
  if (await chave.isVisible().catch(() => false)) {
    await chave.click();
    await pg.waitForTimeout(1200);
    const folha = (await pg.locator('.overlay').last().innerText().catch(() => '')) || '';
    if (!/Aviso neste computador/.test(folha)) anota(conta.quem, onde, 'a folha da senha não tem o aviso neste computador');
    else if (!/ainda não foi ligado nesta instalação/.test(folha)) anota(conta.quem, onde, 'sem as chaves, o aviso neste computador não diz que está desligado');
    await pg.getByRole('button', { name: 'Cancelar' }).click().catch(() => {});
    await pg.waitForTimeout(300);
    telas.push(onde);
  }

  /* A FOLHA MINHA CONTA, no tamanho de celular (fase 190): só existe abaixo de
     1080 px, e é onde mora o aviso no celular. Sem as chaves na instalação, a
     folha tem de dizer isso, e não oferecer um botão que não faz nada. */
  onde = 'Minha conta (celular)';
  await pg.setViewportSize({ width: 390, height: 844 });
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(400);
  const conta390 = pg.getByRole('button', { name: /^Minha conta/ });
  if (await conta390.isVisible().catch(() => false)) {
    await conta390.click();
    await pg.waitForTimeout(1200);
    const folha = pg.locator('.overlay .sheet');
    const texto = (await folha.count()) ? await folha.innerText() : '';
    if (!/Aviso no celular/.test(texto)) anota(conta.quem, onde, 'a folha não tem o aviso no celular');
    else if (!/ainda não foi ligado nesta instalação/.test(texto)) {
      anota(conta.quem, onde, `o aviso no celular, sem as chaves, não diz que está desligado: ${texto.slice(-200).replace(/\s+/g, ' ')}`);
    }
    for (const veneno of ['undefined', 'NaN', '[object Object]', 'Invalid Date']) {
      if (texto.includes(veneno)) anota(conta.quem, onde, `a folha mostra "${veneno}"`);
    }
    await mkdir(join(SAIDA, emArquivo(conta.quem)), { recursive: true });
    await pg.screenshot({ path: join(SAIDA, emArquivo(conta.quem), 'minha-conta-celular.png') });
    telas.push(onde);
  } else {
    anota(conta.quem, onde, 'no tamanho de celular, o botão Minha conta não aparece');
  }

  const meus = achados.filter((a) => a.quem === conta.quem).length;
  console.log(`${meus ? '✗' : '✓'} ${conta.quem.padEnd(22)} ${String(telas.length).padStart(2)} telas${meus ? `  (${meus} achado(s))` : ''}`);
  await ctx.close();
}

/*
 * O ESQUECI MINHA SENHA contra o servidor de verdade (fase 190): a mesma
 * resposta para o e-mail da casa e para um inventado, o link que chega na
 * caixa do servidor, e a tela de criar a senha nova aberta por ele. Não cria a
 * senha: a conta continua entrando com a de sempre.
 */
{
  const conta = CONTAS[0];
  const quem = 'esqueci minha senha';
  let onde = 'entrada';
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  if (AGORA) await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', (e) => anota(quem, onde, `exceção na página: ${e.message}`));
  pg.on('response', async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith('/api/') || r.status() < 400) return;
    anota(quem, onde, `${r.status()} em ${r.request().method()} ${u.pathname}`);
  });
  const pedir = async (email) => {
    await pg.goto(URL_BASE);
    await pg.waitForTimeout(1000);
    await pg.getByRole('button', { name: 'Esqueci minha senha' }).click();
    await pg.locator('#email-esqueci').fill(email);
    await pg.getByRole('button', { name: 'Enviar o link para o meu e-mail' }).click();
    await pg.waitForTimeout(1200);
    return (await pg.locator('body').innerText()).replace(/\s+/g, ' ');
  };
  onde = 'pedido';
  const deVerdade = await pedir(conta.email);
  const inventado = await pedir(`ninguem.${Date.now()}@paodospobres.dev`);
  if (!/vale uma hora e serve uma vez/.test(deVerdade)) anota(quem, onde, 'o pedido não diz que o link vale uma hora');
  if (deVerdade !== inventado) anota(quem, onde, 'a resposta muda entre e-mail cadastrado e inventado');
  if (/Abrir o link que iria por e-mail/.test(deVerdade)) anota(quem, onde, 'o servidor de verdade mostra o link do protótipo');

  const caixa = process.env.ENSAIO_CAIXA ? join(process.env.ENSAIO_CAIXA, 'caixa-de-saida.txt') : '';
  if (!caixa || !existsSync(caixa)) {
    anota(quem, 'caixa', `a caixa de e-mail do servidor não está em ${caixa || '(ENSAIO_CAIXA vazio)'}`);
  } else {
    const links = readFileSync(caixa, 'utf8').split('\n=== ').filter((m) => m.includes(`Para: ${conta.email}`))
      .map((m) => /convite=([A-Za-z0-9_-]+)/.exec(m)?.[1]).filter(Boolean);
    if (!links.length) anota(quem, 'caixa', 'o e-mail do esqueci não chegou à caixa do servidor');
    else {
      onde = 'o link do e-mail';
      await pg.goto(`${URL_BASE}/entrar?convite=${links.at(-1)}`);
      await pg.waitForTimeout(1500);
      const t = await pg.locator('body').innerText();
      if (!/Criar uma senha nova/.test(t) || !t.includes(conta.email)) {
        anota(quem, onde, `o link não abre a tela de criar a senha nova da conta: ${t.slice(0, 160).replace(/\s+/g, ' ')}`);
      }
      await mkdir(join(SAIDA, 'esqueci'), { recursive: true });
      await pg.screenshot({ path: join(SAIDA, 'esqueci', 'link-do-email.png') });
    }
  }
  const meus = achados.filter((a) => a.quem === quem).length;
  console.log(`${meus ? '✗' : '✓'} ${quem.padEnd(22)} pedido, caixa e link${meus ? `  (${meus} achado(s))` : ''}`);
  await ctx.close();
}

await navegador.close();
await mkdir(SAIDA, { recursive: true });
await writeFile(join(SAIDA, 'achados.json'), JSON.stringify(achados, null, 2));
console.log(`\n${((Date.now() - inicio) / 1000).toFixed(1)}s · fotos em ${SAIDA}`);
if (!achados.length) { console.log('Nenhum achado.'); process.exit(0); }
console.log(`\n${achados.length} ACHADO(S):`);
for (const a of achados) console.log(`  [${a.quem} · ${a.tela}] ${a.o_que}`);
process.exit(1);
