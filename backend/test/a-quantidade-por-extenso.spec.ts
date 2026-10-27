/**
 * A QUANTIDADE ESCRITA POR EXTENSO (fase 248).
 *
 * Fazendo o papel de cada setor num plantão, a tela dizia "1 passagem(ns)
 * assinada(s)", "2 crítico(s)" e "1 vaga(s)", e as folhas que vão ao juiz e à rede
 * diziam "3 acolhimento(s)". Eram mais de cem frases assim, nas telas, nos avisos
 * do servidor, nas folhas e no protótipo. Hoje o número leva a palavra certa pelo
 * `quantos` (kernel/common/quantos.ts).
 *
 * Esta conferência lê do CÓDIGO todo texto que a pessoa lê (literal, partes fixas
 * de template e texto de JSX) e reprova o plural com parênteses. O comentário e o
 * log de quem cuida do servidor não contam.
 */
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { quantos } from '../src/kernel/common/quantos';

const RAIZ = join(__dirname, '..', '..');
const PASTAS = [join(RAIZ, 'backend', 'src'), join(RAIZ, 'frontend', 'src')];
const PLURAL_COM_PARENTESES = /[a-zà-úç]\((s|ns|es|ões|is|m|aram|vam)\)/i;

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules' && n !== 'migrations') arquivos(p, saida); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.spec\./.test(n)) saida.push(p);
  }
  return saida;
}

/** O log de quem cuida do servidor fala com a TI, não com quem usa. */
function ehLog(no: ts.Node): boolean {
  for (let p: ts.Node | undefined = no.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && /(^console\.|\.log\.|\blog\.)(log|warn|error|info|debug)$|^console\./
      .test(p.expression.getText())) return true;
  }
  return false;
}

describe('A quantidade por extenso', () => {
  it('o número leva o singular ou o plural, sem parênteses', () => {
    expect(quantos(1, 'passagem assinada', 'passagens assinadas')).toBe('1 passagem assinada');
    expect(quantos(0, 'passagem assinada', 'passagens assinadas')).toBe('0 passagens assinadas');
    expect(quantos(3, 'vaga', 'vagas')).toBe('3 vagas');
  });

  it('nenhum texto da tela, do servidor, das folhas ou do protótipo escreve o plural com parênteses', () => {
    const achados: string[] = [];
    for (const pasta of PASTAS) {
      for (const f of arquivos(pasta)) {
        const cod = readFileSync(f, 'utf8');
        if (!PLURAL_COM_PARENTESES.test(cod)) continue;
        const src = ts.createSourceFile(f, cod, ts.ScriptTarget.Latest, true,
          f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        const visita = (no: ts.Node) => {
          let textos: string[] = [];
          if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) textos = [no.text];
          else if (ts.isTemplateExpression(no)) textos = [no.head.text, ...no.templateSpans.map((s) => s.literal.text)];
          else if (ts.isJsxText(no)) textos = [no.getText()];
          for (const t of textos) {
            if (PLURAL_COM_PARENTESES.test(t) && !ehLog(no)) {
              const linha = src.getLineAndCharacterOfPosition(no.getStart()).line + 1;
              achados.push(`${relative(RAIZ, f)}:${linha} ${t.trim().slice(0, 80)}`);
            }
          }
          ts.forEachChild(no, visita);
        };
        visita(src);
      }
    }
    expect(achados).toEqual([]);
  });
});
