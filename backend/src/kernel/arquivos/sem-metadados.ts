/**
 * A FOTO SEM O LUGAR ONDE FOI TIRADA (fase 294; o M2 da análise geral de 08/11).
 *
 * A câmera do celular grava na foto, junto da imagem, a latitude e a longitude de onde ela foi
 * tirada: numa casa de acolhimento, é o endereço da casa, e a foto sai da instituição no livro
 * da vida (fase 270) e em todo documento baixado. A foto grande era redesenhada no aparelho e
 * perdia esses dados sem querer; a que já chegava pequena, ou de outro aplicativo, ia como veio.
 *
 * Aqui, ao guardar qualquer imagem, saem:
 *  - o bloco do GPS dentro do EXIF (as entradas e os valores que elas apontam viram zero);
 *  - o XMP (onde a localização também pode estar) e o IPTC do JPEG (cidade e bairro em texto).
 *
 * A orientação e o resto do EXIF ficam: sem a orientação, a foto deitada de lado chegaria
 * deitada. Nada muda de tamanho nem de lugar dentro do arquivo, então a imagem abre igual.
 *
 * Tudo é feito BLOCO A BLOCO, pela estrutura de cada formato, e nunca no arquivo inteiro: a
 * revisão de segurança da primeira versão provou que um JPEG preparado, com milhares de
 * entradas de GPS apontando para o arquivo todo, prendia o servidor por 40 segundos, e que o
 * XMP estendido, procurado no arquivo inteiro, apagava os cabeçalhos entre um pedaço e outro.
 * Agora cada leitura fica dentro do bloco, com teto de entradas, e nada é zerado duas vezes.
 *
 * Arquivo que não for imagem, ou que não der para ler, volta como veio.
 */

const TAG_DO_GPS = 0x8825;
/** O GPS tem cerca de 32 campos no padrão; mais que isso não é foto de câmera. */
const MAXIMO_DE_ENTRADAS = 64;
const BYTES_DO_TIPO: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

