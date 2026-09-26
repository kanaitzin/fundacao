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

/*
 * QUEM ABRIU E QUEM FECHOU (fase 113).
 *
 * `created_by` e `confirmed_by` eram gravados desde a migração 0120 e nunca
 * lidos: a tela dizia "Chamada confirmada" e mais nada. Confirmar é alguém
 * afirmando que olhou todas as crianças da casa — num sistema em que cada
 * marcação tem nome por regra, era a única assinatura sem dono.
 */
cobrar('a chamada aberta diz quem a abriu',
  /Aberta por/i.test(chamadaDepois), chamadaDepois.slice(0, 160));

await clicar(/← Chamadas/);
await clicar(/Café da manhã/);
const cafe = await conteudo();
cobrar('e a chamada confirmada diz quem a fechou, e a que horas',
  /Chamada confirmada por .+ às \d{2}:\d{2}/.test(cafe), cafe.slice(0, 200));
cobrar('o fecho não é a mesma pessoa que abriu — são dois atos',
  /Aberta por Educadora/.test(cafe) && /confirmada por Líder/.test(cafe),
  cafe.slice(0, 200));
await clicar(/← Chamadas/);

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
/*
 * E O EDUCADOR FOLHEIA OS DIAS ANTERIORES (1510).
 *
 * A Fundação pediu em 22/09: *"cada educador pode ver uma ata unificada da
 * passagem dos dias anteriores para poder controlar e ajustar se necessário o
 * comportamento ou a dinâmica da casa"*. O turno anterior ele já lia; a janela de
 * vários dias — a que responde "desde quando?" — não era dele.
 *
 * E a outra metade, que é a que eu podia ter errado sem ninguém ver: a ATA Geral
 * Noturna continua FORA, porque a §10.2 é pergunta da Fundação. A tela tem de
 * DIZER isso, e não apenas omitir — quem não encontra a Geral e não lê a frase
 * conclui que o sistema não a tem.
 */
if ((await aba('ATA')) || (await doMais('ATA'))) {
  await pg.waitForTimeout(900);
  const temArquivo = await pg.locator('[role="tab"]', { hasText: /Arquivo/ }).count();
  cobrar('o educador tem a aba do Arquivo das ATAS', temArquivo > 0,
    'era a lista de cargos de app_consulta_arquivo_ata que o barrava');
  if (temArquivo) {
    await clicar(/Arquivo/);
    await pg.waitForTimeout(1200);
    const arq = await conteudo();
    cobrar('e a janela de vários dias abre para ele',
      /semana|mês|Arquivo/i.test(arq), arq.slice(0, 90));
    cobrar('a tela diz que a ATA Geral Noturna não é dele — e de quem é',
      /não aparece aqui/i.test(arq) || /coordenação, a equipe técnica e os líderes/i.test(arq),
      'omitir sem dizer faz o educador concluir que o sistema não tem a ATA Geral');
  }
  await clicar(/ATA Geral Noturna/);
  await pg.waitForTimeout(700);
  /*
   * ESTA COBRANÇA MUDOU DE LADO NA FASE 145, um dia depois de eu a escrever.
   *
   * Na 1510 a frase da aba mandava "use o Arquivo" e isso era uma MENTIRA para o
   * educador: o Arquivo não mostrava a Geral para ele. A 1540 fez a Geral aparecer
   * lá — *"todos leem a ata coletiva, seja manhã ou noite"* —, e a frase voltou a
   * ser verdadeira. É a lição transversal do repositório em dois dias seguidos:
   * quem muda a regra reescreve a frase, e a cobrança junto.
   */
  cobrar('a aba da Geral manda ao Arquivo — e agora a Geral está lá para ele',
    /use o Arquivo/i.test(await conteudo()),
    'a 1540 fez a linha desta casa na Geral aparecer no Arquivo para todo cargo da casa');
  await aba('Passagem');
}

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
/*
 * O QUE O CADASTRO PEDE CHEGA AO PERFIL (fase 116).
 *
 * Cinco campos — gênero, raça/cor autodeclarada, naturalidade, NIS e registro
 * civil — eram pedidos na tela de cadastro, gravados pelo banco, e lidos por
 * NENHUM `SELECT`. E a ficha de entrada (`admission_record`) tinha rota desde
 * a migração 0480 e nenhuma tela a chamava: quem trouxe a criança, de onde ela
 * veio, se tem irmãos acolhidos, como ela chegou — tudo isso só reaparecia
 * dentro de um relatório, se alguém o gerasse.
 */
cobrar('e a identificação complementar, que o cadastro pedia e ninguém lia',
  /natural de|NIS|Registro civil/i.test(perfil),
  'raça/cor autodeclarada e NIS são o que o relatório de política pública precisa');
/*
 * O QUE ACONTECEU COM ELA, E QUE NÃO CHEGAVA AQUI (fase 118).
 *
 * Três informações eram gravadas com o id dela e lidas só de fora: a
 * convivência familiar (aberta DAQUI desde a fase 89 e lida só na lista da
 * casa), a internação (lida pela casa) e o ofício a órgão externo, cujo
 * `person_id` existia desde a migração 0320 e que **nenhuma consulta lia**.
 */
cobrar('o perfil traz as idas para a família, e como ela voltou de cada uma',
  /Convivência familiar/i.test(perfil),
  'a convivência era aberta DAQUI e lida só na lista de quem está fora agora');
/*
 * O RELATO DA CONVIVÊNCIA (fase 122) — *"tudo ficando no perfil do jovem"*.
 *
 * A Fundação tirou o prazo de propósito: *"dessa forma não haverá uma pressão
 * para arrancar a informação da criança."* As cobranças abaixo são essa frase
 * na tela — a porta aberta, os dois relatos da MESMA ida, e nenhum contador.
 */
cobrar('o perfil traz os relatos da ida, e mais de um da mesma ida',
  /não queria falar agora/i.test(perfil) && /por conta própria/i.test(perfil),
  'o que ela contou na terça não substitui o que se observou no domingo: soma');
cobrar('a porta continua aberta numa ida de semanas atrás',
  /Registrar o que ela contou/i.test(perfil),
  'uma ida de setembro aceita um relato em março, e é esse o que mais importa');
cobrar('e NENHUM contador de relatos, nem "sem relato há tantos dias"',
  !/\b\d+\s*relatos?\b/i.test(perfil) && !/sem relato h[áa]/i.test(perfil),
  'um número aqui é a cobrança voltando pela porta dos fundos');
cobrar('o perfil traz as internações — inclusive as encerradas',
  /Internações hospitalares/i.test(perfil),
  'uma internação encerrada some da tela da casa e fica na vida da criança');
cobrar('e os ofícios a órgãos externos SOBRE ela',
  /Comunicações a órgãos externos/i.test(perfil),
  'um ofício ao Judiciário sobre a Alice não aparecia em lugar nenhum da vida da Alice');
cobrar('o perfil diz COMO ELA CHEGOU',
  /como ela chegou/i.test(perfil),
  'a ficha de entrada tinha rota desde a 0480 e nenhuma tela a chamava');
cobrar('e a ficha traz quem a trouxe e os irmãos acolhidos',
  /quem trouxe/i.test(perfil) && /irmãos/i.test(perfil),
  'a educadora do primeiro plantão precisa saber que ela tem uma irmã na Casa 01');
/* `text-transform: uppercase` no CSS: o texto que volta da tela é
 * "QUEM APARECE POR ALICE". Comparação sensível a maiúsculas reprova uma
 * tela certa — é a mesma armadilha anotada no `ensaio.mjs`. */
cobrar('o perfil traz os contatos de quem aparece', /quem aparece por/i.test(perfil));
/* A PRESENÇA, NA VIDA DELA (fase 110). O registro de cada criança ficava
   DENTRO da chamada; o provedor da linha do tempo dizia, num comentário, que
   "o registro dele está no perfil" — e não estava. A cobrança é pelo CONTEÚDO:
   a exceção com a frase escrita, e a correção com quem corrigiu. */
cobrar('o perfil traz a presença nas chamadas',
  /Presença nas chamadas/i.test(perfil),
  'era preciso abrir a chamada daquele almoço para saber se ela esteve');
cobrar('e a exceção vem com o FATO escrito, não só com o rótulo',
  /comeu a fruta depois|recusou o jantar/i.test(perfil),
  '"recusou" sozinho é um rótulo que atravessa meses (§8.14)');
cobrar('a correção de uma chamada aparece, com quem corrigiu',
  /Antes constava/i.test(perfil),
  'o histórico era guardado por gatilho desde a fase 67 e não era lido por nada');
/* O PRONTUÁRIO DE EDUCAÇÃO (fase 111): as tabelas existiam desde a 0530 e o
   relatório as lia — nenhuma rota as escrevia. */
cobrar('o perfil traz a educação',
  /Sala de recursos|Apoio educacional|Educação/i.test(perfil),
  'o relatório leria "não há" sobre escola e profissionalização para sempre');
cobrar('e a evolução educacional, com quem escreveu',
  /Evolução educacional/i.test(perfil) && /ciências|sala de recursos/i.test(perfil));
cobrar('há por onde escrever uma evolução — inclusive para o educador',
  (await pg.locator('main.conteudo button')
     .filter({ hasText: /Escrever uma evolução/ }).count()) > 0,
  'o único INSERT do repositório estava dentro de um teste');

/*
 * O CONCEITO DO BIMESTRE (fase 137) — decisão de 20 e 21/09.
 *
 * Este bloco roda como EQUIPE TÉCNICA, que é um dos três cargos que digitam. O
 * que ele cobra, além de a tela existir: que o conceito **nunca apareça sozinho**
 * (o motivo vem ao lado, sempre), e que a versão corrigida continue legível — as
 * duas coisas são o que separa "conceito do bimestre" de "nota colada no nome da
 * criança".
 */
cobrar('o perfil traz o conceito por bimestre',
  /Conceito por bimestre/i.test(perfil), perfil.slice(0, 300));
cobrar('e cada conceito vem COM o motivo ao lado',
  /ficou para trás em matemática|entregou os trabalhos/i.test(perfil),
  'conceito sozinho numa lista é a nota colada no nome da criança');
cobrar('a versão corrigida continua legível, dizendo que foi substituída',
  /substituído por um registro posterior/i.test(perfil)
    && /corrige um registro anterior/i.test(perfil),
  'nada se sobrescreve — e quem lê precisa ver que houve correção');
cobrar('há por onde registrar o conceito de um bimestre',
  await clicar(/Registrar o conceito de um bimestre/));
const folhaCnc = await corpo();
cobrar('a folha diz que o conceito fala do acompanhamento, e não da criança',
  /acompanhamento neste bimestre/i.test(folhaCnc), folhaCnc.slice(0, 300));
cobrar('a folha oferece os três conceitos que o servidor manda',
  /Está acompanhando o ano/i.test(folhaCnc)
    && /Acompanha, com apoio em curso/i.test(folhaCnc)
    && /pede providência/i.test(folhaCnc), folhaCnc.slice(0, 400));
const btCnc = pg.locator('.overlay .sheet button')
  .filter({ hasText: /Registrar com o meu nome/ }).first();
cobrar('sem escolher o conceito, não registra',
  await btCnc.isDisabled().catch(() => false));
await pg.locator('.overlay .sheet .opt').filter({ hasText: /Está acompanhando o ano/ })
  .first().click();
await pg.waitForTimeout(250);
cobrar('e com o conceito escolhido e SEM o porquê, ainda não registra',
  await btCnc.isDisabled().catch(() => false),
  'o porquê é o que impede o conceito de atravessar meses como rótulo');
await pg.locator('#cnc-mot').fill(
  'A escola devolveu o retorno do bimestre: entregou os trabalhos e melhorou em leitura.');
await pg.waitForTimeout(250);
cobrar('com o porquê escrito, o conceito pode ser registrado',
  !(await btCnc.isDisabled().catch(() => true)));
await btCnc.click();
await pg.waitForTimeout(1300);
const depoisCnc = await conteudo();
cobrar('e a tela diz que corrigir não apaga o anterior',
  /nada se apaga|não da criança/i.test(depoisCnc), depoisCnc.slice(0, 400));

/*
 * A LISTA DE SERVIÇOS VEM DO SERVIDOR (fase 130) — a tela não inventa a sua
 * lista (§12.2).
 *
 * Até a 130 os serviços estavam escritos no HTML, em `<option value="fono">`,
 * enquanto `GET /nursing/education/kinds` existia e ninguém a chamava. A guarda
 * de REGRESSÃO é o `rotas-sem-porta`: se a chamada sair, a rota volta a ser
 * órfã e a suíte fica vermelha. O que este percurso cobra é a outra metade —
 * que a lista CHEGUE, e que a tela diga quando ela não chega em vez de abrir um
 * campo vazio sem explicação.
 */
const folhaDoApoio = pg.locator('main.conteudo button')
  .filter({ hasText: /apoio educacional/i });
if (!(await folhaDoApoio.count())) {
  cobrar('a folha do apoio educacional tem porta', false, 'não achei o botão');
} else {
  await folhaDoApoio.first().click();
  await pg.waitForTimeout(1000);
  const opcoes = await pg.locator('#edu-serv option').allInnerTexts();
  cobrar('a lista de serviços do prontuário chega do servidor',
    opcoes.length > 1, `veio ${JSON.stringify(opcoes)}`);
  cobrar('e ela não é a lista escrita à mão que existia antes',
    !(await corpo()).includes('não chegou do servidor'),
    'a tela avisa quando a lista não chega — e aqui ela deveria ter chegado');
  await fechar();
}
/* A AUDITORIA (fase 112) não aparece para a técnica: a §7 dá a leitura à
   coordenação e à gestão geral. Oferecer uma porta que o servidor vai recusar
   ensina a pessoa a não confiar na tela. */
cobrar('a auditoria NÃO aparece para a equipe técnica',
  !/Quem mexeu no registro/i.test(perfil),
  'a §7 dá a leitura da auditoria a dois cargos, e a tela não oferece o que o servidor recusa');
cobrar('há como acrescentar contato', await clicar(/Acrescentar contato/));
await fechar();
cobrar('os acompanhamentos abrem', await doMais('Acompanhamentos'));

