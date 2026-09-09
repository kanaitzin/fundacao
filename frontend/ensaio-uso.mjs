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
    /* `.folha` e `.overlay` são as duas caixas do sistema: a folha que sobe de
     * baixo e o cartão que cobre a tela. Fechar só uma das duas deixava a
     * seguinte clicando por baixo de uma caixa aberta. */
    const b = pg.locator('.overlay button, .folha button')
      .filter({ hasText: /^(Fechar|Cancelar|Entendi)$/ });
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
/*
 * AS AÇÕES QUE LEVAM A OUTRA TELA.
 *
 * A linha do tempo é montada por seis módulos, e quatro deles mandam ação de
 * navegação. Até 09/09/2026 a tela não sabia desenhar nenhuma delas: o evento
 * chegava com "Chamada aberta — 4/12 conferidos" e nada para tocar.
 */
await clicar(/^Tudo$/);
const linhaInteira = await conteudo();
cobrar('a linha do tempo traz a chamada aberta',
  /Chamada aberta/.test(linhaInteira), linhaInteira.slice(0, 120));
for (const [oQue, botao] of [['a chamada', /Abrir chamada/],
                             ['a passagem', /Assinar minha passagem/],
                             ['a ocorrência', /Abrir ocorrência/]]) {
  cobrar(`${oQue} tem botão na linha do tempo`,
    (await pg.locator('main.conteudo li.ev button').filter({ hasText: botao }).count()) > 0,
    'evento que o servidor manda com ação e a tela não desenha é botão que não existe');
}
/* E o botão precisa LEVAR: um que não navega é pior que nenhum. */
await clicar(/Abrir chamada/);
cobrar('e o botão leva mesmo à chamada',
  /Janta|Almoço|Café|conferid/i.test(await conteudo()), (await conteudo()).slice(0, 100));

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

/*
 * A OUTRA LEITURA DAS OITO CASAS.
 *
 * A chave 🌱 no alto é troca de modo — e o teste que importa aqui não é que a
 * tela abre: é que ela NÃO ordena por resultado. Ordenar por conquistas parece
 * mais útil e é um ranking com outro nome.
 */
const chave = pg.locator('header button').filter({ hasText: /🌱/ });
cobrar('o gestor tem a chave do trabalho social no alto', await chave.count() > 0);
if (await chave.count()) {
  await chave.first().click();
  await pg.waitForTimeout(1500);
}
const impacto = await conteudo();
cobrar('a tela mostra o que o acolhimento produziu',
  /conquistas registradas/.test(impacto) && /acolhidos agora/.test(impacto));
cobrar('as casas saem na ordem do cadastro',
  (() => {
    const codigos = [...impacto.matchAll(/\b(AI[1-4]|ARM[1-4]) —/g)].map((m) => m[1]);
    return codigos.length >= 8
      && JSON.stringify(codigos) === JSON.stringify([...codigos].sort());
  })(),
  'ordenar por resultado seria um ranking com outro nome');
cobrar('a tela diz em voz alta que não compara casas',
  /não compara casas/.test(impacto));
cobrar('a lista de quem conquistou é por data, e não por quem tem mais',
  /por data, e não por criança/i.test(impacto));
cobrar('nenhuma exceção no gestor', erros.length === 0, erros[0]);

/* A caixa, seja qual for: a folha que sobe de baixo ou o cartão que cobre. */
const CAIXA = ':is(.folha,.overlay)';

// ============================================ 9. O remédio que só a Enfermagem dá
console.log('\n💊 A exceção do medicamento (fase 72)');
await trocar('enfermagem');
erros.length = 0;
await doMais('Saúde');
cobrar('a Enfermagem tem a aba dos esquemas', await clicar(/^Esquemas$/));
const esquemas = await conteudo();
/* `text-transform: uppercase` de novo: na tela sai "SÓ A ENFERMAGEM
 * ADMINISTRA". Comparar sensível a maiúsculas reprova a tela certa. */
cobrar('a exceção que já existe aparece escrita, com o motivo',
  /Só a Enfermagem administra/i.test(esquemas), esquemas.slice(0, 140));