/** Apaga o bloco do GPS de um TIFF (o EXIF) que mora entre `inicio` e `fim`, no lugar. */
export function semGpsNoTiff(b: Buffer, inicio: number, fim: number): boolean {
  try {
    if (fim - inicio < 8) return false;
    const ordem = b.toString('latin1', inicio, inicio + 2);
    if (ordem !== 'II' && ordem !== 'MM') return false;
    const le = ordem === 'II';
    const u16 = (o: number) => (le ? b.readUInt16LE(inicio + o) : b.readUInt16BE(inicio + o));
    const u32 = (o: number) => (le ? b.readUInt32LE(inicio + o) : b.readUInt32BE(inicio + o));
    const dentro = (o: number, n: number) => o >= 0 && n >= 0 && inicio + o + n <= fim;
    if (u16(2) !== 42) return false;
    const ifd0 = u32(4);
    if (!dentro(ifd0, 2)) return false;
    const entradas0 = Math.min(u16(ifd0), MAXIMO_DE_ENTRADAS);
    for (let i = 0; i < entradas0; i++) {
      const e = ifd0 + 2 + i * 12;
      if (!dentro(e, 12)) return false;
      if (u16(e) !== TAG_DO_GPS) continue;
      const gps = u32(e + 8);
      if (!dentro(gps, 2)) return false;
      const n = Math.min(u16(gps), MAXIMO_DE_ENTRADAS);
      const zerados = new Set<number>();
      for (let j = 0; j < n; j++) {
        const g = gps + 2 + j * 12;
        if (!dentro(g, 12)) break;
        const tamanho = (BYTES_DO_TIPO[u16(g + 2)] ?? 1) * u32(g + 4);
        if (tamanho > 4) {
          const valor = u32(g + 8);
          if (!zerados.has(valor) && dentro(valor, tamanho)) {
            zerados.add(valor);
            b.fill(0, inicio + valor, inicio + valor + tamanho);
          }
        }
        b.fill(0, inicio + g, inicio + g + 12);
      }
      b.fill(0, inicio + gps, inicio + gps + 2);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const comeca = (b: Buffer, em: number, texto: string) =>
  b.length >= em + texto.length && b.toString('latin1', em, em + texto.length) === texto;

/** JPEG: só os segmentos antes da imagem, cada um no seu tamanho. */
function jpeg(b: Buffer): void {
  let p = 2;
  while (p + 4 <= b.length && b[p] === 0xff) {
    const marca = b[p + 1];
    if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { p += 2; continue; }
    if (marca === 0xda || marca === 0xd9) return; // a imagem começa: dali em diante é só imagem
    const tamanho = b.readUInt16BE(p + 2);
    const dados = p + 4;
    const fim = p + 2 + tamanho;
    if (tamanho < 2 || fim > b.length) return;
    if (marca === 0xe1 && comeca(b, dados, 'Exif\0\0')) semGpsNoTiff(b, dados + 6, fim);
    if (marca === 0xe1 && comeca(b, dados, 'http://ns.adobe.com/xap/1.0/\0')) b.fill(0x20, dados + 29, fim);
    if (marca === 0xe1 && comeca(b, dados, 'http://ns.adobe.com/xmp/extension/\0')) b.fill(0x20, dados + 35, fim);
    if (marca === 0xed && comeca(b, dados, 'Photoshop 3.0\0')) b.fill(0, dados + 14, fim); // o IPTC
    p = fim;
  }
}

/* O código de conferência dos blocos do PNG, escrito aqui: o do `node:zlib` só existe a partir
   do Node 20.15, e o instalador aceita o 20. */
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = TABELA_CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG: o eXIf, e os textos que carregam XMP ou o EXIF em hexadecimal. */
function png(b: Buffer): void {
  let p = 8;
  while (p + 12 <= b.length) {
    const tamanho = b.readUInt32BE(p);
    const tipo = b.toString('latin1', p + 4, p + 8);
    const dados = p + 8;
    const fim = dados + tamanho;
    if (fim + 4 > b.length) return;
    let mudou = false;
    if (tipo === 'eXIf') mudou = semGpsNoTiff(b, dados, fim);
    if (tipo === 'iTXt' || tipo === 'tEXt' || tipo === 'zTXt') {
      const zero = b.indexOf(0, dados);
      const chave = zero > dados && zero < fim ? b.toString('latin1', dados, zero) : '';
      if (chave === 'XML:com.adobe.xmp' || chave.startsWith('Raw profile type')) {
        b.fill(0x20, zero + 1, fim);
        mudou = true;
      }
    }
    if (mudou) b.writeUInt32BE(crc32(b.subarray(p + 4, fim)), fim);
    if (tipo === 'IEND') return;
    p = fim + 4;
  }
}

/** WebP: os blocos `EXIF` (o TIFF direto) e `XMP `. */
function webp(b: Buffer): void {
  let p = 12;
  while (p + 8 <= b.length) {
    const tipo = b.toString('latin1', p, p + 4);
    const tamanho = b.readUInt32LE(p + 4);
    const dados = p + 8;
    const fim = dados + tamanho;
    if (fim > b.length) return;
    if (tipo === 'EXIF') {
      const tiff = comeca(b, dados, 'Exif\0\0') ? dados + 6 : dados;
      semGpsNoTiff(b, tiff, fim);
    }
    if (tipo === 'XMP ') b.fill(0x20, dados, fim);
    p = fim + (tamanho % 2);
  }
}

/** HEIC: o item Exif do iPhone traz o `Exif\0\0`; o XMP vem num item de texto. */
function heic(b: Buffer): void {
  const EXIF = Buffer.from('Exif\0\0', 'latin1');
  let i = b.indexOf(EXIF);
  for (let vezes = 0; i >= 0 && vezes < 8; vezes++) {
    semGpsNoTiff(b, i + EXIF.length, Math.min(b.length, i + EXIF.length + 65536));
    i = b.indexOf(EXIF, i + EXIF.length);
  }
  const inicio = Buffer.from('<x:xmpmeta', 'latin1');
  const fimXmp = Buffer.from('</x:xmpmeta>', 'latin1');
  let x = b.indexOf(inicio);
  for (let vezes = 0; x >= 0 && vezes < 8; vezes++) {
    const f = b.indexOf(fimXmp, x);
    if (f < 0 || f - x > 262144) break;
    b.fill(0x20, x, f + fimXmp.length);
    x = b.indexOf(inicio, f);
  }
}

/** Uma cópia da imagem sem o GPS, sem o XMP e sem o IPTC. O que não é imagem volta igual. */
export function semMetadados(original: Buffer, mime: string): Buffer {
  const limpar = { 'image/jpeg': jpeg, 'image/png': png, 'image/webp': webp, 'image/heic': heic }[mime];
  if (!limpar) return original;
  const b = Buffer.from(original);
  try {
    limpar(b);
    return b;
  } catch {
    return original;
  }
}