/*
 * DE ONDE VEM A FONTE DO ACOMPANHAMENTO (fase 134) — resposta §10.7 de 20/09.
 *
 * O `POST /followups/:id/sources` existia desde a migração 0490 e NUNCA teve
 * quem o chamasse: ele pedia `entidade` e `entityId` digitados à mão. O que este
 * percurso cobra é a lista que faltava — uma só, com filtro por tipo — e, sobre
 * tudo, a regra que a folha impõe: **o conteúdo da ocorrência restrita não sai
 * por aqui**, só a referência.
 */
/* O acompanhamento do BRUNO, e não o primeiro da lista: é o que tem período com
   registro dentro dele. Clicar no primeiro abriria um acompanhamento sem fonte
   nenhuma e o percurso mediria uma lista vazia dizendo que a tela está errada. */
const cartaoBruno = pg.locator('main.conteudo .card').filter({ hasText: /Bruno/ }).first();
cobrar('a lista traz o acompanhamento do Bruno', (await cartaoBruno.count()) > 0,
  (await conteudo()).slice(0, 300));
if (await cartaoBruno.count()) {
  await cartaoBruno.locator('button').filter({ hasText: /^(Abrir|Preencher)$/ }).first().click();
  await pg.waitForTimeout(1100);
}
const folha134 = await corpo();
cobrar('a folha traz as fontes do período', /Fontes do período/i.test(folha134),
  folha134.slice(0, 400));
cobrar('e diz que guarda a REFERÊNCIA, não a cópia',
  /refer[êe]ncia/i.test(folha134) && /nunca a c[óo]pia/i.test(folha134));
cobrar('as três origens vêm na MESMA lista, com filtro por tipo',
  /Linha do tempo/i.test(folha134) && /Ocorrências/i.test(folha134)
    && /Evoluções de saúde/i.test(folha134), folha134.slice(0, 500));
/* A ocorrência restrita: aparece, marcada, e SEM o texto. */
cobrar('a ocorrência restrita aparece marcada',
  /Acesso restrito/i.test(folha134),
  'esconder que existe faria a técnica procurar noutro lugar');
cobrar('e o conteúdo dela NÃO está na folha',
  /fica na tela da ocorrência/i.test(folha134),
  'esta folha se imprime, se anexa e se esquece em cima de uma mesa');
cobrar('a fonte já escolhida vem marcada, e não oferece o botão de novo',
  /Já é fonte deste acompanhamento/i.test(folha134),
  'sem isso quem escreve não sabe o que já citou');
const btFonte = pg.locator('.overlay .sheet button').filter({ hasText: /^Usar como fonte$/ });
cobrar('e há por onde escolher uma fonte nova', (await btFonte.count()) > 0);
if (await btFonte.count()) {
  await btFonte.first().click();
  await pg.waitForTimeout(1100);
  const depois134 = await corpo();
  const antes = (folha134.match(/Já é fonte deste acompanhamento/gi) ?? []).length;
  const agora = (depois134.match(/Já é fonte deste acompanhamento/gi) ?? []).length;
  cobrar('escolher acrescenta a fonte, e ela passa a vir marcada', agora > antes,
    `antes ${antes}, agora ${agora}`);
}
await fechar();

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
/*
 * A CRIANÇA É ESCOLHIDA, e não deixada no primeiro nome da lista (fase 141).
 *
 * Tem de ser a Lara: ela é a única com item INDIVIDUAL na grade do dia do
 * protótipo — a Fonoaudiologia das 15h — e é esse item que a migração 1470 faz
 * sair da grade quando a criança não está na casa. Com qualquer outro nome, o
 * percurso registraria a internação e não exercitaria nada do que a fase
 * corrigiu.
 */
const quemInternar = await pg.locator('.overlay select#int-p')
  .evaluate((s) => Array.from(s.options).find((o) => /Lara/.test(o.textContent))?.value ?? '');
cobrar('a Lara está na lista de quem se pode internar', quemInternar !== '',
  'sem ela o percurso não exercita a grade do dia');
await pg.locator('.overlay select#int-p').selectOption(quemInternar);
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

/*
 * E A GRADE DO DIA PERDE O HORÁRIO INDIVIDUAL DELA (migração 1470).
 *
 * Era o defeito medido em 22/09: a criança internada continuava com o horário
 * pré-programado só dela pedindo "Estou ciente" ao plantão, e o aviso de "sem
 * confirmação" escalava aquilo para a coordenação de hora em hora. A cobrança é
 * nos DOIS sentidos, porque metade da correção é o que ela NÃO faz: o item
 * individual sai, e a refeição da casa fica — o almoço acontece com dezenove
 * crianças do mesmo jeito que com vinte.
 */
/*
 * A aba chama-se "Dia", e não "No dia" — eu escrevi o nome errado na primeira
 * versão desta cobrança, `aba()` devolveu `false` sem navegar, e a checagem da
 * Fonoaudiologia PASSOU pelo motivo errado: ela não estava na tela porque a tela
 * era a lista de acolhidos. Cobrança que passa sem ter olhado é pior do que
 * cobrança que falta, e por isso a navegação agora é cobrada também.
 */
cobrar('a aba do Dia abre para o educador', await aba('Dia'));
/*
 * O FILTRO PRECISA VOLTAR PARA "Tudo" ANTES DE COBRAR — e isto é um achado do
 * próprio percurso. O bloco do educador, muito acima, deixou a tela em "Por
 * criança", que **não é um filtro da linha do tempo**: é a Visão dos 20, outra
 * rota, que agrupa por criança e onde a ausência é INFORMAÇÃO ("no hospital") e
 * não pendência. Cobrar a linha do dia sem voltar o filtro media a tela errada.
 */
await clicar(/^Tudo$/);
await pg.waitForTimeout(900);
const dia141 = await conteudo();
cobrar('a grade do dia perde o horário individual de quem está no hospital',
  !/Fonoaudiologia/.test(dia141),
  'a Fonoaudiologia da Lara continuou na linha do dia com ela internada');
cobrar('e a refeição da casa fica — internação não apaga a rotina de todos',
  /Almoço|Janta|Café da manhã/.test(dia141),
  'a linha do dia perdeu a atividade coletiva junto');
await fechar();
cobrar('nenhuma exceção no caminho da internação', erros.length === 0, erros[0]);

// ====================================================== 6. Líder Noturno
console.log('\n🌙 Líder Noturno Geral');
await trocar('lider_noturno_geral');
erros.length = 0;
cobrar('a ATA Geral abre', await doMais('ATA'));
cobrar('a ATA da noite fala das casas', /casa|noite|noturna/i.test(await conteudo()));
cobrar('nenhuma exceção no turno da noite', erros.length === 0, erros[0]);

/* ======================================================================== */
/* A LINHA DA CASA SE CORRIGE, COM REGISTRO (fase 138) — decisão de 21/09.   */
/*                                                                          */
/* Este bloco roda como COORDENAÇÃO, que é um dos três cargos que corrigem.  */
/* O que ele cobra, além de a porta existir: que o Líder Noturno Geral — que  */
/* PREENCHE a folha — não veja a porta de corrigir o que já assinou, e que o  */
/* "antes constava" apareça na folha com o nome de quem corrigiu.            */
/* ======================================================================== */
console.log('\n📝 A linha da casa na ATA Geral se corrige (fase 138)');
await fechar();
const abaGeral = pg.locator('main.conteudo [role="tab"]')
  .filter({ hasText: /^ATA Geral Noturna$/ });
if (await abaGeral.count()) {
  await abaGeral.first().click();
  await pg.waitForTimeout(1200);
}
const folhaOito = await conteudo();
/* A folha das OITO é dele: a cobrança é pelos códigos das casas, e não pelo
   título — o título aparece também na linha desta casa, no Arquivo. */
cobrar('a folha das oito casas abre para quem preenche',
  (folhaOito.match(/\b(AI[1-4]|ARM[1-4])\b/g) ?? []).length >= 6,
  folhaOito.slice(0, 300));
cobrar('e ela mostra as correções que alguém fez, com o motivo',
  /Correções desta folha/i.test(folhaOito) && /Antes constava/i.test(folhaOito),
  'registrar e não mostrar cria a impressão de rastro onde ninguém vê rastro');

/*
 * AGORA A COORDENAÇÃO, QUE É QUEM CORRIGE — e ela corrige no ARQUIVO.
 *
 * Isto apareceu ao escrever o percurso, e é achado de desenho: a folha das oito
 * casas **não é da coordenação** — a tela diz, com estas palavras, que ela "fica
 * com quem responde pela instituição". O lugar onde a coordenação olha a linha da
 * casa dela é o Arquivo, e é lá que a porta de corrigir tem de estar. Botão no
 * lugar onde a pessoa não passa é botão que não existe.
 */
await fechar();
await trocar('coordenador');
erros.length = 0;
cobrar('a coordenação alcança a ATA', await doMais('ATA'));
const abaArquivo = pg.locator('main.conteudo [role="tab"]').filter({ hasText: /Arquivo/ });
cobrar('e alcança o Arquivo, onde a linha desta casa fica',
  (await abaArquivo.count()) > 0);
if (await abaArquivo.count()) {
  await abaArquivo.first().click();
  await pg.waitForTimeout(1400);
}
const arquivoTxt = await conteudo();
cobrar('o Arquivo mostra a linha desta casa na ATA Geral',
  /ATA Geral Noturna/i.test(arquivoTxt), arquivoTxt.slice(0, 300));
cobrar('e mostra o que constava ANTES, com quem corrigiu e o motivo',
  /Antes constava/i.test(arquivoTxt) && /registro da portaria/i.test(arquivoTxt),
  'registrar e não mostrar cria a impressão de rastro onde ninguém vê rastro');
cobrar('há a porta de corrigir esta linha',
  (await pg.locator('main.conteudo button').filter({ hasText: /Corrigir esta linha/ })
     .count()) > 0,
  'a decisão de 21/09 pôs a coordenação a corrigir; sem porta, a decisão não existe');
cobrar('e a tela diz, antes de abrir, que o anterior não se apaga',
  /não se apaga/i.test(arquivoTxt));

if (await clicar(/Corrigir esta linha/)) {
  const folhaCor = await corpo();
  cobrar('a folha abre com o que está escrito hoje, e não em branco',
    /Motivo do chamado/i.test(folhaCor) && /Por que está sendo corrigido/i.test(folhaCor),
    folhaCor.slice(0, 300));
  const btCor = pg.locator('.overlay .sheet button')
    .filter({ hasText: /Corrigir com o meu nome/ }).first();
  cobrar('sem dizer por quê, não corrige', await btCor.isDisabled().catch(() => false));
  await pg.locator('#cor-porque').fill(
    'A ação registrada estava incompleta: faltou dizer que conferi o registro da dose.');
  await pg.waitForTimeout(250);
  cobrar('com o porquê escrito, a correção libera',
    !(await btCor.isDisabled().catch(() => true)));
  await pg.locator('#cor-acao').fill(
    'Fui à casa, acompanhei a medicação e conferi o registro da dose com a Enfermagem.');
  await btCor.click();
  await pg.waitForTimeout(1600);
  const corrigida = await conteudo();
  cobrar('a correção entra na folha, com o motivo escrito',
    /conferi o registro da dose/i.test(corrigida), corrigida.slice(0, 600));
}

cobrar('nenhuma exceção ao corrigir a linha', erros.length === 0, erros[0]);

// ====================================================== 7. Cozinha
/*
 * QUEM PEDE O LANCHE É QUEM ESTÁ NO TURNO.
 *
 * Este bloco era do cargo `cozinha`, e o cargo saiu do seletor na fase 83 — a
 * Fundação decidiu que a cozinha não entra no sistema. O ensaio continuou
 * pedindo `selectOption('cozinha')` e passou a MORRER aqui, no bloco 7 de 13:
 * as 59 cobranças seguintes — o Gestor Geral, a exceção por medicamento, a
 * escala, a passagem que lê as doses, a ATA da próxima equipe — deixaram de
 * rodar, e as fases 84, 85 e 86 foram construídas com este ensaio vermelho.
 * Ele estourou com exceção do Node em vez de acusar achado, e é por isso que
 * ninguém viu: quem quebra alto não é ouvido do mesmo jeito que quem reclama.
 *
 * Agora é o EDUCADOR, que é quem percebe que falta lanche para a saída de
 * sábado. E, por ser este o ensaio que aperta os botões até o fim, ele pede de
 * verdade e LÊ DE VOLTA o que ficou gravado — inclusive a distinção que a casa
 * perde se o sistema a confundir: vinte lanches para a saída do grupo é UM
 * pedido e VINTE porções.
 */
console.log('\n🍽️ A cozinha, pedida por quem está no turno (fase 82)');
await trocar('educador');
erros.length = 0;
cobrar('a Cozinha abre em "Mais"', await doMais('Cozinha'));

const antes = await conteudo();
const numeroDe = (texto, rotulo) => {
  const m = new RegExp(`(\\d+)\\s+${rotulo}`).exec(texto);
  return m ? Number(m[1]) : null;
};
const porcoesAntes = numeroDe(antes, 'porções de lanche');
const pedidosAntes = numeroDe(antes, 'pedidos de lanche');

cobrar('a aba dos pedidos abre primeiro, e diz que a folha vai em papel',
  /recebe estes pedidos em papel/i.test(antes));
cobrar('o educador tem os dois botões de pedir',
  /Pedir lanche/i.test(antes) && /Pedir cesta básica/i.test(antes));
cobrar('a contabilização separa porções de pedidos',
  porcoesAntes !== null && pedidosAntes !== null,
  'somar os dois faria a casa parecer que pede pouco');
/* Somar por pessoa é medir gente (regra 3): conta-se quantas PESSOAS pediram. */
cobrar('e conta pessoas distintas, não pedidos por educador',
  /Pedidos por \d+ pessoas? da equipe/i.test(antes));

cobrar('"Pedir lanche" abre a folha do pedido', await clicar(/Pedir lanche/i));
const folhaPedido = pg.locator('.overlay .sheet');
const botaoRegistrar = folhaPedido.locator('button', { hasText: /^Registrar pedido$/ });

/* A finalidade é obrigatória porque "1 lanche" sozinho obriga a cozinha a
 * adivinhar. O botão nasce barrado, e é isso que se cobra aqui. */
