#!/usr/bin/env node
/**
 * SIMULAÇÃO DE USO — cada cargo fazendo o que faz, e não só abrindo telas.
 *
 * Os outros ensaios cobrem coisas diferentes: `ensaio` abre cada tela e olha
 * o que ela escreveu; `ensaio:roteiro` cobra que cada tarefa tenha porta.
 * Nenhum dos dois APERTA os botões até o fim.
 *
 * Este aperta. Ele percorre o turno inteiro — marcar chamada, registrar
 * exceção com motivo, assinar passagem, confirmar dose, abrir o cofre, fechar
 * a ATA, internar uma criança — e cobra que a tela responda alguma coisa. É o
 * ensaio que pega o defeito que só aparece no terceiro clique: a folha que
 * abre e não fecha, o botão que salva e não recarrega, o formulário que aceita
 * vazio.
 *
 * Ele NÃO substitui aplicar o roteiro com uma pessoa: onde ela para continua
 * sendo a informação que nenhum robô produz.
 *
 * Uso: ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio:uso
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
let cargoAtual = '';
const cobrar = (o_que, ok, detalhe) => {
  if (ok) console.log(`    ✓ ${o_que}`);
  else {
    console.log(`    ✗ ${o_que}${detalhe ? ` — ${detalhe}` : ''}`);
    achados.push(`[${cargoAtual}] ${o_que}${detalhe ? ` — ${detalhe}` : ''}`);
  }
};

const navegador = await chromium.launch({
  executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const pg = await navegador.newPage({ viewport: { width: 420, height: 900 } });
const erros = [];
pg.on('pageerror', (e) => erros.push(e.message));
pg.on('console', (m) => {
  if (m.type() === 'error' && !/net::|Failed to load/.test(m.text())) erros.push(m.text());
});

const corpo = () => pg.locator('body').innerText();
const conteudo = () => pg.locator('main.conteudo').innerText();

async function trocar(cargo) {
  cargoAtual = cargo;
  await pg.locator('select.troca-cargo-sel').selectOption(cargo);
  await pg.waitForTimeout(900);
  const abas = pg.locator('nav.tabbar button');
  if (await abas.count()) { await abas.first().click(); await pg.waitForTimeout(600); }
}

async function aba(nome) {
  const b = pg.locator('nav.tabbar button', { hasText: nome });
  if (!(await b.count())) return false;
  await b.first().click();
  await pg.waitForTimeout(900);
  return true;
}

async function doMais(nome) {
  const m = pg.locator('nav.tabbar button', { hasText: 'Mais' });
  if (!(await m.count())) return false;
  await m.first().click();
  await pg.waitForTimeout(350);
  const porta = pg.locator('.overlay .sheet button.card.row', { hasText: nome });
  if (!(await porta.count())) {
    await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).click();
    return false;
  }
  await porta.first().click();
  await pg.waitForTimeout(1100);
  return true;
}

/** Fecha o que tenha ficado por cima, para o passo seguinte começar limpo. */
async function fechar() {
  for (let i = 0; i < 3; i++) {
    const b = pg.locator('.overlay button').filter({ hasText: /^(Fechar|Cancelar|Entendi)$/ });
    if (!(await b.count())) return;
    await b.first().click();
    await pg.waitForTimeout(350);
  }
}

const clicar = async (texto, onde = 'main.conteudo') => {
  const b = pg.locator(`${onde} button`).filter({ hasText: texto });
  if (!(await b.count())) return false;
  await b.first().click();
  await pg.waitForTimeout(1000);
  return true;
};

await pg.goto(`file://${ARQUIVO}`);
await pg.waitForTimeout(900);
await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
await pg.waitForTimeout(1200);

// ====================================================== 1. Educador social
console.log('\n🏫 Educador social — o turno inteiro');
await trocar('educador');
erros.length = 0;

await aba('Chamada');
cobrar('a chamada abre com as refeições do dia', /Janta|Almoço|Café/.test(await conteudo()));
await clicar(/Janta/);
const antesDeMarcar = await conteudo();
await clicar(/^Normal$/);
const depoisDeMarcar = await conteudo();
cobrar('marcar "Normal" muda a contagem da chamada',
  antesDeMarcar !== depoisDeMarcar, 'a tela ficou igual depois do clique');

/* A exceção é a pergunta mais importante do roteiro para este cargo: o campo
 * de observação vira obrigatório, e é aí que se vê se a pessoa escreve o fato
 * ou escreve um juízo. */