const marcar = pg.locator('main.conteudo button').filter({ hasText: /^Só a Enfermagem pode dar$/ });
cobrar('há como marcar um esquema como exclusivo', (await marcar.count()) > 0);
if (await marcar.count()) {
  await marcar.first().click();
  await pg.waitForTimeout(800);
  const folha = await corpo();
  cobrar('a folha diz o que a marcação causa às 22h',
    /NÃO poderá confirmar/i.test(folha), folha.slice(0, 120));
  const botaoMarcar = pg.locator(`${CAIXA} button`).filter({ hasText: /^Marcar$/ }).first();
  const motivo = pg.locator(`${CAIXA} textarea`).first();
  await motivo.fill('curto');
  cobrar('motivo curto não marca — quem lê a frase é quem for barrado',
    await botaoMarcar.isDisabled());
  await motivo.fill('Injetável, aplicação subcutânea conforme a consulta de 04/09.');
  await botaoMarcar.click();
  await pg.waitForTimeout(1400);
  await fechar();
  const depoisDeMarcar = await conteudo();
  cobrar('o esquema marcado passa a exibir a exceção na lista',
    (depoisDeMarcar.match(/Só a Enfermagem administra/gi) ?? []).length >= 2,
    'marcou e a lista não mudou');
}

/*
 * E o outro lado, que é o que importa: o EDUCADOR precisa saber disso ANTES da
 * hora. A grade do dia é a única tela de medicação que ele abre — a aba dos
 * esquemas não existe para o cargo dele.
 */
await trocar('educador');
await aba('Dia');
await clicar(/^Tudo$/);
const linhaDoEducador = await conteudo();
cobrar('a dose chega à linha do tempo do educador',
  /Insulina/i.test(linhaDoEducador), linhaDoEducador.slice(0, 160));
cobrar('e ela diz, ali mesmo, que não é com ele',
  /Só a Enfermagem administra/i.test(linhaDoEducador),
  'a dose exclusiva aparecia muda, e a recusa só chegava depois do clique');

/*
 * O CARTÃO DA DOSE, um a um. "Confirmar dose" existir na tela não basta: o que
 * não pode existir é o botão EM CIMA da dose que a pessoa não pode dar.
 *
 * `li.ev` é o cartão da linha do tempo, e é preciso ser exato: um seletor
 * frouxo casa com o `<li>` de fora e pergunta ao pai o que era para se
 * perguntar ao filho — a resposta vem certa por acidente.
 */
const cartao = (texto) => pg.locator('main.conteudo li.ev').filter({ hasText: texto }).first();
const botaoDose = (texto) =>
  cartao(texto).locator('button').filter({ hasText: /Confirmar dose/ }).count();

cobrar('a dose exclusiva não oferece botão a quem não pode dá-la',
  (await botaoDose(/Insulina/)) === 0,
  'botão que o servidor recusa ensina a equipe a duvidar da tela');
cobrar('e o cartão dela diz por quê, ali mesmo',
  /Só a Enfermagem administra/i.test(await cartao(/Insulina/).innerText()));

/*
 * E o EFEITO DA MARCAÇÃO feita há dois passos: o colírio da Lara acabou de
 * virar exclusivo pelas mãos da Enfermagem, e o educador tem de perder o botão
 * dele NESTE turno — sem recarregar nada, sem esperar o dia seguinte.
 */
cobrar('a dose recém-marcada perde o botão para o educador',
  (await botaoDose(/Colírio/)) === 0,
  'a exceção marcada agora só valeria amanhã');

/* E a dose comum continua confirmável — senão o conserto teria calado todas. */
cobrar('a dose comum continua com "Confirmar dose" para o educador',
  (await botaoDose(/Amoxicilina/)) > 0,
  'a linha do tempo é a única tela em que o educador confirma dose');

/* E o quarto clique: a folha da dose abre com o medicamento e a via certos. */
if (await botaoDose(/Amoxicilina/)) {
  await cartao(/Amoxicilina/).locator('button')
    .filter({ hasText: /Confirmar dose/ }).first().click();
  await pg.waitForTimeout(1200);
  const folhaDaDose = await corpo();
  cobrar('a folha da dose abre com o medicamento, a via e o horário',
    /Confirmar dose/.test(folhaDaDose) && /oral/i.test(folhaDaDose),
    folhaDaDose.slice(0, 140));
  cobrar('a folha diz que só confirma quem administrou',
    /só confirma quem administrou/i.test(folhaDaDose));
  await fechar();
}
cobrar('nenhuma exceção no caminho do medicamento', erros.length === 0, erros[0]);

// ====================================================== 10. A escala de plantão
console.log('\n🗓️ A escala de plantão (fase 73)');
await trocar('coordenador');
erros.length = 0;
cobrar('a escala abre em "Mais"', await doMais('escala de plantão'));
const escala = await conteudo();
/* De novo o `text-transform: uppercase`: na tela sai "ESCALA DE PLANTÃO",
 * "DIURNO 7H–19H". Toda cobrança desta tela é insensível a maiúsculas. */
cobrar('a escala abre nos próximos trinta dias', /Escala de plantão/i.test(escala));
cobrar('a escala diz em voz alta o turno que está sem ninguém',
  /sem ninguém|sem escala|ninguém escalado/i.test(escala), escala.slice(0, 160));