cobrar('sem finalidade escrita, não há como registrar',
  await botaoRegistrar.isDisabled());
await folhaPedido.locator('#pd-fin').fill('saída ao parque no sábado à tarde');
await folhaPedido.locator('#pd-qtd').fill('20');
await pg.waitForTimeout(300);
cobrar('com a finalidade escrita, o pedido pode ser registrado',
  await botaoRegistrar.isEnabled());
await botaoRegistrar.click();
await pg.waitForTimeout(1300);

/* A LEITURA DE VOLTA — o que separa este ensaio dos outros cinco. */
const depois = await conteudo();
cobrar('o pedido registrado aparece na lista',
  /saída ao parque no sábado à tarde/i.test(depois));
cobrar('e com o nome de quem pediu', /Pedido por /i.test(depois),
  'o controle aqui é de autoria, não de acesso');
cobrar('vinte lanches contam como UM pedido',
  numeroDe(depois, 'pedidos de lanche') === (pedidosAntes ?? 0) + 1,
  `era ${pedidosAntes}, ficou ${numeroDe(depois, 'pedidos de lanche')}`);
cobrar('e como VINTE porções',
  numeroDe(depois, 'porções de lanche') === (porcoesAntes ?? 0) + 20,
  `era ${porcoesAntes}, ficou ${numeroDe(depois, 'porções de lanche')}`);

cobrar('as três folhas para a cozinha têm porta',
  /Solicitação de lanche/i.test(depois)
  && /Solicitação de cesta básica/i.test(depois)
  && /Restrições alimentares/i.test(depois));

/* A outra aba: a restrição sem a razão dela. */
cobrar('a aba das restrições abre',
  await clicar(/^Restrições$/, 'main.conteudo .seg'));
const restricoes = await conteudo();
cobrar('a lista mostra o que não pode ser servido', /Não servir|restri/i.test(restricoes));
cobrar('e diz por que não traz o motivo da restrição',
  /restrição<?\/?b?>?, não a razão|não a razão dela/i.test(restricoes)
  || /não a razão/i.test(restricoes));
cobrar('nenhuma exceção na cozinha', erros.length === 0, erros[0]);
await fechar();

// ====================================================== 8. Gestor Geral
console.log('\n🏛️ Gestor Geral');
await trocar('gestor_geral');
erros.length = 0;
cobrar('o painel das unidades abre', await doMais('Painel das unidades'));
cobrar('o painel mostra as oito casas', (await conteudo()).length > 200);

/*
 * A OUTRA LEITURA DAS OITO CASAS.
 *
 * A chave no alto é troca de modo — e o teste que importa aqui não é que a
 * tela abre: é que ela NÃO ordena por resultado. Ordenar por conquistas parece
 * mais útil e é um ranking com outro nome.
 *
 * ELA É ACHADA PELO NOME ACESSÍVEL, e não pelo desenho (corrigido na fase 150).
 * Este percurso procurava o emoji 🌱 dentro do botão, e quando a moldura trocou
 * os emoji por desenhos ele deixou de achar a chave: **as três cobranças
 * seguintes passaram a reprovar sem que nada estivesse errado com elas** — a
 * tela nunca chegava a abrir. Prender um ensaio ao DESENHO de um botão é prendê-lo
 * à decisão mais volátil que existe numa tela; o nome acessível é o contrato de
 * verdade, é o que muda quando a função muda, e é o que a pessoa com leitor de
 * tela ouve.
 */
const chave = pg.getByRole('button', { name: /trabalho social das oito casas/i });
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
/* ======================================================================== */
/* O GESTOR ABRE O QUE QUISER (fase 136) — decisão de 21/09.                 */
/*                                                                          */
/* Com só a contagem ele não tinha por onde escolher. Agora há uma porta por */
/* relato, opaca, e ele abre a que quiser — uma por vez, cada uma com a sua  */
/* finalidade escrita. O que este percurso cobra é justamente o que NÃO se   */
/* pode ver antes de abrir.                                                 */
/* ======================================================================== */
await fechar();
/* Volta ao modo normal: a chave do trabalho social ficou ligada acima. O nome
   acessível dela MUDA com o modo, e é por isso que ele serve de contrato. */
const chaveVolta = pg.getByRole('button', { name: /Voltar para a operação/i });
if (await chaveVolta.count()) {
  await chaveVolta.first().click();
  await pg.waitForTimeout(1200);
}
if (await aba('Acolhidos')) {
  const cartaoKaua = pg.locator('main.conteudo button').filter({ hasText: /Kauã/ }).first();
  cobrar('o gestor alcança o perfil do Kauã', (await cartaoKaua.count()) > 0);
  if (await cartaoKaua.count()) {
    await cartaoKaua.click();
    await pg.waitForTimeout(1400);
    const perfilG = await conteudo();
    cobrar('o perfil diz que existem relatos em área restrita',
      /área restrita/i.test(perfilG), perfilG.slice(0, 300));
    cobrar('e há uma porta POR RELATO, numerada',
      /Relato 1 de \d+/i.test(perfilG), perfilG.slice(0, 400));
    cobrar('a porta não traz data, autor nem trecho',
      !/Escrito por/i.test(perfilG.split(/Relato 1 de/)[1] ?? ''),
      'a porta é opaca de propósito: o que ela diz é que existe');
    cobrar('a tela diz que não há como abrir todos de uma vez',
      /pare quando encontrar/i.test(perfilG),
      'é a decisão de 21/09 escrita onde quem abre lê');

    cobrar('há por onde abrir com finalidade escrita',
      await clicar(/Abrir com finalidade escrita/));
    const folhaFin = await corpo();
    cobrar('a folha diz que ele ainda não sabe de que trata',
      /não sabe ainda de que ela trata/i.test(folhaFin), folhaFin.slice(0, 300));
    const btAbrir = pg.locator('.overlay .sheet button')
      .filter({ hasText: /Registrar a finalidade e abrir/ }).first();
    cobrar('sem finalidade, não abre', await btAbrir.isDisabled().catch(() => false));
    await pg.locator('#fin').fill('para ver');
    cobrar('e uma finalidade curta também não abre',
      await btAbrir.isDisabled().catch(() => false),
      'o piso de quinze caracteres é o do servidor');
    await pg.locator('#fin').fill(
      'Preparar a resposta ao ofício fictício do MP sobre a situação familiar.');
    cobrar('com a finalidade escrita, o botão libera',
      !(await btAbrir.isDisabled().catch(() => true)));
    await btAbrir.click();
    await pg.waitForTimeout(1300);
    const depoisAbrir = await conteudo();
    cobrar('o relato aparece, com a finalidade declarada ao lado',
      /Aberto por você agora, com a finalidade/i.test(depoisAbrir),
      depoisAbrir.slice(0, 400));
    cobrar('e as outras portas continuam fechadas',
      /Abrir com finalidade escrita/i.test(depoisAbrir),
      'abrir uma não é uma chave que destranca a criança');
  }
}

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
 * "DIURNO 08:00–20:00". Toda cobrança desta tela é insensível a maiúsculas.
 * O horário é o da decisão de 25/09 (fase 157), que substituiu o 7h–19h. */
cobrar('a escala abre nos próximos trinta dias', /Escala de plantão/i.test(escala));
cobrar('a escala diz em voz alta o turno que está sem ninguém',
  /sem ninguém|sem escala|ninguém escalado/i.test(escala), escala.slice(0, 160));
cobrar('os dois turnos aparecem com o horário',
  /08:00–20:00/.test(escala) && /20:01–07:59/.test(escala));

/* O HORÁRIO DOS TURNOS DA CASA (fase 159): a coordenação muda, e vale amanhã.
 * Entra pelo nome acessível do botão e dos campos — nunca pelo desenho. */
cobrar('o horário dos turnos da casa aparece na escala', /Horário dos turnos/i.test(escala));
const mudar = pg.getByRole('button', { name: /Mudar o horário dos turnos/i });
cobrar('a coordenação pode mudar o horário dos turnos', (await mudar.count()) > 0);
if (await mudar.count()) {
  await mudar.click();
  await pg.getByLabel('O diurno começa às').fill('07:00');
  await pg.getByLabel('e termina às').fill('19:00');
  const previa = await conteudo();
  cobrar('a tela mostra como o noturno fica ANTES de gravar',
    /noturno fica das 19:01 às 06:59/i.test(previa), previa.slice(0, 200));
  await pg.getByRole('button', { name: /Gravar — vale a partir de amanhã/i }).click();
  await pg.waitForTimeout(400);
  const depois = await conteudo();
  cobrar('a mudança vale a partir de amanhã, e a tela diz isso',
    /A partir de \d{2}\/\d{2}\/\d{4}: diurno das 07:00 às 19:00/i.test(depois), depois.slice(0, 240));
  cobrar('o horário de HOJE não mudou',
    /08:00–20:00/.test(depois) && /20:01–07:59/.test(depois));
}

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
  /*
   * O MOTIVO É OBRIGATÓRIO SEMPRE (fase 144, decisão da Fundação de 22/09).
   *
   * Até aqui só o plantão JÁ PASSADO exigia, e o ensaio clicava "Retirar" sem
   * escrever nada — agora o botão nasce desabilitado, e a frase diz para quem a
   * explicação serve: a pessoa que foi tirada vai perguntar.
   */
  const botaoRet = pg.locator(`${CAIXA} button`).filter({ hasText: /^Retirar$/ }).first();
  cobrar('e sem motivo escrito o botão de retirar nasce desabilitado',
    await botaoRet.isDisabled(),
    'a decisão de 22/09 foi "sempre exigir motivo", e não só no plantão que já passou');
  cobrar('a folha diz para quem a frase serve',
    /vai perguntar/i.test(await corpo()),
    'quem foi tirado do plantão de sábado pergunta na segunda');
  await pg.locator(`${CAIXA} input#ret-motivo`)
    .fill('Trocou o plantão com a Tainá, a pedido dela.');
  cobrar('com o motivo escrito, retirar libera', !(await botaoRet.isDisabled()));
  await botaoRet.click();
  await pg.waitForTimeout(1400);
  await fechar();
}

/*
 * OS TRÊS AJUSTES DA FASE 123 — *"cada um com a sua cor diferente"*,
 * *"substituir ou deixar a menos"*, e os dois cargos que passaram a montar.
 */
/* A COR na linha, e o nome ao lado dela sempre. */
const linhaComCor = pg.locator('main.conteudo li.linha-ata').first();
cobrar('a linha de cada pessoa na escala carrega a cor dela',
  (await linhaComCor.count()) > 0,
  'a cor existe desde a 0990 e era usada só na ATA');
if (await linhaComCor.count()) {
  cobrar('e o nome continua escrito ao lado da cor',
    (await linhaComCor.innerText()).trim().length > 3,
    'a folha da parede sai em preto e branco — a cor é apoio, nunca a informação');
}

/* SUBSTITUIR num gesto, com "Retirar" continuando ao lado. */
const substituir = pg.locator('main.conteudo button').filter({ hasText: /^Substituir$/ });
cobrar('a escala tem o botão de substituir num gesto',
  (await substituir.count()) > 0,
  'eram dois atos, e entre um e outro o turno ficava vazio na tela');
cobrar('e "Retirar" continua ao lado — *"substituir ou deixar a menos"*',
  (await pg.locator('main.conteudo button').filter({ hasText: /^Retirar$/ }).count()) > 0,
  'uma casa pode passar o turno com uma pessoa a menos, e o sistema não cobra substituto');
if (await substituir.count()) {
  await substituir.first().click();
  await pg.waitForTimeout(800);
  const folhaSub = await corpo();
  cobrar('a folha de substituir diz que a linha de quem sai continua registrada',
    /continua registrada/i.test(folhaSub), folhaSub.slice(0, 200));
  const quemEntra = pg.locator(`${CAIXA} select#sub-quem`);
  cobrar('e traz a equipe para escolher quem entra',
    (await quemEntra.locator('option').count()) > 1);
  const botaoSub = pg.locator(`${CAIXA} button`).filter({ hasText: /^Substituir$/ }).first();
  cobrar('sem escolher quem entra, não substitui', await botaoSub.isDisabled());
  /* E a substituição pede motivo desde a 144, pelo mesmo motivo da retirada:
     "a Joana entrou no lugar" não explica por que a Marta saiu. */
  cobrar('a folha de substituir também pede por que a troca acontece',
    /por que esta troca acontece|escreva por quê/i.test(folhaSub),
    'deixar só a substituição sem a frase faria quem não quer escrever substituir em vez de retirar');
  await pg.locator(`${CAIXA} textarea#sub-motivo`)
    .fill('Consulta médica marcada no mesmo horário; troca combinada com a equipe.');
  const quantasOpcoes = await quemEntra.locator('option').count();
  if (quantasOpcoes > 1) {
    /*
     * A ÚLTIMA opção, e não a primeira — e o motivo é uma recusa legítima.
     *
     * Escolhendo `nth(1)` o ensaio caiu num 409: a primeira pessoa da lista já
     * estava escalada naquele mesmo turno, e o sistema recusou com a frase
     * certa ("esta pessoa já está escalada neste turno"). O defeito era do
     * ensaio, não da tela. A última da lista é a coordenação, que a semeadura
     * nunca põe em plantão nenhum — é a única escolha que não depende do que
     * os blocos anteriores deixaram montado.
     */
    await quemEntra.selectOption(
      await quemEntra.locator('option').nth(quantasOpcoes - 1).getAttribute('value'));
    await botaoSub.click();
    await pg.waitForTimeout(1500);
    const depoisDoClique = await corpo();
    await fechar();
    cobrar('quem entrou aparece com o lugar de quem saiu',
      /entrou no lugar de/i.test(await conteudo()),
      depoisDoClique.replace(/\s+/g, ' ').slice(0, 400));
  }
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
  'montar a escala é da coordenação, da técnica ou do Líder Diurno');

/*
 * E OS DOIS CARGOS QUE PASSARAM A MONTAR (fase 123).
 *
 * *"Pela equipe técnica, o coordenador ou o educador líder."* O Líder Diurno é
 * quem descobre às 6h50 que alguém não veio; a técnica é quem remaneja quando
 * a coordenação está em audiência. Sem esta cobrança, a decisão da Fundação
 * viveria só no comentário da migração.
 */