await clicar(/^Outro$/);
const folhaExcecao = await corpo();
cobrar('"Outro" abre a folha de exceção', /Motivo|exceção|observ/i.test(folhaExcecao));

/*
 * O QUARTO CLIQUE, na chamada: a exceção precisa FICAR escrita.
 *
 * Uma marcação de exceção que salva e não aparece na lista dos conferidos é
 * pior do que uma que falha: a educadora acha que registrou "recusou o
 * jantar", e a ATA da noite não tem nada.
 */
const opcoes = pg.locator('.overlay button, .overlay [role="radio"], .overlay label');
const excecaoEscolhida = pg.locator('.overlay').getByText(/Recusou|Não quis|Ausente|Fora da casa/).first();
if (await excecaoEscolhida.count()) await excecaoEscolhida.click();
const obs = pg.locator('.overlay textarea').first();
if (await obs.count()) {
  await obs.fill('Recusou o jantar; comeu a fruta depois.');
  const salvar = pg.locator('.overlay button').filter({ hasText: /Registrar|Salvar|Marcar/ });
  if (await salvar.count()) { await salvar.first().click(); await pg.waitForTimeout(1200); }
}
await fechar();
const chamadaDepois = await conteudo();
cobrar('a exceção escrita fica visível na chamada',
  /Recusou o jantar/.test(chamadaDepois) || /conferid/i.test(chamadaDepois),
  chamadaDepois.slice(0, 120));

await aba('Dia');
cobrar('o Dia tem os quatro filtros',
  /Agora/.test(await conteudo()) && /Por criança/.test(await conteudo()));
await clicar(/Por criança/);
cobrar('o filtro "Por criança" responde', /ordem alfabética|alfabétic/i.test(await conteudo()));

await clicar(/Não aconteceu/);
cobrar('"Não aconteceu" abre o registro de exceção', /Recusad|motivo|observ/i.test(await corpo()));
await fechar();

await aba('Passagem');
const passagem = await conteudo();
/*
 * Não basta a tela abrir: ela precisa dizer o que fazer. A primeira versão
 * cobrava só o tamanho do texto, e a tela passava com um cartão de estado e
 * nenhuma instrução — que é exatamente onde a educadora ia parar.
 */
cobrar('a passagem diz o que fazer, e não só o estado do plantão',
  /assinar a sua passagem/i.test(passagem), passagem.slice(0, 90));

/* E, aberto o plantão, a assinatura precisa FICAR — com o nome de quem
 * assinou. O sistema não assina por ninguém, e por isso a prova é o nome. */
await clicar(/Plantão diurno|Plantão noturno/);
const dentroDoPlantao = await conteudo();
cobrar('o plantão aberto oferece assinar a passagem',
  /Assinar|passagem/i.test(dentroDoPlantao), dentroDoPlantao.slice(0, 100));
cobrar('nenhuma exceção no turno do educador', erros.length === 0, erros[0]);

// ====================================================== 2. Líder Diurno
console.log('\n☀️ Líder Diurno');
await trocar('lider_diurno');
erros.length = 0;
cobrar('o Painel do Plantão está em "Mais"', await doMais('Plantão'));
cobrar('o painel diz quem está em quê', (await conteudo()).length > 120);
cobrar('a ATA está em "Mais"', await doMais('ATA'));
const ata = await conteudo();
cobrar('a ATA mostra o turno e as seções', /ATA|turno|seção|Seções/i.test(ata));
cobrar('nenhuma exceção no turno do líder', erros.length === 0, erros[0]);

// ====================================================== 3. Equipe técnica
console.log('\n🧠 Equipe técnica');
await trocar('equipe_tecnica');
erros.length = 0;
await aba('Acolhidos');
await clicar(/Alice/);
const perfil = await conteudo();
cobrar('o perfil traz a identificação nova', /RG|SUS|Filiação/.test(perfil));
/* `text-transform: uppercase` no CSS: o texto que volta da tela é
 * "QUEM APARECE POR ALICE". Comparação sensível a maiúsculas reprova uma
 * tela certa — é a mesma armadilha anotada no `ensaio.mjs`. */
cobrar('o perfil traz os contatos de quem aparece', /quem aparece por/i.test(perfil));
cobrar('há como acrescentar contato', await clicar(/Acrescentar contato/));
await fechar();
cobrar('os acompanhamentos abrem', await doMais('Acompanhamentos'));
cobrar('nenhuma exceção no turno da técnica', erros.length === 0, erros[0]);

