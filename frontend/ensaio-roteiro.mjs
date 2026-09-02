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
    cargo: 'coordenador', secao: '5.7',
    nome: 'O limite da casa, no Painel das unidades',
    caminho: [{ mais: 'Painel das unidades' }],
    procurar: [/limite|vagas|ocupação/i],
  },
  {
    cargo: 'coordenador', secao: '5.8',
    nome: 'O tablet sumiu — Equipe, aba Aparelhos',
    caminho: [{ mais: 'Equipe' }, { clicar: /Aparelhos/ }],
    procurar: [/aparelho/i],
  },
  {
    cargo: 'coordenador', secao: '5.9',
    nome: 'Um registro colidiu — Sincronização',
    caminho: [{ mais: 'Sincronização' }],
    procurar: [/conflito|sincroniza/i],
  },
  {
    cargo: 'coordenador', secao: '5.10',
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

  // ------------------------------------------------------------ 7. Cozinha
  {
    cargo: 'cozinha', secao: '7.1',
    nome: 'O que não pode ser servido hoje',
    caminho: [],
    procurar: [/NÃO SERVIR|restri/i],
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
