#!/usr/bin/env node
/**
 * ENSAIO DO ROTEIRO — as tarefas que o Marcelo vai pedir na Casa 03.
 *
 * O `ensaio.mjs` abre cada tela e olha o que ela escreveu. Este vai atrás de
 * outra coisa: **para cada tarefa do `docs/roteiro-marcelo.md`, a porta
 * existe e abre no cargo certo?**
 *
 * Ele NÃO simula a procura de uma pessoa — onde ela para é justamente o que a
 * aplicação do roteiro serve para descobrir, e nenhum ensaio responde isso.
 * O que ele impede é o outro fracasso, o barato: a tarefa não ter porta
 * nenhuma, e o Marcelo descobrir isso diante da equipe.
 *
 * Cada tarefa declara o caminho e o que precisa estar escrito no fim dele. O
 * texto cobrado é o que a PESSOA lê, e não um seletor: se o rótulo mudar, o
 * ensaio falha — e é o que se quer, porque o roteiro também envelhece com o
 * rótulo.
 *
 * Uso: ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio:roteiro
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

/*
 * O ROTEIRO, TAREFA A TAREFA.
 *
 * `secao` é o item do roteiro, para o achado ser localizável no documento que
 * o Marcelo leva na mão.
 */
const TAREFAS = [
  // ---------------------------------------------------------- 1. Educador
  {
    /*
     * A chamada do CAFÉ, no protótipo, já está confirmada — 20 de 20 —, e as
     * linhas mostram o resultado em vez dos botões. É de propósito: a
     * demonstração precisa de uma chamada fechada para mostrar esse estado.
     * Mas o roteiro pede "confirme a presença da chamada da manhã", e a
     * educadora chegaria numa chamada já feita. Está anotado no §0.3 do
     * roteiro; aqui o ensaio usa a do almoço, que é a que está aberta.
     */
    cargo: 'educador', secao: '1.1',
    nome: 'Confirme a presença — a chamada aberta tem os dois caminhos',
    caminho: [{ aba: 'Chamada' }, { clicar: /Almoço/ }],
    procurar: [/Normal/, /Outro/],
  },
  {
    cargo: 'educador', secao: '1.2',
    nome: 'Registre a sua passagem do turno',
    caminho: [{ aba: 'Passagem' }],
    procurar: [/passagem|plantão/i],
  },
  {
    cargo: 'educador', secao: '1.3',
    nome: 'Uma criança recusou o remédio das 16h',
    caminho: [{ aba: 'Dia' }, { clicar: /Não aconteceu/ }],
    procurar: [/Recusad/i],
  },
  {
    cargo: 'educador', secao: '1.5',
    nome: 'Como cada criança está agora — o filtro "Por criança"',
    caminho: [{ aba: 'Dia' }, { clicar: /Por criança/ }],
    procurar: [/ordem alfabética|alfabétic/i],
  },

  // ------------------------------------------------------ 2. Líder Diurno
  {
    cargo: 'lider_diurno', secao: '2.1',
    nome: 'Registrar pelo colega, quando o aparelho ficou sem sinal',
    caminho: [{ aba: 'Dia' }, { clicar: /^⋯$|Mais opções/ }],
    procurar: [/pelo colega/i],
  },
  {
    cargo: 'lider_diurno', secao: '2.2',
    nome: 'Descubra quem está em cada atividade agora — Painel do Plantão',
    caminho: [{ mais: 'Plantão' }],
    procurar: [/plantão/i],
  },
  {
    cargo: 'lider_diurno', secao: '2.3',
    nome: 'Fechar a ATA com pendência',
    caminho: [{ mais: 'ATA' }],
    procurar: [/ATA/],
  },

  // ---------------------------------------------------- 3. Equipe técnica
  {
    cargo: 'equipe_tecnica', secao: '3.1',
    nome: 'Escreva o acompanhamento mensal',
    caminho: [{ mais: 'Acompanhamentos' }],
    procurar: [/acompanhamento/i],
  },
  {
    cargo: 'equipe_tecnica', secao: '3.5',
    nome: 'Atualizar escola, cuidados e equipe',
    caminho: [{ aba: 'Acolhidos' }, { clicar: /Alice|Abrir|Ver perfil/ }],
    procurar: [/Atualizar escola|cuidados/i],
  },

  // ------------------------------------------------------- 4. Enfermagem
  {
    cargo: 'enfermagem', secao: '4.1 e 4.2',
    nome: 'Chegou remédio / Conferi o armário',
    caminho: [{ mais: 'Saúde' }, { clicar: /^Estoque$/ }],
    procurar: [/Chegou remédio/i, /Conferi o armário/i],
  },
  {
    cargo: 'enfermagem', secao: '4.4',
    nome: 'Devolver pedindo complemento',
    /* "Triagem" é uma ABA dentro da Saúde, e não uma porta do "Mais": a
     * enfermagem alcança as oito casas por uma tela só. */
    /* Dois passos, e o segundo é o que a tarefa mede: a devolução mora dentro
     * de "Revisar", junto do "Conferir e assinar". Ficar fora da fila seria
     * oferecer a devolução a quem ainda não leu a evolução. */
    caminho: [{ mais: 'Saúde' }, { clicar: /^Triagem$/ }, { clicar: /^Revisar$/ }],
    procurar: [/Devolver pedindo complemento/i, /Assinar como Enfermagem/i],
  },

  // ------------------------------------------------------ 5. Coordenação
  {
    cargo: 'educador', secao: '1.4',
    nome: 'A ATA do turno anterior, com o nome de quem escreveu',
    caminho: [{ mais: 'ATA' }, { clicar: /Turno anterior/ }],
    procurar: [/O que ficou escrito neste turno/i],
  },
  {
    cargo: 'coordenador', secao: '5.1',
    nome: 'O que cada setor enxerga',
    caminho: [{ mais: 'O que cada setor enxerga' }],
    procurar: [/setor|enxerga/i],
  },
  {
    cargo: 'coordenador', secao: '5.2',
    nome: 'O cofre de acessos pede a senha de novo',
    caminho: [{ mais: 'Cofre' }],
    procurar: [/senha|cofre/i],
  },
  {
    cargo: 'coordenador', secao: '5.4',
    nome: 'Recusar transferência com motivo',
    caminho: [{ mais: 'Transferências' }],
    /* A tarefa é encontrar o BOTÃO. A primeira versão procurava a palavra
     * "transferência" e falhava numa tela correta: ela fala em "Recebidas" e
     * "Enviadas por esta casa", que é a linguagem da casa, não a do
     * cadastro. */
    procurar: [/Recusar com motivo/i, /Aceitar/],
  },
  {
    cargo: 'coordenador', secao: '5.6',
    /* A tarefa que substituiu "defina quem pode dar remédio no turno": desde a
     * migração 0930 o educador de plantão pode por padrão, e o que se marca é
     * a EXCEÇÃO, no medicamento. */
    nome: 'Só a Enfermagem dá este medicamento — a exceção no esquema',
    caminho: [{ mais: 'Saúde' }, { clicar: /^Esquemas$/ }],
    procurar: [/Só a Enfermagem pode dar/i, /Voltar a permitir o educador/i],
  },
  {
    cargo: 'coordenador', secao: '5.7',
    nome: 'Montar a escala do mês — e o turno sem ninguém',
    caminho: [{ mais: 'escala' }],
    procurar: [/Escalar alguém/i, /ninguém escalado/i],
  },
  {
    cargo: 'coordenador', secao: '5.8',
    nome: 'A folha da escala para a parede',
    caminho: [{ mais: 'escala' }],
    procurar: [/Folha para a parede/i],
  },
  {
    cargo: 'coordenador', secao: '5.9',
    nome: 'O limite da casa, no Painel das unidades',
    caminho: [{ mais: 'Painel das unidades' }],
    procurar: [/limite|vagas|ocupação/i],
  },
  {
    cargo: 'coordenador', secao: '5.10',
    nome: 'O tablet sumiu — Equipe, aba Aparelhos',
    caminho: [{ mais: 'Equipe' }, { clicar: /Aparelhos/ }],
    procurar: [/aparelho/i],
  },
  {
    cargo: 'coordenador', secao: '5.11',
    nome: 'Um registro colidiu — Sincronização',
    caminho: [{ mais: 'Sincronização' }],
    procurar: [/conflito|sincroniza/i],
  },
  {
    cargo: 'coordenador', secao: '5.12',
    nome: 'Aprovar o relatório mensal',
    caminho: [{ mais: 'Acompanhamentos' }],
    procurar: [/aprova/i],
  },

  // ------------------------------------------------ 6. Líder Noturno Geral
  {
    cargo: 'lider_noturno_geral', secao: '6.1',
    nome: 'A ATA Geral da noite, com as casas que não chamaram',
    caminho: [{ mais: 'ATA' }],
    procurar: [/geral|noturna|noite/i],
  },

  // ------------------------------------------- 3.6 a 3.8 — o que nasceu depois
  {
    cargo: 'equipe_tecnica', secao: '3.6',
    nome: 'Registrar a internação de uma criança',
    caminho: [{ mais: 'Internação' }],
    procurar: [/registrar internação/i, /continua da casa/i],
  },
  {
    cargo: 'equipe_tecnica', secao: '3.7',
    nome: 'Registrar uma conquista no perfil',
    caminho: [{ aba: 'Acolhidos' }, { clicar: /Alice/ }],
    procurar: [/conquistou/i, /registrar conquista/i],
  },
  {
    cargo: 'equipe_tecnica', secao: '3.8',
    nome: 'Os contatos de quem aparece pela criança',
    caminho: [{ aba: 'Acolhidos' }, { clicar: /Alice/ }],
    procurar: [/quem aparece por/i, /acrescentar contato/i],
  },

  // ------------------------------------------------ 5.11 e 5.12 — coordenação
  {
    cargo: 'coordenador', secao: '5.14',
    nome: 'O relatório do trabalho desta casa',
    caminho: [{ mais: 'Painel das unidades' }],
    procurar: [/relatório do trabalho desta casa/i],
  },

  // ------------------------------------------------------- 5.1 Gestor Geral
  {
    cargo: 'gestor_geral', secao: '5.1',
    nome: 'As oito casas pelo trabalho social',
    caminho: [{ mais: 'trabalho social' }],
    procurar: [/conquistas registradas/i, /ordem do cadastro/i],
  },

  /* ------------------------------------------------------------ 7. Cozinha
   *
   * A tarefa era do cargo `cozinha`, que saiu do seletor na fase 83 — e este
   * ensaio passou a MORRER aqui, porque `selectOption` não acha a opção e
   * estoura. A tarefa não deixou de existir: mudou de dono. Quem pede o lanche
   * é quem está no turno, e a tela virou "Cozinha — pedidos e restrições",
   * atrás do "Mais".
   */
  {
    cargo: 'educador', secao: '7.1',
    nome: 'Peça o lanche da saída de sábado',
    caminho: [{ mais: 'Cozinha' }],
    procurar: [/Pedir lanche/i, /recebe estes pedidos em papel/i],
  },
  {
    cargo: 'educador', secao: '7.2',
    nome: 'O que não pode ser servido hoje',
    caminho: [{ mais: 'Cozinha' }, { clicar: /^Restrições$/ }],
    procurar: [/Não servir|restri/i, /não a razão/i],
  },

  /* ============================================================ FASES 76–86
   *
   * O que a fila do Marcelo entregou depois de 08/09, que é a data em que o
   * roteiro foi escrito. Sem estas tarefas, o roteiro leva à Casa 03 um
   * sistema de duas semanas atrás — e o que a equipe não é levada a abrir é o
   * que ninguém descobre estar errado.
   */

  // ------------------------------------------- 76 e 77, na mão do educador
  {
    cargo: 'educador', secao: '1.9',
    nome: 'O que é cada coisa no dia — a cor da categoria',
    caminho: [{ aba: 'Dia' }],
    procurar: [/Saúde|Medicamento|Rotina da casa/],
  },
  {
    cargo: 'educador', secao: '1.10',
    nome: 'A que hora sair para a consulta, e para onde',
    caminho: [{ mais: 'Agenda' }],
    procurar: [/Sair \d|estar lá/i],
  },
  {
    cargo: 'educador', secao: '1.11',
    nome: 'Você não presenciou — responda mesmo assim',
    caminho: [{ mais: 'Ocorrências' }],
    procurar: [/Não presenciei/i],
  },

  // ------------------------------------------------ 76, 80 e 81, na técnica
  {
    cargo: 'equipe_tecnica', secao: '3.10',
    nome: 'A psicóloga desmarcou a quarta — sem cancelar a série',
    caminho: [{ mais: 'Agenda' }],
    procurar: [/Desmarcar este dia/i],
  },
  /*
   * A saída para a família nasce NO CONTATO, e não numa tela solta: a saída
   * aponta para quem já está cadastrado. Por isso a tarefa passa pelo perfil.
   */
  {
    cargo: 'equipe_tecnica', secao: '3.11',
    nome: 'A criança vai passar dias com a família',
    caminho: [{ aba: 'Acolhidos' }, { clicar: /Alice/ }],
    procurar: [/Vai passar dias com/i],
  },
  {
    cargo: 'equipe_tecnica', secao: '3.12',
    nome: 'Este adolescente sai sozinho para o curso?',
    caminho: [{ aba: 'Acolhidos' }, { clicar: /Alice/ }],
    procurar: [/sozinh/i],
  },

  // -------------------------------------------------------- 85, na Enfermagem
  {
    cargo: 'enfermagem', secao: '4.7',
    nome: 'Chegou remédio com nota fiscal — e o que ficou sem o papel',
    caminho: [{ mais: 'Saúde' }, { clicar: /^Compras$/ }],
    procurar: [/Nota fiscal/i],
  },
  {
    cargo: 'enfermagem', secao: '4.8',
    nome: 'O que a equipe sinalizou como estoque baixo',
    caminho: [{ mais: 'Saúde' }, { clicar: /^Estoque$/ }],
    procurar: [/sinalizado por gente|baixo/i],
  },

  /* --------------------------------------- 88: o retorno que a equipe seguinte lê
   *
   * A tarefa é de LEITURA, e é o pedido do Marcelo: "para a equipe seguinte ler
   * sem procurar". Cobra-se a porta — o bloco só tem conteúdo depois de alguém
   * registrar uma saída e uma chegada, e é isso que a pessoa faz na tarefa
   * 3.11. Aqui basta que a passagem exista e que ela seja o lugar certo.
   */
  /*
   * A CHEGADA, que faltava (fase 89). A fase 88 entregou o que ela trouxe de
   * casa, e nenhuma tarefa registrava uma chegada — a 3.11 só registra a
   * saída, e a leitura da 1.13 dependia de um fato que ninguém criava. O
   * protótipo abre com o Felipe fora de casa para esta tarefa existir sozinha.
   */
  {
    cargo: 'educador', secao: '1.12',
    nome: 'O Felipe chegou da casa da mãe — registre a chegada',
    caminho: [{ aba: 'Acolhidos' }],
    procurar: [/Com a família/i, /Felipe/, /Chegou/],
  },
  /*
   * A LEITURA. Desde a fase 89 a porta não basta: o protótipo abre com o
   * retorno da Helena no turno diurno, e é o NOME dela que se procura — um
   * cartão de plantão qualquer satisfazia a cobrança antiga, com o bloco vazio.
   */
  {
    cargo: 'educador', secao: '1.13',
    nome: 'A Helena voltou da madrinha — leia na passagem',
    caminho: [{ aba: 'Passagem' }, { clicar: /Plantão diurno/i }],
    procurar: [/com a família neste turno/i, /Helena/, /Trouxe de casa/i],
  },

  /* ------------------------------------------------------ 78, na coordenação
   *
   * O botão da cor traz o NOME do tom escrito — "automática" quando ninguém
   * escolheu —, porque quem não distingue os matizes ainda tem de conseguir
   * escolher e conferir. É por esse nome que se chega nele.
   */
  {
    cargo: 'coordenador', secao: '5.16',
    nome: 'Escolha a cor da linha de uma educadora — e tente repetir',
    caminho: [{ mais: 'Equipe' }, { clicar: /automática/ }],
    /* O "já em uso" é a recusa do servidor, e só aparece depois de tentar
       repetir — que é o que a PESSOA faz. Aqui se cobra a porta, não a recusa:
       o ensaio não decide o tom de ninguém. */
    procurar: [/Cor da linha de/i],
  },
];