for (const cargo of ['lider_diurno', 'equipe_tecnica']) {
  await trocar(cargo);
  const daEquipe = (await doMais('escala de plantão')) ? await conteudo() : '';
  cobrar(`${cargo} monta a escala, como a Fundação decidiu em 15/09`,
    /Escalar alguém/i.test(daEquipe),
    'os dois leem a escala desde a 0950; montar é o que a fase 123 abriu');
}
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

// ============================ 13. O retorno da família na passagemNaFase88 e na ATA
/*
 * O CAMINHO INTEIRO, DE PONTA A PONTA (1060/1070).
 *
 * A técnica registra a saída, o educador recebe a criança escrevendo o que ela
 * trouxe, e a passagemNaFase88 e a ATA passam a mostrar isso — que era o pedido do
 * Marcelo: "ecoar, para a equipe seguinte ler sem procurar".
 *
 * Este bloco é o que prova o eco, e é para ele que este ensaio existe: o
 * `tsc` diz que compila, o `ensaio` diz que a tela renderiza, e nenhum dos
 * dois diz que o que foi gravado às 18h aparece na tela que a equipe das 19h
 * abre. No protótipo a lista de convivências começa VAZIA de propósito — quem
 * abre registra a primeira saída —, então o percurso tem de criar o fato antes
 * de poder lê-lo.
 */
console.log('\n🏠 O retorno da família, da chegada até a passagem (fase 88)');
await trocar('equipe_tecnica');
erros.length = 0;

cobrar('a técnica abre o perfil de uma criança', await aba('Acolhidos'));
cobrar('e chega ao perfil', await clicar(/Alice/));
const perfilNaFase88 = await conteudo();
cobrar('o perfil tem o contato de quem aparece pela criança',
  /Vai passar dias com/i.test(perfilNaFase88),
  'a saída nasce no CONTATO: digitar o nome à mão permitiria escrever qualquer um');

cobrar('"Vai passar dias com" abre a folha da saída', await clicar(/Vai passar dias com/i));
const folhaSaidaFase88 = pg.locator('.overlay .sheet');
const registrarSaida = folhaSaidaFase88.locator('button', { hasText: /^Registrar saída$/ });
cobrar('a folha da saída pede quando ela volta', await registrarSaida.count() > 0);
if (await registrarSaida.count()) {
  /* Uma saída que já terminou: o retorno vem logo depois, no mesmo turno, que
     é o caso do fim de semana. As horas saem do próprio navegador. */
  const agora = new Date();
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
  /* Pelos ids, e não por posição: `input[type="text"]` não casa com um input
     SEM atributo type — o campo da finalidade nunca era preenchido, e o ensaio
     não reclamava porque ele é opcional. Posição em formulário é a mesma
     armadilha do `.last()` no menu "Mais". */
  await folhaSaidaFase88.locator('#fs-ini')
    .fill(local(new Date(agora.getTime() - 3 * 3600_000)));
  await folhaSaidaFase88.locator('#fs-ret')
    .fill(local(new Date(agora.getTime() + 3600_000)));
  await folhaSaidaFase88.locator('#fs-fin').fill('Fim de semana com a mãe.');
  await pg.waitForTimeout(300);
  await registrarSaida.click();
  await pg.waitForTimeout(1400);
}
await fechar();

/* Quem recebe é quem está na porta: o educador de plantão. */
await trocar('educador');
/* `trocar` volta para a primeira aba — a lista da casa é outra. */
cobrar('o educador abre a lista da casa', await aba('Acolhidos'));
/*
 * A LINHA DA ALICE, e não "alguém com a família".
 *
 * Desde a fase 89 o protótipo abre com o Felipe fora de casa, para a tarefa de
 * registrar a chegada existir sozinha no roteiro. Cobrar só "Com a família"
 * passaria mesmo que a saída da Alice não tivesse sido gravada — e clicar no
 * PRIMEIRO "Chegou" podia registrar a chegada do Felipe, com o resto do bloco
 * verde lendo o retorno errado.
 */
const linhaDaAlice = pg.locator('main .card .row').filter({ hasText: /Alice/ })
  .filter({ has: pg.locator('button', { hasText: /^Chegou$/ }) }).first();
cobrar('o educador vê a Alice entre quem está com a família',
  /Com a família/i.test(await conteudo()) && (await linhaDaAlice.count()) > 0,
  'ele precisa saber por que a cadeira vai ficar vazia no jantar');
/*
 * O RELATO ABRE NA SAÍDA, e não no retorno (fase 122).
 *
 * *"Quando o jovem sair para a visita em casa, se abre essa pergunta para ser
 * respondida depois."* O botão existe enquanto ela ainda está com a família —
 * é o que permite registrar o telefonema de sábado.
 */
if (await linhaDaAlice.count()) {
  await linhaDaAlice.locator('button', { hasText: /Relato/ }).first().click();
  await pg.waitForTimeout(800);
  const folhaDoRelato = await pg.locator('.overlay .sheet').innerText();
  cobrar('o relato abre enquanto ela ainda está com a família',
    /A volta de Alice/i.test(folhaDoRelato), folhaDoRelato.slice(0, 160));
  cobrar('e a tela diz, antes do campo, que NÃO há prazo nem cobrança',
    /não há prazo e não há cobrança/i.test(folhaDoRelato),
    'era isto que a Fundação corrigiu: um campo que cobra faz perguntar de novo para a criança');
  cobrar('e ensina a escrever o FATO, não o rótulo',
    /voltou agressiva/i.test(folhaDoRelato),
    '§8.14 — o fato pode mudar amanhã, o rótulo atravessa anos de prontuário');
  cobrar('"houve alteração" é opcional, e sai DESMARCADO',
    !(await pg.locator('.overlay .sheet input[type=checkbox]').first().isChecked()),
    'se todo relato avisasse, a equipe aprenderia a ignorar o sino');
  await fechar();
}

let chegouDaAlice = false;
if (await linhaDaAlice.count()) {
  await linhaDaAlice.locator('button', { hasText: /^Chegou$/ }).first().click();
  await pg.waitForTimeout(700);
  chegouDaAlice = true;
}
cobrar('e tem o botão de registrar a chegada DELA', chegouDaAlice);

const folhaChegadaFase88 = pg.locator('.overlay .sheet');
cobrar('a folha da chegada pergunta COMO ela chegou',
  /Como ela chegou/i.test(await folhaChegadaFase88.innerText()));
/* O pedido do Marcelo, em campo próprio: é fato logístico do turno seguinte. */
cobrar('e pergunta o que ela trouxe de casa',
  /Trouxe algo de casa/i.test(await folhaChegadaFase88.innerText()));
await folhaChegadaFase88.locator('#nota-ret').fill('Chegou no horário e foi direto para o quarto.');
await folhaChegadaFase88.locator('#trouxe-ret').fill('Mochila com roupa suja e um frasco de xarope.');
await pg.waitForTimeout(300);
await folhaChegadaFase88.locator('button', { hasText: /^Registrar chegada$/ }).click();
await pg.waitForTimeout(1500);
await fechar();

/* A LEITURA DE VOLTA, que é a fase inteira. */
/*
 * O PLANTÃO DO TURNO DE AGORA — e não o que está "Aberto".
 *
 * A chegada é registrada com a hora do relógio, e o turno dela sai do FUSO DA
 * INSTITUIÇÃO: às 19h38 de Porto Alegre a criança volta no plantão NOTURNO, e
 * o cartão aberto do protótipo é o diurno. A primeira versão deste bloco
 * cobrava o cartão "Aberto" e falhava a partir das 19h — e falhava dizendo
 * "a criança não voltou", que é a acusação errada.
 *
 * É a armadilha 2 dos ensaios em Playwright, escrita no §6: roteiro preso a
 * horário fixo falha em certas horas do dia, e isso NÃO é defeito do sistema.
 * O ensaio calcula o turno como o sistema calcula, e abre o cartão certo.
 */
const turnoDeAgora = (() => {
  const h = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false,
  }).format(new Date()));
  return h >= 7 && h < 19 ? 'diurno' : 'noturno';
})();

cobrar('a lista de plantões abre', await aba('Passagem'));
/* O bloco vive DENTRO do plantão: a aba mostra os cartões. */
const cartaoDaFase88 = pg.locator('main.conteudo button.chamadacard')
  .filter({ hasText: new RegExp(`Plantão ${turnoDeAgora}`, 'i') }).first();
cobrar(`há o plantão ${turnoDeAgora}, que é o turno de agora em Porto Alegre`,
  (await cartaoDaFase88.count()) > 0);
await cartaoDaFase88.click();
await pg.waitForTimeout(1300);
const passagemNaFase88 = await conteudo();
cobrar('a passagem mostra quem esteve com a família neste turno',
  /com a família neste turno/i.test(passagemNaFase88), passagemNaFase88.slice(0, 200));
cobrar('e diz que a criança voltou', /voltou neste turno/i.test(passagemNaFase88));
cobrar('com o que ela trouxe de casa escrito',
  /frasco de xarope/i.test(passagemNaFase88),
  'é o que muda o que a casa faz nas próximas duas horas');
cobrar('e com o nome de quem recebeu', /recebida por/i.test(passagemNaFase88));

cobrar('a ATA abre', await doMais('ATA'));
/*
 * A ATA TROCA DE TURNO POR ABA, não por cartão — e abre no diurno.
 *
 * O ensaio cobrava um `button.chamadacard` aqui, como na Passagem, e não achava
 * nada: ficava no turno diurno, onde a criança SAIU, e reclamava que o retorno
 * não aparecia. O bloco estava lá o tempo todo, no turno certo.
 */
cobrar(`a ATA oferece o turno ${turnoDeAgora}`,
  await clicar(new RegExp(`Turno ${turnoDeAgora}`, 'i')));
const ataNaFase88 = await conteudo();
cobrar('a ATA mostra o MESMO retorno, da mesma fonte',
  /Acolhido em experiência familiar/i.test(ataNaFase88) && /frasco de xarope/i.test(ataNaFase88),
  'duas consultas quase iguais divergiriam no primeiro ajuste');
/* E o turno em que ela SAIU diz "saiu", não "voltou": é o mesmo componente
   contando duas metades da mesma história, uma em cada turno. */
const outroTurno = turnoDeAgora === 'diurno' ? 'noturno' : 'diurno';
if (await clicar(new RegExp(`Turno ${outroTurno}`, 'i'))) {
  const naOutra = await conteudo();
  cobrar('e o turno em que ela saiu conta a outra metade',
    !/experiência familiar/i.test(naOutra) || /saiu neste turno|está com a família/i.test(naOutra),
    'o mesmo bloco não pode dizer "voltou" no turno em que ela ainda estava fora');
}
cobrar('nenhuma exceção no caminho do retorno', erros.length === 0, erros[0]);

// ====================================== 14. A prévia dos anexos (fase 107)
/*
 * O BOTÃO DE OLHO PRECISA ABRIR UMA IMAGEM, E NÃO UM NOME DE ARQUIVO.
 *
 * Este bloco existe por causa da §6.19: a fase 107 pôs prévia em quatro
 * lugares, e três deles só aparecem depois de um clique, dentro de uma folha.
 * O `ensaio` percorre telas e o `ensaio:acessibilidade` mede cor — nenhum dos
 * dois abriria estas caixas, e a entrega poderia nascer quebrada com tudo
 * verde ao lado, que foi o que aconteceu nas fases 87, 89 e 92.
 *
 * A cobrança é pelo CONTEÚDO: procura a `img` da prévia, e não o botão. Botão
 * que abre uma caixa vazia passaria numa cobrança de porta.
 */
console.log('\n👁 A prévia dos anexos');
await trocar('equipe_tecnica');
erros.length = 0;
await aba('Acolhidos');
await clicar(/Alice/);

cobrar('a foto de identificação tem botão de olho', await clicar(/Ver a foto/));
cobrar('e o olho abre a IMAGEM, não o nome do arquivo',
  (await pg.locator('.overlay img.previa-img').count()) > 0,
  'um retângulo cinza escrito "foto.png" não deixa ninguém conferir se é a criança certa');
await fechar();

/* O contato PELO NOME, e não o primeiro da lista: dois contatos oferecem o
 * mesmo botão, e só a madrinha tem foto guardada — a genitora existe
 * justamente para a folha da guarita mostrar os espaços em branco. Um ensaio
 * que clica no `.first()` mede outra coisa e reprova uma tela certa. */
const cartaoDaMadrinha = pg.locator('main.conteudo .card').filter({ hasText: /Simoni/ });
const portaria = cartaoDaMadrinha.locator('button').filter({ hasText: /Portaria/ });
const achouPortaria = (await portaria.count()) > 0;
cobrar('o contato com foto abre a folha da portaria', achouPortaria);
if (achouPortaria) {
  await portaria.first().click();
  await pg.waitForTimeout(900);
  const olho = pg.locator('.overlay button.olho');
  const temOlho = (await olho.count()) > 0;
  cobrar('a foto 3×4 já guardada tem botão de olho', temOlho,
    'até a fase 107 o protótipo dizia "já tem foto cadastrada" e não deixava ver qual');
  if (temOlho) {
    await olho.first().click();
    await pg.waitForTimeout(900);
    cobrar('e ela abre — o servidor de mentira guarda a foto, como o de verdade',
      (await pg.locator('.overlay img.previa-img').count()) > 0,
      'servidor de mentira que responde PIOR que o servidor esconde um sistema que existe (§6.14)');
    await fechar();
    await portaria.first().click();
    await pg.waitForTimeout(700);
  }

  /*
   * O DIA E A HORA DA VISITA (1500).
   *
   * A folha da guarita dizia QUEM podia entrar e não dizia QUANDO — e assim ela
   * transferia para o porteiro uma decisão que é da casa. Aqui se cobra a porta e
   * os DOIS sentidos da recusa: autorizar sem horário é barrado, e retirar sem
   * motivo também. As duas recusas existem para quem está no portão.
   */
  const folhaVisita = await corpo();
  cobrar('a folha de autorizar tem os dias da semana',
    /Quando pode vir/.test(folhaVisita) && /sáb/.test(folhaVisita));
  cobrar('e a faixa de horário', /Das/.test(folhaVisita));
  cobrar('a madrinha já tem o horário combinado, e ele vem preenchido',
    (await pg.locator('.overlay input#vis-de').inputValue()) !== '',
    'reautorizar alguém não pode pedir à técnica que digite de novo o que ela já combinou');
}
await fechar();