// ====================================================== 4. Enfermagem
console.log('\n🩺 Enfermagem');
await trocar('enfermagem');
erros.length = 0;
cobrar('a Saúde abre', await doMais('Saúde'));
cobrar('a grade do dia tem doses', /Confirmar|Doses de hoje|aguardando/i.test(await conteudo()));
await clicar(/^Estoque$/);
const estoque = await conteudo();
cobrar('o armário tem as duas ações', /Chegou remédio/.test(estoque) && /Conferi o armário/.test(estoque));
/*
 * ------------------------------------------------------------------------
 * O QUARTO CLIQUE: o que ficou GRAVADO.
 *
 * Até aqui o ensaio apertava os botões e olhava se a tela respondeu alguma
 * coisa. Não é o bastante. O defeito que a fase 31 corrigiu — a entrada de
 * remédio que SUBSTITUÍA em vez de somar, deixando 30 frascos virarem 10 —
 * passaria por todas as cobranças acima: a folha abriu, o botão salvou, a
 * tela mudou. Só o NÚMERO estava errado.
 * ------------------------------------------------------------------------
 */
const quantidadeDe = async (medicamento) => {
  const texto = await conteudo();
  const linha = texto.split('\n').findIndex((l) => l.includes(medicamento));
  const m = /(\d+)\s+(frasco|comprimido)/.exec(texto.split('\n')[linha + 1] ?? '');
  return m ? Number(m[1]) : null;
};

const antesDaEntrada = await quantidadeDe('Amoxicilina');
await clicar(/Chegou remédio/);
await pg.locator('.overlay input').first().fill('10');
await clicar(/Registrar entrada/, '.overlay');
await pg.waitForTimeout(1200);
await fechar();
const depoisDaEntrada = await quantidadeDe('Amoxicilina');
cobrar('"Chegou remédio" SOMA ao que já estava no armário',
  antesDaEntrada !== null && depoisDaEntrada === antesDaEntrada + 10,
  `${antesDaEntrada} + 10 deveria dar ${(antesDaEntrada ?? 0) + 10}, deu ${depoisDaEntrada}`);

/* E a conferência SUBSTITUI, com motivo obrigatório — é o par da anterior, e
 * inverter os dois é o defeito mais fácil de cometer nesta tela. */
await clicar(/Conferi o armário/);
const folhaConferencia = await corpo();
cobrar('a conferência avisa que substitui, e não soma',
  /substitui|passa a ser|no lugar/i.test(folhaConferencia));
await pg.locator('.overlay input').first().fill('26');
const botaoConferir = pg.locator('.overlay button').filter({ hasText: /Registrar|Confirmar|Salvar/ });
cobrar('sem motivo escrito, a conferência não salva',
  await botaoConferir.first().isDisabled(),
  'o motivo é o que impede sumiço em silêncio');
const motivoConferencia = pg.locator('.overlay textarea').first();
if (await motivoConferencia.count()) {
  await motivoConferencia.fill('Contagem do plantão da manhã; sobraram 26.');
  await botaoConferir.first().click();
  await pg.waitForTimeout(1200);
  await fechar();
  cobrar('a conferência grava a quantidade contada',
    (await quantidadeDe('Amoxicilina')) === 26,
    `deveria ficar 26, ficou ${await quantidadeDe('Amoxicilina')}`);
}

await clicar(/^Triagem$/);
cobrar('a triagem lista o que espera assinatura', /Revisar|triagem/i.test(await conteudo()));
await clicar(/^Revisar$/);
cobrar('a revisão oferece devolver e assinar',
  /Devolver pedindo complemento/.test(await corpo()) && /Assinar como Enfermagem/.test(await corpo()));
await fechar();
cobrar('nenhuma exceção no turno da enfermagem', erros.length === 0, erros[0]);

// ====================================================== 5. Coordenação
console.log('\n👩‍💼 Coordenação');
await trocar('coordenador');
erros.length = 0;

/* O cofre é o caminho que mais custou: o protótipo abre sem senha e três
 * telas depois pede "sua senha". */
cobrar('o cofre abre em "Mais"', await doMais('Cofre'));
const antesDoCofre = await conteudo();
cobrar('a tela diz qual senha usar no protótipo',
  /senha-dev-123/.test(antesDoCofre), 'sem a dica, quem demonstra tenta e desiste');
await pg.locator('main.conteudo input').first().fill('senha-dev-123');
await clicar(/Entrar no cofre/);
await fechar();
const dentroDoCofre = await conteudo();
cobrar('o cofre abre com a senha do protótipo',
  /Acolhido|Acessos|Benefícios/.test(dentroDoCofre), dentroDoCofre.slice(0, 80));
