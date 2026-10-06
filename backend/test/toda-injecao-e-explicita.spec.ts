/**
 * TODA INJEÇÃO É EXPLÍCITA (fase 190).
 *
 * O NestJS descobre o que injetar pelo TIPO do parâmetro do construtor, lido
 * do metadado que o compilador do TypeScript grava. O `tsc` e o `ts-jest`
 * gravam; o `tsx`, que roda o `npm run dev`, a simulação da casa e os scripts,
 * NÃO grava. Sem o `@Inject(...)`, o parâmetro chega vazio só ali.
 *
 * Foi assim da fase 179 à 190: o `AppModule` recebia o `HttpAdapterHost` sem
 * `@Inject`, a suíte e o servidor compilado subiam, e o servidor pelo `tsx`
 * caía na partida. A simulação de trinta dias é que viu. Este teste lê o
 * código: todo parâmetro de construtor com `private`, `public` ou `readonly`
 * nas classes do servidor tem o `@Inject` na frente.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', 'src');

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return arquivos(p);
    return p.endsWith('.ts') && !p.endsWith('.d.ts') ? [p] : [];
  });
}

describe('toda injeção é explícita', () => {
  it('nenhum parâmetro de construtor depende do metadado de tipo', () => {
    const sem: string[] = [];
    for (const arq of arquivos(SRC)) {
      const texto = readFileSync(arq, 'utf8');
      for (const m of texto.matchAll(/constructor\s*\(([\s\S]*?)\)\s*\{/g)) {
        const params = m[1].split(/,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean);
        for (const p of params) {
          if (/^(private|public|protected|readonly)\b/.test(p) && !p.startsWith('@')) {
            sem.push(`${relative(SRC, arq)}: ${p.replace(/\s+/g, ' ')}`);
          }
        }
      }
    }
    expect(sem).toEqual([]);
  });
});
