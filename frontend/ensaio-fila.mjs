#!/usr/bin/env node
/**
 * ENSAIO DA FILA OFFLINE — o que acontece quando não há sinal.
 *
 * O ensaio das telas (`ensaio.mjs`) abre cada tela e olha o que ela escreveu.
 * Este vai atrás da outra coisa: o COMPORTAMENTO que só existe fora da tela.
 * Ele usa o botão "sem sinal" do protótipo — que existe justamente para isto
 * poder ser experimentado — e cobra, no navegador de verdade, com IndexedDB
 * de verdade:
 *
 *   1. sem sinal, a marcação da chamada NÃO se perde: ela vai para a fila e o
 *      selo aparece no cabeçalho com a contagem;
 *   2. a operação sobrevive a FECHAR E ABRIR o aplicativo — é o caso real do
 *      celular que reinicia no meio do turno, e é o motivo de a fila ser
 *      IndexedDB e não uma variável;
 *   3. com sinal de volta, a fila sobe e some sozinha;
 *   4. o horário guardado é o do ATO, não o do envio (§17.3);
 *   5. o servidor decide o que pode ser apagado: uma operação que ele NÃO
 *      confirma continua no aparelho. É o §17.2, e é o teste que impede a
 *      volta do defeito mais caro possível — apagar do aparelho um registro
 *      que não existe em lugar nenhum.
 *
 * Uso: ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio:fila
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = process.env.ENSAIO_ARQUIVO
  ?? resolve(AQUI, '..', 'prototipo', 'rede-acolher-prototipo.html');
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;

if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error('ENSAIO_CHROMIUM não aponta para um executável. Rode `bash scripts/preparar-ambiente.sh`.');
  process.exit(2);
}

const achados = [];
const cobrar = (o_que, condicao, detalhe) => {
  if (condicao) console.log(`  ✓ ${o_que}`);
  else { console.log(`  ✗ ${o_que}${detalhe ? ` — ${detalhe}` : ''}`); achados.push(o_que); }
};

/** Lê a fila direto do IndexedDB, sem passar pela tela. */
const lerFila = (pg) => pg.evaluate(() => new Promise((ok) => {
  const req = indexedDB.open('rede-acolher-fila');
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('operacoes')) return ok([]);
    const t = db.transaction('operacoes', 'readonly').objectStore('operacoes').getAll();
    t.onsuccess = () => ok(t.result);
    t.onerror = () => ok([]);
  };
  req.onerror = () => ok([]);
}));

