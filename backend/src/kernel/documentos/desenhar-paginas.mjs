#!/usr/bin/env node
/**
 * AS PÁGINAS DE UM PDF, COMO IMAGEM (fase 165).
 *
 * Pedido de 25/09: *"quando existir PDF médico anexado, converter visualmente
 * suas páginas para anexos dentro do DOCX, preservando também o arquivo
 * original"*. Decisão de 27/09: a conversão é do SERVIDOR, e não do celular —
 * vale para o PDF que já estava anexado, e o aparelho da casa não faz esforço.
 *
 * Roda num PROCESSO SEPARADO, chamado por `paginas-do-pdf.ts` (nome diferente de propósito: com o mesmo nome, o Jest importava o `.mjs` no lugar do `.ts`), por três razões:
 *
 *  * o pdf.js é módulo ES, e o servidor (e a suíte) são CommonJS;
 *  * um PDF malformado que derrube o desenho derruba ESTE processo, e não o
 *    servidor que está atendendo o plantão;
 *  * quem chama põe tempo máximo, e o processo morre inteiro se passar dele.
 *
 * Entrada: os bytes do PDF no stdin. Argumentos: máximo de páginas e escala.
 * Saída: uma linha de JSON no stdout — `{ total, paginas: [base64 PNG, …] }`.
 * O PDF original não é tocado: quem guarda o arquivo é o `ArquivosService`.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const exigir = createRequire(import.meta.url);
/*
 * A TELA VEM DA MESMA BIBLIOTECA QUE O PDF.JS USA (fase 194).
 *
 * O pdf.js traz a sua própria cópia do `@napi-rs/canvas` (a 0.1.x), e o
 * servidor usa outra (a 1.x). Quando a página tem uma FOTO dentro (todo PDF
 * escaneado: a alta do hospital, a receita fotografada), o pdf.js desenha a
 * foto numa tela da cópia dele e a cola na nossa; telas de duas cópias nativas
 * diferentes corrompem a memória, e o processo morria sem dizer nada. O
 * relatório da internação saía com "não pôde ser reproduzido" justamente nos
 * documentos do hospital. Achado ao digitalizar o primeiro documento pela
 * câmera do sistema; `o-documento-digitalizado.spec.ts` cobra.
 */
const daMesmaDoPdfjs = createRequire(exigir.resolve('pdfjs-dist/package.json'));
const { createCanvas, Path2D, DOMMatrix, ImageData } = daMesmaDoPdfjs('@napi-rs/canvas');

globalThis.Path2D ??= Path2D;
globalThis.DOMMatrix ??= DOMMatrix;
globalThis.ImageData ??= ImageData;

const FONTES = join(dirname(exigir.resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/';

const maximo = Math.max(1, Math.min(50, Number(process.argv[2] ?? 20)));
const escala = Math.max(0.5, Math.min(3, Number(process.argv[3] ?? 1.5)));

const partes = [];
for await (const p of process.stdin) partes.push(p);
const bytes = new Uint8Array(Buffer.concat(partes));

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({
  data: bytes,
  standardFontDataUrl: FONTES,
  disableFontFace: true,
  useSystemFonts: false,
  /* Nada de código dentro do PDF: o arquivo veio de fora da instituição. */
  isEvalSupported: false,
  enableXfa: false,
}).promise;

const paginas = [];
for (let n = 1; n <= Math.min(doc.numPages, maximo); n++) {
  const pagina = await doc.getPage(n);
  const vista = pagina.getViewport({ scale: escala });
  const tela = createCanvas(Math.ceil(vista.width), Math.ceil(vista.height));
  const ctx = tela.getContext('2d');
  /* Fundo branco: o PDF sem fundo sairia transparente, e no Word isso vira
     texto preto sobre o cinza da página. */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tela.width, tela.height);
  await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
  paginas.push(tela.toBuffer('image/png').toString('base64'));
  pagina.cleanup();
}
process.stdout.write(JSON.stringify({ total: doc.numPages, paginas }) + '\n');
await doc.destroy();
