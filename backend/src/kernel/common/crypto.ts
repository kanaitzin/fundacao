import { randomBytes, scrypt as _scrypt, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

// Parâmetros scrypt (ADR-003): N=2^15, r=8, p=1 — custo adequado a 2026 sem
// penalizar login em aparelhos da operação. Trocar por argon2id é uma troca
// de implementação isolada neste arquivo.
const N = 2 ** 15, r = 8, p = 1, KEYLEN = 64;

/**
 * O hash guardado (fase 293, identity/1688): `scrypt2$N$r$p$tamanho$sal$sha256(chave)`. O banco
 * guarda o sha256 da chave, e não a chave: uma cópia do banco não vale como senha. Quem
 * compara é o banco (`auth_chave_confere`), com a chave que `chaveDaSenha` deriva.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r, p, maxmem: 128 * 1024 * 1024 });
  const resumo = createHash('sha256').update(key).digest('base64');
  return `scrypt2$${N}$${r}$${p}$${KEYLEN}$${salt.toString('base64')}$${resumo}`;
}

/**
 * A chave da senha com o sal que o banco entregou (fase 293): o hash fica no banco, e quem
 * compara é ele. O custo é o mesmo para e-mail com e sem conta (o sal falso tem os mesmos
 * parâmetros).
 */
export async function chaveDaSenha(password: string, sal: { n: number; r: number; p: number; sal: string; tamanho: number }): Promise<string> {
  const key = await scrypt(password, Buffer.from(sal.sal, 'base64'), sal.tamanho, {
    N: sal.n, r: sal.r, p: sal.p, maxmem: 128 * 1024 * 1024,
  });
  return key.toString('base64');
}

/** Token de sessão opaco; somente o hash vai ao banco (ADR-002). */
export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  const pepper = process.env.SESSION_PEPPER ?? 'dev-pepper';
  return createHash('sha256').update(token + pepper).digest('hex');
}
