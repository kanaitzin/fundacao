#!/usr/bin/env node
/**
 * O QUE CADA SETOR VÊ (fase 246, pedido de 25/10: "confira que cada setor
 * enxergue apenas as suas funções, diminuindo as opções em tela").
 *
 * Contra o servidor de verdade, como o `ensaio-servidor.mjs`, e chamado pela
 * simulação da casa com `SIM_SETORES=1`. Para uma conta de cada cargo, abre cada
 * tela do menu e cada aba de dentro, e aperta cada botão da tela. Se o botão abre
 * uma folha, preenche com texto fictício e aperta o botão de gravar dela. Anota o
 * que o servidor respondeu às escritas.
 *
 * Duas saídas:
 *   1. os ACHADOS: botão que a tela mostra ao cargo e que o servidor recusa com
 *      403 (ou leitura recusada depois do toque). É opção que a pessoa vê e não
 *      pode usar, e sai da tela sem precisar de decisão;
 *   2. o INVENTÁRIO, em `inventario.md`: cargo por cargo, tela por tela, cada botão
 *      e o que ele fez (gravou, foi recusado, só mostrou). É dele que sai a lista
 *      do que é ou não função de cada setor, para a Fundação decidir.
 *
 * Grava no banco da simulação, que é fictício: os botões que gravam gravam de
 * verdade. Não é para rodar solto nem sobre banco de alguém.
 *
 * Variáveis: as do `ensaio-servidor.mjs` (ENSAIO_CHROMIUM, ENSAIO_URL,
 * ENSAIO_AGORA, ENSAIO_CONTAS, ENSAIO_SAIDA), e ENSAIO_CARGOS para medir só alguns
 * cargos (`ENSAIO_CARGOS=educador,portaria`).
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const URL_BASE = process.env.ENSAIO_URL ?? 'http://localhost:5173';
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;
const SAIDA = process.env.ENSAIO_SAIDA ?? '/tmp/ensaio-setores';
const AGORA = process.env.ENSAIO_AGORA ? new Date(process.env.ENSAIO_AGORA) : null;
const SO = (process.env.ENSAIO_CARGOS ?? '').split(',').map((x) => x.trim()).filter(Boolean);

if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error('ENSAIO_CHROMIUM não aponta para um executável.');
  process.exit(2);
}
/* Uma conta de cada cargo: o que três educadores veem é o mesmo. */
const CONTAS = [];
for (const c of JSON.parse(process.env.ENSAIO_CONTAS ?? '[]')) {
  const cargo = /\(([^)]+)\)/.exec(c.quem)?.[1] ?? c.quem;
  if (SO.length && !SO.includes(cargo)) continue;
  if (!CONTAS.some((x) => x.cargo === cargo)) CONTAS.push({ ...c, cargo });
}
/* Do cargo com menos alcance para o com mais: os botões da coordenação e do
   gestor mudam a casa (encerram, decidem), e quem vem antes mede a casa inteira. */
const ORDEM = ['portaria', 'cozinha', 'educador', 'lider_noturno_geral', 'enfermagem', 'lider_diurno',
  'equipe_tecnica', 'coordenador', 'gestor_geral'];
CONTAS.sort((a, z) => (ORDEM.indexOf(a.cargo) + 99) % 99 - (ORDEM.indexOf(z.cargo) + 99) % 99);
if (!CONTAS.length) {
  console.error('ENSAIO_CONTAS vazio: este ensaio é chamado pela simulação da casa (SIM_SETORES=1).');
  process.exit(2);
}

/* O que nunca se aperta: sair, trocar de casa, abrir e fechar explicação, e os
   botões que só mudam o que se vê (voltar, dia anterior, mês seguinte). */
const NAO_APERTA = /^(sair|trocar de casa|como funciona|fechar|cancelar|voltar|←.*|mais|menos|anterior|próximo|seguinte|hoje|ontem|amanhã|‹|›|«|»|<|>|ver menos|ver mais|mostrar menos|mostrar mais|recolher|abrir menos|entendi|pronto)$/i;
/* Na folha, o que não é gravar. */
/* O que mexe na conta de outra pessoa entra no inventário e NÃO se aperta: a
   primeira rodada redefiniu a senha da educadora pela Equipe, e as contas que
   vinham depois não entravam mais. */
