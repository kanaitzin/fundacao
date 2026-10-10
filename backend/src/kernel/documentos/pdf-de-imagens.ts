/**
 * O DOCUMENTO DIGITALIZADO EM PDF (fase 194; pedido de 10/10).
 *
 * A câmera do sistema fotografa as páginas de um papel (a alta do hospital, a
 * receita, o parecer, o relatório da escola) e entrega UM PDF, com uma página
 * por foto, e não uma pilha de JPG soltos: o papel de várias folhas continua
 * sendo um documento só, que abre na ordem, imprime em A4 e entra no relatório
 * da internação como qualquer PDF que veio do hospital.
 *
 * Não importa nada, como o `implantacao.regra.ts`: a TELA monta o PDF no
 * aparelho (a foto não sai dele antes de a pessoa confirmar), e a SUÍTE confere
 * que o servidor aceita e desenha o que sai daqui.
 *
 * Por que escrito à mão, e não uma biblioteca: um PDF de imagens é pequeno de
 * escrever (catálogo, páginas, e cada foto como JPEG embutido, que o PDF
 * entende sem converter), e uma biblioteca de PDF no aparelho seria centenas
 * de KB a mais no protótipo que o Marcelo abre com dois cliques.
 */
export interface PaginaJpeg {
  /** Os bytes do JPEG, como a câmera os deixou depois de reduzir. */
  jpeg: Uint8Array;
}

/**
 * O tamanho e as cores vêm do PRÓPRIO JPEG (o marcador SOF), e não de quem
 * chama: tamanho informado errado faria a página sair esticada, e um JPEG em
 * tons de cinza declarado como colorido sairia ilegível.
 */
export function medidasDoJpeg(b: Uint8Array): { largura: number; altura: number; cores: number } {
  if (!(b?.length > 3) || b[0] !== 0xff || b[1] !== 0xd8) throw new Error('Cada página tem de ser uma foto em JPEG.');
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marca = b[i + 1];
    if (marca === 0xff || marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { i += marca === 0xff ? 1 : 2; continue; }
    const tam = (b[i + 2] << 8) | b[i + 3];
    /* SOF0 a SOF15, menos DHT (C4), JPG (C8) e DAC (CC). */
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      const altura = (b[i + 5] << 8) | b[i + 6];
      const largura = (b[i + 7] << 8) | b[i + 8];
      const cores = b[i + 9];
      if (!largura || !altura || ![1, 3, 4].includes(cores)) break;
      return { largura, altura, cores };
    }
    i += 2 + tam;
  }
  throw new Error('Não foi possível ler o tamanho da foto.');
}

/** A4 em pontos, e a margem de 1 cm em volta da foto. */
const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 28.35;

const texto = (s: string) => new TextEncoder().encode(s);

/** Monta o PDF: uma página A4 por foto, a foto inteira, centrada, sem distorcer. */
export function pdfDeJpegs(paginas: PaginaJpeg[]): Uint8Array {
  if (!paginas.length) throw new Error('O documento precisa de pelo menos uma página.');
  const medidas = paginas.map((p) => medidasDoJpeg(p.jpeg));

  const partes: Uint8Array[] = [];
  const posicoes: number[] = [];
  let total = 0;
  const por = (b: Uint8Array) => { partes.push(b); total += b.length; };
  /* Objeto n: 1 catálogo, 2 páginas, e para cada página i: página, conteúdo, imagem. */
  const objeto = (n: number, corpo: (string | Uint8Array)[]) => {
    posicoes[n] = total;
    por(texto(`${n} 0 obj\n`));
    for (const c of corpo) por(typeof c === 'string' ? texto(c) : c);
    por(texto('\nendobj\n'));
  };

  /* O cabeçalho, com os quatro bytes altos que dizem "isto é binário". */
  por(texto('%PDF-1.4\n'));
  por(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const n = paginas.length;
  const idPagina = (i: number) => 3 + i * 3;
  objeto(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  objeto(2, [`<< /Type /Pages /Count ${n} /Kids [${paginas.map((_, i) => `${idPagina(i)} 0 R`).join(' ')}] >>`]);

  paginas.forEach((p, i) => {
    const id = idPagina(i);
    const { largura, altura, cores } = medidas[i];
    const espaco = cores === 1 ? '/DeviceGray' : cores === 4 ? '/DeviceCMYK' : '/DeviceRGB';
    const livreL = A4.largura - 2 * MARGEM;
    const livreA = A4.altura - 2 * MARGEM;
    const escala = Math.min(livreL / largura, livreA / altura);
    const w = largura * escala;
    const h = altura * escala;
    const x = (A4.largura - w) / 2;
    const y = (A4.altura - h) / 2;
    const desenho = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${i} Do Q`;
    objeto(id, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.largura} ${A4.altura}] `
      + `/Resources << /XObject << /Im${i} ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`]);
    objeto(id + 1, [`<< /Length ${desenho.length} >>\nstream\n${desenho}\nendstream`]);
    objeto(id + 2, [`<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura} `
      + `/ColorSpace ${espaco} /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
    p.jpeg, '\nendstream']);
  });

  const quantos = 3 + n * 3;
  const inicioDaTabela = total;
  const linhas = ['xref', `0 ${quantos}`, '0000000000 65535 f '];
  for (let k = 1; k < quantos; k++) linhas.push(`${String(posicoes[k]).padStart(10, '0')} 00000 n `);
  por(texto(`${linhas.join('\n')}\ntrailer\n<< /Size ${quantos} /Root 1 0 R >>\nstartxref\n${inicioDaTabela}\n%%EOF\n`));

  const saida = new Uint8Array(total);
  let pos = 0;
  for (const b of partes) { saida.set(b, pos); pos += b.length; }
  return saida;
}
