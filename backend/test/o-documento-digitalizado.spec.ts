/**
 * O DOCUMENTO DIGITALIZADO (fase 194; pedido de 10/10).
 *
 * A câmera do sistema junta as fotos das páginas num PDF, montado no aparelho
 * por `kernel/documentos/pdf-de-imagens.ts`. Este teste prova as três coisas
 * que importam para quem guarda o papel do hospital:
 *
 *  1. o servidor ACEITA o PDF como PDF (pela assinatura) e como INTEIRO (o
 *     `%%EOF` que a internação confere desde a fase 165);
 *  2. o servidor DESENHA as páginas (o mesmo `paginasDoPdf` que põe os
 *     anexos dentro do relatório da internação em Word), na ordem e em A4;
 *  3. foto que não é JPEG é recusada, em português.
 *
 * As fotos são de verdade, feitas pelo `@napi-rs/canvas`, no tamanho que a
 * câmera entrega (a lição da fase 179: dado de teste do tamanho de um pixel
 * esconde o limite).
 */
import { createCanvas } from '@napi-rs/canvas';
import { medidasDoJpeg, pdfDeJpegs } from '../src/kernel/documentos/pdf-de-imagens';
import { paginasDoPdf } from '../src/kernel/documentos/paginas-do-pdf';
import { ArquivosService } from '../src/kernel/arquivos/arquivos.service';

function folha(largura: number, altura: number, texto: string): Uint8Array {
  const c = createCanvas(largura, altura);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, largura, altura);
  g.fillStyle = '#111111'; g.font = '48px sans-serif';
  for (let y = 120; y < altura; y += 90) g.fillText(`${texto} · linha ${y}`, 60, y);
  return new Uint8Array(c.toBuffer('image/jpeg', 85));
}

describe('o documento digitalizado em PDF', () => {
  const retrato = folha(1500, 2000, 'Alta hospitalar (fictícia)');
  const deitada = folha(2000, 1400, 'Receita (fictícia)');

  it('lê o tamanho da foto do próprio JPEG', () => {
    expect(medidasDoJpeg(retrato)).toEqual({ largura: 1500, altura: 2000, cores: 3 });
    expect(medidasDoJpeg(deitada)).toMatchObject({ largura: 2000, altura: 1400 });
  });

  it('o servidor aceita o PDF como PDF inteiro, e desenha as páginas na ordem, em A4', async () => {
    const pdf = Buffer.from(pdfDeJpegs([{ jpeg: retrato }, { jpeg: deitada }]));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(retrato.length + deitada.length);

    process.env.ARQUIVOS_DIR = process.env.ARQUIVOS_DIR ?? '/tmp/arquivos';
    const guardado = await new ArquivosService().guardar(pdf.toString('base64'), { conferirInteireza: true });
    expect(guardado).toMatchObject({ mime: 'application/pdf', rotulo: 'PDF' });

    const desenho = await paginasDoPdf(pdf);
    expect(desenho.falhou).toBeFalsy();
    expect(desenho.total).toBe(2);
    expect(desenho.paginas).toHaveLength(2);
    // A página desenhada tem a proporção do A4, com a foto dentro, e não a da foto.
    for (const png of desenho.paginas) {
      const largura = png.readUInt32BE(16);
      const altura = png.readUInt32BE(20);
      expect(altura / largura).toBeCloseTo(841.89 / 595.28, 1);
    }
  }, 60_000);

  it('recusa o que não é foto em JPEG, e o documento sem página', () => {
    expect(() => pdfDeJpegs([])).toThrow('pelo menos uma página');
    expect(() => pdfDeJpegs([{ jpeg: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]) }])).toThrow('JPEG');
    expect(() => pdfDeJpegs([{ jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }])).toThrow();
  });
});
