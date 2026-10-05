import { createHmac, randomBytes } from 'node:crypto';

/**
 * O CÓDIGO DE SEIS DÍGITOS DO APLICATIVO AUTENTICADOR (fase 187).
 *
 * TOTP (RFC 6238) sobre HOTP (RFC 4226): HMAC-SHA1 do número do intervalo de
 * 30 segundos, com o segredo que o aplicativo e o servidor dividem. É o que o
 * Google Authenticator, o Microsoft Authenticator e os demais calculam; não há
 * biblioteca de fora nem serviço de terceiros, e nada sai do servidor.
 *
 * Aceita-se o intervalo de antes e o de depois (um minuto e meio, no total):
 * o relógio do celular erra alguns segundos, e o código digitado no último
 * segundo chega no intervalo seguinte. Quem impede o mesmo código de entrar
 * duas vezes é o banco (`auth_aceitar_passo`), que guarda o último passo aceito.
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PASSO_EM_SEGUNDOS = 30;

export function base32(bytes: Buffer): string {
  let bits = 0, valor = 0, saida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { saida += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function deBase32(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, valor = 0;
  const bytes: number[] = [];
  for (const c of limpo) {
    valor = (valor << 5) | ALFABETO.indexOf(c); bits += 5;
    if (bits >= 8) { bytes.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

/** Um segredo novo: 20 bytes, como a RFC recomenda para SHA-1. */
export function novoSegredo(): string {
  return base32(randomBytes(20));
}

export function codigoDoPasso(segredo: string, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const h = createHmac('sha1', deBase32(segredo)).update(contador).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export const passoDe = (instanteMs: number) => Math.floor(instanteMs / 1000 / PASSO_EM_SEGUNDOS);

/**
 * Confere o código e devolve O PASSO em que ele bate (para o banco guardar),
 * ou nulo. A comparação percorre os três passos sempre, sem sair no primeiro.
 */
export function conferirCodigo(segredo: string, codigo: string, agoraMs = Date.now()): number | null {
  const digitado = String(codigo ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(digitado)) return null;
  const atual = passoDe(agoraMs);
  let achado: number | null = null;
  for (const p of [atual - 1, atual, atual + 1]) {
    if (codigoDoPasso(segredo, p) === digitado && achado === null) achado = p;
  }
  return achado;
}

/**
 * O endereço que o aplicativo autenticador entende. Tocado no celular, abre o
 * aplicativo já com a conta; num computador, a tela mostra o segredo para ser
 * digitado. O e-mail entra só como rótulo dentro do aplicativo da pessoa.
 */
export function enderecoDoAutenticador(segredo: string, conta: string): string {
  const rotulo = encodeURIComponent(`Rede Acolher:${conta}`);
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent('Rede Acolher')}`
    + `&algorithm=SHA1&digits=6&period=${PASSO_EM_SEGUNDOS}`;
}

/** Os oito códigos de reserva: dez caracteres sem letra parecida com número. */
export function codigosDeReserva(n = 8): string[] {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: n }, () => {
    const b = randomBytes(10);
    const s = [...b].map((x) => letras[x % letras.length]).join('');
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export const normalizarReserva = (c: string) => String(c ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