/*
 * E A RETIRADA PEDE MOTIVO — no contato que TEM autorização para perder.
 */
const cartaoDaGenitora = pg.locator('main.conteudo .card').filter({ hasText: /Rosângela/ });
const portariaDela = cartaoDaGenitora.locator('button').filter({ hasText: /Portaria/ });
if (await portariaDela.count()) {
  await portariaDela.first().click();
  await pg.waitForTimeout(800);
  cobrar('o cartão mostra quando a genitora pode vir',
    /dom/.test(await conteudo()) || /09:00/.test(await corpo()));
  /*
   * O HISTÓRICO DA FOLHA, e ele é cobrado AQUI e não no cartão da madrinha.
   *
   * Eu cobrei primeiro na madrinha, e o ensaio reprovou com razão: o histórico
   * dela está vazio. O semeado é o da genitora — autorizada, suspensa pela Vara,
   * liberada de novo —, e é aqui que a propriedade que importa se vê: a linha da
   * suspensão continua lá depois da liberação.
   */
  const folhaDela = await corpo();
  cobrar('o histórico da folha aparece sem precisar de botão',
    /O que já aconteceu com esta autorização/.test(folhaDela));
  cobrar('e a retirada antiga continua lá depois de a visita ser liberada de novo',
    /Saiu da folha/.test(folhaDela) && /Vara suspendeu/.test(folhaDela),
    'nada se sobrescreve: a linha da suspensão é a que explica a história');
  /* Desmarca "Autorizado a visitar": o campo do motivo tem de aparecer. */
  const marca = pg.locator('.overlay input[type="checkbox"]').first();
  await marca.uncheck();
  await pg.waitForTimeout(400);
  cobrar('desmarcar a autorização abre o campo do motivo',
    /sai da folha da portaria/.test(await corpo()),
    'sem ele a família ouve "não está na folha" e ninguém sabe por quê');
  await clicar(/^Salvar$/, '.overlay');
  await pg.waitForTimeout(900);
  cobrar('e salvar sem motivo é recusado, com a frase do portão',
    /por que este contato sai da folha/i.test(await corpo()));
  await pg.locator('.overlay textarea#vis-motivo')
    .fill('A Vara suspendeu as visitas até a próxima audiência.');
  await clicar(/^Salvar$/, '.overlay');
  await pg.waitForTimeout(1100);
  cobrar('com o motivo escrito, a retirada é registrada',
    /motivo registrado/i.test(await corpo()) || !/sai da folha da portaria/.test(await corpo()));
}
await fechar();
/*
 * E OS TRÊS QUE ERAM SÓ REFERÊNCIA (fase 108).
 *
 * A cobrança aqui é dupla: que a tela diga QUAL DAS DUAS formas é antes do
 * clique — a pílula "no sistema" / "no Drive" —, e que o olho abra mesmo uma
 * imagem quando o papel está guardado. O servidor de mentira traz um de cada,
 * nas duas formas, porque bloco que só existe com dado nasce invisível (§6.19).
 */
await fechar();
if (await doMais('Ocorrências')) {
  const cartaoComAnexo = pg.locator('main.conteudo .card')
    .filter({ hasText: /anexo\(s\)/i }).first();
  if (await cartaoComAnexo.count()) {
    await cartaoComAnexo.locator('button').filter({ hasText: /Abrir detalhes/ }).first().click();
    await pg.waitForTimeout(900);
    const texto = await conteudo();
    cobrar('a lista de anexos diz onde o documento está, antes do clique',
      /no sistema/i.test(texto) && /no Drive/i.test(texto),
      'as duas formas convivem, e a pílula é o que separa uma da outra');
    const olho = pg.locator('main.conteudo button.olho').filter({ hasText: /Abrir/ }).first();
    if (await olho.count()) {
      await olho.click();
      await pg.waitForTimeout(900);
      cobrar('o anexo guardado no sistema ABRE — não devolve um caminho de pasta',
        (await pg.locator('.overlay img.previa-img, .overlay iframe.previa-quadro').count()) > 0,
        'era isto que a tela dizia não fazer: "o sistema não abre o arquivo"');
      await fechar();
    }
  }
}

/*
 * QUEM LÊ A FALA ESPONTÂNEA DA CRIANÇA (fase 144, decisão da Fundação de 22/09).
 *
 * A conferência de 22/09 levou à Fundação uma assimetria real: o RELATO restrito
 * inclui o Líder Diurno desde a 0730, e o BLOCO PROTEGIDO da ocorrência não
 * incluía. Ela respondeu: incluir. Aqui se cobram os DOIS lados — porque uma
 * regra de acesso só está certa quando o que ela fecha também está fechado.
 *
 * *E o protótipo não tinha o que mostrar: as duas ocorrências semeadas nasciam
 * sem bloco protegido, então a regra mais cuidadosa do sistema não aparecia no
 * único arquivo que o Marcelo abre (§6.19).*
 */
await fechar();
await trocar('lider_diurno');
erros.length = 0;
if (await doMais('Ocorrências')) {
  const restrita = pg.locator('main.conteudo .card')
    .filter({ hasText: /Violência ou suspeita/i }).first();
  cobrar('a ocorrência com bloco protegido aparece na lista',
    (await restrita.count()) > 0,
    'sem ela semeada, a regra de quem lê a fala da criança não se demonstra');
  if (await restrita.count()) {
    await restrita.locator('button').filter({ hasText: /Abrir detalhes/ }).first().click();
    await pg.waitForTimeout(900);
    cobrar('o Líder Diurno lê a fala espontânea — entrou em 22/09',
      /não quero ir pra casa da tia/i.test(await conteudo()),
      'a regra do relato restrito já o incluía; a da ocorrência protegida, não');
  }
}
cobrar('nenhuma exceção na leitura do Líder Diurno', erros.length === 0, erros[0]);

await fechar();
await trocar('educador');
erros.length = 0;
if (await doMais('Ocorrências')) {
  const restrita = pg.locator('main.conteudo .card')
    .filter({ hasText: /Violência ou suspeita/i }).first();
  if (await restrita.count()) {
    await restrita.locator('button').filter({ hasText: /Abrir detalhes/ }).first().click();
    await pg.waitForTimeout(900);
    const oQueEleVe = await conteudo();
    cobrar('o educador do plantão NÃO lê a fala espontânea',
      !/não quero ir pra casa da tia/i.test(oQueEleVe),
      'o educador ficou fora de propósito — a decisão de 22/09 nomeou três cargos');
    cobrar('e a tela diz a quem ele pode pedir, em vez de só omitir',
      /Líder Diurno/i.test(oQueEleVe),
      'a frase nomeava dois cargos e envelheceu na 144');
  }
}
cobrar('nenhuma exceção na leitura do educador', erros.length === 0, erros[0]);

/*
 * O PEDIDO PARA LER A OBSERVAÇÃO RESTRITA (1540, decisão da Fundação de 22/09).
 *
 * *"Todos leem a ata coletiva, seja manhã ou noite […] menos as restritas, que
 * são apenas para quem tem autorização. A pessoa pode solicitar ler alguma coisa,
 * e cabe à equipe deixar ou não."*
 *
 * O percurso cobra o caminho inteiro e nos DOIS sentidos, porque metade desta
 * regra é o que ela NÃO abre: o educador pede, a coordenação decide, e a porta de
 * pedir fica colada na frase que diz que existe algo que ele não lê.
 */
await fechar();
erros.length = 0;
if ((await aba('ATA')) || (await doMais('ATA'))) {
  await pg.waitForTimeout(900);
  /*
   * O TURNO NOTURNO, e não o que a tela escolhe sozinha.
   *
   * A linha restrita semeada é da ATA da NOITE — é onde ela faz sentido: a
   * observação que a coordenação guarda é sobre a visita remarcada pela Vara. A
   * tela abre no plantão aberto, que é o diurno, e ali não há linha restrita
   * nenhuma; cobrar sem trocar de turno mediria uma ATA sem o que a fase trata.
   */
  const noturno = pg.locator('main.conteudo [role="tab"]').filter({ hasText: /Turno noturno/ });
  if (await noturno.count()) { await noturno.first().click(); await pg.waitForTimeout(1100); }
  const ataDoEducador = await conteudo();
  cobrar('a ATA diz quantas observações restritas existem, sem o conteúdo',
    /observaç(ão|ões) restrita/i.test(ataDoEducador),
    'quem não lê o texto precisa saber que ele existe, senão conclui que não existe');
  const pedir = pg.locator('main.conteudo button').filter({ hasText: /Pedir para ler/ });
  cobrar('e traz a porta de pedir, colada nessa frase', (await pedir.count()) > 0,
    'botão longe do lugar onde a falta aparece é botão que não existe');
  if (await pedir.count()) {
    await pedir.first().click();
    await pg.waitForTimeout(700);
    const folha = await corpo();
    cobrar('a folha do pedido diz para que a frase serve',
      /quem decide lê esta frase/i.test(folha));
    const botaoPedir = pg.locator('.overlay button').filter({ hasText: /^Pedir$/ }).first();
    cobrar('e sem motivo o botão nasce desabilitado', await botaoPedir.isDisabled());
    await pg.locator('.overlay textarea#mot-txt')
      .fill('Preciso saber como a criança passou a noite antes do café.');
    cobrar('com o motivo escrito, pedir libera', !(await botaoPedir.isDisabled()));
    await botaoPedir.click();
    await pg.waitForTimeout(1200);
    cobrar('o pedido fica esperando resposta, e a tela diz isso',
      /esperando resposta/i.test(await conteudo()),
      'um pedido que some é um pedido que se refaz');
  }
}
cobrar('nenhuma exceção no pedido do educador', erros.length === 0, erros[0]);

/* E A COORDENAÇÃO DECIDE — é o outro lado, e é onde a fila tem de aparecer. */
await fechar();
await trocar('coordenador');
erros.length = 0;
if ((await aba('ATA')) || (await doMais('ATA'))) {
  await pg.waitForTimeout(900);
  const fila = await conteudo();
  cobrar('a fila de pedidos aparece para quem decide, no topo da aba da casa',
    /Pedidos para ler observação restrita/i.test(fila),
    'pedido esperando numa aba que ninguém visita é pedido que morre');
  cobrar('e ela mostra o motivo escrito por quem pediu',
    /passou a noite/i.test(fila) || /dose das 9h/i.test(fila));
  const liberar = pg.locator('main.conteudo button').filter({ hasText: /^Liberar$/ });
  cobrar('a fila oferece liberar e negar', (await liberar.count()) > 0
    && (await pg.locator('main.conteudo button').filter({ hasText: /^Negar$/ }).count()) > 0);
  if (await liberar.count()) {
    await liberar.first().click();
    await pg.waitForTimeout(700);
    cobrar('liberar pede motivo, e diz por quem a frase responde',
      /vai perguntar pela criança/i.test(await corpo()));
    await pg.locator('.overlay textarea#mot-txt')
      .fill('A observação é sobre o sono, e quem dá a dose precisa dela.');
    await pg.locator('.overlay button').filter({ hasText: /^Liberar$/ }).first().click();
    await pg.waitForTimeout(1200);
    cobrar('liberado, a tela diz que a liberação é DESTA ATA e é retirável',
      /desta ata/i.test(await conteudo()) || /retirar a liberação/i.test(await conteudo()));
    cobrar('e a liberação viva aparece para poder ser retirada',
      /Leituras liberadas agora/i.test(await conteudo()),
      'liberação que não se retira é ampliação permanente de acesso pela porta dos fundos');
  }
}
cobrar('nenhuma exceção na decisão da coordenação', erros.length === 0, erros[0]);
await fechar();
await fechar();

/* A NOTA FISCAL, na Enfermagem. Nada de `if` que pula em silêncio: uma
   cobrança que só roda quando encontra a porta é uma cobrança desligada que
   ninguém desligou (§6.19). Se a porta não estiver lá, isto REPROVA. */
await fechar();
await trocar('enfermagem');
erros.length = 0;
cobrar('a Saúde abre para a Enfermagem', await doMais('Saúde'));
cobrar('a aba Compras existe', await clicar(/^Compras$/));
const verNota = pg.locator('main.conteudo button.olho').filter({ hasText: /nota/i }).first();
cobrar('a compra com papel guardado tem botão de olho',
  (await verNota.count()) > 0,
  '"com nota" passou a querer dizer que HÁ nota, e não que alguém digitou algo no campo');
if (await verNota.count()) {
  await verNota.click();
  await pg.waitForTimeout(900);
  cobrar('e a nota fiscal abre na tela',
    (await pg.locator('.overlay img.previa-img, .overlay iframe.previa-quadro').count()) > 0);
  await fechar();
}
/* O MOVIMENTO DO ARMÁRIO (fase 109) — a caixa que ninguém podia abrir.
   A cobrança é pelo CONTEÚDO: procura a conferência que não fechou, que é o
   caso que fez esta tela existir. */
await fechar();
cobrar('a aba Estoque existe', await clicar(/^Estoque$/));
const verMovimento = pg.locator('main.conteudo button.olho')
  .filter({ hasText: /movimento/i }).first();
cobrar('cada item do armário oferece o movimento', (await verMovimento.count()) > 0,
  'a tabela era escrita por três lugares e lida por nenhum desde a migração 0200');
if (await verMovimento.count()) {
  await verMovimento.click();
  await pg.waitForTimeout(900);
  const folha = await pg.locator('.overlay .sheet').innerText();
  cobrar('e o movimento conta a história: o que entrou, e o que saiu',
    /Chegou remédio/i.test(folha) && /Dose administrada/i.test(folha),
    'o histórico mostrava caixas chegando e nenhuma saindo — era esse o defeito');
  cobrar('cada linha do movimento tem o nome de quem a fez',
    /Fictícia|Fictício/.test(folha));
  await fechar();
}

/* E A AUDITORIA, na coordenação (fase 112). Ela era escrita por todo serviço
   e não tinha rota que a lesse — a maior das pontas soltas da varredura. */
