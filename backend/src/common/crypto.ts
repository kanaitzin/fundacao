import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

// Parâmetros scrypt (ADR-003): N=2^15, r=8, p=1 — custo adequado a 2026 sem
// penalizar login em aparelhos da operação. Trocar por argon2id é uma troca
// de implementação isolada neste arquivo.
const N = 2 ** 15, r = 8, p = 1, KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r, p, maxmem: 128 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, rr, pp, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, salt, expected.length, {
    N: Number(n), r: Number(rr), p: Number(pp), maxmem: 128 * 1024 * 1024,
  });
  return timingSafeEqual(key, expected);
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
