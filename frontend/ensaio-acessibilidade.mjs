#!/usr/bin/env node
/**
 * ENSAIO DE ACESSIBILIDADE — a tela lida no corredor, às onze da noite.
 *
 * O projeto escolheu a *Atkinson Hyperlegible* por ser desenhada para leitura
 * difícil, e nunca conferiu o resto: contraste, nome acessível dos botões,
 * rótulo dos campos, tamanho do alvo de toque. São as quatro coisas que
 * decidem se a educadora acerta o botão de primeira segurando uma criança com
 * a outra mão — e nenhuma delas aparece quando quem constrói olha a tela num
 * monitor grande, parado, com luz.
 *
 * Roda o axe-core em CADA tela que CADA cargo alcança, e agrupa o que
 * encontrar por regra, com um exemplo de onde. Contagem por regra, e não por
 * elemento: vinte linhas de uma lista com o mesmo defeito são UM defeito.
 *
 * Regras: WCAG 2.1 A e AA — o que a Fundação precisaria cumprir se alguém
 * perguntasse, e o que qualquer pessoa precisa para ler uma tela cansada.
 *
 * `ENSAIO_A11Y_TOLERADAS` lista regras conhecidas e aceitas, com motivo
 * escrito no código — nunca silenciadas em silêncio.
 *
 * Uso: ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio:acessibilidade
 */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = process.env.ENSAIO_ARQUIVO
  ?? resolve(AQUI, '..', 'prototipo', 'rede-acolher-prototipo.html');
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;

if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error('ENSAIO_CHROMIUM não aponta para um executável. Rode `bash scripts/preparar-ambiente.sh`.');
  process.exit(2);
}

const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/**
 * O que se tolera, e por quê. Uma linha aqui é uma decisão registrada.
 *
 * Vazio por enquanto: a fase 50 preferiu corrigir a listar.
 */
const TOLERADAS = new Map([
  // ['nome-da-regra', 'o motivo, por extenso'],
]);

const achados = new Map();   // regra → { impacto, ajuda, ondes: [] }

const navegador = await chromium.launch({
  executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const pg = await navegador.newPage({ viewport: { width: 420, height: 900 } });

/* A cor da tela mora no topo no monitor e na folha da conta no celular, onde o
 * topo é uma linha só (fase 184). */
async function abrirCor() {
  const conta = pg.getByRole('button', { name: /^Minha conta/ });
  if (await conta.isVisible()) { await conta.click(); await pg.waitForTimeout(300); }
  await pg.getByRole('button', { name: /^Escolher a cor da tela/ }).click();
}
async function fecharCor() {
  /* Abrir a cor fecha a folha da conta: fica uma folha só, com um Fechar só. */
  await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).click();
  await pg.waitForTimeout(200);
}

await pg.goto(`file://${ARQUIVO}`);
await pg.waitForTimeout(900);
/* A entrada abre vazia (fase 188): o atalho do protótipo preenche o Marcelo. */
await pg.getByRole('button', { name: 'Marcelo Barbosa' }).click();
await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
await pg.waitForTimeout(1200);

async function conferir(onde) {
  await pg.evaluate(AXE);
  const r = await pg.evaluate(async () => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  }));
  for (const v of r.violations) {
    if (TOLERADAS.has(v.id)) continue;
    if (!achados.has(v.id)) {
      achados.set(v.id, { impacto: v.impact, ajuda: v.help, ondes: [], exemplo: null });
    }
    const a = achados.get(v.id);
    a.ondes.push(onde);
    if (!a.exemplo) a.exemplo = (v.nodes[0]?.html ?? '').slice(0, 120);
  }
}

const seletor = pg.locator('select.troca-cargo-sel');
const cargos = await seletor.locator('option').evaluateAll((os) =>
  os.map((o) => ({ valor: o.value, rotulo: o.textContent.trim() })));

/*
 * OS TRÊS TEMAS (27/09). Até aqui o ensaio conferia SÓ o claro — o Chromium
 * sem tela abre claro —, e o escuro, que existe desde a fase 50, nunca tinha
 * sido medido. "Confira se tudo fica legível" é nos três, ou não é conferência.
 * `ENSAIO_TEMAS=light` roda um só, para quem está mexendo numa tela.
 */