await fechar();
await trocar('coordenador');
erros.length = 0;
await aba('Acolhidos');
await clicar(/Alice/);
const perfilCoord = await conteudo();
cobrar('a coordenação vê o rastro do registro da criança',
  /Quem mexeu no registro/i.test(perfilCoord),
  'a §7 promete "Auditoria (leitura)" à coordenação na própria casa');
cobrar('e o rastro abre', await clicar(/Ver o rastro/));
const rastro = await conteudo();
cobrar('com o nome de quem agiu e a FINALIDADE declarada',
  /Finalidade declarada/i.test(rastro) && /Fictícia|Fictício/.test(rastro),
  'a finalidade é a razão de metade destas linhas existirem');
/*
 * O TRABALHO DA EQUIPE (fase 117).
 *
 * A Fundação pediu em 15/09; a fase 112 tinha recusado, e a recusa dizia que,
 * se ela pedisse, viraria outro caminho **com finalidade escrita e registro da
 * própria consulta**. As cobranças abaixo são as três condições, na tela.
 */
/* A folha do rastro ficou aberta no passo anterior; sem fechá-la, o clique em
 * "Mais" acontece por baixo dela e o percurso segue na tela errada. */
await fechar();
await doMais('trabalho da equipe');
await pg.waitForTimeout(700);
const trabalhoVazio = await conteudo();
cobrar('a coordenação alcança o trabalho da equipe',
  /trabalho da equipe/i.test(trabalhoVazio),
  'a §7 passou a prometer isto a três cargos');
cobrar('e a tela diz, antes de tudo, que não conta nada',
  /não conta nada|somar por pessoa é medir gente/i.test(trabalhoVazio),
  'um total ao lado de um nome é uma avaliação que ninguém assinou');
/* Abrir sem finalidade tem de ser recusado NA TELA, e não só no servidor: a
 * recusa que só aparece depois do clique ensina que o campo é decorativo. A
 * pessoa é escolhida ANTES, senão a recusa que volta é a outra. */
const alvo = pg.locator('#tr-alvo');
if (await alvo.count()) await alvo.selectOption({ index: 1 });
await clicar(/Abrir o período/);
const semFinalidade = await conteudo();
cobrar('abrir sem escrever a finalidade é recusado',
  /finalidade/i.test(semFinalidade), semFinalidade.slice(0, 200));
const motivo = pg.locator('#tr-fim');
if (await motivo.count()) await motivo.fill('Apuração do episódio da noite de ontem.');
await clicar(/Abrir o período/);
await pg.waitForTimeout(900);
const trabalho = await conteudo();
cobrar('com a finalidade escrita, o período abre e mostra o que foi feito',
  /Chamada aberta|ATA|Dose confirmada|Pedido à cozinha/i.test(trabalho),
  trabalho.slice(0, 200));
cobrar('cada linha tem o nome de quem fez, e a hora',
  /fict[íi]ci[ao]/i.test(trabalho) && /\d{2}:\d{2}/.test(trabalho),
  trabalho.slice(0, 200));
cobrar('e NENHUM total aparece — nem registros, nem plantões, nem média',
  !/\b\d+\s*(registros|plantões|a[çc][õo]es|doses no per[íi]odo)\b/i.test(trabalho),
  'a tela responde "o que foi feito", e não "quem fez mais"');
await aba('Acolhidos');
await clicar(/Alice/);
const perfilDeNovo = await conteudo();
cobrar('e a auditoria da CRIANÇA continua no lugar, sem filtro por pessoa da equipe',
  /Quem mexeu no registro/i.test(perfilDeNovo),
  'a recusa da fase 112 fica de pé: o outro caminho é outro, e não um filtro nesta tela');
await clicar(/Ver o rastro/);
const rastroDeNovo = await conteudo();
cobrar('e sem contar nada — nem acessos, nem aberturas por pessoa',
  !/\b\d+\s*(acessos|aberturas|vezes)\b/i.test(rastroDeNovo),
  'um total ao lado de um nome é uma avaliação que ninguém assinou');

/*
 * E EM PORTUGUÊS (fase 115).
 *
 * O mapa de rótulos da fase 112 cobria treze das 170 ações que o sistema
 * grava: o resto chegava aqui como o código cru, em inglês. A cobrança é pela
 * FORMA — se sobrar um `algo.algo_assim` na tela, é rótulo que faltou.
 */
cobrar('e em português: nenhuma linha mostra o código cru da ação',
  !/\b[a-z][a-z_]{2,}\.[a-z_]{3,}\b/.test(rastroDeNovo.replace(/\S+@\S+/g, '')),
  rastroDeNovo.slice(0, 200));
cobrar('inclusive a leitura excepcional, que o BANCO escreve e não o serviço',
  /Leitura excepcional de relato/.test(rastroDeNovo),
  'as 25 ações mais sensíveis saem de dentro de funções SECURITY DEFINER');

/*
 * ====================================================== O PERÍODO DA CASA
 *
 * Fase 121, resposta da Fundação em 15/09: *"acompanhamento semanal é um bom
 * caminho: ver como foi a casa toda aquela semana, tipo uma ata geral de toda
 * semana"*, com o período livre — *"um dia, dois, três, uma semana, um mês,
 * seis meses"*.
 *
 * As cobranças são as decisões do relatório, na tela: o período é de fato
 * livre, a parte boa vem primeiro, a criança não é contada, e o texto de
 * acesso restrito não aparece.
 */
await fechar();
await doMais('período da casa');
await pg.waitForTimeout(900);
const oPeriodo = await conteudo();
cobrar('a coordenação alcança o período da casa',
  /per[íi]odo da casa/i.test(oPeriodo),
  'é o relatório que ele descreveu como "uma ata geral de toda semana"');
cobrar('e os atalhos de período estão lá — de um dia a seis meses',
  /Hoje/.test(oPeriodo) && /7 dias/.test(oPeriodo) && /6 meses/.test(oPeriodo),
  'o período livre foi o pedido, com estas palavras');

/* A PARTE BOA VEM PRIMEIRO. É a frase dele — *"as observações que os
 * educadores botam têm que ser ponderadas para ser trazido coisas boas e
 * negativas"* —, e a ordem da tela é o que a cumpre. */
const iConquistas = oPeriodo.toLowerCase().indexOf('conquistas');
const iOcorrencias = oPeriodo.toLowerCase().indexOf('ocorrências');
cobrar('as conquistas vêm ANTES das ocorrências',
  iConquistas >= 0 && iOcorrencias >= 0 && iConquistas < iOcorrencias,
  'um resumo que abre pela lista de falhas ensina a equipe a ler a semana assim');
cobrar('e as memórias da criança estão no relatório da casa',
  /Mem[óo]rias/i.test(oPeriodo),
  'a parte boa não é um apêndice: ela é metade do que ele pediu');

/* QUEM NÃO ESTÁ COMENDO O QUÊ — com a frase ao lado, e sem número nenhum. */
cobrar('"quem não está comendo o quê" aparece, com o que foi escrito ao lado',
  /Refei[çc][õo]es com exce[çc][ãa]o/i.test(oPeriodo) && /dor de barriga/i.test(oPeriodo),
  '"recusou" três vezes sem a frase viraria um traço da criança');
/* A cobrança é pela FORMA do que seria uma contagem, e não pela vizinhança
 * do nome: a primeira versão procurava "nome seguido de número" e acusava a
 * própria DATA que vem ao lado do nome em cada linha. Três linhas embaixo de
 * um nome são três fatos; "3 recusas" é uma ficha. */
cobrar('e nenhuma contagem por criança — nem "vezes", nem "recusas"',
  !/\b\d+\s*(vezes|recusas|exce[çc][õo]es de|faltas)\b/i.test(oPeriodo),
  'o que a seção mostra é o que foi escrito, e não quantas vezes aconteceu');

/* O QUE NÃO SAI. A ocorrência de acesso restrito entra como contagem, e a
 * ressalva manda o leitor à tela certa. */
cobrar('a ressalva diz o que NÃO está escrito aqui, e onde se lê',
  /Aus[êe]ncia de registro n[ãa]o [ée] aus[êe]ncia de trabalho/i.test(oPeriodo),
  'quem lê de fora conclui o contrário se ninguém escrever');
cobrar('o par de doses aparece com o período anterior, e não como porcentagem',
  /contra \d+ em \d{2}\/\d{2}/.test(oPeriodo),
  '"aumento de medicamentos" foi o pedido; a conta é de quem lê');

/* E a folha, que é o que sai da casa. */
await clicar(/Ver a folha antes de baixar/);
await pg.waitForTimeout(700);
const folhaDoPeriodo = await conteudo();
cobrar('a folha do período abre em pré-visualização',
  /Pr[ée]-visualiza[çc][ãa]o/i.test(folhaDoPeriodo),
  folhaDoPeriodo.slice(0, 200));
cobrar('e ela carrega a ressalva, e não só a tabela',
  /aus[êe]ncia de trabalho|ordenada por quantidade/i.test(folhaDoPeriodo),
  'a folha circula sem ninguém por perto para explicar o contexto');
await fechar();


/*
 * ====================================================== A visão do Gestor Geral
 *
 * Decisão da Fundação em 15/09: *"o gestor vê tudo o que ele quiser, em uma
 * visão apenas contagens e métricas, na visão total ele vê tudo."* A fase 117
 * o tinha deixado de fora, e a ausência estava escrita como decisão minha.
 *
 * O que estas cobranças guardam não é que a tela existe — é o que ficou de
 * fora dela: a ordem por NOME e o aviso ANTES do número.
 */
console.log('\n🏛️ Gestor Geral — o painel e as contagens');
await trocar('gestor_geral');
erros.length = 0;

/*
 * O PAINEL DAS OITO CASAS (fase 120) — a tela INICIAL dele.
 *
 * Ele pediu isto com todas as letras: *"como o dia a dia é controlado pelos
 * coordenadores, ele não vai querer que a tela inicial dele seja essa de
 * controle total."* A primeira cobrança é justamente essa: o que aparece sem
 * ninguém tocar em nada.
 */
const inicial = await conteudo();
cobrar('o Gestor Geral ABRE no painel, e não na linha do dia',
  /oito casas, em números/i.test(inicial),
  inicial.slice(0, 160));
cobrar('e o painel abre pelo que a INSTITUIÇÃO fez, antes das casas',
  inicial.toLowerCase().indexOf('o que o pão dos pobres fez') >= 0
  && inicial.toLowerCase().indexOf('o que o pão dos pobres fez')
     < inicial.toLowerCase().indexOf('casa a casa'),
  'a pergunta é "o que o Pão dos Pobres fez", e comparar casas é o segundo olhar');
cobrar('o gasto vem com a ressalva colada, e não em nota de rodapé',
  /sem valor lançado/i.test(inicial) && /MAIOR do que este número/i.test(inicial),
  'um total incompleto num relatório de prestação de contas é pior que nenhum');
/*
 * A FRASE E AS CAIXAS DO CONCEITO (fase 139) — terceira versão desta cobrança.
 *
 * Ela já disse "não existe campo de nota, boletim ou conceito" (verdade até a
 * 137), depois "o conceito existe e o painel não o conta" (verdade até a 139).
 * Agora o painel conta. **Cobrança que não muda com o sistema guarda uma
 * mentira**, e é por isso que ela é reescrita junto.
 */
cobrar('a tela diz que não existe NOTA, e que o que ela conta é o CONCEITO',
  /não existe nota escolar/i.test(inicial) && /CONCEITO do bimestre/i.test(inicial),
  'estimar "boas notas" a partir de texto livre continuaria sendo inventar um número');
cobrar('o painel tem a caixa de quem está acompanhando o ano',
  /Acompanhando o ano/i.test(inicial),
  'é a caixa que ele pediu em 09/09, e ela passou a ter de onde sair');
cobrar('e a caixa de quem NÃO está — a que faz a casa agir',
  /pede providência/i.test(inicial),
  'painel que mostra só quem vai bem ensina a olhar para o lado bom');
cobrar('e diz que o conceito conta pelo BIMESTRE, não pela data de digitação',
  /conta pelo BIMESTRE/i.test(inicial),
  'o retorno atrasado da escola é o caso comum, e ele não pode cair no bimestre errado');
cobrar('e diz que a ordem é o código da casa, nunca o resultado',
  /nunca por resultado/i.test(inicial),
  'ordenar por número é a classificação pronta');
/* O gráfico existe, e cada barra traz o NÚMERO por extenso: quem não enxerga a
 * barra lê a lista, e num celular não há "passar o mouse". */
const barras = await pg.locator('main.conteudo figure.gr svg rect.gr-barra').count();
cobrar('as oito casas viram barras, uma por casa', barras >= 8, `vieram ${barras}`);
cobrar('e a tabela inteira continua na tela, dobrada',
  await pg.locator('main.conteudo details.dobra').count() > 0,
  'o gráfico é o ponto; a tabela é o que se copia para o relatório');
cobrar('nenhuma exceção no painel', erros.length === 0, erros[0]);
erros.length = 0;
await doMais('trabalho da equipe');
await pg.waitForTimeout(700);
const gestorTrabalho = await conteudo();
cobrar('o Gestor Geral alcança o trabalho da equipe',
  /trabalho da equipe/i.test(gestorTrabalho),
  'a fase 117 o deixava de fora; a Fundação decidiu o contrário em 15/09');
cobrar('e tem a aba de CONTAGENS, que os outros cargos não têm',
  /Contagens/.test(gestorTrabalho), gestorTrabalho.slice(0, 200));
await clicar(/^Contagens$/);
const motivoG = pg.locator('#tr-fim');
if (await motivoG.count()) await motivoG.fill('Preparação da reunião mensal com a diretoria.');
await clicar(/Contar o período/);
await pg.waitForTimeout(900);
const contagens = await conteudo();
cobrar('as contagens abrem, por unidade, setor, pessoa e tipo de registro',
  /Por unidade/i.test(contagens) && /Por pessoa/i.test(contagens)
  && /Por tipo de registro/i.test(contagens), contagens.slice(0, 250));
/* Minúsculas dos dois lados: `text-transform: uppercase` no CSS faz o
 * `eyebrow` voltar como "POR UNIDADE", e comparar posição de texto sensível a
 * caixa reprova uma tela certa — é a armadilha anotada no `ensaio.mjs`. */
