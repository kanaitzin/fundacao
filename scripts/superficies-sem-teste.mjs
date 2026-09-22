#!/usr/bin/env node
/**
 * SUPERFÍCIE SEM TESTE — quais tabelas nenhum teste jamais escreveu.
 *
 * POR QUE ISTO EXISTE, e a razão é um defeito que custou quarenta fases. A
 * `routine_item` chegava VAZIA da semente, então nenhuma suíte jamais gerou uma
 * grade do dia com item individual — e por isso ninguém viu que a criança
 * internada continuava com os horários dela pedindo ciência ao plantão (fase
 * 141). A lição ficou escrita: **superfície sem dado de partida é superfície sem
 * teste.** Uma lição escrita, porém, é uma lição que se lembra; este script é a
 * mesma coisa MEDIDA.
 *
 * COMO ELE MEDE, e é aqui que está o truque. Contar linhas no fim da suíte não
 * serve: vazio no fim não distingue *"ninguém escreveu"* de *"a suíte limpou"* —
 * e as suítes desta casa limpam, porque o banco é um só. Quem separa os dois é o
 * `pg_stat_user_tables.n_tup_ins`, que conta as inserções da rodada **inclusive
 * das linhas apagadas depois**.
 *
 * Então: rode a suíte inteira e rode isto em seguida, sem mexer no banco no meio.
 *
 *     npm test && node scripts/superficies-sem-teste.mjs
 *
 * NÃO É TESTE, e é a mesma decisão do `varredura-de-pontas.mjs`: o resultado
 * precisa de julgamento. Há tabelas vazias por DECISÃO ESCRITA — a
 * `work_schedule` é MORTA, a `medication_authorization` e o `medication_protocol`
 * são história de decisões que deixaram de valer, e as rotas de escrita delas
 * saíram de propósito. Um teste que reprovasse por elas seria desligado na
 * primeira pressa. Ele diz *candidato*; quem confirma abre o caminho e olha.
 */
import { Client } from 'pg';

/*
 * As que estão vazias por decisão escrita, com a decisão ao lado. Cada linha
 * aqui é uma afirmação que alguém pode conferir — e se a decisão mudar, a linha
 * sai e a tabela volta a ser candidata.
 */
const POR_DECISAO = {
  work_schedule:
    'MORTA desde as fases 129 e 131 — a escala semanal deu lugar à escala por data.',
  medication_authorization:
    'Dormente pela decisão de 08/09 (§8.6): autorização de pessoa deu lugar a marcação de medicamento.',
  medication_protocol:
    'Leitura-só desde 08/09 — as rotas de escrita saíram; o que a casa decidiu em agosto é história dela.',
  medication_protocol_change:
    'O histórico do protocolo acima, pela mesma decisão.',
};

const url = process.env.DATABASE_URL
  ?? 'postgres://rede_admin:dev-only-change-me@127.0.0.1:5432/rede_acolher';

const c = new Client({ connectionString: url });
await c.connect();

const { rows } = await c.query(`
  WITH contagem AS (
    SELECT t.tablename AS tab,
           (xpath('/row/c/text()',
             query_to_xml(format('select count(*) as c from public.%I', t.tablename),
                          false, true, '')))[1]::text::int AS agora
      FROM pg_tables t
     WHERE t.schemaname = 'public' AND t.tablename <> 'schema_migration')
  SELECT k.tab, k.agora, s.n_tup_ins AS inseridas
    FROM contagem k JOIN pg_stat_user_tables s ON s.relname = k.tab
   ORDER BY s.n_tup_ins, k.tab`);

const total = rows.length;
const nunca = rows.filter((r) => Number(r.inseridas) === 0);
const escritas = rows.filter((r) => Number(r.inseridas) > 0);
const limpas = escritas.filter((r) => r.agora === 0);

console.log(`\nSUPERFÍCIE SEM TESTE — ${total} tabelas medidas pela rodada que acabou.\n`);

/*
 * A GUARDA CONTRA LER RODADA PARCIAL, e ela é a parte mais importante deste
 * arquivo.
 *
 * O `n_tup_ins` conta desde que o schema existe, e o `globalSetup` do Jest
 * recria o schema a cada rodada — então rodar UMA suíte e ler isto aqui devolve
 * as outras cento e poucas tabelas como "nunca escritas". Foi o que aconteceu na
 * primeira vez que eu o rodei: oitenta e três candidatas, todas falsas.
 *
 * **Medidor que mente quando mal usado é pior do que medidor nenhum**, porque a
 * saída dele tem a mesma cara nos dois casos. Então ele confere se a rodada foi
 * inteira antes de concluir — e o sinal não é número mágico: é a PROPORÇÃO de
 * tabelas tocadas. Numa rodada inteira ela passa de nove em dez; numa suíte só,
 * fica perto de duas.
 */
const proporcao = escritas.length / total;
if (proporcao < 0.6) {
  console.log('ISTO NÃO PARECE UMA RODADA INTEIRA — e por isso não vou concluir nada.\n');
  console.log(`  Tabelas tocadas nesta rodada: ${escritas.length} de ${total} `
    + `(${Math.round(proporcao * 100)}%).`);
  console.log('  Numa rodada inteira passa de 90%; numa suíte só, fica perto de 20%.\n');
  console.log('O `globalSetup` do Jest recria o schema a cada rodada, e o contador de');
  console.log('inserções começa do zero com ele. Rode a suíte INTEIRA e leia em seguida,');
  console.log('sem mexer no banco no meio:\n');
  console.log('    npm test && node scripts/superficies-sem-teste.mjs\n');
  await c.end();
  process.exit(0);
}

if (!nunca.length) {
  console.log('Toda tabela recebeu pelo menos uma linha em algum teste.\n');
} else {
  const esperadas = nunca.filter((r) => POR_DECISAO[r.tab]);
  const candidatas = nunca.filter((r) => !POR_DECISAO[r.tab]);

  if (esperadas.length) {
    console.log(`VAZIAS POR DECISÃO ESCRITA (${esperadas.length}) — não são candidatas:`);
    for (const r of esperadas) console.log(`  · ${r.tab}\n      ${POR_DECISAO[r.tab]}`);
    console.log('');
  }
  if (candidatas.length) {
    console.log(`NUNCA ESCRITAS POR TESTE NENHUM (${candidatas.length}) — CANDIDATAS:`);
    for (const r of candidatas) console.log(`  · ${r.tab}`);
    console.log('\nCada uma é uma superfície que a suíte nunca exercitou com dado.');
    console.log('Exercite-a antes de confiar nela: foi assim que a fase 146 achou que a');
    console.log('contenção física podia ser escrita na ocorrência de outra casa.\n');
  } else {
    console.log('NENHUMA CANDIDATA. Fora as de decisão escrita, toda tabela foi exercitada.\n');
  }
}

console.log(`Para referência: ${limpas.length} tabelas foram escritas e limpas pela suíte —`);
console.log('vazias agora, exercitadas na rodada. É o que o `n_tup_ins` distingue e uma');
console.log('contagem de linhas não distinguiria.\n');

await c.end();
