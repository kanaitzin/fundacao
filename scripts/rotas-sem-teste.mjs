#!/usr/bin/env node
/**
 * ROTA SEM TESTE — quais portas do servidor nenhum teste jamais chamou.
 *
 * POR QUE ISTO EXISTE. O `rotas-sem-porta.spec.ts` garante que toda rota tenha
 * TELA — que ninguém construa um caminho que a educadora não alcança. **Nada
 * garantia que ela tivesse TESTE.** E o `superficies-sem-teste.mjs` (fase 146)
 * mede pelo lado do dado: tabela que nenhum teste escreveu. Faltava o lado da
 * porta, que é por onde a pessoa entra.
 *
 * É a mesma pergunta das duas: *"o que nunca foi exercitado?"* — e a resposta
 * dela achou, na 146, que a contenção física podia ser escrita na ocorrência de
 * outra casa.
 *
 * COMO ELE MEDE, e onde ele é impreciso de propósito. Ele lê os controladores e
 * monta o padrão de cada rota (`@Controller` + `@Get`), e lê as suítes procurando
 * as chamadas `.get(...)`, `.post(...)` e irmãs com uma URL de `/api/v1/`. Depois
 * casa uma coisa com a outra por SEGMENTO, tratando `:param` e `${...}` como
 * curinga.
 *
 * O que ele não vê: URL montada por concatenação, ou por variável que ele não
 * consegue ler. Então **ele devolve CANDIDATO**, como os outros dois medidores
 * desta casa — e quem confirma abre o teste e olha. A alternativa seria instalar
 * um gravador dentro do servidor para medir em tempo de execução, e medição que
 * exige código de medição no produto é medição que envelhece junto com ele.
 *
 * E ELE SEPARA DUAS COISAS, porque a primeira versão não separava e isso o
 * tornava quase inútil. Uma suíte que chama as rotas por um auxiliar —
 * `const pegar = (rota) => request(http).get(rota)` — não deixa o par
 * método+URL visível no lugar da chamada, e a URL literal aparece noutro ponto do
 * arquivo. Foi o que aconteceu com a suíte de vocabulário da fase 147: recém
 * escrita, as oito rotas dela continuavam aparecendo como "sem teste".
 *
 *   * **CANDIDATA FORTE** — a URL não aparece em suíte nenhuma, de nenhuma forma.
 *     Aqui a chance de ser verdade é alta;
 *   * **PAR INCERTO** — a URL aparece, mas não colada a esse método. Quase sempre
 *     é o medidor errando o par, e não a rota sem teste.
 *
 *     node scripts/rotas-sem-teste.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname;
const PREFIXO = '/api/v1';
const VERBOS = ['Get', 'Post', 'Patch', 'Put', 'Delete'];

/** `:id`, `:id(uuid)` e `${x}` são todos curinga; o resto é literal. */
const normalizar = (url) => url
  .split('?')[0]
  .replace(/\$\{[^}]*\}/g, ':p')
  .replace(/:[A-Za-z_][A-Za-z0-9_]*(\([^)]*\))?/g, ':p')
  .replace(/\/+$/, '')
  .replace(/^\/+/, '/');

const segmentos = (url) => normalizar(url).split('/').filter(Boolean);

// ---------------------------------------------------------------- as rotas
const controladores = [];
for (const mod of readdirSync(join(RAIZ, 'backend/src/modules'))) {
  const dir = join(RAIZ, 'backend/src/modules', mod);
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.controller.ts')) controladores.push(join(dir, f));
  }
}

