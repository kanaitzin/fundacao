/**
 * A FOTO SEM O LUGAR ONDE FOI TIRADA (fase 294; o M2 da análise geral de 08/11).
 *
 * Esta suíte cobra, com fotos de verdade (desenhadas pela mesma biblioteca de imagem que o
 * servidor usa, com um EXIF de câmera e um XMP colocados dentro):
 *  1. o JPEG guardado sai sem a latitude e sem o XMP, com a orientação, e abre do mesmo tamanho;
 *  2. o PNG guardado sai sem o GPS do bloco eXIf, com o código de conferência certo, e abre;
 *  3. a soma do arquivo repetido é a do que foi guardado: a recusa do repetido continua valendo;
 *  4. o PDF e a imagem sem nada disso chegam ao disco iguais.
 */
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { ArquivosService } from '../src/kernel/arquivos/arquivos.service';

const LATITUDE = 30; // graus: o número que não pode chegar ao disco
const XMP = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><exif:GPSLatitude>30,1.5S</exif:GPSLatitude></x:xmpmeta>';

/** Um TIFF (big-endian) com a orientação 6 e o bloco do GPS com a latitude em graus. */
function exifComGps(): Buffer {
  const t = Buffer.alloc(80);
  t.write('MM', 0, 'latin1'); t.writeUInt16BE(42, 2); t.writeUInt32BE(8, 4);
  t.writeUInt16BE(2, 8); // IFD0, duas entradas
  t.writeUInt16BE(0x0112, 10); t.writeUInt16BE(3, 12); t.writeUInt32BE(1, 14); t.writeUInt16BE(6, 18); // orientação
  t.writeUInt16BE(0x8825, 22); t.writeUInt16BE(4, 24); t.writeUInt32BE(1, 26); t.writeUInt32BE(38, 30); // GPS em 38
  t.writeUInt32BE(0, 34);
  t.writeUInt16BE(1, 38); // GPS IFD, uma entrada: a latitude, três racionais em 56
  t.writeUInt16BE(0x0002, 40); t.writeUInt16BE(5, 42); t.writeUInt32BE(3, 44); t.writeUInt32BE(56, 48);
  t.writeUInt32BE(0, 52);
  t.writeUInt32BE(LATITUDE, 56); t.writeUInt32BE(1, 60);
  t.writeUInt32BE(1, 64); t.writeUInt32BE(1, 68);
  t.writeUInt32BE(15, 72); t.writeUInt32BE(10, 76);
  return t;
}

function segmentoJpeg(marca: number, dados: Buffer): Buffer {
  const cab = Buffer.alloc(4);
  cab.writeUInt16BE(marca, 0); cab.writeUInt16BE(dados.length + 2, 2);
  return Buffer.concat([cab, dados]);
}

function blocoPng(tipo: string, dados: Buffer): Buffer {
  const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo) >>> 0);
  return Buffer.concat([tam, corpo, crc]);
}

function desenho() {
  const c = createCanvas(64, 40);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a6'; ctx.fillRect(0, 0, 64, 40);
  ctx.fillStyle = '#fff'; ctx.fillRect(10, 10, 20, 20);
  return c;
}

/** O valor do racional da latitude, lido no TIFF que ficou no disco (zero quando saiu). */
function latitudeNo(b: Buffer, inicioDoTiff: number): number {
  return b.readUInt32BE(inicioDoTiff + 56);
}

describe('A foto sem o lugar onde foi tirada', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sem-o-lugar-'));
  const antes = process.env.ARQUIVOS_DIR;
  let arquivos: ArquivosService;
  beforeAll(() => { process.env.ARQUIVOS_DIR = dir; arquivos = new ArquivosService(); });
  afterAll(() => { if (antes === undefined) delete process.env.ARQUIVOS_DIR; else process.env.ARQUIVOS_DIR = antes; });

  const guardar = async (b: Buffer) => {
    const g = (await arquivos.guardar(b.toString('base64')))!;
    return { g, noDisco: await readFile(join(dir, g.chave)) };
  };

  it('o JPEG sai sem a latitude e sem o XMP, com a orientação, e abre do mesmo tamanho', async () => {
    const jpeg = await desenho().encode('jpeg', 90);
    const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exifComGps()]);
    const xmp = Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(XMP, 'latin1')]);
    const comGps = Buffer.concat([jpeg.subarray(0, 2), segmentoJpeg(0xffe1, exif), segmentoJpeg(0xffe1, xmp), jpeg.subarray(2)]);
    const tiff = 2 + 4 + 6; // depois do SOI, do cabeçalho do APP1 e do `Exif\0\0`
    expect(latitudeNo(comGps, tiff)).toBe(LATITUDE);

    const { g, noDisco } = await guardar(comGps);
    expect(g.mime).toBe('image/jpeg');
    expect(noDisco).toHaveLength(comGps.length);
    expect(latitudeNo(noDisco, tiff)).toBe(0);
    expect(noDisco.includes(Buffer.from('GPSLatitude'))).toBe(false);
    expect(noDisco.readUInt16BE(tiff + 18)).toBe(6); // a orientação continua
    /* Abre, e a orientação 6 (girar 90 graus) ainda vale: o desenho de 64 por 40 sai em pé. */
    const img = await loadImage(noDisco);
    expect([img.width, img.height]).toEqual([40, 64]);
  });

  it('o PNG sai sem o GPS do bloco eXIf, com o código de conferência certo, e abre', async () => {
    const png = await desenho().encode('png');
    const fimDoIhdr = 8 + 25;
    const comGps = Buffer.concat([png.subarray(0, fimDoIhdr), blocoPng('eXIf', exifComGps()), png.subarray(fimDoIhdr)]);
    const tiff = fimDoIhdr + 8;
    expect(latitudeNo(comGps, tiff)).toBe(LATITUDE);

    const { noDisco } = await guardar(comGps);
    expect(latitudeNo(noDisco, tiff)).toBe(0);
    const tamanho = noDisco.readUInt32BE(fimDoIhdr);
    const crcGuardado = noDisco.readUInt32BE(fimDoIhdr + 8 + tamanho);
    expect(crcGuardado).toBe(crc32(noDisco.subarray(fimDoIhdr + 4, fimDoIhdr + 8 + tamanho)) >>> 0);
    const img = await loadImage(noDisco);
    expect([img.width, img.height]).toEqual([64, 40]);
  });

  it('a soma do repetido é a do que foi guardado', async () => {
    const jpeg = await desenho().encode('jpeg', 80);
    const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exifComGps()]);
    const comGps = Buffer.concat([jpeg.subarray(0, 2), segmentoJpeg(0xffe1, exif), jpeg.subarray(2)]);
    const { g } = await guardar(comGps);
    expect(arquivos.somaDe(comGps.toString('base64'))).toBe(g.sha256);
  });

  it('o PDF e a imagem sem GPS chegam ao disco iguais', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');
    expect((await guardar(pdf)).noDisco.equals(pdf)).toBe(true);
    const png = await desenho().encode('png');
    expect((await guardar(png)).noDisco.equals(png)).toBe(true);
  });
});
