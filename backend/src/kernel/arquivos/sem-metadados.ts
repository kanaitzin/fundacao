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
 *  - o XMP inteiro (onde a localização também pode estar), trocado por espaços.
 *
 * A orientação e o resto do EXIF ficam: sem a orientação, a foto deitada de lado chegaria
 * deitada. Nada muda de tamanho nem de lugar dentro do arquivo, então a imagem abre igual; no
 * PNG, o código de conferência de cada bloco mexido é refeito. Vale para JPEG, PNG, WebP e
 * HEIC (a foto do iPhone). Arquivo que não for imagem, ou que não der para ler, volta como veio.
 */
import { crc32 } from 'node:zlib';

const XMP_INICIO = Buffer.from('<x:xmpmeta');
const XMP_FIM = Buffer.from('</x:xmpmeta>');
const EXIF = Buffer.from('Exif\0\0');
const TAG_DO_GPS = 0x8825;
const BYTES_DO_TIPO: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

/** Apaga o bloco do GPS de um TIFF (o EXIF), no lugar. Devolve se apagou alguma coisa. */
export function semGpsNoTiff(b: Buffer, inicio: number, fim = b.length): boolean {
  try {
    const ordem = b.toString('latin1', inicio, inicio + 2);
    if (ordem !== 'II' && ordem !== 'MM') return false;
    const le = ordem === 'II';
    const u16 = (o: number) => (le ? b.readUInt16LE(inicio + o) : b.readUInt16BE(inicio + o));
    const u32 = (o: number) => (le ? b.readUInt32LE(inicio + o) : b.readUInt32BE(inicio + o));
    const dentro = (o: number, n: number) => o >= 0 && inicio + o + n <= fim;
    if (u16(2) !== 42) return false;
    const ifd0 = u32(4);
    if (!dentro(ifd0, 2)) return false;
    const entradas0 = u16(ifd0);
    for (let i = 0; i < entradas0; i++) {
      const e = ifd0 + 2 + i * 12;
      if (!dentro(e, 12)) return false;
      if (u16(e) !== TAG_DO_GPS) continue;
      const gps = u32(e + 8);
      if (!dentro(gps, 2)) return false;
      const n = u16(gps);
      for (let j = 0; j < n; j++) {
        const g = gps + 2 + j * 12;
        if (!dentro(g, 12)) break;
        const tamanho = (BYTES_DO_TIPO[u16(g + 2)] ?? 1) * u32(g + 4);
        if (tamanho > 4) {
          const valor = u32(g + 8);
          if (dentro(valor, tamanho)) b.fill(0, inicio + valor, inicio + valor + tamanho);
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

/** Troca por espaços todo XMP que achar entre `de` e `ate`. */
function semXmp(b: Buffer, de = 0, ate = b.length): boolean {
  let mudou = false;
  let i = b.indexOf(XMP_INICIO, de);
  while (i >= 0 && i < ate) {
    const f = b.indexOf(XMP_FIM, i);
    if (f < 0 || f + XMP_FIM.length > ate) break;
    b.fill(0x20, i, f + XMP_FIM.length);
    mudou = true;
    i = b.indexOf(XMP_INICIO, f);
  }
  return mudou;
}

/** Todo `Exif\0\0` seguido de TIFF, onde estiver (JPEG, WebP, HEIC). */
function semGpsEmTodoExif(b: Buffer): void {
  let i = b.indexOf(EXIF);
  while (i >= 0) {
    semGpsNoTiff(b, i + EXIF.length);
    i = b.indexOf(EXIF, i + EXIF.length);
  }
}

function png(b: Buffer): void {
  let p = 8;
  while (p + 12 <= b.length) {
    const tamanho = b.readUInt32BE(p);
    const tipo = b.toString('latin1', p + 4, p + 8);
    const dados = p + 8;
    if (dados + tamanho + 4 > b.length) return;
    let mudou = false;
    if (tipo === 'eXIf') mudou = semGpsNoTiff(b, dados, dados + tamanho);
    if (tipo === 'iTXt' || tipo === 'tEXt' || tipo === 'zTXt') mudou = semXmp(b, dados, dados + tamanho) || mudou;
    if (mudou) b.writeUInt32BE(crc32(b.subarray(p + 4, dados + tamanho)) >>> 0, dados + tamanho);
    if (tipo === 'IEND') return;
    p = dados + tamanho + 4;
  }
}

/** Uma cópia da imagem sem o GPS e sem o XMP. O que não é imagem volta igual. */
export function semMetadados(original: Buffer, mime: string): Buffer {
  if (!/^image\/(jpeg|png|webp|heic)$/.test(mime)) return original;
  const b = Buffer.from(original);
  if (mime === 'image/png') { png(b); return b; }
  semGpsEmTodoExif(b);
  /* No WebP o EXIF vem sem o prefixo `Exif\0\0`: o bloco `EXIF` do RIFF já é o TIFF. */
  if (mime === 'image/webp') {
    let p = 12;
    while (p + 8 <= b.length) {
      const tipo = b.toString('latin1', p, p + 4);
      const tamanho = b.readUInt32LE(p + 4);
      if (tipo === 'EXIF') semGpsNoTiff(b, p + 8, p + 8 + tamanho);
      p += 8 + tamanho + (tamanho % 2);
    }
  }
  semXmp(b);
  return b;
}
