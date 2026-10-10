#!/usr/bin/env node
/**
 * A ACOLHE+AI COBRE O SISTEMA? (fase 195; pedido de 10/10: *"teste tudo
 * pedindo no Acolhe, veja se ele já cobre 100 por cento do sistema, para todos
 * os cargos, tanto por texto como por voz"*).
 *
 * Para cada cargo do protótipo, e para a Coordenação Geral, este ensaio pede à
 * Acolhe+AI, no modo guia (o do protótipo, sem modelo):
 *
 *  - por TEXTO e por VOZ, "me leva para" CADA tela que o cargo alcança, e
 *    confere que a tela aberta é a pedida (`main.conteudo[data-tela]`);
 *  - "o que é" cada tela, e confere que ela explica com a frase da tela;
 *  - cada formulário de criação que a tela mostra ao abrir (os botões com
 *    `data-acolhe-abre`), pedido pelo nome, e confere que o formulário abriu.
 *
 * E o relatório pela voz, de ponta a ponta: o ditado longo na Acolhe+AI, o
 * rascunho para conferir, acrescentar falando, a foto, levar para a tela, o
 * resumo do que ela escreveu, a foto oferecida no anexo; e o ditado direto
 * num campo de texto do sistema.
 *
 * A VOZ é um microfone falso (`window.webkitSpeechRecognition` trocado antes de
 * a página carregar), que "fala" a frase do teste com o provisório e o certo,
 * como o Chrome faz. Ele prova o caminho da tela até a Acolhe+AI; o
 * reconhecimento de verdade é do navegador, e não se testa daqui. O MODELO de
 * verdade (ler dados, redigir) também não: pede a chave da instalação.
 *
 * Saída: a matriz em `/tmp/ensaio-acolhe/cobertura.json` e o resumo na tela.
 * Reprova se alguma tela não abre por texto ou por voz, se alguma não é
 * explicada, ou se algum formulário marcado não abre.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = process.env.ENSAIO_ARQUIVO ?? resolve(AQUI, '..', 'prototipo', 'rede-acolher-prototipo.html');
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;
const SAIDA = '/tmp/ensaio-acolhe';
if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error('ENSAIO_CHROMIUM não aponta para um executável. Rode `bash scripts/preparar-ambiente.sh`.');
  process.exit(2);
}
mkdirSync(SAIDA, { recursive: true });

/* As telas pelo título, lidas do código (a mesma tabela que o menu lê). */
const portas = readFileSync(resolve(AQUI, 'src', 'portas.ts'), 'utf8');
const CHAVE_DO_TITULO = Object.fromEntries([
  ...[...portas.matchAll(/aba: '([a-z_]+)'[\s\S]*?titulo: '([^']*)'/g)].map((m) => [m[2], m[1]]),
  ['Painel', 'metricas'], ['Dia', 'dia'], ['Chamada', 'chamada'], ['Acolhidos', 'acolhidos'], ['Passagem', 'passagem'],
]);