const MEXE_EM_CONTA = /(senha|convite|desativ|reativ|vínculo|bloque|revog|tirar da casa|tirar da equipe|cargo d[ea])/i;
const NAO_GRAVA = /^(cancelar|fechar|voltar|←.*|ditar neste campo|parar de ditar|tirar foto|câmera|galeria|arquivo|escolher arquivo|tirar|ver|ampliar|descartar|tirar outra|ler o texto do papel|\+ ?horário|- ?horário|remover horário|acrescentar horário|como funciona)$/i;
const DATA = (AGORA ?? new Date()).toISOString().slice(0, 10);
const espera = (pg, ms) => pg.waitForTimeout(ms);
const limpo = (t) => t.replace(/\s+/g, ' ').trim();

const inventario = {};   // cargo → [{ tela, aba, botao, resultado, rotas }]
const achados = [];

async function entrar(pg, conta) {
  await pg.goto(URL_BASE);
  await espera(pg, 1200);
  await pg.fill('#email', conta.email);
  await pg.fill('#senha', conta.senha);
  await pg.getByRole('button', { name: /Entrar no sistema/ }).click();
  await espera(pg, 2000);
  const adiar = pg.getByRole('button', { name: /Continuar com a senha atual/ });
  if (await adiar.isVisible().catch(() => false)) { await adiar.click(); await espera(pg, 400); }
  return (await pg.locator('main.conteudo').count()) > 0;
}

async function fecharTudo(pg) {
  for (let i = 0; i < 4; i++) {
    await pg.keyboard.press('Escape').catch(() => undefined);
    const b = pg.locator('.overlay button, .folha button, [role="dialog"] button')
      .filter({ hasText: /^(Fechar|Cancelar|Entendi|Pronto)$/ });
    if (!(await b.count())) return;
    await b.first().click({ timeout: 2000 }).catch(() => undefined);
    await espera(pg, 250);
  }
}

/* A coluna lateral, ou, onde ela não existe (a portaria), a barra de baixo. */
let PELA_BARRA = false;
async function irPara(pg, porta, aba) {
  await fecharTudo(pg);
  const nome = new RegExp(`^\\s*${porta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
  const botao = PELA_BARRA
    ? pg.locator('nav.tabbar button').filter({ hasText: nome })
    : pg.locator('nav.portas-lateral button').filter({ has: pg.locator('.rotulo', { hasText: nome }) });
  await botao.first().click({ timeout: 8000 });
  await espera(pg, 900);
  if (aba) {
    const a = pg.locator('main.conteudo [role="tab"]').filter({ hasText: new RegExp(`^\\s*${aba.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) });
    if (await a.count()) { await a.first().click({ timeout: 4000 }).catch(() => undefined); await espera(pg, 600); }
  }
}