const TEMAS = (process.env.ENSAIO_TEMAS ?? 'light,dark,contraste,rosa,azul,verde,colorido').split(',').filter(Boolean);
console.log(`Acessibilidade — ${cargos.length} cargos × ${TEMAS.length} temas (${TEMAS.join(', ')})\n`);
let telas = 0;

for (const tema of TEMAS) {
await pg.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
console.log(`— tema ${tema}`);
for (const cargo0 of cargos) {
  const cargo = { ...cargo0, valor: cargo0.valor, rotulo: cargo0.rotulo, tema };
  await seletor.selectOption(cargo.valor);
  await pg.waitForTimeout(900);

  const abas = await pg.locator('nav.tabbar button').allInnerTexts();
  const doTurno = abas.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => !/Mais$/i.test(t));

  for (let i = 0; i < doTurno.length; i++) {
    await pg.locator('nav.tabbar button').nth(i).click();
    await pg.waitForTimeout(700);
    await conferir(`${tema} · ${cargo.valor} · ${doTurno[i]}`); telas++;
  }

  const temMais = await pg.locator('nav.tabbar button', { hasText: 'Mais' }).count();
  if (temMais) {
    await pg.locator('nav.tabbar button', { hasText: 'Mais' }).first().click();
    await pg.waitForTimeout(350);
    /* A folha do "Mais" também é tela: ela é aberta dezenas de vezes por
     * turno, e é onde metade das funções mora. */
    await conferir(`${tema} · ${cargo.valor} · folha "Mais"`); telas++;
    const portas = await pg.locator('.overlay .sheet button.card.row b.ff').allInnerTexts();
    await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).click();
    await pg.waitForTimeout(250);

    for (let i = 0; i < portas.length; i++) {
      await pg.locator('nav.tabbar button', { hasText: 'Mais' }).first().click();
      await pg.waitForTimeout(300);
      await pg.locator('.overlay .sheet button.card.row').nth(i).click();
      await pg.waitForTimeout(800);
      await conferir(`${tema} · ${cargo.valor} · ${portas[i].trim()}`); telas++;
    }
  } else {
    await conferir(`${tema} · ${cargo.valor} · tela única`); telas++;
  }

  const meus = [...achados.values()].filter((a) => a.ondes.some((o) => o.startsWith(`${tema} · ${cargo.valor}`)));
  console.log(`  ${meus.length ? '✗' : '✓'} ${cargo.rotulo}`);
}
/* A folha de entrar de novo quando a sessão termina (fase 168): aparece por
 * cima de qualquer tela, a qualquer cargo, e é lida às pressas. */
await pg.evaluate(() => window.__ensaioVencerSessao());
await seletor.selectOption('coordenador');       // qualquer chamada ao servidor serve
await pg.waitForTimeout(900);
await conferir(`${tema} · folha "Sua sessão terminou"`); telas++;
await pg.locator('#sessao-senha').fill('senha-dev-123');
await pg.getByRole('button', { name: /Entrar e continuar/ }).click();
await pg.waitForTimeout(700);

/* A leitura das ATAs em sequência (fase 174): a folha longa com várias ATAs,
 * lida pela coordenação no arquivo. */
{
  /* O cargo de novo, de verdade: depois da folha da sessão, o seletor mostra a
     coordenação e a identidade volta a ser a do último cargo percorrido. */
  await seletor.selectOption('equipe_tecnica');
  await pg.waitForTimeout(600);
  await seletor.selectOption('coordenador');
  await pg.waitForTimeout(900);
  /* Pelo mesmo caminho do `ensaio:uso`: a aba da barra, ou a porta do "Mais". */
  const naBarra = pg.locator('nav.tabbar button', { hasText: 'ATA' });
  if (await naBarra.count()) await naBarra.first().click();
  else {
    await pg.locator('nav.tabbar button', { hasText: 'Mais' }).first().click();
    await pg.waitForTimeout(350);
    await pg.locator('.overlay .sheet button.card.row', { hasText: 'ATA' }).first().click();
  }
  await pg.waitForTimeout(900);
  await pg.getByRole('tab', { name: /^Arquivo/ }).click();
  await pg.waitForTimeout(700);
  await pg.getByRole('tab', { name: /^Um dia$/ }).click();
  await pg.locator('#arq-data').fill(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
    .format(new Date(Date.now() - 86400000)));
  await pg.waitForTimeout(1000);
  const ler = pg.getByRole('button', { name: /^Ler o dia em sequência$/ }).first();
  if (!(await ler.count())) {
    await pg.screenshot({ path: '/tmp/ensaio-acessibilidade-sequencia.png', fullPage: true });
    throw new Error('A leitura em sequência não apareceu no arquivo da coordenação (foto em /tmp).');
  }
  await ler.click();
  await pg.waitForTimeout(1200);
  await conferir(`${tema} · folha "ATAs do dia em sequência"`); telas++;
  await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).click();
  await pg.waitForTimeout(400);
}

