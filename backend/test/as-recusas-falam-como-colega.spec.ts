/**
 * AS RECUSAS FALAM COMO COLEGA (fase 214).
 *
 * A fase 212 reescreveu as frases que as telas mostram, medidas abrindo cada
 * tela. As recusas do servidor ficaram de fora: elas só aparecem quando algo é
 * recusado, e nenhuma tela aberta as mostra. Eram 157 no servidor e 91 no
 * protótipo com travessão ou com frase que argumenta com a pessoa ("do
 * contrário, bastaria uma conta nova para enxergar as oito casas").
 *
 * Esta suíte lê o texto de toda `new XException(...)` do servidor e de toda
 * `new Recusa(...)` do protótipo, e reprova as marcas. O recado diz o que
 * fazer e quem faz; o porquê da regra mora no documento, não na recusa.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '..', '..');
const MARCAS = /—|o sistema não decide|de prop[óo]sito|justamente|do contrário|é pior do que|seria suposição|ninguém alcança|por construção|é por isso que/i;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules') return [];
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

/** O texto de cada recado: os literais dentro dos parênteses do construtor. */
function recados(p: string): { linha: number; texto: string }[] {
  const s = readFileSync(p, 'utf8');
  const out: { linha: number; texto: string }[] = [];
  for (const m of s.matchAll(/new (\w+Exception|Recusa|ErroApi)\(/g)) {
    let i = (m.index ?? 0) + m[0].length;
    let prof = 1;
    const ini = i;
    while (i < s.length && prof) {
      if (s[i] === '(') prof++;
      else if (s[i] === ')') prof--;
      i++;
    }
    const corpo = s.slice(ini, i - 1);
    const texto = [...corpo.matchAll(/'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)]
      .map((x) => x[1] ?? x[2]).join('');
    out.push({ linha: s.slice(0, m.index).split('\n').length, texto });
  }
  return out;
}

describe('As recusas falam como colega', () => {
  const fontes = [
    ...arquivos(join(RAIZ, 'backend', 'src')),
    join(RAIZ, 'frontend', 'src', 'mock-casa.ts'),
  ];

  it('há recados para ler (a busca não ficou vazia por engano)', () => {
    const total = fontes.reduce((n, p) => n + recados(p).length, 0);
    expect(total).toBeGreaterThan(300);
  });

  /* O FILTRO DE ERROS (fase 219): as frases dele não nascem de `new X(...)`, e
     por isso esta suíte não as lia. Duas tinham travessão. */
  it('as frases do filtro de erros também', () => {
    const fonte = readFileSync(join(RAIZ, 'backend', 'src', 'kernel', 'common', 'falhas-em-portugues.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const frases = [...fonte.matchAll(/'((?:[^'\\]|\\.){12,})'/g)].map((m) => m[1]);
    expect(frases.length).toBeGreaterThan(8);
    expect(frases.filter((f) => MARCAS.test(f))).toEqual([]);
  });

  it('nenhuma recusa traz travessão nem frase que argumenta com a pessoa', () => {
    const achados = fontes.flatMap((p) => recados(p)
      .filter((r) => MARCAS.test(r.texto))
      .map((r) => `${relative(RAIZ, p)}:${r.linha}: ${r.texto.slice(0, 140)}`));
    expect(achados).toEqual([]);
  });
});