cobrar('os dois turnos aparecem com o horário',
  /7h–19h/i.test(escala) && /19h–7h/i.test(escala));

const linhasEscaladas = () =>
  pg.locator('main.conteudo button').filter({ hasText: /^Retirar$/ }).count();
const escalados = await linhasEscaladas();
const escalarAlguem = pg.locator('main.conteudo button').filter({ hasText: /^Escalar alguém$/ });
cobrar('a coordenação pode escalar', (await escalarAlguem.count()) > 0);
if (await escalarAlguem.count()) {
  await escalarAlguem.first().click();
  await pg.waitForTimeout(800);
  const selecao = pg.locator(`${CAIXA} select#esc-quem`);
  const quantos = await selecao.locator('option').count();
  cobrar('a folha traz a equipe da casa para escolher', quantos > 1,
    'lista vazia é o defeito que não quebra nada — e deixa a escala impossível');
  const botaoEscalar = pg.locator(`${CAIXA} button`).filter({ hasText: /^Escalar$/ }).first();
  cobrar('sem escolher ninguém, não escala', await botaoEscalar.isDisabled());
  if (quantos > 1) {
    const valor = await selecao.locator('option').nth(1).getAttribute('value');
    await selecao.selectOption(valor);
    /* 12x36: é o desenho real da casa, e o que torna a tela usável. */
    await pg.locator(`${CAIXA} input[type="checkbox"]`).first().check();
    await pg.waitForTimeout(300);
    await pg.locator(`${CAIXA} select#esc-passo`).selectOption('2');
    await botaoEscalar.click();
    await pg.waitForTimeout(1600);
    await fechar();
    const depois = await linhasEscaladas();
    /* O quarto clique: não basta a folha fechar. A cada 2 dias, em trinta
     * dias, tem de aparecer mais de uma linha nova — senão a repetição
     * escreveu só o primeiro dia e a coordenação monta o mês na mão. */
    cobrar('quem foi escalado aparece no dia', depois > escalados,
      `${escalados} linha(s) antes, ${depois} depois — escalou e a lista não mudou`);
    cobrar('a repetição alcança os dias seguintes', depois >= escalados + 2,
      `a cada 2 dias deveria acrescentar vários dias; acrescentou ${depois - escalados}`);
  }
}

const retirar = pg.locator('main.conteudo button').filter({ hasText: /^Retirar$/ });
if (await retirar.count()) {
  await retirar.first().click();
  await pg.waitForTimeout(800);
  cobrar('retirar diz que a linha não é apagada',
    /não é apagada|fica registrada como retirada/i.test(await corpo()));
  await pg.locator(`${CAIXA} button`).filter({ hasText: /^Retirar$/ }).first().click();
  await pg.waitForTimeout(1400);
  await fechar();
}

await clicar(/Mês passado/);
const mesPassado = await conteudo();
cobrar('o mês passado abre — é o recorte de quem investiga um evento',
  /Escala de plantão/i.test(mesPassado) && mesPassado.length > 200);
cobrar('o que saiu da escala continua legível no passado',
  /Retirados da escala/i.test(mesPassado) || /ninguém escalado/i.test(mesPassado),
  mesPassado.slice(0, 140));

await clicar(/Folha para a parede/);
const folhaDaParede = await corpo();
cobrar('a folha da parede sai com o cabeçalho da casa',
  /Escala|plantão/i.test(folhaDaParede) && folhaDaParede.length > 200);
await fechar();

/* E o educador vê a escala, mas não a monta: ler quem entra amanhã é de todos;
 * decidir quem entra é da coordenação. */
await trocar('educador');
const escalaDoEducador = (await doMais('escala de plantão')) ? await conteudo() : '';
cobrar('o educador também lê a escala', /Escala de plantão/i.test(escalaDoEducador));
cobrar('mas não tem como escalar ninguém',
  !/Escalar alguém/.test(escalaDoEducador),
  'montar a escala é da coordenação');
cobrar('nenhuma exceção na escala', erros.length === 0, erros[0]);

// ====================================================== 11. A passagem com remédio
console.log('\n🌗 A passagem que lê as doses (fase 72)');
await trocar('educador');
erros.length = 0;
await aba('Passagem');
/*
 * O plantão ABERTO, e não o primeiro da lista.
 *
 * O primeiro cartão é o noturno, já fechado e já com a frase escrita por
 * quem assinou antes — nele a cobrança da frase não aparece, e o ensaio
 * passava sem exercitar nada. A regra que interessa mora no turno de agora.
 */