/* A folha de escolher a cor da tela (fase 182): as sete amostras, lidas em
 * cada tema. Só abre e fecha; escolher trocaria o tema no meio da volta. */
/* A folha da conta (fase 184), que no celular guarda o nome, a senha e o Sair. */
await pg.getByRole('button', { name: /^Minha conta/ }).click();
await pg.waitForTimeout(300);
await conferir(`${tema} · folha "Minha conta"`); telas++;
await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).last().click();
await pg.waitForTimeout(200);
await abrirCor();
await pg.waitForTimeout(400);
await conferir(`${tema} · folha "Cor da tela"`); telas++;
await fecharCor();
await pg.waitForTimeout(300);
/* A busca de criança (fase 183), com um nome digitado e a lista à vista. */
await pg.getByRole('button', { name: /^Buscar criança pelo nome$/ }).click();
await pg.waitForTimeout(400);
await pg.locator('#busca-crianca').fill('a');
await pg.waitForTimeout(300);
await conferir(`${tema} · folha "Buscar criança"`); telas++;
await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).click();
await pg.waitForTimeout(300);
/* A ACOLHE+AI (fase 192): o painel aberto, com uma resposta do guia, o link de
 * tela e o cartão de uma proposta à espera de confirmação. */
await pg.getByRole('button', { name: /^Abrir a Acolhe\+AI/ }).click();
await pg.waitForTimeout(400);
for (const pergunta of ['onde vejo as ocorrências?', 'seria bom ter um lembrete na chamada']) {
  await pg.locator('#acolhe-pergunta').fill(pergunta);
  await pg.locator('.acolhe-painel').getByRole('button', { name: 'Enviar' }).click();
  await pg.waitForTimeout(500);
}
await conferir(`${tema} · Acolhe+AI aberta, com proposta`); telas++;
await pg.getByRole('button', { name: 'Minimizar a Acolhe+AI' }).click();
await pg.waitForTimeout(300);
/* O AVISO NESTE COMPUTADOR (fase 191): só existe a partir de 1080 px, na folha
 * da senha. A volta inteira é a 420 px, onde ele se esconde; para medi-lo, a
 * janela se alarga só para esta folha e volta. */
await pg.setViewportSize({ width: 1440, height: 900 });
await pg.waitForTimeout(300);
await pg.getByRole('button', { name: 'Trocar minha senha' }).click();
await pg.waitForTimeout(500);
await conferir(`${tema} · folha da senha com o aviso neste computador (monitor)`); telas++;
await pg.getByRole('button', { name: 'Cancelar' }).click();
await pg.waitForTimeout(300);
await pg.setViewportSize({ width: 420, height: 900 });
await pg.waitForTimeout(300);
}

await navegador.close();

console.log(`\n${telas} telas conferidas.`);
if (!achados.size) {
  console.log('Nenhuma violação de WCAG 2.1 AA.');
  process.exit(0);
}

const ordem = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const lista = [...achados.entries()]
  .sort((a, b) => (ordem[a[1].impacto] ?? 9) - (ordem[b[1].impacto] ?? 9));

console.log(`\n${lista.length} regra(s) violada(s):\n`);
for (const [regra, a] of lista) {
  console.log(`  [${a.impacto}] ${regra} — ${a.ajuda}`);
  console.log(`      em ${a.ondes.length} tela(s): ${[...new Set(a.ondes)].slice(0, 4).join(', ')}`);
  console.log(`      ex.: ${a.exemplo}`);
}
process.exit(1);
