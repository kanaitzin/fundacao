/**
 * O CÓDIGO DO APLICATIVO AUTENTICADOR, NO NAVEGADOR — só para o protótipo
 * (fase 187).
 *
 * O servidor de verdade calcula com o `crypto` do Node (`backend/src/kernel/
 * common/totp.ts`), e é lá que mora a regra. Aqui é o mesmo cálculo (RFC
 * 6238) pelo WebCrypto, para a demonstração funcionar com um aplicativo
 * autenticador de verdade no celular de quem testa, sem servidor.
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(bytes: Uint8Array): string {
  let bits = 0, valor = 0, saida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { saida += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

function deBase32(texto: string): Uint8Array<ArrayBuffer> {
  const limpo = texto.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, valor = 0;
  const bytes: number[] = [];
  for (const c of limpo) {
    valor = (valor << 5) | ALFABETO.indexOf(c); bits += 5;
    if (bits >= 8) { bytes.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

export function novoSegredo(): string {
  return base32(crypto.getRandomValues(new Uint8Array(20)));
}

async function codigoDoPasso(segredo: string, passo: number): Promise<string> {
  const chave = await crypto.subtle.importKey('raw', deBase32(segredo), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const contador = new DataView(new ArrayBuffer(8));
  contador.setUint32(0, Math.floor(passo / 2 ** 32));
  contador.setUint32(4, passo >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', chave, contador.buffer));
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** O passo em que o código bate (um intervalo antes ou depois também vale), ou nulo. */
export async function conferirCodigo(segredo: string, codigo: string, agoraMs = Date.now()): Promise<number | null> {
  const digitado = String(codigo ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(digitado)) return null;
  const atual = Math.floor(agoraMs / 30_000);
  for (const p of [atual - 1, atual, atual + 1]) {
    if ((await codigoDoPasso(segredo, p)) === digitado) return p;
  }
  return null;
}
