#!/usr/bin/env node
/**
 * ENSAIO DAS FOLHAS EM WORD — ver a folha, e baixar o que se viu.
 *
 * As cinco folhas (ATA, ocorrência, saúde, grade da casa, combinados) saíram
 * do navegador e passaram a nascer no servidor. A tela agora precisa de duas
 * idas ao servidor onde antes montava tudo sozinha, e é isso que este ensaio
 * cobra, num navegador de verdade:
 *
 *   1. o botão da folha abre a pré-visualização, com o timbre e o título;
 *   2. **a finalidade é pedida ANTES do arquivo**, e frase curta demais não
 *      gera nada — a recusa é do servidor, e a tela pergunta antes para ela
 *      não chegar depois de a pessoa achar que baixou;
 *   3. o download acontece de verdade, com nome de arquivo `.docx`;
 *   4. nenhuma exceção na página em nenhum dos cinco caminhos.
 *
 * Uso: ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio:folhas
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
const cobrar = (o_que, ok, detalhe) => {
  if (ok) console.log(`  ✓ ${o_que}`);
  else { console.log(`  ✗ ${o_que}${detalhe ? ` — ${detalhe}` : ''}`); achados.push(o_que); }
};

const navegador = await chromium.launch({
  executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await navegador.newContext({
  viewport: { width: 420, height: 900 }, acceptDownloads: true,
});
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', (e) => erros.push(e.message));

await pg.goto(`file://${ARQUIVO}`);
await pg.waitForTimeout(900);
await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
await pg.waitForTimeout(1200);

/** Abre uma tela do menu "Mais". */
async function abrirDoMais(nome) {
  await pg.locator('nav.tabbar button', { hasText: 'Mais' }).first().click();
  await pg.waitForTimeout(350);
  await pg.locator('.overlay .sheet button.card.row', { hasText: nome }).first().click();
  await pg.waitForTimeout(1200);
}

/**
 * Percorre um documento inteiro: abre a folha, tenta baixar com frase curta,
 * baixa com frase válida.
 */
async function percorrer(nome, abrirFolha) {
  console.log(`\n${nome}`);
  erros.length = 0;
  const abriu = await abrirFolha();
  if (!abriu) { cobrar(`${nome}: o botão da folha existe`, false); return; }

  await pg.waitForTimeout(1400);
  const folha = pg.locator('.sheet').first();
  const texto = await folha.innerText();
  cobrar('a folha abriu com o timbre da Fundação', /PÃO DOS POBRES/i.test(texto));
  cobrar('a folha tem título', texto.trim().length > 200, `${texto.trim().length} caracteres`);

  const baixar = pg.locator('.sheet button').filter({ hasText: /Baixar em Word/ });
  if (!(await baixar.count())) {
    cobrar('o botão de baixar aparece', false, 'sem botão — a folha ficou sem rota de exportação');
    await pg.locator('.sheet button').filter({ hasText: /^Fechar$/ }).first().click();
    return;
  }
  await baixar.first().click();
  await pg.waitForTimeout(600);

  const campo = pg.locator('.overlay .sheet textarea').last();
  cobrar('a finalidade é pedida antes do arquivo', await campo.count() > 0);

  const gerar = pg.locator('.overlay .sheet button').filter({ hasText: /Gerar o documento/ });
  await campo.fill('curta');
  cobrar('frase curta demais não gera nada', await gerar.isDisabled());

  await campo.fill('levar à reunião de equipe desta quinta-feira');
  const baixando = pg.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await gerar.click();
  const arquivo = await baixando;
  cobrar('o arquivo foi gerado e baixado',
    !!arquivo && /\.docx$/.test(await arquivo.suggestedFilename()),
    arquivo ? await arquivo.suggestedFilename() : 'nenhum download');

  await pg.waitForTimeout(700);
  cobrar('a tela diz que a saída ficou registrada',
    /registrada com o seu nome/i.test(await pg.locator('.sheet').first().innerText()));
  cobrar('nenhuma exceção na página', erros.length === 0, erros.join(' | '));

  await pg.locator('.sheet button').filter({ hasText: /^Fechar$/ }).first().click();
  await pg.waitForTimeout(500);
}

const botaoDaFolha = async () => {
  const b = pg.locator('main.conteudo button').filter({ hasText: /Ver em folha|em Word/ });
  if (!(await b.count())) return false;
  await b.first().click();
  return true;
};

await percorrer('ATA do turno', async () => {
  await abrirDoMais('ATA');
  return botaoDaFolha();
});

await percorrer('Ocorrência', async () => {
  await abrirDoMais('Ocorrências');
  /* A folha da ocorrência mora no DETALHE, atrás de "Abrir detalhes": a lista
   * mostra categoria e hora, e o que uma ocorrência diz não fica à mostra na
   * rolagem de quem só passou pela tela. */
  const detalhe = pg.locator('main.conteudo button').filter({ hasText: /Abrir detalhes/ });
  if (await detalhe.count()) { await detalhe.first().click(); await pg.waitForTimeout(1200); }
  return botaoDaFolha();
});

await percorrer('Grade de medicação da casa', async () => {
  await abrirDoMais('Saúde');
  return botaoDaFolha();
});

await percorrer('Combinados da equipe', async () => {
  await abrirDoMais('Combinados');
  return botaoDaFolha();
});

/* A folha da escala é a que vai PREGADA NA PAREDE — o único documento deste
 * sistema que não é lido numa tela. Ela entra no percurso pelo mesmo motivo
 * que as outras: quem confere na tela precisa reconhecer o papel que sai. */
await percorrer('Escala de plantão', async () => {
  await abrirDoMais('escala');
  const b = pg.locator('main.conteudo button').filter({ hasText: /Folha para a parede/ });
  if (!(await b.count())) return false;
  await b.first().click();
  return true;
});

await navegador.close();
console.log(achados.length ? `\n${achados.length} ACHADO(S)` : '\nNenhum achado.');
process.exit(achados.length ? 1 : 0);
