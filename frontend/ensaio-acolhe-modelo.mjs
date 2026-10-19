#!/usr/bin/env node
/**
 * A ACOLHE+AI COM O MODELO, CONTRA O SERVIDOR DE VERDADE (fase 224).
 *
 * Os outros caminhos da Acolhe+AI se medem aos pedaços: a suíte põe o servidor
 * diante de um modelo de mentira, mas sem a tela; o `ensaio:uso` põe a tela
 * diante de um roteiro, mas sem o servidor (o roteiro mora no `mock.ts`); e o
 * `ensaio-servidor` abre a tela contra o servidor, mas SEM a chave, no modo
 * guia. A corrente inteira (a tela de verdade, o servidor de verdade e o
 * modelo do outro lado) nunca tinha sido aberta junta.
 *
 * Aqui o modelo é um servidor local que faz o papel da API da Anthropic: o
 * servidor da Acolhe+AI sobe com `ANTHROPIC_BASE_URL` apontando para ele. Ele
 * responde como o modelo responderia (com raciocínio assinado e pedidos de
 * ferramenta) e guarda tudo o que recebeu. Uma educadora da casa simulada
 * conversa três vezes, trocando de tela no meio, e o ensaio confere:
 *
 *  1. as instruções e as ferramentas chegam ao modelo IGUAIS em toda chamada,
 *     byte a byte, e o que muda (a hora, o turno, a tela, a casa) vem na nota
 *     do momento, no começo de cada pergunta (fase 223);
 *  2. a conversa só cresce, e o raciocínio volta ao modelo como ele mandou;
 *  3. a leitura pedida pelo modelo sai pela sessão da educadora, com a casa da
 *     nota, e traz as crianças que o banco tem na casa dela;
 *  4. a auditoria tem uma linha por chamada, na casa dela, e nenhum raciocínio
 *     tirado.
 *
 * Quem sobe o servidor com a chave e o Vite é o `scripts/simulacao-da-casa.sh`,
 * depois do `ensaio-servidor`. Não é para rodar solto.
 *
 * Variáveis: ENSAIO_CHROMIUM, ENSAIO_URL, ENSAIO_AGORA, ENSAIO_CONTAS,
 * ENSAIO_SAIDA (as mesmas do `ensaio-servidor`), DATABASE_URL e
 * ENSAIO_MODELO_PORTA (onde o modelo de mentira escuta; padrão 3999).
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PgLib from 'pg';

const URL_BASE = process.env.ENSAIO_URL ?? 'http://localhost:5173';
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;
const SAIDA = join(process.env.ENSAIO_SAIDA ?? '/tmp/ensaio-servidor', 'acolhe-com-modelo');
const AGORA = process.env.ENSAIO_AGORA ? new Date(process.env.ENSAIO_AGORA) : null;
const CONTAS = JSON.parse(process.env.ENSAIO_CONTAS ?? '[]');
const PORTA = Number(process.env.ENSAIO_MODELO_PORTA ?? 3999);

if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) { console.error('ENSAIO_CHROMIUM não aponta para um executável.'); process.exit(2); }
const conta = CONTAS.find((c) => /\(educador\)/.test(c.quem));
if (!conta) { console.error('ENSAIO_CONTAS sem educador: este ensaio é chamado pela simulação da casa.'); process.exit(2); }

let falhas = 0;
const cobrar = (o_que, ok, detalhe = '') => {
  if (!ok) falhas++;
  console.log(`    ${ok ? '✓' : '✗'} ${o_que}${ok || !detalhe ? '' : ` — ${String(detalhe).slice(0, 400)}`}`);
};

// ---------- O modelo de mentira ----------

const recebidos = [];
/** O texto da última pergunta da pessoa (o último bloco de texto da última mensagem). */
const ultimaFala = (corpo) => {
  const m = corpo.messages.at(-1);
  const blocos = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
  return blocos.filter((b) => b.type === 'text').map((b) => b.text).at(-1) ?? '';
};
const casaDaNota = (texto) => /\(houseId ([0-9a-f-]{36})\)/.exec(texto)?.[1] ?? null;
let assinaturas = 0;
const pensar = (texto) => ({ type: 'thinking', thinking: texto, signature: `assinatura-do-ensaio-${++assinaturas}` });