const achados = [];

const navegador = await chromium.launch({
  executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const pg = await navegador.newPage({ viewport: { width: 420, height: 900 } });
const erros = [];
pg.on('pageerror', (e) => erros.push(e.message));

await pg.goto(`file://${ARQUIVO}`);
await pg.waitForTimeout(900);
await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
await pg.waitForTimeout(1200);

let cargoAtual = null;

async function trocarCargo(cargo) {
  if (cargoAtual === cargo) return;
  await pg.locator('select.troca-cargo-sel').selectOption(cargo);
  await pg.waitForTimeout(900);
  cargoAtual = cargo;
}

/** Volta ao começo do cargo, para uma tarefa não herdar a tela da anterior. */
async function reiniciar() {
  const abas = pg.locator('nav.tabbar button');
  if (await abas.count()) { await abas.first().click(); await pg.waitForTimeout(600); }
}

async function andar(passo) {
  if (passo.aba) {
    const b = pg.locator('nav.tabbar button', { hasText: passo.aba });
    if (!(await b.count())) return `a aba "${passo.aba}" não existe neste cargo`;
    await b.first().click();
    await pg.waitForTimeout(1000);
    return null;
  }
  if (passo.mais) {
    const aba = pg.locator('nav.tabbar button', { hasText: 'Mais' });
    if (!(await aba.count())) return 'este cargo não tem o menu "Mais"';
    await aba.first().click();
    await pg.waitForTimeout(400);
    const porta = pg.locator('.overlay .sheet button.card.row', { hasText: passo.mais });
    if (!(await porta.count())) {
      await pg.locator('.overlay .sheet button', { hasText: /^Fechar$/ }).click();
      return `"${passo.mais}" não está em "Mais" para este cargo`;
    }
    await porta.first().click();
    await pg.waitForTimeout(1200);
    return null;
  }
  if (passo.clicar) {
    const b = pg.locator('main.conteudo button').filter({ hasText: passo.clicar });
    if (!(await b.count())) return `não achei o botão ${passo.clicar}`;
    await b.first().click();
    await pg.waitForTimeout(1000);
    return null;
  }
  return null;
}

console.log(`Ensaio do roteiro — ${TAREFAS.length} tarefas\n`);

for (const t of TAREFAS) {
  await trocarCargo(t.cargo);
  await reiniciar();
  erros.length = 0;

  let falha = null;
  for (const passo of t.caminho) {
    falha = await andar(passo);
    if (falha) break;
  }

  if (falha) {
    console.log(`  ✗ [${t.secao}] ${t.nome}\n      ${falha}`);
    achados.push(`${t.secao} — ${falha}`);
    continue;
  }

  /* O texto do documento aberto também vale: várias tarefas terminam numa
   * folha por cima da tela, e não na tela. */
  const corpo = await pg.locator('body').innerText();
  const faltando = t.procurar.filter((r) => !r.test(corpo));

  if (faltando.length) {
    console.log(`  ✗ [${t.secao}] ${t.nome}\n      não encontrei: ${faltando.join(', ')}`);
    achados.push(`${t.secao} — texto ausente: ${faltando.join(', ')}`);
  } else if (erros.length) {
    console.log(`  ✗ [${t.secao}] ${t.nome}\n      exceção: ${erros[0]}`);
    achados.push(`${t.secao} — exceção na página`);
  } else {
    console.log(`  ✓ [${t.secao}] ${t.nome}`);
  }

  /* Fecha o que tenha ficado aberto por cima, para a próxima tarefa começar
   * na tela e não numa folha. */
  const fechar = pg.locator('.overlay button').filter({ hasText: /^(Fechar|Cancelar)$/ });
  if (await fechar.count()) { await fechar.first().click(); await pg.waitForTimeout(400); }
}

await navegador.close();
console.log(achados.length
  ? `\n${achados.length} tarefa(s) do roteiro sem porta:\n  ${achados.join('\n  ')}`
  : '\nTodas as tarefas do roteiro têm porta.');
process.exit(achados.length ? 1 : 0);