const navegador = await chromium.launch({
  executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
/* Um contexto só, reaproveitado: o IndexedDB precisa sobreviver ao "fechar e
 * abrir o aplicativo", que é metade do que este ensaio verifica. */
const contexto = await navegador.newContext({ viewport: { width: 420, height: 900 } });
const pg = await contexto.newPage();

const entrar = async (p) => {
  await p.goto(`file://${ARQUIVO}`);
  await p.waitForTimeout(900);
  await p.getByRole('button', { name: /Entrar no sistema/i }).click();
  await p.waitForTimeout(1200);
};

const erros = [];
pg.on('pageerror', (e) => erros.push(e.message));

console.log('Ensaio da fila offline\n');
await entrar(pg);

// Educador social: é ele quem marca a chamada no pátio.
await pg.locator('select.troca-cargo-sel').selectOption('educador');
await pg.waitForTimeout(900);

/*
 * A chamada é ABERTA com sinal, e o sinal cai depois — que é o que acontece
 * na casa: a pessoa desce para o refeitório com a tela já carregada. Cortar o
 * sinal antes de abrir testaria outra coisa (a tela sem dados), e não a fila.
 */
await pg.locator('nav.tabbar button', { hasText: 'Chamada' }).click();
await pg.waitForTimeout(1000);
await pg.locator('main.conteudo button').filter({ hasText: /Janta|Almoço|Café/ }).last().click();
await pg.waitForTimeout(1000);

console.log('Sem sinal');
await pg.getByRole('button', { name: /Simular sem sinal/i }).click();
await pg.waitForTimeout(300);

const antesDoAto = new Date().toISOString();
/* "Normal" é o caminho comum de um toque — o que a educadora aperta vinte
 * vezes por refeição. */
await pg.locator('main.conteudo .ev button').filter({ hasText: /^Normal$/ }).first().click();
await pg.waitForTimeout(1500);

let fila = await lerFila(pg);
cobrar('a marcação sem sinal foi guardada no aparelho', fila.length >= 1, `fila com ${fila.length}`);
cobrar('o selo da fila apareceu no cabeçalho',
  await pg.locator('header .iconbtn.fila .badge').count() > 0);

const texto = await pg.locator('main.conteudo').innerText();
cobrar('a tela diz onde a marcação ficou',
  /guardad[ao] neste aparelho|sem internet/i.test(texto), texto.slice(0, 120));

const op = fila[0];
if (op) {
  cobrar('a operação é de um tipo que o servidor sabe aplicar',
    ['check.mark', 'activity.record', 'activity.acknowledge'].includes(op.kind), op.kind);
  cobrar('o horário guardado é o do ato, não o do envio',
    op.happenedAt >= antesDoAto && op.happenedAt <= new Date().toISOString(), op.happenedAt);
  cobrar('a operação nasce pendente', op.status === 'pendente', op.status);
}

console.log('\nFechar e abrir o aplicativo');
/*
 * A leitura acontece ANTES de entrar, de propósito: a fila é ligada na
 * entrada e sobe sozinha em menos de um segundo. Lendo depois, o ensaio
 * mediria a sincronização e diria que a fila não sobreviveu — quando o que
 * aconteceu foi ela ter feito exatamente o seu trabalho.
 */
await pg.goto(`file://${ARQUIVO}`);
await pg.waitForTimeout(900);
fila = await lerFila(pg);
cobrar('a fila sobreviveu ao aplicativo fechar', fila.length >= 1, `fila com ${fila.length}`);

console.log('\nCom o sinal de volta');
/* Entrar liga a fila, que tenta sozinha: é o que acontece quando a pessoa
 * chega na casa e o wi-fi pega. */
await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
await pg.waitForTimeout(2500);
fila = await lerFila(pg);
cobrar('o que o servidor confirmou saiu do aparelho', fila.length === 0, `restaram ${fila.length}`);
cobrar('o selo sumiu quando não há mais nada guardado',
  await pg.locator('header .iconbtn.fila .badge').count() === 0);

console.log('\nO que o servidor NÃO confirma continua aqui');
/*
 * Uma operação de tipo que o servidor não sabe aplicar volta REJEITADA, e
 * `podeLimpar` não a traz. Ela tem de continuar no aparelho, com o motivo —
 * apagá-la seria fazer sumir um registro que não existe em lugar nenhum.
 */
const restou = await pg.evaluate(async () => {
  const db = await new Promise((ok) => {
    const r = indexedDB.open('rede-acolher-fila');
    r.onsuccess = () => ok(r.result);
  });
  const registro = {
    clientOpId: 'ensaio-tipo-desconhecido',
    kind: 'coisa.que.o.servidor.nao.conhece',
    houseId: undefined, payload: {},
    happenedAt: new Date().toISOString(), queuedAt: new Date().toISOString(),
    status: 'pendente', tentativas: 0,
  };
  await new Promise((ok) => {
    const t = db.transaction('operacoes', 'readwrite').objectStore('operacoes').put(registro);
    t.onsuccess = () => ok();
  });
  return true;
});
if (restou) {
  await entrar(pg);              // a entrada liga a fila e ela tenta enviar
  await pg.waitForTimeout(2500);
  const depois = await lerFila(pg);
  const a = depois.find((o) => o.clientOpId === 'ensaio-tipo-desconhecido');
  cobrar('a operação recusada continua no aparelho', !!a, `restaram ${depois.length}`);
  cobrar('e com o motivo do servidor ao lado', !!a?.motivo, a?.motivo ?? 'sem motivo');
  cobrar('marcada como parada, não como pendente', a?.status === 'rejeitada', a?.status);
}

cobrar('nenhuma exceção na página durante o ensaio', erros.length === 0, erros.join(' | '));

await navegador.close();
console.log(achados.length ? `\n${achados.length} ACHADO(S)` : '\nNenhum achado.');
process.exit(achados.length ? 1 : 0);
