/**
 * TODO AVISO TEM DESTINO (varredura de 27/10).
 *
 * Procurando os caminhos que não terminam em lugar nenhum, o sino mostrou dois:
 * metade dos avisos dizia o nome cru da tabela (*Continua em: medication_dose.*,
 * no aviso da dose vencida), porque a lista que traduz o tipo do aviso para a
 * tela tinha ficado para trás; e nenhum aviso levava à tela, só dizia onde
 * procurar.
 *
 * Esta conferência lê do CÓDIGO do servidor todo objeto de aviso (o que tem o
 * tipo do registro, o título e o corpo ou a prioridade) e cobra que o tipo esteja
 * no `ONDE` do sino (`frontend/src/screens/Avisos.tsx`), com uma aba que existe.
 * Aviso novo sem destino reprova.
 */
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'migrations') arquivos(p, saida); }
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) saida.push(p);
  }
  return saida;
}

/** Os tipos de registro que viram aviso, lidos dos objetos de aviso do servidor. */
function tiposDeAviso(): Set<string> {
  const tipos = new Set<string>();
  for (const f of arquivos(join(RAIZ, 'backend', 'src'))) {
    const src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
    const visita = (no: ts.Node) => {
      if (ts.isObjectLiteralExpression(no)) {
        const nomes = no.properties.map((p) => p.name?.getText());
        const ehAviso = nomes.includes('title') && (nomes.includes('body') || nomes.includes('priority'));
        /* O aviso do fim do plantão leva o tipo num objeto espalhado dentro dele
           (`...(turno ? { entity: 'shift', ... } : {})`): sobe até o espalhamento e
           confere que o objeto de fora é um aviso. */
        let p: ts.Node | undefined = no.parent;
        while (p && !ts.isSpreadAssignment(p) && !ts.isObjectLiteralExpression(p)) p = p.parent;
        const fora = p && ts.isSpreadAssignment(p) ? p.parent : undefined;
        const espalhado = nomes.includes('entity') && !!fora && ts.isObjectLiteralExpression(fora)
          && fora.properties.some((x) => x.name?.getText() === 'title');
        if (ehAviso || espalhado) {
          for (const p of no.properties) {
            if (ts.isPropertyAssignment(p) && p.name.getText() === 'entity' && ts.isStringLiteral(p.initializer)) {
              tipos.add(p.initializer.text);
            }
          }
        }
      }
      ts.forEachChild(no, visita);
    };
    visita(src);
  }
  return tipos;
}

/** O `ONDE` do sino, lido do arquivo da tela. */
function destinosDoSino(): Map<string, string> {
  const fonte = readFileSync(join(RAIZ, 'frontend', 'src', 'screens', 'Avisos.tsx'), 'utf8');
  const bloco = /export const ONDE[^=]*=\s*\{([\s\S]*?)\n\};/.exec(fonte)?.[1] ?? '';
  const mapa = new Map<string, string>();
  for (const m of bloco.matchAll(/^\s*([a-z_]+):\s*\{\s*tela:\s*'[^']+',\s*aba:\s*'([a-z_]+)'/gm)) mapa.set(m[1], m[2]);
  return mapa;
}

/** As abas que existem: as do turno e as portas do Mais. */
function abasQueExistem(): Set<string> {
  const portas = readFileSync(join(RAIZ, 'frontend', 'src', 'portas.ts'), 'utf8');
  const app = readFileSync(join(RAIZ, 'frontend', 'src', 'App.tsx'), 'utf8');
  return new Set([...portas.matchAll(/aba: '([a-z_]+)'/g), ...app.matchAll(/aba: '([a-z_]+)'/g)].map((m) => m[1]));
}

/** Os avisos do protótipo: a lista semeada e os que o servidor de mentira acrescenta. */
function tiposDoPrototipo(): Set<string> {
  const mock = readFileSync(join(RAIZ, 'frontend', 'src', 'mock-casa.ts'), 'utf8');
  const semeados = /const AVISOS = \[([\s\S]*?)\n\];/.exec(mock)?.[1] ?? '';
  const novos = [...mock.matchAll(/AVISOS\.(unshift|push)\(([\s\S]{0,600}?)\)\s*;/g)].map((m) => m[2]).join('\n');
  return new Set([...`${semeados}\n${novos}`.matchAll(/entidade: '([a-z_]+)'/g)].map((m) => m[1]));
}

describe('Todo aviso tem destino', () => {
  it('os avisos do protótipo também têm destino no sino', () => {
    const destinos = destinosDoSino();
    const tipos = tiposDoPrototipo();
    expect(tipos.size).toBeGreaterThan(5);
    expect([...tipos].filter((t) => !destinos.has(t))).toEqual([]);
  });

  it('a leitura acha os avisos do servidor (a medida mede alguma coisa)', () => {
    const tipos = tiposDeAviso();
    for (const t of ['medication_dose', 'sync_conflict', 'transfer_request', 'shift_fim_aviso', 'shift']) {
      expect(tipos).toContain(t);
    }
  });

  it('todo tipo de aviso tem a tela e a aba no sino, e a aba existe', () => {
    const destinos = destinosDoSino();
    const abas = abasQueExistem();
    const semDestino = [...tiposDeAviso()].filter((t) => !destinos.has(t));
    expect(semDestino).toEqual([]);
    const abaQueNaoExiste = [...destinos.entries()].filter(([, aba]) => !abas.has(aba)).map(([t, aba]) => `${t} → ${aba}`);
    expect(abaQueNaoExiste).toEqual([]);
  });
});