const min = contagens.toLowerCase();
cobrar('e o aviso vem ANTES do número, não em nota de rodapé',
  min.indexOf('contam registros') >= 0
  && min.indexOf('contam registros') < min.indexOf('por unidade'),
  'é a razão de a tela não existir antes da decisão, e ela não deixou de valer');
cobrar('a tela diz que nenhuma contagem é por criança',
  /Nenhuma contagem aqui é por criança/i.test(contagens),
  'a regra 3 protege quem é cuidado, e não foi o que a Fundação revisou');
/* A ordem é a regra: por NOME, nunca por total. Uma lista ordenada por número
 * JÁ É a classificação, e ela apareceria sem ninguém ter decidido fazê-la. */
const nomesNaTela = [...contagens.matchAll(/^(.+?) \(fictíci[ao]\)$/gim)].map((x) => x[1]);
cobrar('e a ordem é por nome, nunca por total',
  nomesNaTela.length === 0
  || JSON.stringify(nomesNaTela) === JSON.stringify([...nomesNaTela].sort((a, b) => a.localeCompare(b))),
  `veio ${JSON.stringify(nomesNaTela)}`);
cobrar('nenhuma exceção na visão do Gestor Geral', erros.length === 0, erros[0]);


/*
 * ============ O QUE SE ESCREVEU SOBRE A CRIANÇA (fase 128) ============
 *
 * A decisão de 20/09 é de uma linha — **o Gestor Geral vê só a contagem** —, e o
 * percurso só prova isso se percorrer os DOIS lados: a técnica, que lê a
 * narrativa, e o gestor, que vê o número e não o texto. Um teste de servidor diz
 * que a rota recorta; isto diz que a TELA mostra o recorte.
 *
 * O Kauã é a criança de quem a ocorrência `o1` fala, e dela são os três relatos
 * do protótipo — dois abertos e um restrito, a narrativa em que a educadora diz
 * que ficou com medo de sair e deixar a casa.
 */
console.log('\n🗣️ O que se escreveu sobre a criança (fase 128)');

async function abrirOKaua() {
  await aba('Acolhidos');
  const cartao = pg.locator('main.conteudo button').filter({ hasText: /Kauã/ });
  if (!(await cartao.count())) return false;
  await cartao.first().click();
  await pg.waitForTimeout(1100);
  return true;
}

await trocar('equipe_tecnica');
erros.length = 0;
if (!(await abrirOKaua())) {
  cobrar('o perfil do Kauã abre para a equipe técnica', false, 'não achei o cartão dele');
} else {
  /* `.eyebrow` tem text-transform: uppercase, e o innerText devolve o texto
     TRANSFORMADO: comparar sensível a maiúsculas passa por engano. */
  const dela = (await conteudo()).toLowerCase();
  cobrar('o perfil traz o bloco do que se escreveu sobre ela',
    dela.includes('o que se escreveu sobre'), dela.slice(0, 200));
  cobrar('e a equipe técnica LÊ a narrativa restrita — é o acompanhamento dela',
    dela.includes('fiquei com medo'),
    'sem o texto, a técnica volta a abrir a ocorrência para ler o que já é dela');
  cobrar('a narrativa restrita chega marcada como restrita, e não solta',
    dela.includes('área restrita'),
    'sem a marca, quem lê não sabe que aquilo não circula pelo plantão');
  cobrar('e para ela não há contagem — ela alcança tudo o que existe',
    !/existe[m]? \d+ relatos? em área restrita/.test(dela),
    'a contagem é para quem NÃO alcança; para quem alcança, ela é ruído');
}

await trocar('gestor_geral');
if (!(await abrirOKaua())) {
  cobrar('o perfil do Kauã abre para o Gestor Geral', false, 'não achei o cartão dele');
} else {
  const dele = (await conteudo()).toLowerCase();
  cobrar('o Gestor Geral vê que EXISTE relato em área restrita',
    /existe[m]? \d+ relatos? em área restrita/.test(dele),
    'esconder que existem faria a equipe procurar noutro lugar');
  cobrar('e NÃO vê o texto da narrativa — é a decisão de 20/09',
    !dele.includes('fiquei com medo'),
    'a leitura é o comando do §26.2, com finalidade escrita e registro');
  cobrar('a frase da contagem está em português, e não "N relato(s)"',
    !dele.includes('relato(s)'),
    'quem lê isto às 23h merece a frase certa');
  cobrar('nenhuma exceção no bloco dos relatos', erros.length === 0, erros[0]);
}

/* Devolve o cargo que as seções de baixo esperam. O percurso é SEQUENCIAL: quem
   troca de cargo no meio e não devolve faz a próxima seção reprovar por um
   motivo que não é dela — e foi o que esta linha custou para eu aprender. */
await trocar('equipe_tecnica');


/*
 * ============ A ESCALA NÃO SE DEDUZ (fase 129) ============
 *
 * *"Não cabe a nós deduzir"* — decisão da Fundação, 20/09/2026. O turno NOTURNO
 * do protótipo é o que está sem escala lançada, e é ele que mostra as duas
 * metades: o sistema não diz quem devia estar, e diz quem esteve.
 *
 * O turno DIURNO tem escala, e o percurso confere que ele fica CALADO — aviso
 * que aparece em todo turno é aviso que a equipe aprende a não ler.
 */
console.log('\n📋 A escala não se deduz (fase 129)');
await trocar('lider_diurno');
erros.length = 0;

if (await aba('Passagem')) {
  const noturno = pg.locator('main.conteudo button').filter({ hasText: /Plantão noturno/ });
  if (!(await noturno.count())) {
    cobrar('a lista de plantões traz o turno noturno', false, (await conteudo()).slice(0, 200));
  } else {
    await noturno.first().click();
    await pg.waitForTimeout(1000);
    const semEscala = (await conteudo()).toLowerCase();
    cobrar('a passagem do turno sem escala diz que ninguém a lançou',
      semEscala.includes('ninguém lançou a escala'),
      'sem isto, a tela cala sobre o motivo de não haver nome a cobrar');
    cobrar('e diz que o sistema não deduz quem devia estar',
      semEscala.includes('não diz quem devia estar'),
      'é a decisão da Fundação, e a tela precisa dizê-la em voz alta');
    cobrar('e que quem esteve na casa assina do mesmo jeito',
      semEscala.includes('quem esteve na casa') || semEscala.includes('quem esteve'),
      'é isto que segura a educadora das 23h: a escala decide quem é COBRADO, nunca quem PODE');
    cobrar('e NÃO nomeia ninguém como faltando',
      !semEscala.includes('sem passagem até agora'),
      'nomear alguém sem escala lançada é o defeito que a 0420 existiu para corrigir');
    cobrar('a pílula do cargo não diz "você não estava na escala" onde escala não há',
      !semEscala.includes('você não estava na escala'),
      'sugeriria que havia uma escala e a pessoa ficou de fora');
  }
}

/* A ATA está na barra de alguns cargos e atrás do "Mais" noutros. */
if ((await aba('ATA')) || (await doMais('ATA'))) {
  const doDiurno = pg.locator('main.conteudo button').filter({ hasText: /^Turno diurno$/ });
  if (await doDiurno.count()) {
    await doDiurno.first().click();
    await pg.waitForTimeout(1000);
    const comEscala = (await conteudo()).toLowerCase();
    cobrar('a ATA do turno COM escala fica calada sobre a escala',
      !comEscala.includes('ninguém lançou a escala'),
      'aviso que aparece em todo turno é aviso que a equipe aprende a não ler');
    cobrar('e nomeia quem não passou o plantão, que é a cobrança com nome',
      comEscala.includes('não passou o plantão'),
      'com escala lançada, a pendência TEM nome — e é o que permite ir atrás da pessoa');
  }
  const doNoturno = pg.locator('main.conteudo button').filter({ hasText: /^Turno noturno$/ });
  if (await doNoturno.count()) {
    await doNoturno.first().click();
    await pg.waitForTimeout(1000);
    const semEscala = (await conteudo()).toLowerCase();
    cobrar('a ATA do turno SEM escala diz que ninguém a lançou',
      semEscala.includes('ninguém lançou a escala'),
      'é o líder que fecha a ATA, e é ele quem precisa saber por que não há nome');
  }
}
cobrar('nenhuma exceção nas telas da escala não lançada', erros.length === 0, erros[0]);


/*
 * ============ O COMPROMISSO OLHA A ESCALA LANÇADA (fase 131) ============
 *
 * `app_staff_for_commitment` lia a `work_schedule`, a escala SEMANAL do desenho
 * anterior à escala por data — e **nenhuma casa nunca a preencheu**. A tela
 * dizia *"(fora da escala deste horário)"* em TODO nome, para sempre; era a
 * mesma dedução que a fase 129 tirou da passagem, num lugar que ela não
 * alcançou.
 *
 * A cobrança que vale é a que prova que o sinal **DISTINGUE**: alguns nomes com
 * o aviso e outros sem. Só cobrar "há aviso" passaria com a função velha, que
 * o punha em todos — e foi assim que o defeito viveu da 0610 até aqui.
 */
console.log('\n📆 O compromisso olha a escala lançada (fase 131)');
await trocar('equipe_tecnica');
erros.length = 0;

