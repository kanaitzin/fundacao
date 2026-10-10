/**
 * TODO ANEXO PASSA PELA CÂMERA DO SISTEMA (fase 194; pedido de 10/10).
 *
 * O pedido foi a câmera em todo lugar que recebe documento: a internação, o
 * remédio, o parecer da Enfermagem, o relatório da técnica. A regra existia
 * escrita no CLAUDE.md desde a fase 165 (*"todo lugar novo que recebe foto ou
 * documento usa o EscolherAnexo"*), e nove telas ainda tinham o seletor de
 * arquivo solto, sem câmera, sem documento em PDF e sem a mesma prévia. Regra
 * escrita que o teste não cobra é conselho (fase 167).
 *
 * Estático: lê as telas. O `<input type="file">` e o `capture` só existem no
 * `anexos.tsx`, que é quem os esconde atrás de botões com nome.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FRONT = join(__dirname, '..', '..', 'frontend', 'src');
const LUGAR_DO_ANEXO = new Set(['anexos.tsx']);

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(e) ? [p] : [];
  });
}

describe('todo anexo passa pela câmera do sistema', () => {
  it('nenhuma tela tem seletor de arquivo solto: todas usam o EscolherAnexo', () => {
    const soltos = arquivos(FRONT)
      .filter((f) => !LUGAR_DO_ANEXO.has(f.split('/').pop()!))
      .filter((f) => /type=["']file["']|capture=["']/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(FRONT.length + 1));
    expect(soltos).toEqual([]);
  });

  it('o EscolherAnexo oferece a câmera do sistema e o documento em PDF', () => {
    const anexos = readFileSync(join(FRONT, 'anexos.tsx'), 'utf8');
    expect(anexos).toMatch(/<FolhaCamera/);
    expect(anexos).toMatch(/Abrir a câmera/);
    expect(anexos).toMatch(/Digitalizar documento/);
    const camera = readFileSync(join(FRONT, 'camera.tsx'), 'utf8');
    expect(camera).toMatch(/pdfDeJpegs/);
    // O X e o certo de cada foto, pelo nome que o leitor de tela diz.
    expect(camera).toMatch(/Refazer a foto/);
    expect(camera).toMatch(/Usar esta foto/);
  });

  it('toda tela que recebe documento usa o EscolherAnexo', () => {
    const usam = arquivos(join(FRONT, 'screens'))
      .filter((f) => /<EscolherAnexo\b/.test(readFileSync(f, 'utf8')))
      .map((f) => f.split('/').pop());
    for (const tela of ['Acolhidos.tsx', 'Dossie.tsx', 'Internacao.tsx', 'Ocorrencias.tsx', 'Portaria.tsx',
      'Saude.tsx', 'TrabalhoSocial.tsx']) {
      expect([tela, usam.includes(tela)]).toEqual([tela, true]);
    }
  });
});
