#!/usr/bin/env node
/**
 * VARREDURA DE PONTAS SOLTAS — dado que é gravado e não chega a lugar nenhum.
 *
 * A fase 106 fez esta varredura À MÃO, uma vez, e achou a auditoria inteira sem
 * leitor. O problema de varredura à mão é que ela vale para o dia em que foi
 * feita: desde então entraram 27 migrações, e ninguém refez a conta.
 *
 * Então ela virou script. Ele NÃO é teste, e isso é decisão: o resultado precisa
 * de julgamento humano — coluna de auditoria que ninguém lê hoje pode ser a que
 * salva a instituição numa inspeção, e `synced_at` existe para o dia em que a
 * fila offline falhar. Um teste que reprovasse por isso seria desligado na
 * primeira pressa, e aí a varredura pararia de existir de novo.
 *
 * O QUE ELE PERGUNTA, coluna por coluna: **este nome aparece em algum lugar que
 * LEIA?** Procura em quatro lugares, porque cada um esconde uma classe de leitor:
 *
 *   * o corpo das FUNÇÕES do banco (`pg_get_functiondef`);
 *   * as POLÍTICAS de RLS (`qual` e `with_check`);
 *   * as VISÕES (`pg_get_viewdef`);
 *   * o código do servidor e das telas, em TypeScript — que é por onde a
 *     `medication_authorization` escapou de uma varredura minha.
 *
 * O que ele NÃO sabe, e está escrito aqui para quem ler a saída: `SELECT *`
 * devolve a coluna sem nomeá-la. Por isso a resposta dele é **candidato**, nunca
 * veredito — e quem confirmar precisa abrir o caminho de leitura e olhar.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

/* Colunas que TODA tabela tem e que ninguém precisa ler por nome para elas
   servirem: a chave, e a hora em que a linha nasceu. Contá-las afogaria a saída
   em ruído e esconderia o que importa. */
const RUIDO = new Set(['id', 'created_at']);

const c = new Client({ connectionString: url });
await c.connect();

const { rows: colunas } = await c.query(`
  SELECT c.relname AS tabela, a.attname AS coluna,
         col_description(c.oid, a.attnum) AS comentario
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind = 'r'
   ORDER BY c.relname, a.attnum`);

/* Um nome de coluna pode repetir-se em tabelas diferentes (`note`, `status`).
   A varredura é por NOME, então nomes repetidos são conferidos uma vez e o
   resultado vale para todas — e isso está dito na saída, para ninguém concluir
   que a `note` de uma tabela específica tem leitor. */
const nomes = [...new Set(colunas.map((r) => r.coluna))].filter((n) => !RUIDO.has(n));

const { rows: funcoes } = await c.query(
  `SELECT string_agg(pg_get_functiondef(p.oid), E'\\n') AS tudo
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prokind = 'f'`);
const { rows: politicas } = await c.query(
  `SELECT string_agg(coalesce(qual,'') || ' ' || coalesce(with_check,''), E'\\n') AS tudo
     FROM pg_policies WHERE schemaname = 'public'`);
const { rows: visoes } = await c.query(
  `SELECT coalesce(string_agg(pg_get_viewdef(c.oid), E'\\n'), '') AS tudo
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind IN ('v','m')`);
await c.end();

const doBanco = `${funcoes[0].tudo ?? ''}\n${politicas[0].tudo ?? ''}\n${visoes[0].tudo ?? ''}`;

/* O TypeScript do servidor e das telas, sem os comentários: a história de uma
   coluna morta costuma estar escrita num comentário sobre ela, e contá-lo como
   leitura faria a varredura dizer que ela vive. */
const arquivos = execSync(
  `find ${RAIZ}/backend/src ${RAIZ}/frontend/src -name '*.ts' -o -name '*.tsx'`,
  { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const doCodigo = arquivos.map((f) => readFileSync(f, 'utf8').split('\n')
  .filter((l) => {
    const t = l.trim();
    return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'));
  }).join('\n')).join('\n');

const candidatos = [];
for (const nome of nomes) {
  const re = new RegExp(`\\b${nome}\\b`);
  if (re.test(doBanco) || re.test(doCodigo)) continue;
  const onde = colunas.filter((r) => r.coluna === nome);
  candidatos.push({ nome, tabelas: onde.map((r) => r.tabela),
    morta: onde.some((r) => (r.comentario ?? '').startsWith('MORTA ')) });
}

console.log(`\nVARREDURA DE PONTAS — ${colunas.length} colunas em ${
  new Set(colunas.map((r) => r.tabela)).size} tabelas`);
console.log(`${nomes.length} nomes distintos conferidos (fora id e created_at).\n`);

const jaDeclaradas = candidatos.filter((k) => k.morta);
const novos = candidatos.filter((k) => !k.morta);

if (jaDeclaradas.length) {
  console.log(`JÁ DECLARADAS MORTAS (${jaDeclaradas.length}) — o teste do catálogo as guarda:`);
  for (const k of jaDeclaradas) console.log(`  · ${k.tabelas.join(', ')}.${k.nome}`);
  console.log('');
}

if (!novos.length) {
  console.log('NENHUM CANDIDATO NOVO. Toda coluna aparece em função, política, visão ou código.');
} else {
  console.log(`CANDIDATOS A PONTA SOLTA (${novos.length}) — nome que não aparece em`);
  console.log('função, política, visão nem TypeScript. CONFIRA CADA UM: `SELECT *`');
  console.log('devolve a coluna sem nomeá-la, e então a varredura erra por excesso.\n');
  for (const k of novos) console.log(`  · ${k.tabelas.join(', ')}.${k.nome}`);
}
console.log('');
