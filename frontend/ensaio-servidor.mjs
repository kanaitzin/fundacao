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
import PgLib from 'pg';

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

/*
 * AS ABAS DE DENTRO DE CADA TELA (fase 205; pedido de 12/10: "teste cada menu, cada
 * detalhe"). A porta abria a tela na primeira aba, e as outras (Estoque, Compras,
 * Esquemas, Pedidos, Restrições, Álbum...) nunca eram abertas contra o servidor.
 */
async function abasDeDentro(pg, quem, tela) {
  const nomes = (await pg.locator('main.conteudo [role="tab"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const vistas = [];
  for (const nome of [...new Set(nomes)].slice(0, 8)) {
    const aba = pg.locator('main.conteudo [role="tab"]', { hasText: nome }).first();
    if (!(await aba.isVisible().catch(() => false)) || (await aba.getAttribute('aria-selected')) === 'true') continue;
    await aba.click({ timeout: 5000 }).catch(() => {});
    await pg.waitForTimeout(600);
    await conferir(pg, quem, `${tela} › ${nome}`);
    vistas.push(nome);
  }
  return vistas;
}

async function portas(pg) {
  const coluna = pg.locator('nav.portas-lateral button');
  if (await coluna.first().isVisible().catch(() => false)) {
    return (await coluna.locator('.rotulo').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

let juntosFeito = false;
let juntosOk = false;
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
    /* O 404 que a tela lê como "ainda não preenchido" (fase 218, a primeira vez que
       o ensaio abriu um perfil): a ficha de entrada de cadastro antigo e o motivo
       judicial que ninguém registrou. A tela mostra o que falta preencher. */
    if (r.status() === 404 && /^\/api\/v1\/people\/[0-9a-f-]{36}\/(admission|judicial)$/.test(u.pathname)) return;
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
    for (const a of await abasDeDentro(pg, conta.quem, onde)) telas.push(`${onde} › ${a}`);
  }
  const lista = await portas(pg);
  for (let i = 0; i < lista.length; i++) {
    onde = lista[i];
    await pg.keyboard.press('Escape');
    await pg.locator('nav.portas-lateral button').nth(i).click({ timeout: 8000 }).catch((e) => anota(conta.quem, onde, `não abriu: ${e.message.split('\n')[0]}`));
    await assentar(pg);
    await conferir(pg, conta.quem, onde);
    telas.push(onde);
    for (const a of await abasDeDentro(pg, conta.quem, onde)) telas.push(`${onde} › ${a}`);
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

  /*
   * A ACOLHE+AI E O SISTEMA JUNTOS, GRAVANDO (fase 205; pedido de 12/10: "usando os 2
   * ao mesmo tempo e vendo se ele anota e guarda tudo certinho"). O primeiro
   * educador conta à Acolhe+AI o que aconteceu, leva o rascunho à linha da ATA e
   * aperta Registrar linha; depois deixa uma sugestão. O banco tem de ter as duas
   * coisas, com o nome DELE e na casa dele: quem escreve é a pessoa, nunca a assistente.
   */
  if (/\(educador\)/.test(conta.quem) && !juntosFeito) {
    juntosFeito = true;
    onde = 'Acolhe+AI e ATA, gravando';
    const marca = `R${Date.now().toString().slice(-6)}`;
    const relato = `a ronda da meia-noite foi tranquila, todos dormindo, conferido ${marca}`;
    await pg.keyboard.press('Escape');
    const ata = pg.locator('nav.portas-lateral button', { hasText: /^\s*ATA\s*$/ }).first();
    if (await ata.isVisible().catch(() => false)) await ata.click(); else await pg.locator('nav.tabbar button', { hasText: 'ATA' }).first().click().catch(() => {});
    await pg.waitForTimeout(1200);
    /* Sem plantão aberto não há ATA: a educadora abre o plantão na Passagem, como faria ao chegar. */
    if (!(await pg.locator('#linha-ata').count())) {
      /* A Passagem é uma das abas de cima, e não uma porta da coluna. */
      await pg.locator('nav.tabbar button, nav.portas-lateral button', { hasText: /^\s*Passagem\s*$/ }).first().click().catch(() => {});
      await pg.waitForTimeout(1000);
      const abrirPlantao = pg.getByRole('button', { name: /^Abrir o plantão/ }).first();
      await abrirPlantao.click({ timeout: 8000 }).catch(() => {});
      await pg.waitForTimeout(1500);
      await pg.locator('nav.tabbar button, nav.portas-lateral button', { hasText: /^\s*ATA\s*$/ }).first().click().catch(() => {});
      await pg.waitForTimeout(1200);
    }
    const temLinha = await pg.locator('#linha-ata').count();
    const painel = pg.locator('.acolhe-painel');
    if (!(await painel.isVisible().catch(() => false))) await pg.getByRole('button', { name: /^Abrir a Acolhe\+AI/ }).click().catch(() => {});
    await pg.waitForTimeout(500);
    await pg.locator('#acolhe-pergunta').fill(`preciso registrar que ${relato}`);
    await painel.getByRole('button', { name: 'Enviar' }).click();
    await pg.waitForTimeout(1500);
    const cartao = painel.locator('.acolhe-rascunho').last();
    if (!(await cartao.isVisible().catch(() => false))) anota(conta.quem, onde, 'a Acolhe+AI não montou o rascunho do relato');
    else if (!temLinha) {
      await mkdir(join(SAIDA, 'acolhe-gravando'), { recursive: true });
      await pg.screenshot({ path: join(SAIDA, 'acolhe-gravando', 'ata-sem-linha.png'), fullPage: true });
      anota(conta.quem, onde, `a ATA do turno aberta não tem a caixa Escrever uma linha (a tela diz: ${(await pg.locator('main.conteudo').innerText()).replace(/\s+/g, ' ').slice(0, 160)})`);
    }
    else {
      await cartao.getByRole('button', { name: 'Está bom' }).click();
      await pg.waitForTimeout(300);
      await cartao.getByRole('button', { name: /^Levar para a tela/ }).click();
      await pg.waitForTimeout(1500);
      const licenca = painel.getByRole('button', { name: 'Pode mexer' });
      if (await licenca.isVisible().catch(() => false)) { await licenca.click(); await pg.waitForTimeout(2500); }
      const escrito = await pg.locator('#linha-ata').inputValue().catch(() => '');
      if (!escrito.includes(marca)) anota(conta.quem, onde, `o rascunho não chegou à linha da ATA (a caixa tem: ${escrito.slice(0, 80)})`);
      else if (await pg.locator('main.conteudo [role="dialog"]').count()) anota(conta.quem, onde, 'o rascunho abriu um formulário por cima da ATA, em vez da linha do turno');
      else {
        await pg.getByRole('button', { name: 'Minimizar a Acolhe+AI' }).click().catch(() => {});
        await pg.locator('main.conteudo button', { hasText: 'Registrar linha' }).first().click();
        await pg.waitForTimeout(1500);
        if (!(await pg.locator('main.conteudo').innerText()).includes(marca)) anota(conta.quem, onde, 'a linha registrada não aparece na ATA');
        const db = new PgLib.Client({ connectionString: process.env.DATABASE_URL });
        await db.connect();
        const { rows } = await db.query(`SELECT u.email, u.role, h.code FROM ata_note n JOIN app_user u ON u.id = n.author_id
                                          JOIN house h ON h.id = n.house_id WHERE n.body LIKE $1`, [`%${marca}%`]);
        if (rows.length !== 1) anota(conta.quem, onde, `o banco tem ${rows.length} linha(s) com o relato, esperava uma`);
        else if (rows[0].email !== conta.email) anota(conta.quem, onde, `a linha ficou com o nome de outra pessoa: ${rows[0].email}`);
        /* E a sugestão, pela conversa, com o nome dela. */
        /* Minimizada, ela fica no botão ou na faixa com Ver a conversa. */
        if (!(await painel.isVisible().catch(() => false))) {
          const faixa = pg.locator('.acolhe-faixa').getByRole('button', { name: 'Ver a conversa' });
          if (await faixa.isVisible().catch(() => false)) await faixa.click();
          else await pg.getByRole('button', { name: /^Abrir a Acolhe\+AI/ }).click().catch(() => {});
        }
        await pg.waitForTimeout(400);
        await pg.locator('#acolhe-pergunta').fill(`seria bom a ATA lembrar a ronda das 3h, sugestão ${marca}`);
        await painel.getByRole('button', { name: 'Enviar' }).click();
        await pg.waitForTimeout(1200);
        await painel.locator('.acolhe-proposta').last().getByRole('button', { name: 'Confirmar' }).click().catch(() => {});
        await pg.waitForTimeout(1500);
        const s2 = await db.query(`SELECT u.email, s.house_id IS NOT NULL AS com_casa FROM assistant_suggestion s
                                     JOIN app_user u ON u.id = s.author_id WHERE s.body LIKE $1`, [`%${marca}%`]);
        if (s2.rows.length !== 1) anota(conta.quem, onde, `o banco tem ${s2.rows.length} sugestão(ões) com a marca, esperava uma`);
        else if (s2.rows[0].email !== conta.email || !s2.rows[0].com_casa) anota(conta.quem, onde, `a sugestão ficou sem o autor certo ou sem a casa: ${JSON.stringify(s2.rows[0])}`);
        const lic = await db.query(`SELECT count(*)::int AS n FROM audit_event a JOIN app_user u ON u.id = a.actor_id
                                     WHERE a.action = 'assistente.licenca' AND u.email = $1`, [conta.email]);
        if (!lic.rows[0].n) anota(conta.quem, onde, 'a licença dada à Acolhe+AI não ficou na auditoria');
        await db.end();
        juntosOk = !achados.some((a) => a.quem === conta.quem && a.tela === onde);
      }
    }
    await pg.getByRole('button', { name: 'Minimizar a Acolhe+AI' }).click().catch(() => {});
    telas.push(onde);
  }

  /* O CALENDÁRIO DOS PLANTÕES (fase 206), contra o livro de verdade: o mês em
     grade, e o turno tocado abre o plantão daquele dia. */
  onde = 'calendário dos plantões';
  const aPassagem = pg.locator('nav.tabbar button, nav.portas-lateral button', { hasText: 'Passagem' });
  if (await aPassagem.count()) {
    await aPassagem.first().click();
    await pg.waitForTimeout(1500);
    const cal = pg.locator('.calendario');
    if (!(await cal.count())) anota(conta.quem, onde, 'a Passagem não mostra o calendário');
    else {
      const erroCal = await cal.locator('[role="alert"]').count();
      if (erroCal) anota(conta.quem, onde, `o calendário abriu com erro: ${await cal.locator('[role="alert"]').innerText()}`);
      let turnos = cal.locator('button.cal-turno');
      if (!(await turnos.count())) {
        await cal.getByRole('button', { name: 'Mês anterior' }).click();
        await pg.waitForTimeout(1200);
        turnos = cal.locator('button.cal-turno');
      }
      /* Quem não tem casa de trabalho abre a primeira casa da lista, e a simulação só
         vive a dela: aqui a cobrança é a tela DIZER qual casa está aberta (fase 213). */
      const semCasa = /\((lider_noturno_geral|enfermagem|gestor_geral)\)$|^geral /.test(conta.quem);
      if (semCasa) {
        const aviso = pg.locator('.casa-aberta');
        if (!(await aviso.count()) || !/Você está na \S+ · /.test(await aviso.innerText())) {
          anota(conta.quem, onde, 'quem não tem casa de trabalho abre a Passagem sem saber de qual casa');
        }
      } else if (!(await turnos.count())) anota(conta.quem, onde, 'nem este mês nem o anterior têm turno no calendário');
      else if (await turnos.count()) {
        await turnos.first().click();
        await pg.waitForTimeout(1500);
        const t = await pg.locator('main.conteudo').innerText();
        if (!/\d{2}\/\d{2}\/\d{4}/.test(t) || !/Plantão (diurno|noturno)/.test(t)) {
          anota(conta.quem, onde, `o turno tocado não abriu o plantão daquele dia (a tela diz: ${t.replace(/\s+/g, ' ').slice(0, 160)})`);
        }
        await pg.getByRole('button', { name: '← Plantões' }).click().catch(() => {});
        await pg.waitForTimeout(600);
      }
    }
    telas.push(onde);
  }

  /* AS CHAMADAS DA CASA (fase 211), contra o servidor: quem define cria uma pela
     folha com a paleta, confere no BANCO que ela nasceu na casa com a cor, abre a
     chamada com um toque e tira da lista; quem não define não vê o botão. */
  onde = 'chamadas da casa';
  const aChamada = pg.locator('nav.tabbar button, nav.portas-lateral button', { hasText: /^Chamada/ });
  if (await aChamada.count()) {
    await aChamada.first().click();
    await pg.waitForTimeout(1500);
    const nova = pg.getByRole('button', { name: 'Nova chamada da casa' });
    const define = /\((coordenador|equipe_tecnica|lider_diurno)\)$/.test(conta.quem) && !/^geral /.test(conta.quem);
    if (await nova.count()) {
      const titulo = `Roda de leitura ${emArquivo(conta.quem).slice(0, 12)}`;
      await nova.click();
      await pg.waitForTimeout(500);
      const folha = pg.locator('.overlay');
      await folha.getByRole('button', { name: 'Lazer ou atividade' }).click();
      await folha.locator('#mc-titulo').fill(titulo);
      await folha.locator('#mc-hora').fill('16:30');
      await folha.locator('#mc-pessoas').fill('12');
      await folha.getByRole('button', { name: 'Jade', exact: true }).click();
      await folha.getByRole('button', { name: 'Criar a chamada' }).click();
      await pg.waitForTimeout(1500);
      if (await folha.count()) anota(conta.quem, onde, `a folha não fechou: ${(await folha.innerText()).replace(/\s+/g, ' ').slice(0, 160)}`);
      const db = new PgLib.Client({ connectionString: process.env.DATABASE_URL });
      await db.connect();
      const { rows } = await db.query(
        `SELECT m.id, h.code, m.color, m.at_time::text AS hora, m.people_count FROM house_check_model m
           JOIN house h ON h.id = m.house_id WHERE m.title = $1 AND m.ended_at IS NULL`, [titulo]);
      if (rows.length !== 1 || rows[0].color !== 'jade' || rows[0].hora !== '16:30:00' || rows[0].people_count !== 12) {
        anota(conta.quem, onde, `a chamada criada pela tela não está no banco como devia: ${JSON.stringify(rows)}`);
      }
      const cartao = pg.locator('.chamada-da-casa button.chamadacard', { hasText: titulo });
      if (!(await cartao.count())) anota(conta.quem, onde, 'a chamada criada não aparece na lista da casa');
      else {
        await cartao.first().click();
        await pg.waitForTimeout(1500);
        const t = await pg.locator('main.conteudo').innerText();
        if (!t.includes(titulo) || !/Aberta por/.test(t)) {
          anota(conta.quem, onde, `o toque não abriu a chamada (a tela diz: ${t.replace(/\s+/g, ' ').slice(0, 160)})`);
        }
        await pg.getByRole('button', { name: /← Chamadas/ }).click().catch(() => {});
        await pg.waitForTimeout(800);
        await pg.getByRole('button', { name: `Mudar a chamada ${titulo}` }).click();
        await pg.waitForTimeout(500);
        await folha.getByRole('button', { name: /Tirar esta chamada/ }).click();
        await folha.getByRole('button', { name: 'Tirar da lista' }).click();
        await pg.waitForTimeout(1200);
        const fim = await db.query(`SELECT ended_at IS NOT NULL AS saiu FROM house_check_model WHERE title = $1`, [titulo]);
        if (!fim.rows.every((r) => r.saiu)) anota(conta.quem, onde, 'tirar da lista não encerrou a chamada no banco');
      }
      await db.end();
    } else if (define) {
      anota(conta.quem, onde, 'quem define as chamadas da casa não vê o botão Nova chamada da casa');
    }
    telas.push(onde);
  }

  /* OS ARQUIVOS NO PERFIL (fases 216 a 218), contra o servidor: a técnica abre a
     área restrita e vê os documentos dela; anexa o laudo a uma alergia ou
     restrição, se a criança tiver uma; e registra um atendimento com um arquivo,
     conferido no BANCO com o autor. */
  if (/\(equipe_tecnica\)$/.test(conta.quem)) {
    onde = 'perfil: arquivos';
    await pg.keyboard.press('Escape');
    const acolhidos = pg.getByRole('button', { name: /^Acolhidos/ }).filter({ visible: true });
    if (await acolhidos.count()) {
      await acolhidos.first().click();
      await pg.waitForTimeout(1500);
      const cartao = pg.locator('.pessoa-cartao').first();
      if (!(await cartao.count())) anota(conta.quem, onde, 'a lista dos acolhidos veio vazia');
      else {
        await cartao.click();
        await pg.waitForTimeout(1800);
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const db = new PgLib.Client({ connectionString: process.env.DATABASE_URL });
        await db.connect();

        await pg.getByRole('tab', { name: /Judiciário/ }).click().catch(() => {});
        await pg.waitForTimeout(800);
        const abrirArea = pg.getByRole('button', { name: 'Abrir a área restrita' });
        if (await abrirArea.count()) {
          await abrirArea.click();
          await pg.waitForTimeout(1500);
          if (!(await pg.locator('section.documentos-da-categoria').count())) {
            anota(conta.quem, onde, 'a área restrita aberta não mostra os documentos dela');
          }
        }

        await pg.getByRole('tab', { name: /Saúde/ }).click().catch(() => {});
        await pg.waitForTimeout(1000);
        const anexarLaudo = pg.locator('#perfil-saude').getByRole('button', { name: /^Anexar laudo ou receita de / });
        if (await anexarLaudo.count()) {
          await anexarLaudo.first().click();
          await pg.waitForTimeout(800);
          await pg.locator('#anx-arq-arquivo').setInputFiles({ name: 'laudo.png', mimeType: 'image/png', buffer: png });
          await pg.waitForTimeout(700);
          await pg.locator('.overlay').getByRole('button', { name: /^Anexar$/ }).last().click();
          await pg.waitForTimeout(1500);
          const { rows } = await db.query(
            `SELECT count(*)::int AS n FROM document WHERE category = 'saude'
               AND (health_condition_id IS NOT NULL OR food_restriction_id IS NOT NULL)
               AND created_by = (SELECT id FROM app_user WHERE email = $1)`,
            [conta.email]);
          if (!rows[0].n) anota(conta.quem, onde, 'o laudo anexado à alergia ou restrição não chegou ao banco ligado ao registro');
        }

        await pg.getByRole('tab', { name: /Atendimentos/ }).click().catch(() => {});
        await pg.waitForTimeout(1200);
        const registrar = pg.getByRole('button', { name: 'Registrar atendimento da equipe técnica' });
        if (!(await registrar.count())) anota(conta.quem, onde, 'a técnica não vê o botão de registrar atendimento');
        else {
          // Único por rodada: o SIM_SO_NAVEGADOR repete o ensaio sobre o mesmo banco.
          const relato = `Atendimento de psicopedagogia da simulação, ${emArquivo(conta.quem).slice(0, 16)}, ${Date.now()}.`;
          await registrar.click();
          await pg.waitForTimeout(600);
          const folha = pg.locator('.overlay');
          await folha.getByRole('button', { name: 'Psicopedagogia' }).click();
          await folha.locator('#at-relato').fill(relato);
          await pg.locator('#at-arq-arquivo').setInputFiles({ name: 'atividade.png', mimeType: 'image/png', buffer: png });
          await pg.waitForTimeout(700);
          /* Desde a 233 o arquivo escolhido já entra na lista da mensagem. */
          await folha.getByRole('button', { name: 'Registrar o atendimento' }).click();
          await pg.waitForTimeout(1800);
          const { rows } = await db.query(
            `SELECT s.area, (SELECT count(*)::int FROM technical_session_attachment a WHERE a.session_id = s.id) AS arquivos,
                    u.email FROM technical_session s JOIN app_user u ON u.id = s.created_by WHERE s.summary = $1`, [relato]);
          if (rows.length !== 1 || rows[0].area !== 'psicopedagogia' || rows[0].arquivos !== 1 || rows[0].email !== conta.email) {
            anota(conta.quem, onde, `o atendimento registrado pela tela não está no banco como devia: ${JSON.stringify(rows)}`);
          }
          const bloco = await pg.locator('section.atendimentos-tecnicos').innerText().catch(() => '');
          if (!bloco.includes(relato)) anota(conta.quem, onde, 'o atendimento registrado não aparece no perfil');
        }
        await db.end();
      }
      telas.push(onde);
    } else {
      anota(conta.quem, onde, 'a técnica não acha a porta dos Acolhidos');
    }
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
    /* O 404 que a tela lê como "ainda não preenchido" (fase 218, a primeira vez que
       o ensaio abriu um perfil): a ficha de entrada de cadastro antigo e o motivo
       judicial que ninguém registrou. A tela mostra o que falta preencher. */
    if (r.status() === 404 && /^\/api\/v1\/people\/[0-9a-f-]{36}\/(admission|judicial)$/.test(u.pathname)) return;
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

if (!juntosFeito) anota('Acolhe+AI e sistema', 'gravando', 'nenhuma conta de educador para o ensaio de gravar pela Acolhe+AI');
else console.log(`${juntosOk ? '✓' : '✗'} ${'Acolhe+AI e o sistema'.padEnd(22)} rascunho na linha da ATA e sugestão, gravados com o autor`);
await navegador.close();
await mkdir(SAIDA, { recursive: true });
await writeFile(join(SAIDA, 'achados.json'), JSON.stringify(achados, null, 2));
console.log(`\n${((Date.now() - inicio) / 1000).toFixed(1)}s · fotos em ${SAIDA}`);
if (!achados.length) { console.log('Nenhum achado.'); process.exit(0); }
console.log(`\n${achados.length} ACHADO(S):`);
for (const a of achados) console.log(`  [${a.quem} · ${a.tela}] ${a.o_que}`);
process.exit(1);