/**
 * O que o modelo responde, pela forma da conversa: pergunta nova ou resultado
 * de ferramenta. É roteiro, e não inteligência: o que se mede é o caminho.
 */
function responder(corpo) {
  const ultima = corpo.messages.at(-1);
  const resultado = Array.isArray(ultima.content) && ultima.content.find((b) => b.type === 'tool_result');
  const comNota = ultimaFala(corpo);
  /* A nota do momento é da tela: o modelo responde ao que a PESSOA disse. */
  const fala = comNota.replace(/^\[Nota[^\]]*\]\s*/, '');
  if (resultado && !/[a-z]/i.test(fala)) {
    if (resultado.tool_use_id === 'toolu_casa') {
      let n = 0;
      try { n = JSON.parse(resultado.content).length; } catch { /* cortado ou recusado */ }
      return [pensar('A lista voltou, conto as crianças.'), { type: 'text', text: `Hoje são ${n} crianças na casa.` }];
    }
    return [{ type: 'text', text: 'Pronto, a Agenda está aberta.' }];
  }
  if (/quem está na casa/i.test(fala)) {
    const casa = casaDaNota(comNota);
    return [pensar('Leio a lista de acolhidos da casa da nota.'),
      { type: 'tool_use', id: 'toolu_casa', name: 'consultar_sistema',
        input: { rota: `/people?houseId=${casa}`, motivo: 'ver quem está na casa' } }];
  }
  if (/agenda/i.test(fala)) {
    return [pensar('Ela quer ir à Agenda.'), { type: 'tool_use', id: 'toolu_agenda', name: 'abrir_tela', input: { tela: 'agenda' } }];
  }
  return [{ type: 'text', text: 'De nada! Estou por aqui.' }];
}

const modelo = createServer((req, res) => {
  const partes = [];
  req.on('data', (p) => partes.push(p));
  req.on('end', () => {
    let corpo = {};
    try { corpo = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { /* corpo vazio */ }
    recebidos.push({ cabecalhos: req.headers, corpo });
    const content = corpo.messages ? responder(corpo) : [{ type: 'text', text: '' }];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      id: `msg_ensaio_${recebidos.length}`, type: 'message', role: 'assistant', model: corpo.model,
      content, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1000, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      input_transformations: [],
    }));
  });
});
await new Promise((ok) => modelo.listen(PORTA, '127.0.0.1', ok));

// ---------- A educadora conversa ----------

console.log('\n🤝 A Acolhe+AI com o modelo, contra o servidor de verdade (fase 224)');
const db = new PgLib.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const { rows: [eu] } = await db.query(
  `SELECT u.id, u.full_name AS nome, s.house_id AS casa
     FROM app_user u
     LEFT JOIN user_house_assignment s ON s.user_id = u.id AND s.valid_to IS NULL
    WHERE u.email = $1 LIMIT 1`, [conta.email]);
/* O relógio da simulação recomeça do mesmo instante a cada vez que o banco
   sobe: a hora não separa esta rodada da anterior. As linhas que já estavam
   lá separam. */
const { rows: jaHavia } = await db.query(
  `SELECT id FROM audit_event WHERE action = 'assistente.conversa' AND actor_id = $1`, [eu?.id]);