const cartaoAberto = pg.locator('main.conteudo button.chamadacard')
  .filter({ hasText: 'Aberto' }).first();
cobrar('há um plantão aberto para assinar', (await cartaoAberto.count()) > 0);
await cartaoAberto.click();
await pg.waitForTimeout(1200);
const comRemedios = await conteudo();
cobrar('a passagem lista as doses do turno',
  /Os remédios deste turno/i.test(comRemedios), comRemedios.slice(0, 160));
cobrar('a passagem não oferece marcar tudo de uma vez',
  !/marcar todas|confirmar todas/i.test(comRemedios),
  'dose é confirmada por quem a deu, uma a uma');
const exigeFrase = /ficou sem resposta|ficaram sem resposta/.test(comRemedios);
const assinar = pg.locator('main.conteudo button').filter({ hasText: /Assinar/ }).first();
if (exigeFrase && (await assinar.count())) {
  /* A passagem tem DUAS travas, e é preciso soltar a primeira para ver a
     segunda: sem nenhum dos três campos escritos, o botão já estaria travado
     por outro motivo, e o ensaio provaria a trava errada. */
  await pg.locator('main.conteudo textarea#contrib')
    .fill('Turno tranquilo; acompanhei o almoço e a saída para a escola.');
  await pg.waitForTimeout(400);
  cobrar('sem a frase sobre as doses, a passagem não assina',
    await assinar.isDisabled(),
    'a frase é a única coisa que falta, e a tela precisa dizer isso');
  cobrar('e a tela diz que é a frase que falta, e não outra coisa',
    /é a única coisa que falta/i.test(await conteudo()));
  const campo = pg.locator('main.conteudo textarea#medic');
  if (await campo.count()) {
    await campo.fill('A dose das 22h da Alice foi dada pela Joana, que ficou sem confirmar.');
    await pg.waitForTimeout(400);
    cobrar('escrita a frase, a passagem libera a assinatura',
      !(await assinar.isDisabled()));
    /* E ela precisa FICAR: assinar e a frase não aparecer é o quarto clique. */
    await assinar.click();
    await pg.waitForTimeout(1500);
    cobrar('a frase sobre os remédios fica escrita na passagem assinada',
      /dada pela Joana/.test(await conteudo()),
      'assinou e o que ela escreveu sobre as doses não voltou');
  }
  cobrar('a tela diz que escrever ali não confirma dose nenhuma',
    /não confirma dose nenhuma/i.test(comRemedios));
}
cobrar('nenhuma exceção na passagem', erros.length === 0, erros[0]);

// ====================================================== 12. A ATA da próxima equipe
console.log('\n📓 A ATA que a próxima equipe lê (fase 74)');
await trocar('educador');
erros.length = 0;
cobrar('o educador chega à ATA', await doMais('ATA'));
const ataDoEducador = await conteudo();
cobrar('a ATA oferece o turno anterior',
  /Turno anterior/.test(ataDoEducador), ataDoEducador.slice(0, 140));
await clicar(/Turno anterior/);
const anterior = await conteudo();
cobrar('o turno anterior traz o que foi escrito lá',
  anterior.length > 200 && /Turno anterior/.test(anterior), anterior.slice(0, 140));
cobrar('cada linha da ATA sai com o nome de quem escreveu',
  (await pg.locator('main.conteudo article.linha-ata').count()) > 0,
  'ata sem autor é ata de ninguém');
cobrar('o educador NÃO lê a linha restrita',
  !/só coordenação, técnica e líder/i.test(anterior),
  'a linha restrita apareceu inteira para quem não deve lê-la');
const contagem = /Há \d+ observaç(ão|ões) restrita/i.test(anterior);
cobrar('e o educador sabe que existe algo que não é para ele', contagem,
  'esconder sem dizer que escondeu é o que faz a equipe desconfiar do sistema');

/* O líder lê a mesma ATA — e a linha restrita aparece para ele. */
await trocar('lider_diurno');
await doMais('ATA');
await clicar(/Turno anterior/);
const paraOLider = await conteudo();
cobrar('o líder lê a linha restrita que o educador não vê',
  /só coordenação, técnica e líder/i.test(paraOLider)
    && !/Há \d+ observaç(ão|ões) restrita/i.test(paraOLider),
  'o líder precisa ver o conteúdo, e não a contagem');
cobrar('nenhuma exceção na ATA', erros.length === 0, erros[0]);

await navegador.close();
console.log(achados.length
  ? `\n${achados.length} ACHADO(S):\n  ${achados.join('\n  ')}`
  : '\nTodos os cargos completaram o percurso.');
process.exit(achados.length ? 1 : 0);
