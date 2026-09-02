#!/usr/bin/env node
/**
 * O COFRE ABRE?
 *
 * A única parte do sistema em que restaurar os bytes não basta.
 *
 * As credenciais de acesso dos acolhidos (gov.br, INSS, CTPS, banco) são
 * cifradas pela aplicação em AES-256-GCM, com a chave em `CREDENTIAL_KEY`. O
 * banco guarda bytes; a chave vive fora dele. Isso significa que um backup
 * restaurado com a chave ERRADA volta com o cofre intacto e ilegível — e o
 * GCM, por autenticar, recusa em vez de devolver texto errado, que é o
 * comportamento certo e também o mais silencioso: ninguém repara, porque
 * ninguém abre o cofre todo dia.
 *
 * Este conferidor abre TODAS as credenciais e diz quantas responderam. Ele
 * NÃO imprime nenhum segredo, nem parte de um: só a contagem e, quando falha,
 * o id da linha — que é metadado, e é o que basta para investigar (§20).
 *
 * Uso:  DATABASE_URL=... CREDENTIAL_KEY=... node scripts/conferir-cofre.mjs
 * Sai com 0 se todas abriram, 1 se alguma não abriu.
 */
import { createDecipheriv, createHash } from 'node:crypto';
import pg from 'pg';

const DEV_KEY = 'chave-de-desenvolvimento-nao-usar-em-producao';

/* A MESMA derivação do `kernel/common/segredo.ts`. Duplicada aqui de
 * propósito: este script precisa rodar com o sistema PARADO, sem subir o
 * NestJS — no dia da restauração o serviço ainda não está no ar, e um
 * conferidor que depende do que se quer conferir não confere nada. */
const chave = () => createHash('sha256')
  .update(process.env.CREDENTIAL_KEY ?? DEV_KEY).digest();

function abre(guardado) {
  const [versao, iv, tag, dados] = String(guardado).split('.');
  if (versao !== 'v1' || !iv || !tag || !dados) return false;
  try {
    const d = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    Buffer.concat([d.update(Buffer.from(dados, 'base64url')), d.final()]);
    return true;
  } catch {
    return false;
  }
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(`SELECT id, secret_enc FROM person_credential`);
await c.end();

if (!rows.length) {
  console.log('Nenhuma credencial guardada — nada a conferir.');
  process.exit(0);
}

const fechadas = rows.filter((r) => !abre(r.secret_enc)).map((r) => r.id);
if (!fechadas.length) {
  console.log(`${rows.length} credencial(is): todas abrem com a chave deste ambiente.`);
  process.exit(0);
}

console.error(
  `${fechadas.length} de ${rows.length} credencial(is) NÃO abrem com esta chave.\n`
  + 'Isto quase sempre significa uma coisa só: a CREDENTIAL_KEY deste ambiente\n'
  + 'não é a que cifrou estes dados. Não recadastre nada antes de procurar a\n'
  + 'chave certa — recadastrar apaga a única pista de que ela existiu.\n'
  + `Linhas: ${fechadas.slice(0, 10).join(', ')}${fechadas.length > 10 ? '…' : ''}`);
process.exit(1);
