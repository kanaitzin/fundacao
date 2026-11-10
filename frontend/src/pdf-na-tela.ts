/**
 * O PDF DESENHADO NA TELA, EM QUALQUER APARELHO (fase 304).
 *
 * Até aqui o PDF abria num quadro do navegador. No computador funciona; no
 * celular não: o Chrome do Android deixa o quadro em branco e o Safari do iPhone
 * mostra só a primeira página, parada. A equipe técnica tocava em Abrir no
 * atendimento e não via o papel.
 *
 * Aqui o próprio sistema desenha as páginas, com o pdf.js, e devolve cada uma
 * como imagem. Nada sai do aparelho. O arquivo é importado sob demanda
 * (`import('./pdf-na-tela')`), como a leitura do papel: só desce quando alguém
 * abre um PDF.
 *
 * O trabalhador do pdf.js roda na própria página: com o protótipo aberto por dois
 * cliques (`file://`), um trabalhador de módulo vindo de blob nasce e morre calado,
 * e o PDF ficava em "Abrindo" para sempre. Carregado aqui, ele define o
 * `globalThis.pdfjsWorker`, e o pdf.js o usa sem abrir trabalhador nenhum. Um
 * ofício de duas páginas desenha num instante; o limite de páginas segura o resto.
 */
import * as pdfjs from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.min.mjs';

/** Páginas demais param aqui: o resto se baixa. Um ofício tem duas; um prontuário inteiro, cem. */
export const MAXIMO_DE_PAGINAS_NA_TELA = 40;
/** A largura da página desenhada, em pixels: lê bem no celular e no monitor sem pesar. */
const LARGURA = 1200;

export type PaginasDoPdf = { paginas: string[]; total: number };

const bytesDe = (dataUrl: string): Uint8Array => {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/**
 * Desenha as páginas de um PDF (em data URL) e devolve cada uma como imagem JPEG,
 * até o máximo. `total` diz quantas o PDF tem, para a tela avisar o que ficou de fora.
 */
export async function paginasDoPdfNaTela(dataUrl: string, aoAndar?: (feitas: number, total: number) => void): Promise<PaginasDoPdf> {
  const doc = await pdfjs.getDocument({ data: bytesDe(dataUrl), isEvalSupported: false, disableFontFace: false }).promise;
  try {
    const total = doc.numPages;
    const paginas: string[] = [];
    for (let n = 1; n <= Math.min(total, MAXIMO_DE_PAGINAS_NA_TELA); n++) {
      const pagina = await doc.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const vista = pagina.getViewport({ scale: LARGURA / base.width });
      const tela = document.createElement('canvas');
      tela.width = Math.ceil(vista.width);
      tela.height = Math.ceil(vista.height);
      const ctx = tela.getContext('2d');
      if (!ctx) throw new Error('Este aparelho não desenhou o PDF.');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, tela.width, tela.height);
      await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
      paginas.push(tela.toDataURL('image/jpeg', 0.85));
      pagina.cleanup();
      aoAndar?.(paginas.length, total);
    }
    return { paginas, total };
  } finally {
    void doc.destroy();
  }
}