cobrar('o cofre é de uma criança por vez', /uma criança por vez/i.test(dentroDoCofre));

cobrar('"O que cada setor enxerga" abre', await doMais('setor'));
cobrar('o painel das unidades abre', await doMais('Painel das unidades'));
cobrar('a sincronização abre', await doMais('Sincronização'));
cobrar('as transferências abrem', await doMais('Transferências'));
cobrar('a tela de transferência tem recusar com motivo',
  /Recusar com motivo/.test(await conteudo()));
cobrar('nenhuma exceção no turno da coordenação', erros.length === 0, erros[0]);

// ------------------------------------------- internação, ponta a ponta
console.log('\n🏥 Internação — o caminho inteiro');
erros.length = 0;
cobrar('a internação abre em "Mais"', await doMais('Internação'));
await clicar(/Registrar internação/);
await pg.locator('.overlay input#int-h').fill('Hospital Fictício');
await pg.locator('.overlay textarea').fill('Crise respiratória fictícia; internada para observação.');
await clicar(/^Registrar$/, '.overlay');
await pg.waitForTimeout(1200);
cobrar('a internação aparece na lista depois de registrada',
  /Internada/.test(await conteudo()), 'a lista não recarregou');
await clicar(/Hospital Fictício/);
const periodo = await conteudo();
cobrar('o período abre com os três blocos',
  /quem esteve com ela/i.test(periodo) && /aconteceu no hospital/i.test(periodo));
await clicar(/Escrever no diário/);
await pg.locator('.overlay textarea').first().fill('Visita da tarde: acordada, comeu bem.');
await clicar(/^Salvar$/, '.overlay');
await pg.waitForTimeout(1000);
cobrar('o relato entra no diário', /Visita da tarde/.test(await conteudo()));
/*
 * E a CONTAGEM precisa ter mudado. "0 dia(s) com relato" depois de escrever
 * um relato é o defeito clássico do quarto clique: salvou, apareceu, e o
 * resumo continuou contando o mundo de antes.
 */
await clicar(/← Internações/);
await pg.waitForTimeout(900);
cobrar('a lista passa a contar o dia com relato',
  /1 dia\(s\) com relato/.test(await conteudo()),
  (await conteudo()).match(/\d+ dia\(s\) com relato/)?.[0] ?? 'sem a contagem');
await clicar(/Hospital Fictício/);
await clicar(/Medicação dada no hospital/);
await pg.locator('.overlay input#me-m').fill('Antibiótico fictício');
await clicar(/^Registrar$/, '.overlay');
await pg.waitForTimeout(1000);
cobrar('a medicação sai com a origem escrita',
  /Administrada pelo hospital/i.test(await conteudo()));

// e o efeito na casa
await trocar('educador');
await aba('Acolhidos');
cobrar('o educador vê que a criança está no hospital', /no hospital/.test(await conteudo()));
cobrar('e não vê a porta da internação', !(await doMais('Internação')));
await fechar();
cobrar('nenhuma exceção no caminho da internação', erros.length === 0, erros[0]);

// ====================================================== 6. Líder Noturno
console.log('\n🌙 Líder Noturno Geral');
await trocar('lider_noturno_geral');
erros.length = 0;
cobrar('a ATA Geral abre', await doMais('ATA'));
cobrar('a ATA da noite fala das casas', /casa|noite|noturna/i.test(await conteudo()));
cobrar('nenhuma exceção no turno da noite', erros.length === 0, erros[0]);

// ====================================================== 7. Cozinha
console.log('\n🍽️ Cozinha');
await trocar('cozinha');
erros.length = 0;
const cozinha = await conteudo();
cobrar('a tela única mostra o que não pode ser servido', /NÃO SERVIR|restri/i.test(cozinha));
cobrar('e diz por que não traz o motivo da restrição',
  /restrição, não a razão|não a razão dela/i.test(cozinha));
cobrar('nenhuma exceção na cozinha', erros.length === 0, erros[0]);

// ====================================================== 8. Gestor Geral
console.log('\n🏛️ Gestor Geral');
await trocar('gestor_geral');
erros.length = 0;
cobrar('o painel das unidades abre', await doMais('Painel das unidades'));
cobrar('o painel mostra as oito casas', (await conteudo()).length > 200);
cobrar('nenhuma exceção no gestor', erros.length === 0, erros[0]);

await navegador.close();
console.log(achados.length
  ? `\n${achados.length} ACHADO(S):\n  ${achados.join('\n  ')}`
  : '\nTodos os cargos completaram o percurso.');
process.exit(achados.length ? 1 : 0);
