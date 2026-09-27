import { execFile } from 'node:child_process';
import { join } from 'node:path';

/**
 * Chama `desenhar-paginas.mjs` num processo à parte (fase 165) e devolve as
 * páginas como PNG. Nunca lança: PDF ilegível, protegido por senha ou que
 * passa do tempo volta como `{ total: 0, paginas: [], falhou: true }`, e quem
 * monta o documento escreve que aquele anexo não pôde ser reproduzido. Um
 * exame que não desenha não pode impedir o relatório da internação de sair.
 */
export interface PaginasDoPdf {
  total: number;
  paginas: Buffer[];
  falhou?: boolean;
}

export const PAGINAS_POR_PDF = 20;
const TEMPO_MAXIMO_MS = 30_000;

export function paginasDoPdf(pdf: Buffer, maximo = PAGINAS_POR_PDF): Promise<PaginasDoPdf> {
  return new Promise((resolve) => {
    const filho = execFile(
      process.execPath,
      [join(__dirname, 'desenhar-paginas.mjs'), String(maximo), '1.5'],
      { timeout: TEMPO_MAXIMO_MS, maxBuffer: 200 * 1024 * 1024, encoding: 'utf8' },
      (erro, saida) => {
        if (erro) { resolve({ total: 0, paginas: [], falhou: true }); return; }
        try {
          const r = JSON.parse(String(saida).trim().split('\n').pop() ?? '{}');
          resolve({
            total: Number(r.total) || 0,
            paginas: (r.paginas ?? []).map((b: string) => Buffer.from(b, 'base64')),
          });
        } catch {
          resolve({ total: 0, paginas: [], falhou: true });
        }
      });
    filho.stdin?.on('error', () => undefined);
    filho.stdin?.end(pdf);
  });
}