const navegador = await chromium.launch({ executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
if (AGORA) await pg.clock.setFixedTime(AGORA);
const erros = [];
pg.on('pageerror', (e) => erros.push(`exceção: ${e.message}`));
pg.on('response', (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith('/api/') && r.status() >= 400) erros.push(`${r.status()} em ${r.request().method()} ${u.pathname}`);
});
await pg.goto(URL_BASE);
await pg.waitForTimeout(1200);
await pg.fill('#email', conta.email);
await pg.fill('#senha', conta.senha);
await pg.getByRole('button', { name: /Entrar no sistema/ }).click();
await pg.waitForTimeout(2000);
const adiar = pg.getByRole('button', { name: /Continuar com a senha atual/ });
if (await adiar.isVisible().catch(() => false)) { await adiar.click(); await pg.waitForTimeout(400); }

const painel = pg.locator('.acolhe-painel');
const abrirPainel = async () => {
  if (await painel.isVisible().catch(() => false)) return;
  await pg.getByRole('button', { name: /^Abrir a Acolhe\+AI/ }).click();
  await pg.waitForTimeout(500);
};
const perguntar = async (texto, esperar) => {
  await abrirPainel();
  await pg.locator('#acolhe-pergunta').fill(texto);
  await painel.getByRole('button', { name: 'Enviar' }).click();
  await pg.waitForFunction((re) => new RegExp(re).test(document.querySelector('.acolhe-painel')?.textContent ?? ''),
    esperar.source, { timeout: 20000 }).catch(() => {});
  await pg.waitForTimeout(400);
};
const irPara = async (nome) => {
  if (await painel.isVisible().catch(() => false)) {
    await pg.getByRole('button', { name: 'Minimizar a Acolhe+AI' }).click().catch(() => {});
  }
  await pg.locator('nav.tabbar button, nav.portas-lateral button', { hasText: new RegExp(`^\\s*${nome}\\s*$`) })
    .filter({ visible: true }).first().click();
  await pg.waitForTimeout(900);
};

await irPara('Dia');
await abrirPainel();
cobrar('com a chave, a Acolhe+AI não está no modo guia', !/modo guia/i.test(await painel.innerText()));
await perguntar('quem está na casa hoje?', /Hoje são \d+ crianças/);
const respostaCasa = /Hoje são (\d+) crianças/.exec(await painel.innerText())?.[1];
await irPara('Chamada');
await perguntar('me leva para a agenda', /a Agenda está aberta/);
const naAgenda = /Agenda|Marcar compromisso/.test(await pg.locator('main.conteudo').innerText());
await perguntar('obrigada', /Estou por aqui/);
await mkdir(SAIDA, { recursive: true });
await pg.screenshot({ path: join(SAIDA, 'conversa.png'), fullPage: true });

// ---------- O que chegou ao modelo ----------

const chamadas = recebidos.filter((r) => r.corpo.messages);
cobrar('cada pergunta e cada resultado foram ao modelo pelo servidor (cinco chamadas)', chamadas.length === 5, `${chamadas.length} chamadas`);
const [primeira] = chamadas;
cobrar('com o raciocínio preso à conversa e tirado em vez de recusar, se mudar',
  String(primeira?.cabecalhos['anthropic-beta']).includes('thinking-binding-controls-2026-08-01')
  && primeira?.corpo.thinking?.block_binding?.prefix_mismatch_behavior === 'drop_block',
  JSON.stringify(primeira?.corpo.thinking));
const sistema = JSON.stringify(primeira?.corpo.system);
const ferramentas = JSON.stringify(primeira?.corpo.tools);
cobrar('as instruções e as ferramentas chegam iguais em toda chamada, mesmo trocando de tela',
  chamadas.every((c) => JSON.stringify(c.corpo.system) === sistema && JSON.stringify(c.corpo.tools) === ferramentas));
cobrar('e não levam a casa, a tela nem a hora',
  !sistema.includes(eu?.casa ?? '-') && !/Tela aberta|Agora:/.test(sistema));
cobrar('chamam a educadora pelo primeiro nome', sistema.includes(`${String(eu?.nome).split(' ')[0]} (no cadastro, ${eu?.nome})`));

/* A conversa só cresce: cada chamada repete a anterior, e só a última
   mensagem da pessoa pode ganhar blocos. A marca de cache do servidor, que
   muda de lugar, não é conteúdo, e sai da comparação. */
const semCache = (x) => JSON.stringify(x, (k, v) => (k === 'cache_control' ? undefined : v));
const quebra = chamadas.findIndex((c, i) => i > 0 && (c.corpo.messages.length < chamadas[i - 1].corpo.messages.length
  || semCache(c.corpo.messages.slice(0, chamadas[i - 1].corpo.messages.length - 1))
     !== semCache(chamadas[i - 1].corpo.messages.slice(0, -1))));
cobrar('a conversa só cresce: nenhuma chamada muda o que já foi mandado', quebra === -1, `quebra na chamada ${quebra + 1}`);
const pensamentos = chamadas.at(-1)?.corpo.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : []))
  .filter((b) => b.type === 'thinking').map((b) => b.signature) ?? [];