/** Os botões da tela, um por rótulo: o repetido em cada cartão é medido no primeiro. */
async function botoesDaTela(pg) {
  return pg.locator('main.conteudo button').evaluateAll((els) => {
    const vistos = new Set();
    const out = [];
    for (const e of els) {
      if (!e.getClientRects().length || e.disabled) continue;
      if (e.getAttribute('role') === 'tab' || e.hasAttribute('aria-expanded')) continue;
      if (e.closest('nav, .acolhe-painel, .overlay, .folha, [role="dialog"]')) continue;
      const rotulo = (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim();
      if (!rotulo || vistos.has(rotulo)) continue;
      vistos.add(rotulo);
      out.push(rotulo);
    }
    return out;
  });
}

async function folhaAberta(pg) {
  const f = pg.locator('.overlay .sheet, .folha, [role="dialog"][aria-modal="true"]');
  return (await f.count()) ? f.last() : null;
}

/** Preenche a folha com dado fictício e aperta o último botão de gravar dela. */
async function preencherEGravar(pg, folha) {
  await folha.evaluate((raiz, dia) => {
    const pôr = (el, v) => {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      set?.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    for (const el of raiz.querySelectorAll('input, textarea, select')) {
      if (!el.getClientRects().length || el.disabled || el.readOnly) continue;
      if (el.tagName === 'SELECT') {
        if (!el.value) {
          const o = [...el.options].find((x) => x.value);
          if (o) pôr(el, o.value);
        }
        continue;
      }
      if (el.tagName === 'TEXTAREA') {
        if (!el.value) pôr(el, 'Registro fictício do ensaio dos setores, com texto suficiente para a conferência.');
        continue;
      }
      const t = (el.type || 'text').toLowerCase();
      if (['file', 'password', 'checkbox', 'radio', 'hidden', 'button', 'submit', 'range', 'color'].includes(t)) continue;
      if (el.value) continue;
      if (t === 'number') pôr(el, '1');
      else if (t === 'date') pôr(el, dia);
      else if (t === 'time') pôr(el, '10:00');
      else if (t === 'datetime-local') pôr(el, `${dia}T10:00`);
      else if (t === 'month') pôr(el, dia.slice(0, 7));
      else if (t === 'email') pôr(el, 'ensaio.setores@paodospobres.dev');
      else if (t === 'tel') pôr(el, '51 90000-0000');
      else pôr(el, 'Texto fictício do ensaio dos setores');
    }
    /* A escolha em botões (o tipo, a categoria): o primeiro, se nenhum está marcado. */
    const opts = [...raiz.querySelectorAll('button.opt')];
    if (opts.length && !opts.some((b) => b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true')) opts[0].click();
  }, DATA);
  await espera(pg, 300);
  const candidatos = await folha.locator('button').evaluateAll((els, re) => {
    const rx = new RegExp(re, 'i');
    return els.map((e, i) => ({ i, t: (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(), ok: e.getClientRects().length > 0 && !e.disabled }))
      .filter((x) => x.ok && x.t && !rx.test(x.t) && !/^\d+$/.test(x.t));
  }, NAO_GRAVA.source);
  const alvo = candidatos.at(-1);
  if (!alvo) return 'a folha não tem botão de gravar que se possa apertar com o texto fictício';
  await folha.locator('button').nth(alvo.i).click({ timeout: 4000 }).catch(() => undefined);
  await espera(pg, 1100);
  return `apertou ${alvo.t}`;
}

const navegador = await chromium.launch({ executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
await mkdir(SAIDA, { recursive: true });
const inicio = Date.now();

for (const conta of CONTAS) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  if (AGORA) await pg.clock.setFixedTime(AGORA);
  const linhas = inventario[conta.cargo] = [];
  let escritas = [];
  let leiturasRecusadas = [];
  pg.on('response', (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith('/api/') || u.pathname.includes('/auth/')) return;
    const rota = `${r.request().method()} ${u.pathname.replace(/^\/api\/v1/, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')}`;
    if (r.request().method() !== 'GET') escritas.push({ rota, status: r.status() });
    else if (r.status() === 403) leiturasRecusadas.push(rota);
  });
  pg.on('dialog', (d) => d.dismiss().catch(() => undefined));

  if (!(await entrar(pg, conta))) {
    achados.push(`[${conta.cargo}] não chegou à tela inicial depois de entrar`);
    await ctx.close();
    continue;
  }
  let portas = (await pg.locator('nav.portas-lateral button .rotulo').allInnerTexts()).map(limpo).filter(Boolean);
  PELA_BARRA = !portas.length;
  if (PELA_BARRA) portas = (await pg.locator('nav.tabbar button').allInnerTexts()).map(limpo).filter((t) => t && !/^Mais$/i.test(t));
  let medidos = 0;
  for (const porta of portas) {
    await irPara(pg, porta, null).catch(() => undefined);
    const abas = (await pg.locator('main.conteudo [role="tab"]').allInnerTexts().catch(() => [])).map(limpo).filter(Boolean);
    for (const aba of abas.length ? abas : [null]) {
      await irPara(pg, porta, aba).catch(() => undefined);
      const botoes = (await botoesDaTela(pg)).filter((b) => !NAO_APERTA.test(b));
      for (const botao of botoes) {
        if (MEXE_EM_CONTA.test(botao)) {
          linhas.push({ tela: porta, aba, botao, resultado: 'não apertado: mexe na conta de alguém', passo: '', rotas: [] });
          continue;
        }
        await irPara(pg, porta, aba).catch(() => undefined);
        const alvo = pg.locator('main.conteudo button').filter({ hasText: botao }).first();
        const porRotulo = pg.locator(`main.conteudo button[aria-label="${botao.replace(/"/g, '\\"')}"]`).first();
        const el = (await porRotulo.count()) ? porRotulo : alvo;
        if (!(await el.isVisible().catch(() => false))) continue;
        /* A resposta atrasada do botão anterior não pode cair na conta deste. */
        await pg.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
        await espera(pg, 300);
        escritas = []; leiturasRecusadas = [];
        let passo = 'apertou';
        await el.click({ timeout: 4000 }).catch(() => { passo = 'não deu para apertar'; });
        await espera(pg, 700);
        const folha = await folhaAberta(pg);
        if (folha && !escritas.length) passo = `abriu a folha; ${await preencherEGravar(pg, folha)}`;
        await pg.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
        await espera(pg, 300);
        const recusadas = escritas.filter((e) => e.status === 403);
        const gravou = escritas.filter((e) => e.status < 300);
        const resultado = recusadas.length ? 'RECUSADO pelo servidor (403)'
          : leiturasRecusadas.length ? 'leitura RECUSADA depois do toque (403)'
            : gravou.length ? 'grava'
              : escritas.length ? `o servidor pediu outro dado (${escritas.map((e) => e.status).join(', ')})`
                : folha ? 'abre folha, sem gravar com o texto fictício' : 'só mostra';
        const rotas = [...new Set([...escritas.map((e) => `${e.rota} → ${e.status}`), ...leiturasRecusadas.map((r) => `${r} → 403`)])];
        linhas.push({ tela: porta, aba, botao, resultado, passo, rotas });
        if (recusadas.length || leiturasRecusadas.length) {
          achados.push(`[${conta.cargo}] ${porta}${aba ? ` › ${aba}` : ''} › "${botao}": ${resultado} ${rotas.join('; ')}`);
        }
        medidos++;
      }
    }
  }
  console.log(`✓ ${conta.quem.padEnd(32)} ${String(portas.length).padStart(2)} telas · ${medidos} botões`);
  await ctx.close();
}
await navegador.close();

/* O inventário, para ler e decidir. */
const md = ['# O que cada setor vê', '',
  `Medido contra o servidor de verdade, numa casa simulada, em ${new Date().toISOString().slice(0, 10)}.`,
  'Cada linha é um botão que o cargo vê, e o que aconteceu quando o ensaio o apertou.', ''];
for (const [cargo, linhas] of Object.entries(inventario)) {
  md.push(`## ${cargo}`, '', '| Tela | Aba | Botão | O que fez |', '|---|---|---|---|');
  for (const l of linhas) md.push(`| ${l.tela} | ${l.aba ?? ''} | ${l.botao.replace(/\|/g, '/')} | ${l.resultado}${l.rotas.length ? ` (${l.rotas.join('; ').replace(/\|/g, '/')})` : ''} |`);
  md.push('');
}
await writeFile(join(SAIDA, 'inventario.md'), md.join('\n'));
await writeFile(join(SAIDA, 'inventario.json'), JSON.stringify(inventario, null, 2));
await writeFile(join(SAIDA, 'achados-dos-setores.json'), JSON.stringify(achados, null, 2));

console.log(`\n${((Date.now() - inicio) / 1000).toFixed(1)}s · inventário em ${SAIDA}/inventario.md`);
console.log(achados.length
  ? `${achados.length} botão(ões) que a tela mostra e o servidor recusa:\n  ${achados.join('\n  ')}`
  : 'Nenhum botão que a tela mostre e o servidor recuse.');
process.exit(achados.length ? 1 : 0);