const rotas = [];
for (const arquivo of controladores) {
  const texto = readFileSync(arquivo, 'utf8');
  /*
   * Um arquivo pode ter VÁRIOS `@Controller` — o `people.controller.ts` tem três
   * (`people`, `transfers`, `reports`). Então cada rota pertence ao último
   * prefixo declarado acima dela, e não ao primeiro do arquivo.
   */
  const marcas = [...texto.matchAll(/@Controller\(\s*['"]([^'"]*)['"]\s*\)/g)]
    .map((m) => ({ pos: m.index, prefixo: m[1] }));
  if (!marcas.length) continue;

  const verbos = new RegExp(`@(${VERBOS.join('|')})\\(\\s*(?:['"]([^'"]*)['"])?\\s*\\)`, 'g');
  for (const m of texto.matchAll(verbos)) {
    const marca = [...marcas].reverse().find((x) => x.pos < m.index);
    if (!marca) continue;
    const caminho = [PREFIXO, marca.prefixo, m[2] ?? ''].filter(Boolean).join('/');
    rotas.push({
      metodo: m[1].toUpperCase(),
      padrao: normalizar('/' + caminho.replace(/^\/+/, '')),
      arquivo: arquivo.replace(RAIZ, ''),
      linha: texto.slice(0, m.index).split('\n').length,
    });
  }
}

// ------------------------------------------------------------- as chamadas
const chamadas = [];      // com o método colado à URL
const urls = [];          // toda URL de /api/v1 que aparece, com método ou sem
const testes = readdirSync(join(RAIZ, 'backend/test')).filter((f) => f.endsWith('.spec.ts'));
for (const f of testes) {
  const texto = readFileSync(join(RAIZ, 'backend/test', f), 'utf8');
  for (const m of texto.matchAll(
    /\.(get|post|patch|put|delete)\(\s*[`'"]([^`'"]*\/api\/v1\/[^`'"]*)[`'"]/g)) {
    chamadas.push({ metodo: m[1].toUpperCase(), url: m[2], suite: f });
  }
  /* E toda URL literal, solta — é ela que aparece quando a suíte chama por um
     auxiliar e o método fica noutra linha. */
  for (const m of texto.matchAll(/[`'"]([^`'"]*\/api\/v1\/[^`'"]*)[`'"]/g)) {
    urls.push({ url: m[1], suite: f });
  }
}

const casa = (padrao, url) => {
  const a = segmentos(padrao); const b = segmentos(url);
  if (a.length !== b.length) return false;
  return a.every((s, i) => s === ':p' || b[i] === ':p' || s === b[i]);
};

const semPar = rotas.filter(
  (r) => !chamadas.some((c) => c.metodo === r.metodo && casa(r.padrao, c.url)));
/* Candidata FORTE: a URL não aparece em suíte nenhuma, nem solta. */
const fortes = semPar.filter((r) => !urls.some((u) => casa(r.padrao, u.url)));
const incertas = semPar.filter((r) => urls.some((u) => casa(r.padrao, u.url)));

// ------------------------------------------------------------------ a saída
console.log(`\nROTA SEM TESTE — ${rotas.length} rotas em ${controladores.length} controladores,`);
console.log(`conferidas contra ${chamadas.length} chamadas em ${testes.length} suítes.\n`);

if (!semPar.length) {
  console.log('Toda rota é chamada por algum teste, com o método casando.\n');
} else {
  if (fortes.length) {
    console.log(`CANDIDATAS FORTES (${fortes.length}) — a URL não aparece em suíte nenhuma:\n`);
    for (const r of fortes) {
      console.log(`  · ${r.metodo.padEnd(6)} ${r.padrao}`);
      console.log(`      ${r.arquivo}:${r.linha}`);
    }
    console.log('');
  } else {
    console.log('NENHUMA CANDIDATA FORTE — toda URL de rota aparece em alguma suíte.\n');
  }
  if (incertas.length) {
    console.log(`PAR INCERTO (${incertas.length}) — a URL aparece, o método não casou:`);
    console.log('Quase sempre é o medidor errando o par (a suíte chama por um auxiliar).\n');
    for (const r of incertas) {
      const onde = urls.find((u) => casa(r.padrao, u.url));
      console.log(`  · ${r.metodo.padEnd(6)} ${r.padrao}  → aparece em ${onde.suite}`);
    }
    console.log('');
  }
  console.log('Confirme abrindo a suíte — e se a rota mesmo não tem teste, escreva-o antes');
  console.log('de confiar nela. Foi por este caminho que a fase 146 achou que a contenção');
  console.log('física podia ser escrita na ocorrência de outra casa.\n');
}