cobrar('o raciocínio volta ao modelo como ele mandou, com a assinatura', pensamentos.length === 3
  && pensamentos.every((s, i) => s === `assinatura-do-ensaio-${i + 1}`), pensamentos.join(', '));

const notas = chamadas.at(-1)?.corpo.messages
  .filter((m) => m.role === 'user' && Array.isArray(m.content))
  .flatMap((m) => m.content.filter((b) => b.type === 'text').map((b) => b.text)) ?? [];
cobrar('cada pergunta começa pela nota do momento', notas.length === 3 && notas.every((t) => t.startsWith('[Nota da tela, não da pessoa.')),
  notas.map((t) => t.slice(0, 80)).join(' | '));
cobrar('com a casa dela', notas.every((t) => casaDaNota(t) === eu?.casa), `${notas.map(casaDaNota).join(', ')} contra ${eu?.casa}`);
cobrar('e a tela de cada momento: o Dia, depois a Chamada', /Tela aberta: Dia\./.test(notas[0] ?? '') && /Tela aberta: Chamada\./.test(notas[1] ?? ''),
  notas.map((t) => /Tela aberta: [^.]*/.exec(t)?.[0]).join(' | '));
if (AGORA) {
  const hora = AGORA.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  cobrar('a hora da nota é a de Porto Alegre, no relógio da casa', (notas[0] ?? '').includes(`, ${hora}, turno`), `${hora} | ${notas[0]?.slice(0, 120)}`);
}

// ---------- A leitura e a auditoria ----------

const { rows: [{ n: noBanco }] } = await db.query(
  `SELECT count(*)::int AS n FROM house_stay WHERE house_id = $1 AND status = 'ativa'`, [eu?.casa]);
cobrar('a leitura saiu pela sessão dela e trouxe as crianças que o banco tem na casa',
  Number(respostaCasa) === noBanco, `a Acolhe+AI contou ${respostaCasa}, o banco tem ${noBanco}`);
cobrar('e o modelo levou a educadora à Agenda', naAgenda);
const { rows: linhas } = await db.query(
  `SELECT house_id, detail FROM audit_event
    WHERE action = 'assistente.conversa' AND actor_id = $1 AND NOT (id = ANY($2::uuid[]))`, [eu?.id, jaHavia.map((r) => r.id)]);
cobrar('a auditoria tem uma linha por chamada, na casa dela', linhas.length === chamadas.length
  && linhas.every((l) => l.house_id === eu?.casa), `${linhas.length} linhas`);
cobrar('nenhum raciocínio tirado', linhas.length > 0 && linhas.every((l) => l.detail?.raciocinioTirado === 0),
  JSON.stringify(linhas.map((l) => l.detail?.raciocinioTirado)));
cobrar('e nenhuma conversa na auditoria', !JSON.stringify(linhas).includes('quem está na casa'));
cobrar('nenhuma exceção nem recusa da API', erros.length === 0, erros.join(' | '));

await navegador.close();
await db.end();
modelo.close();
console.log(falhas ? `\n${falhas} cobrança(s) reprovada(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