const navegador = await chromium.launch({
  executablePath: EXECUTAVEL,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

const achados = [];
const cobrar = (o, ok, detalhe = '') => {
  console.log(`    ${ok ? '✓' : '✗'} ${o}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
  if (!ok) achados.push(`${o}${detalhe ? ` (${detalhe})` : ''}`);
};

/** O microfone falso: cada `start()` fala a próxima frase da fila, e depois fica ouvindo em silêncio. */
const MICROFONE_FALSO = () => {
  window.__falas = [];
  localStorage.setItem('rede-acolher.acolhe.aviso-do-microfone', '1');
  class Falso {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; this.onresult = null; this.onend = null; this.onerror = null; }
    start() {
      const fala = window.__falas.shift();
      if (!fala) return;
      setTimeout(() => {
        const resultado = (t, certo) => Object.assign([{ transcript: t }], { isFinal: certo });
        if (this.interimResults) this.onresult?.({ resultIndex: 0, results: [resultado(fala.slice(0, Math.ceil(fala.length / 2)), false)] });
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [resultado(fala, true)] }), 60);
      }, 40);
    }
    stop() { setTimeout(() => this.onend?.(), 10); }
  }
  window.webkitSpeechRecognition = Falso;
  window.SpeechRecognition = Falso;
};

async function novaPagina(entrada = 'Marcelo Barbosa') {
  const pg = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  const erros = [];
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.addInitScript(MICROFONE_FALSO);
  await pg.goto(`file://${ARQUIVO}`);
  await pg.waitForTimeout(800);
  await pg.getByRole('button', { name: entrada, exact: true }).click();
  await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
  await pg.waitForTimeout(1200);
  return { pg, erros };
}

const espera = (pg, ms) => pg.waitForTimeout(ms);
const telaAberta = (pg) => pg.locator('main.conteudo').getAttribute('data-tela');

async function abrirAcolhe(pg) {
  const abrir = pg.getByRole('button', { name: /^Abrir a Acolhe\+AI/ });
  if (await abrir.isVisible().catch(() => false)) { await abrir.click(); await espera(pg, 300); }
  const faixa = pg.locator('.acolhe-faixa').getByRole('button', { name: 'Ver a conversa' });
  if (await faixa.isVisible().catch(() => false)) { await faixa.click(); await espera(pg, 200); }
}

async function fecharFolhas(pg) {
  for (let i = 0; i < 4; i++) {
    const b = pg.locator('main.conteudo .overlay button, main.conteudo .folha button, body > div .overlay button')
      .filter({ hasText: /^(Cancelar|Fechar)$/ });
    if (!(await b.count())) return;
    await b.first().click().catch(() => undefined);
    await espera(pg, 250);
  }
}

/** Pergunta à Acolhe+AI por texto, ou pela voz (o microfone falso fala a frase). */
async function perguntar(pg, frase, { voz = false } = {}) {
  await abrirAcolhe(pg);
  const painel = pg.locator('.acolhe-painel');
  const caixa = pg.locator('#acolhe-pergunta');
  if (voz) {
    await caixa.fill('');
    await pg.evaluate((f) => window.__falas.push(f), frase);
    await painel.getByRole('button', { name: 'Falar pelo microfone' }).click();
    await espera(pg, 250);
    await painel.getByRole('button', { name: 'Parar de ouvir' }).click();
    await espera(pg, 100);
    const ouvido = await caixa.inputValue();
    if (ouvido.toLowerCase() !== frase.toLowerCase()) return { ouvido, ok: false };
  } else {
    await caixa.fill(frase);
  }
  await painel.getByRole('button', { name: 'Enviar' }).click();
  await espera(pg, 700);
  /* A licença pode vir depois de a tela carregar (o perfil da criança): espera
     enquanto a Acolhe+AI diz "Pensando…", e aperta a licença quando ela aparece. */
  const licenca = painel.getByRole('button', { name: 'Pode mexer' });
  const ocupada = pg.locator('.acolhe-painel[data-ocupada], .acolhe-faixa[data-ocupada]');
  for (let i = 0; i < 100; i++) {
    if (await licenca.isVisible().catch(() => false)) { await licenca.click(); await espera(pg, 300); continue; }
    if (!(await ocupada.count())) break;
    await espera(pg, 150);
  }
  if (await ocupada.count()) achados.push(`a Acolhe+AI ficou trabalhando mais de 15 s em "${frase}"`);
  await espera(pg, 300);
  return { ok: true };
}

const ultimaResposta = (pg) => pg.locator('.acolhe-painel .acolhe-linha.acolhe').last().innerText().catch(() => '');

const matriz = {};

async function percorrer(pg, rotulo) {
  console.log(`\n— ${rotulo}`);
  const titulos = await pg.evaluate(() => [...document.querySelectorAll('nav.tabbar button .rotulo, nav.portas-lateral button .rotulo')]
    .map((e) => e.textContent.trim()).filter((t) => t && t !== 'Mais'));
  let telas = [...new Set(titulos)].map((t) => ({ titulo: t, chave: CHAVE_DO_TITULO[t] })).filter((t) => t.chave);
  /* O cargo de uma tela só (a portaria) não tem menu: a tela é a que está aberta. */
  if (!telas.length) {
    const chave = await telaAberta(pg);
    const titulo = Object.keys(CHAVE_DO_TITULO).find((k) => CHAVE_DO_TITULO[k] === chave);
    if (titulo) telas = [{ titulo, chave }];
  }
  const linha = { telas: telas.length, porTexto: 0, porVoz: 0, explicadas: 0, formularios: 0, formulariosAbertos: 0, abertos: [], falhas: [] };
  matriz[rotulo] = linha;
  const falha = (o) => { linha.falhas.push(o); achados.push(`[${rotulo}] ${o}`); };

  if (!telas.length) falha('nenhuma tela para pedir: o ensaio não mediu este cargo');
  for (const t of telas) {
    // Por texto.
    await fecharFolhas(pg);
    await perguntar(pg, `me leva para ${t.titulo}`);
    if ((await telaAberta(pg)) === t.chave) linha.porTexto++; else falha(`"me leva para ${t.titulo}" por texto abriu ${await telaAberta(pg)}`);
    // Explicar.
    await perguntar(pg, `o que é ${t.titulo}?`);
    const r = await ultimaResposta(pg);
    if (r.includes(t.titulo) && r.length > t.titulo.length + 12) linha.explicadas++; else falha(`"o que é ${t.titulo}?" não explicou (${r.slice(0, 80)})`);
    // Os formulários que a tela mostra ao abrir.
    const botoes = await pg.locator('main.conteudo [data-acolhe-abre]').evaluateAll((els) =>
      els.filter((e) => e.getClientRects().length).map((e) => (e.getAttribute('aria-label') || e.innerText).trim()));
    const campos = () => pg.locator('main.conteudo input, main.conteudo textarea, main.conteudo select').count();
    for (const b of botoes) {
      linha.formularios++;
      await fecharFolhas(pg);
      if ((await telaAberta(pg)) !== t.chave) await perguntar(pg, `me leva para ${t.titulo}`);
      const antes = await campos();
      await perguntar(pg, `quero ${b.replace(/^\+\s*/, '').toLowerCase()} em ${t.titulo}`);
      /* Folha por cima, ou o formulário dentro da própria tela (o cadastro de acolhido): mais campos que antes. */
      const abriu = await pg.locator('main.conteudo [role="dialog"][aria-modal="true"], main.conteudo .folha').count()
        || (await campos()) > antes;
      if (abriu) { linha.formulariosAbertos++; linha.abertos.push(b); } else falha(`"quero ${b}" em ${t.titulo} não abriu o formulário`);
      await fecharFolhas(pg);
      const voltar = pg.locator('main.conteudo button', { hasText: /^← / });
      if (await voltar.count()) { await voltar.first().click(); await espera(pg, 300); }
    }
    // Por voz: o mesmo pedido, falado. Sai de lá antes, para a voz provar que leva.
    const outra = telas.find((x) => x.chave !== t.chave);
    if (outra) { await perguntar(pg, `me leva para ${outra.titulo}`); await fecharFolhas(pg); }
    const v = await perguntar(pg, `me leva para ${t.titulo}`, { voz: true });
    if (v.ok && (await telaAberta(pg)) === t.chave) linha.porVoz++;
    else falha(`"me leva para ${t.titulo}" por voz ${v.ok ? `abriu ${await telaAberta(pg)}` : `foi ouvido como "${v.ouvido}"`}`);
  }
  await percorrerAsSubtelas(pg, telas, linha, falha);
  console.log(`    ${linha.telas} telas · por texto ${linha.porTexto} · por voz ${linha.porVoz} · explicadas ${linha.explicadas} · subtelas ${linha.subtelasAbertas ?? 0}/${linha.subtelas ?? 0} · formulários ${linha.formulariosAbertos}/${linha.formularios}`);
}

/**
 * AS SUBTELAS (fase 196): o que só aparece com um registro aberto. O perfil da
 * criança, pedido pelo nome, por texto e por voz; cada formulário do perfil,
 * pedido de OUTRA tela com o nome da criança; o dossiê (uma entrada,
 * `data-acolhe-entra`) e os formulários de dentro dele; e a internação aberta,
 * com o diário. Conta junto com os formulários da tela.
 */
const CRIANCA = 'Bruno';
async function percorrerAsSubtelas(pg, telas, linha, falha) {
  const outra = telas.find((x) => x.chave !== 'acolhidos' && x.chave !== 'internacao');
  const sair = async () => { await fecharFolhas(pg); if (outra) await perguntar(pg, `me leva para ${outra.titulo}`); };
  const titulo = () => pg.locator('main.conteudo h2').first().innerText().catch(() => '');
  const folhaAberta = () => pg.locator('main.conteudo [role="dialog"][aria-modal="true"], main.conteudo .folha').count();
  const campos = () => pg.locator('main.conteudo input, main.conteudo textarea, main.conteudo select').count();
  const marcados = (sel) => pg.locator(`main.conteudo ${sel}`).evaluateAll((els) =>
    els.filter((e) => e.getClientRects().length).map((e) => ({ rotulo: (e.getAttribute('aria-label') || e.innerText).trim(), entra: e.hasAttribute('data-acolhe-entra') })));

  if (telas.some((x) => x.chave === 'acolhidos')) {
    linha.subtelas = (linha.subtelas ?? 0) + 2;
    await sair();
    await perguntar(pg, `abre o perfil do ${CRIANCA}`);
    if ((await titulo()).includes(CRIANCA)) linha.subtelasAbertas = (linha.subtelasAbertas ?? 0) + 1;
    else falha(`"abre o perfil do ${CRIANCA}" por texto abriu "${await titulo()}"`);
    await sair();
    const v = await perguntar(pg, `abre o perfil do ${CRIANCA}`, { voz: true });
    if (v.ok && (await titulo()).includes(CRIANCA)) linha.subtelasAbertas = (linha.subtelasAbertas ?? 0) + 1;
    else falha(`"abre o perfil do ${CRIANCA}" por voz abriu "${await titulo()}"`);

    const doPerfil = await marcados('[data-acolhe-abre], [data-acolhe-entra]');
    const base = await campos();
    for (const b of doPerfil) {
      linha.formularios++;
      await sair();
      await perguntar(pg, `quero ${b.rotulo.toLowerCase()} do ${CRIANCA}`);
      const abriu = b.entra
        ? (await titulo()).includes(CRIANCA) && !(await pg.locator('main.conteudo [data-acolhe-entra]', { hasText: b.rotulo }).count())
        : (await folhaAberta()) > 0 || (await campos()) > base;
      if (abriu) { linha.formulariosAbertos++; linha.abertos.push(b.rotulo); } else falha(`"quero ${b.rotulo} do ${CRIANCA}" não abriu, no perfil`);
      /* O dossiê: os formulários de dentro dele, pedidos de fora, pelo nome. */
      if (b.entra && abriu) {
        /* Cada aba do dossiê (Documentos, Vivências), olhada pelo ensaio. */
        await fecharFolhas(pg);
        const deDentro = [...await marcados('[data-acolhe-abre]')];
        const abas = await pg.locator('main.conteudo [role="tab"]').allInnerTexts();
        for (const a of abas) {
          await pg.locator('main.conteudo [role="tab"]', { hasText: a.trim() }).first().click();
          await espera(pg, 300);
          for (const m of await marcados('[data-acolhe-abre]')) if (!deDentro.some((x) => x.rotulo === m.rotulo)) deDentro.push(m);
        }
        const baseDentro = await campos();
        for (const d of deDentro) {
          linha.formularios++;
          await sair();
          await perguntar(pg, `quero ${d.rotulo.toLowerCase()} no ${b.rotulo.split(' ')[0].toLowerCase()} do ${CRIANCA}`);
          if ((await folhaAberta()) > 0 || (await campos()) > baseDentro) { linha.formulariosAbertos++; linha.abertos.push(d.rotulo); }
          else falha(`"quero ${d.rotulo} no ${b.rotulo} do ${CRIANCA}" não abriu`);
        }
      }
    }
  }

  const internacao = telas.find((x) => x.chave === 'internacao');
  if (internacao) {
    await sair();
    await perguntar(pg, `me leva para ${internacao.titulo}`);
    let cartoes = await marcados('[data-acolhe-entra]');
    /* O protótipo não tem internação em andamento (a de lá está encerrada, e o
       diário só existe na aberta): o ensaio abre uma, na memória da página. */
    const registrar = pg.locator('main.conteudo button', { hasText: 'Registrar internação' });
    if (!cartoes.length && (await registrar.count())) {
      await registrar.first().click();
      await espera(pg, 400);
      await pg.locator('#int-p').selectOption({ label: 'Caio' }).catch(() => pg.locator('#int-p').selectOption({ index: 1 }));
      await pg.locator('#int-h').fill('Hospital Fictício do Ensaio');
      await pg.locator('#int-m').fill('Febre alta, ficou em observação (dado do ensaio).');
      await pg.locator('main.conteudo [role="dialog"] button', { hasText: /^Registrar$/ }).click();
      await espera(pg, 800);
      cartoes = await marcados('[data-acolhe-entra]');
    }
    const nome = cartoes[0]?.rotulo.split(/\s+/)[0];
    if (!nome) falha('a Internação não mostrou nenhum cartão para entrar: o ensaio não mediu o diário');
    else {
      linha.subtelas = (linha.subtelas ?? 0) + 1;
      await sair();
      await perguntar(pg, `quero ver a internação da ${nome}`);
      const dentro = await marcados('[data-acolhe-abre]');
      if (dentro.length && !(await pg.locator('main.conteudo [data-acolhe-entra]').count())) linha.subtelasAbertas = (linha.subtelasAbertas ?? 0) + 1;
      else falha(`"quero ver a internação da ${nome}" não entrou na internação`);
      for (const d of dentro) {
        linha.formularios++;
        await sair();
        await perguntar(pg, `quero ${d.rotulo.toLowerCase()} da internação da ${nome}`);
        if ((await folhaAberta()) > 0) { linha.formulariosAbertos++; linha.abertos.push(d.rotulo); }
        else falha(`"quero ${d.rotulo} da internação da ${nome}" não abriu`);
      }
    }
  }
}

// ============================================================ todos os cargos
const TODOS = ['coordenador', 'equipe_tecnica', 'educador', 'lider_diurno', 'lider_noturno_geral', 'enfermagem', 'gestor_geral', 'portaria', 'coordenacao_geral'];
/* `ENSAIO_CARGOS=portaria,educador` mede só esses; sem ele, todos, e o relatório pela voz. */
const PEDIDOS = process.env.ENSAIO_CARGOS ? process.env.ENSAIO_CARGOS.split(',') : TODOS;
const CARGOS = PEDIDOS.filter((c) => c !== 'coordenacao_geral');
for (const cargo of CARGOS) {
  const { pg, erros } = await novaPagina();
  await pg.locator('select.troca-cargo-sel').selectOption(cargo);
  await espera(pg, 900);
  await percorrer(pg, cargo);
  if (erros.length) achados.push(`[${cargo}] exceção na página: ${erros[0]}`);
  await pg.close();
}
if (PEDIDOS.includes('coordenacao_geral')) {
  const { pg, erros } = await novaPagina('Coordenação Geral');
  await percorrer(pg, 'coordenacao_geral');
  if (erros.length) achados.push(`[coordenacao_geral] exceção na página: ${erros[0]}`);
  await pg.close();
}

// ============================================================ o relatório pela voz
if (!process.env.ENSAIO_CARGOS) {
console.log('\n— o relatório pela voz, de ponta a ponta');
  const { pg, erros } = await novaPagina();
  await pg.locator('select.troca-cargo-sel').selectOption('coordenador');
  await espera(pg, 900);
  const painel = pg.locator('.acolhe-painel');
  const fala1 = 'relatório da ATA: hoje à tarde a Ana voltou da escola às dezessete horas e lanchou com o grupo';
  await perguntar(pg, fala1, { voz: true });
  const cartao = painel.locator('.acolhe-rascunho').last();
  cobrar('o relatório falado vira um rascunho para conferir', await cartao.isVisible());
  const campo = cartao.locator('textarea');
  cobrar('com o que foi dito, arrumado em frase', /^Hoje à tarde a Ana voltou da escola.*grupo\.$/.test(await campo.inputValue()), await campo.inputValue());
  cobrar('e a tela onde ele vai ficar já sugerida', (await cartao.locator('select').inputValue()) === 'ata');
  await pg.evaluate(() => window.__falas.push('ela contou que tirou nota boa em matemática'));
  await cartao.getByRole('button', { name: 'Acrescentar falando' }).click();
  await espera(pg, 250);
  await cartao.getByRole('button', { name: 'Parar de ouvir' }).click();
  await espera(pg, 150);
  cobrar('acrescentar falando junta o novo trecho no fim do rascunho',
    /grupo\. Ela contou que tirou nota boa em matemática$/.test(await campo.inputValue()), await campo.inputValue());
  await campo.fill(`${await campo.inputValue()}.`);
  cobrar('e a pessoa edita o rascunho à mão', (await campo.inputValue()).endsWith('matemática.'));
  await cartao.getByRole('button', { name: 'Tirar uma foto' }).click();
  await espera(pg, 1500);
  await pg.locator('.camera').getByRole('button', { name: 'Fotografar', exact: true }).click();
  await espera(pg, 500);
  await pg.locator('.camera').getByRole('button', { name: 'Usar esta foto' }).click();
  await espera(pg, 400);
  cobrar('a foto entra no rascunho, com a prévia', (await cartao.locator('.acolhe-rascunho-fotos img').count()) === 1);
  await cartao.getByRole('button', { name: 'Está bom' }).click();
  await espera(pg, 300);
  await cartao.getByRole('button', { name: /^Levar para a tela/ }).click();
  await espera(pg, 2500);
  const licenca = painel.getByRole('button', { name: 'Pode mexer' });
  if (await licenca.isVisible().catch(() => false)) { await licenca.click(); await espera(pg, 2500); }
  const folha = pg.locator('main.conteudo [role="dialog"][aria-modal="true"]').last();
  const escrito = await folha.locator('textarea').first().inputValue().catch(() => '');
  cobrar('levar para a tela abre a ATA, o formulário, e escreve o rascunho no campo', (await telaAberta(pg)) === 'ata'
    && escrito.startsWith('Hoje à tarde a Ana') && escrito.endsWith('matemática.'), escrito.slice(0, 80));
  await pg.locator('.acolhe-faixa').getByRole('button', { name: 'Ver a conversa' }).click().catch(() => undefined);
  await espera(pg, 200);
  cobrar('e a conversa mostra o que ela escreveu na tela, para conferir',
    /O que eu escrevi na tela/.test(await painel.innerText()) && /Nada foi salvo por mim/.test(await painel.innerText()));
  await pg.getByRole('button', { name: 'Minimizar a Acolhe+AI' }).click();
  await fecharFolhas(pg);
  /* A foto do rascunho é oferecida no próximo anexo que a pessoa abrir. */
  await pg.locator('nav.portas-lateral button', { hasText: 'Saúde' }).first().click();
  await espera(pg, 800);
  await pg.locator('main.conteudo [role="tab"]', { hasText: 'Compras' }).first().click().catch(() => undefined);
  await espera(pg, 600);
  await pg.locator('main.conteudo button', { hasText: 'Registrar compra' }).first().click().catch(() => undefined);
  await espera(pg, 600);
  const oferta = pg.getByRole('button', { name: /Usar a foto da Acolhe\+AI/ });
  cobrar('o anexo da tela oferece a foto da Acolhe+AI, sem pôr sozinho', (await oferta.count()) > 0);
  if (await oferta.count()) {
    await oferta.first().click();
    await espera(pg, 300);
    cobrar('e, tocada, ela vira o anexo, com a prévia para conferir', (await pg.locator('main.conteudo .previa img').count()) > 0);
  }
  await fecharFolhas(pg);
  /* O ditado direto num campo de texto do sistema. */
  await pg.locator('nav.portas-lateral button', { hasText: 'Agenda' }).first().click();
  await espera(pg, 800);
  await pg.locator('main.conteudo button', { hasText: 'Marcar compromisso' }).first().click();
  await espera(pg, 500);
  const orient = pg.locator('#ori');
  await orient.click();
  await espera(pg, 300);
  await pg.evaluate(() => window.__falas.push('levar o cartão do SUS e o relatório da escola'));
  const mic = pg.getByRole('button', { name: 'Ditar neste campo' });
  cobrar('todo campo de texto longo tem o microfone junto', await mic.isVisible());
  await mic.click();
  await espera(pg, 250);
  cobrar('enquanto dita, o botão vira Parar', await pg.getByRole('button', { name: 'Parar de ditar' }).isVisible());
  await pg.getByRole('button', { name: 'Parar de ditar' }).click();
  await espera(pg, 150);
  cobrar('e o que foi dito entra no campo, com a maiúscula', (await orient.inputValue()) === 'Levar o cartão do SUS e o relatório da escola', await orient.inputValue());
  cobrar('nenhuma exceção no relatório pela voz', erros.length === 0, erros[0]);
  await pg.close();
}

await navegador.close();
writeFileSync(`${SAIDA}/cobertura.json`, JSON.stringify(matriz, null, 2));
console.log('\nA cobertura, cargo por cargo (telas · texto · voz · explicadas · subtelas · formulários):');
for (const [c, l] of Object.entries(matriz)) {
  console.log(`  ${c.padEnd(20)} ${String(l.telas).padStart(3)} · ${l.porTexto} · ${l.porVoz} · ${l.explicadas} · ${l.subtelasAbertas ?? 0}/${l.subtelas ?? 0} · ${l.formulariosAbertos}/${l.formularios}`);
}
console.log(achados.length ? `\n${achados.length} ACHADO(S):\n  ${achados.join('\n  ')}` : '\nA Acolhe+AI alcança todas as telas de todos os cargos, por texto e por voz.');
process.exit(achados.length ? 1 : 0);
