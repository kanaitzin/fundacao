/**
 * A LEITURA DO TEXTO DO PAPEL, NO PRÓPRIO APARELHO (fase 234).
 *
 * O ofício, a receita e a guia viram foto ou PDF, e o texto deles serve para
 * achar o documento depois, para levar a um campo sem redigitar e para a
 * Acolhe+AI receber só o texto conferido. A leitura roda aqui, no navegador,
 * com o Tesseract e o português que vêm junto com o sistema: a imagem não sai
 * do aparelho, e o `fetch` do trabalhador recusa qualquer endereço que não seja
 * o do português embutido.
 *
 * A leitura erra letra e número. Quem usa este texto mostra a imagem ao lado e
 * deixa a pessoa corrigir antes de qualquer uso; nada aqui guarda nada.
 *
 * Este arquivo é importado sob demanda (`import('./ocr')`): no sistema
 * instalado os três arquivos só descem quando alguém toca em Ler o texto, e no
 * protótipo vêm embutidos, como tudo.
 */
import { createWorker } from 'tesseract.js';
/* O trabalhador e o núcleo entram como texto (o núcleo já traz o wasm dentro):
   como endereço, o protótipo os embutiria em base64 por cima do base64. */
import codigoDoTrabalhador from 'tesseract.js/dist/worker.min.js?raw';
import codigoDoNucleo from 'tesseract.js-core/tesseract-core-lstm.wasm.js?raw';
import urlDoPortugues from '@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz?url';

/** Endereço inventado: só o trabalhador o conhece, e ele é atendido pelo português embutido. */
const ENDERECO_DO_PORTUGUES = 'http://leitura-no-aparelho.invalid';

let pronto: Promise<string> | null = null;

const comoDataUrl = async (url: string) => {
  if (url.startsWith('data:')) return url;
  const b = await (await fetch(url)).blob();
  return new Promise<string>((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(new Error('Não foi possível preparar a leitura do texto.'));
    r.readAsDataURL(b);
  });
};

/**
 * O trabalhador numa peça só: o núcleo, o trabalhador do Tesseract e o português
 * (como endereço `data:`) no mesmo arquivo. Com o protótipo aberto por dois
 * cliques (`file://`), o trabalhador não carrega uma segunda peça de blob, e o
 * Tesseract não carrega o núcleo quando ele já está ali.
 */
function trabalhador() {
  pronto ??= (async () => {
    const portugues = await comoDataUrl(urlDoPortugues);
    const peca = [
      `const PORTUGUES = ${JSON.stringify(portugues)};`,
      'const buscar = self.fetch.bind(self);',
      `self.fetch = (u, o) => String(u).startsWith(${JSON.stringify(ENDERECO_DO_PORTUGUES)})`,
      '  ? buscar(PORTUGUES, o)',
      "  : Promise.reject(new Error('A leitura do texto não sai do aparelho.'));",
      codigoDoNucleo,
      ';self.TesseractCore = self.TesseractCore || (typeof TesseractCore !== "undefined" ? TesseractCore : undefined);',
      codigoDoTrabalhador,
    ].join('\n');
    return URL.createObjectURL(new Blob([peca], { type: 'text/javascript' }));
  })();
  return pronto;
}

export type Andamento = { pagina: number; total: number; fracao: number };

/**
 * Lê o texto de cada página (imagem em data URL ou blob URL) e devolve o texto
 * de todas, separadas por uma linha com o número da página quando há mais de uma.
 */
export async function lerOTexto(paginas: string[], aoAndar?: (a: Andamento) => void): Promise<string> {
  const workerPath = await trabalhador();
  let atual = 0;
  const w = await createWorker('por', 1, {
    workerPath, corePath: 'embutido.js', langPath: ENDERECO_DO_PORTUGUES,
    workerBlobURL: false, cacheMethod: 'none', gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') aoAndar?.({ pagina: atual + 1, total: paginas.length, fracao: m.progress });
    },
  });
  try {
    const partes: string[] = [];
    for (atual = 0; atual < paginas.length; atual++) {
      aoAndar?.({ pagina: atual + 1, total: paginas.length, fracao: 0 });
      const { data } = await w.recognize(paginas[atual]);
      const texto = arrumar(data.text);
      partes.push(paginas.length > 1 ? `Página ${atual + 1}\n${texto}` : texto);
    }
    return partes.join('\n\n').trim();
  } finally {
    await w.terminate();
  }
}

/** Tira as linhas vazias repetidas e os espaços sobrando que a leitura deixa. */
export function arrumar(texto: string): string {
  return texto
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