if (!((await aba('Agenda')) || (await doMais('Agenda')))) {
  cobrar('a Agenda tem porta para a equipe técnica', false, 'não achei a aba nem o Mais');
} else {
  const marcar = pg.locator('main.conteudo button').filter({ hasText: /Marcar compromisso/i });
  if (!(await marcar.count())) {
    cobrar('a Agenda tem o botão de marcar compromisso', false, (await conteudo()).slice(0, 200));
  } else {
    await marcar.first().click();
    await pg.waitForTimeout(1200);
    /* A lista de pessoas só aparece ao escolher "um educador com nome". */
    const comNome = pg.locator('button, label').filter({ hasText: /educador com nome/i });
    if (await comNome.count()) { await comNome.first().click(); await pg.waitForTimeout(1200); }

    const folha = await corpo();
    const comAviso = (folha.match(/\(fora da escala deste horário\)/g) ?? []).length;
    /* Os nomes da lista: as linhas do select de responsável. */
    const nomes = (await pg.locator('select option').allInnerTexts())
      .filter((t) => /\(fict/i.test(t));

    cobrar('a lista de responsáveis traz nomes', nomes.length > 1,
      `veio ${JSON.stringify(nomes)}`);
    cobrar('alguém aparece FORA da escala do horário', comAviso > 0,
      'sem isto o sinal não avisa nada');
    cobrar('e alguém aparece DENTRO dela — o sinal distingue pessoas',
      comAviso < nomes.length,
      'o aviso em TODO nome é o defeito que viveu da 0610 até a 131: a função lia a '
      + 'work_schedule, que nenhuma casa preencheu, e respondia o mesmo para todos');
    await fechar();
  }
}
cobrar('nenhuma exceção na tela de marcar compromisso', erros.length === 0, erros[0]);

/* Devolve o cargo: o percurso é sequencial. */
await trocar('equipe_tecnica');

/* Devolve o cargo, outra vez: o percurso é sequencial. */
await trocar('equipe_tecnica');


/*
 * ====================== O DOSSIÊ E O ÁLBUM (fase 124)
 *
 * Os dois pedidos que a equipe fez e a Fundação repassou em 15/09: *"ter foto
 * das crianças no perfil […] podendo previamente visualizar o que está sendo
 * hospedado e confirmar"* e *"poder visualizar a hora que eles quiserem e
 * baixar"*.
 *
 * O bloco abre a pasta da criança, e cobra as duas entregas onde elas moram.
 */
await fechar();
await aba('Acolhidos');
await clicar(/Alice/);
if (await clicar(/Dossiê e vivências/)) {
  await pg.waitForTimeout(900);

  /* O BAIXAR, na folha do documento já conferido.
   *
   * O botão da tela é "👁 Abrir", e não o título do documento: quem abre uma
   * pasta de papel clica no olho, não no nome. A primeira versão deste bloco
   * procurava por "Certidão" e não achava nada — e passava calada, porque o
   * `if` não entrava. Cobrança que vive dentro de um `if` que nunca é
   * verdadeiro é cobrança que não existe. */
  const conferido = pg.locator('main.conteudo button').filter({ hasText: /Abrir/ }).first();
  cobrar('o dossiê tem documento com arquivo para abrir', (await conferido.count()) > 0,
    'sem documento guardado, o botão de baixar não teria onde aparecer (§6.19)');
  if (await conferido.count()) {
    await conferido.click();
    await pg.waitForTimeout(900);
    const folhaDoc = await corpo();
    cobrar('o documento do dossiê tem o botão de baixar',
      /Baixar/i.test(folhaDoc),
      'o botão existe na biblioteca de anexos desde a fase 47, e faltava justamente aqui');
    await fechar();
  }

  /*
   * O QUE NASCEU EM OUTRA TELA E CHEGOU AQUI (fase 125).
   *
   * *"Se elas quiserem botar alguma bula, alguma receita, alguma coisa ali pela
   * enfermagem, que já caia direto no perfil da criança."* A receita vivia presa
   * à prescrição, na tela de Saúde, e o dossiê — que só lê `document` — não sabia
   * que ela existia.
   */
  const pastaDaAlice = await conteudo();
  cobrar('a receita anexada na tela de Saúde aparece no dossiê da criança',
  /Receita anexada à prescrição/i.test(pastaDaAlice), pastaDaAlice.slice(0, 250));
  cobrar('a bula também — e ela não existia em lugar nenhum',
  /Bula anexada à prescrição/i.test(pastaDaAlice),
  'ele pediu "alguma bula, alguma receita", e só a receita existia');
  cobrar('e o anexo do diário de internação, que sumia com a internação encerrada',
  /Anexo do diário de internação/i.test(pastaDaAlice),
  'é o laudo que o hospital entregou, e ele é da criança');

  /* AS VÁRIAS FOTOS, no álbum. */
  const abaAlbum = pg.locator('main.conteudo button').filter({ hasText: /Vivências/i });
  if (await abaAlbum.count()) {
    await abaAlbum.first().click();
    await pg.waitForTimeout(900);
  }
  const album = await conteudo();
  cobrar('o álbum abre com a vivência semeada',
    /Aniversário de 7 anos|bolo de chocolate/i.test(album), album.slice(0, 200));

  const verFoto = pg.locator('main.conteudo button').filter({ hasText: /Abrir|Ver/i });
  if (await verFoto.count()) {
    await verFoto.first().click();
    await pg.waitForTimeout(1000);
    const folhaFoto = await corpo();
    cobrar('uma vivência com VÁRIAS fotos diz quantas são',
      /Foto 1 de 3/i.test(folhaFoto), folhaFoto.slice(0, 300));
    cobrar('e dá para passar de uma para a outra',
      (await pg.locator('.overlay button').filter({ hasText: /Próxima/ }).count()) > 0,
      'a festa é UMA vivência, e antes virava três — três vezes a mesma data e a mesma descrição');
    const proxima = pg.locator('.overlay button').filter({ hasText: /Próxima/ }).first();
    if (await proxima.count()) {
      await proxima.click();
      await pg.waitForTimeout(900);
      const segunda = await corpo();
      cobrar('a segunda foto abre, e o aviso de autorização é DELA',
        /Foto 2 de 3/i.test(segunda) && /autorização de uso de imagem/i.test(segunda),
        'a autorização é por foto: a festa pode ter uma com uma criança de outra casa');
    }
    await fechar();
  }

  /* E o campo aceita VÁRIAS de uma vez, com prévia antes de confirmar. */
  if (await clicar(/Registrar uma vivência|Nova vivência/i)) {
    await pg.waitForTimeout(800);
    const campo = pg.locator('.overlay input#viv-foto');
    cobrar('o campo de foto aceita várias de uma vez',
      (await campo.count()) > 0 && (await campo.getAttribute('multiple')) !== null,
      'o campo não tinha `multiple`, e a educadora registrava seis vivências');
    cobrar('e a folha diz que dá para escolher várias',
      /pode escolher várias/i.test(await corpo()),
      'quem não sabe que pode, manda uma de cada vez');
    await fechar();
  }
}
cobrar('nenhuma exceção no dossiê e no álbum', erros.length === 0, erros[0]);

/*
 * E NA TELA DE SAÚDE, O OUTRO LADO (fase 125).
 *
 * É a Enfermagem quem anexa o papel — e a aba de Esquemas, onde o botão vive,
 * só existe para quem cadastra esquema. A primeira versão deste bloco rodou
 * como Gestor Geral, não achou a porta, e passou calada: os dois `if` sem
 * `cobrar` nenhum fizeram a tela inteira sumir do ensaio sem uma linha de
 * saída. É a mesma lição da fase 124 — cobrança dentro de um `if` que nunca
 * entra é cobrança que não existe —, e por isso aqui cada passo cobra.
 */
await fechar();
await trocar('enfermagem');
cobrar('a Enfermagem alcança a tela de Saúde', await doMais('Saúde'),
  'é ela quem anexa a receita; sem a porta, o resto do bloco não teria onde acontecer');
const abaEsquemas = pg.locator('main.conteudo [role="tab"]').filter({ hasText: /^Esquemas$/ });
cobrar('e a aba dos esquemas, onde o papel do médico fica junto da prescrição',
  (await abaEsquemas.count()) > 0, await conteudo().catch(() => ''));
if (await abaEsquemas.count()) {
  await abaEsquemas.first().click();
  await pg.waitForTimeout(900);
}
const receitas = pg.locator('main.conteudo button').filter({ hasText: /Receitas/ }).first();
cobrar('o esquema tem a porta das receitas', (await receitas.count()) > 0,
  (await conteudo()).slice(0, 250));
if (await receitas.count()) {
  await receitas.click();
  await pg.waitForTimeout(1000);
  const folhaRec = await corpo();
  cobrar('a tela de Saúde separa a receita da bula',
    /bula/i.test(folhaRec) && /receita/i.test(folhaRec), folhaRec.slice(0, 250));
  cobrar('e diz que o papel também está no dossiê da criança',
    /dossiê da criança/i.test(folhaRec),
    'sem a frase, a Enfermagem fica na dúvida sobre se o papel "caiu no perfil"');
  await fechar();
}

/* ======================================================================== */
/* O REMÉDIO "SE NECESSÁRIO" — quem dá é o educador, e é no Dia (fase 132).  */
/*                                                                          */
/* Este percurso roda como EDUCADOR de propósito: o caso inteiro é a dose da */
/* madrugada, dada por quem não alcança a tela de Saúde (§7). Se o bloco     */
/* aparecesse só para a Enfermagem, o defeito que a 1390 corrigiu continuaria */
/* de pé com outra roupa.                                                    */
/* ======================================================================== */
console.log('\n💊 O remédio "se necessário" — o educador registra no Dia');
await fechar();
await trocar('educador');
erros.length = 0;
await aba('Dia');
const dia132 = await conteudo();
cobrar('o Dia traz o bloco "Se necessário"', /Se necessário/i.test(dia132),
  dia132.slice(0, 300));
cobrar('com a condição escrita pela Enfermagem na frente de quem decide',
  /Só se:/i.test(dia132) && /37,8/.test(dia132),
  'sem a condição, quem decide às 2h precisaria de outra tela');
cobrar('e com o que já foi dado hoje, com o motivo e o nome de quem deu',
  /Dadas hoje/i.test(dia132) && /Acordou às 2h/i.test(dia132)
    && /Tainá Souza/i.test(dia132), dia132.slice(0, 400));
cobrar('o desfecho é dito como sem prazo, em palavra e não em cor',
  /não há prazo/i.test(dia132) && /ninguém vai cobrar/i.test(dia132),
  'pendência com prazo sobre quem cuidou de madrugada tem uma só forma de ser baixada');

/* O registro em si: o motivo curto NÃO passa, e é essa recusa que faz a folha
 * valer. "Febre" sozinho não diz à Enfermagem se aquilo vira prescrição. */
cobrar('há por onde registrar que foi dado', await clicar(/Registrar que foi dado/),
  'sem o botão, o remédio da madrugada volta a não ficar em lugar nenhum');
const folha132 = await corpo();
cobrar('a folha repete a orientação da Enfermagem enquanto se escreve',
  /A orientação diz/i.test(folha132), folha132.slice(0, 300));
const btRegistrar = pg.locator('.overlay .sheet button')
  .filter({ hasText: /Registrar com o meu nome/ }).first();
cobrar('o botão nasce desabilitado, sem motivo escrito',
  await btRegistrar.isDisabled().catch(() => false));
await pg.locator('#prn-mot').fill('febre');
cobrar('e continua desabilitado com "febre" sozinho',
  await btRegistrar.isDisabled().catch(() => false),
  'o piso de dez caracteres é o mesmo do relato (0300)');
await pg.locator('#prn-mot').fill(
  'Acordou às 4h com 38,2 °C, dizendo que o corpo doía; ofereci água antes.');
cobrar('com o fato escrito, o registro libera',
  !(await btRegistrar.isDisabled().catch(() => true)));
await btRegistrar.click();
await pg.waitForTimeout(1100);
const depois132 = await conteudo();
cobrar('a dose registrada aparece na hora, com o nome de quem deu',
  /Acordou às 4h/i.test(depois132), depois132.slice(0, 400));
cobrar('e a contagem do dia diz quantas vezes já foi preciso',
  /dada 2× hoje/i.test(depois132), depois132.slice(0, 400));

/* O desfecho, escrito depois — e uma vez. */
cobrar('há por onde escrever o que aconteceu depois',
  await clicar(/Escrever o que aconteceu depois/));
const folhaDesf = await corpo();
cobrar('a folha do desfecho mostra por que a dose foi dada',
  /Foi dado porque/i.test(folhaDesf), folhaDesf.slice(0, 300));
cobrar('e avisa que se escreve uma vez e não se reescreve',
  /não se reescreve/i.test(folhaDesf), folhaDesf.slice(0, 300));
await pg.locator('#prn-desf').fill(
  'A febre cedeu em cerca de 40 minutos; dormiu até as 7h e não voltou.');
await pg.locator('.overlay .sheet button').filter({ hasText: /^Registrar$/ }).first().click();
await pg.waitForTimeout(1100);
const comDesfecho = await conteudo();
cobrar('o desfecho fica na dose, e o botão de escrever sai dela',
  /Depois:/i.test(comDesfecho) && /cedeu em cerca de 40 minutos/i.test(comDesfecho),
  comDesfecho.slice(0, 400));

/* ======================================================================== */
/* QUEM LEVOU A CRIANÇA NA CONSULTA (fase 133).                             */
/*                                                                          */
/* A pergunta é um BOTÃO e não um campo, e o percurso cobra as duas metades  */
/* disso: "Fui eu" não pede nome nenhum — senão a Enfermagem digitaria o     */
/* próprio nome vinte vezes por semana —, e "Outra pessoa" exige o nome.     */
/* ======================================================================== */
console.log('\n🚗 Quem levou a criança na consulta');
await fechar();
await trocar('educador');
erros.length = 0;
await aba('Acolhidos');
await clicar(/Alice/);
/*
 * A LISTA DE TIPOS VEM DO SERVIDOR (fase 140) — e o botão que dava 500 saiu.
 *
 * A folha tinha a lista escrita à mão, com um "Vacina" que o enum do banco não
 * tem: registrar vacina devolvia *Internal server error*. E o enum tinha
 * "Emergência" e "Terapia", que a tela nunca ofereceu. O percurso cobra as duas
 * pontas: o que saiu e o que entrou.
 */
cobrar('o perfil tem por onde registrar o atendimento de saúde',
  await clicar(/Registrar atendimento de saúde/),
  'quem acompanhou é quem escreve, e o educador tem de alcançar esta folha');
const folha133 = await corpo();
cobrar('a folha pergunta quem levou a criança', /Quem levou a criança/i.test(folha133),
  folha133.slice(0, 300));
cobrar('a lista de tipos NÃO oferece mais "Vacina"',
  !/\bVacina\b/i.test(folha133),
  'a tela oferecia um tipo que o enum não tem, e o servidor devolvia 500');
cobrar('e passou a oferecer Emergência e Terapia, que o banco aceita',
  /Emergência/i.test(folha133) && /Terapia/i.test(folha133),
  'dois tipos de atendimento existiam no banco e não tinham como ser registrados');
cobrar('a folha pergunta como ela estava ao CHEGAR e ao SAIR',
  /ao CHEGAR/i.test(folha133) && /ao SAIR/i.test(folha133),
  'as quatro opções são as do modelo de papel da Fundação (0530)');
cobrar('e diz, na tela, que isso não é avaliação da criança',
  /não é avaliação da criança/i.test(folha133),
  'quem preenche às 19h precisa saber para que serve — e para que NÃO serve');

/*
 * O TIPO PASSOU A SER ESCOLHIDO (fase 140), e não vem mais preenchido.
 *
 * Antes a folha nascia em "consulta", porque a lista era local. Agora ela nasce
 * VAZIA e espera o servidor — e enquanto ninguém escolhe, o envio fica barrado.
 * É de propósito: escolher por quem preenche era o que deixava a lista errada
 * passar sem ninguém olhar.
 */
const btEnviaEvo = pg.locator('.overlay .sheet button')
  .filter({ hasText: /Enviar para a Enfermagem/ }).first();
cobrar('sem escolher o tipo, não se envia',
  await btEnviaEvo.isDisabled().catch(() => false),
  'a folha nasce sem tipo porque a lista vem do servidor');
await pg.locator('.overlay .sheet .opt').filter({ hasText: /^Consulta$/ }).first().click();
await pg.waitForTimeout(250);
cobrar('e nasce em "Fui eu", sem pedir nome nenhum',
  (await pg.locator('.overlay .sheet #evo-quem').count()) === 0,
  'campo de nome sempre aberto é campo preenchido por obrigação');

/* "Outra pessoa": o nome passa a ser exigido, e é o caso do motorista. */
await pg.locator('.overlay .sheet button').filter({ hasText: /^Outra pessoa$/ }).first().click();
await pg.waitForTimeout(350);
cobrar('escolhendo "Outra pessoa", o nome é pedido',
  (await pg.locator('.overlay .sheet #evo-quem').count()) === 1);
await pg.locator('#evo-ret').fill(
  'Voltou tranquila, sem dor referida; comeu bem no jantar.');
const btEnviar = pg.locator('.overlay .sheet button')
  .filter({ hasText: /Enviar para a Enfermagem/ }).first();
cobrar('e sem o nome não se envia',
  await btEnviar.isDisabled().catch(() => false),
  'dizer "foi outra pessoa" e não dizer quem é pior do que não perguntar');
await pg.locator('#evo-quem').fill('Seu Jorge, motorista da Fundação (fictício)');
cobrar('com o nome escrito, o envio libera',
  !(await btEnviar.isDisabled().catch(() => true)));
await btEnviar.click();
await pg.waitForTimeout(1200);

/* A leitura, do outro lado: a Enfermagem que tria vê os DOIS nomes. */
await fechar();
await trocar('enfermagem');
cobrar('a Enfermagem alcança a tela de Saúde para triar', await doMais('Saúde'));
/* A tela de Saúde abre em "Doses do dia": a fila de triagem é outra aba, e sem
   este clique o percurso mediria a grade e diria que o campo não aparece. */
const abaTriagem = pg.locator('main.conteudo [role="tab"]').filter({ hasText: /^Triagem$/ });
cobrar('e a aba da triagem existe', (await abaTriagem.count()) > 0);
if (await abaTriagem.count()) {
  await abaTriagem.first().click();
  await pg.waitForTimeout(900);
}
const triagem133 = await conteudo();
cobrar('a fila de triagem diz quem LEVOU a criança',
  /levou: Seu Jorge/i.test(triagem133) || /levou: .*motorista/i.test(triagem133),
  triagem133.slice(0, 500));
cobrar('e diz também quem REGISTROU — ao lado, não no lugar',
  /registrou:/i.test(triagem133),
  'quem levou e quem responde pelo que está escrito são duas perguntas');

cobrar('nenhuma exceção ao abrir as prévias', erros.length === 0, erros[0]);

await navegador.close();
console.log(achados.length
  ? `\n${achados.length} ACHADO(S):\n  ${achados.join('\n  ')}`
  : '\nTodos os cargos completaram o percurso.');
process.exit(achados.length ? 1 : 0);
