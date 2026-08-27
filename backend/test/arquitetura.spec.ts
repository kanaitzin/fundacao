/**
 * FRONTEIRAS ENTRE PARTIÇÕES — regra executável.
 *
 * O objetivo é concreto: acrescentar, alterar ou REMOVER um módulo não pode
 * quebrar os outros. Isso só se sustenta se for verificado por máquina; em
 * documento, vira promessa que a próxima pressa desmente.
 *
 * Regras verificadas:
 *  1. um módulo importa apenas do `kernel` ou da PORTA PÚBLICA (index.ts) de
 *     outro módulo — nunca de um arquivo interno alheio;
 *  2. só importa módulos declarados em `depends` no seu `module.json`;
 *  3. o `kernel` não importa NENHUM módulo (senão a base dependeria do topo);
 *  4. não há ciclo entre módulos;
 *  5. todo módulo tem porta pública e manifesto;
 *  6. cada módulo é auto-contido: suas migrações moram dentro dele.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';

const SRC = join(__dirname, '..', 'src');
const MODULES_DIR = join(SRC, 'modules');

interface Manifest { name: string; depends: string[]; descricao: string; }

const modules = readdirSync(MODULES_DIR).filter((m) =>
  statSync(join(MODULES_DIR, m)).isDirectory());

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (entry.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Extrai os caminhos relativos importados por um arquivo. */
function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const re = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

/** Se o import aponta para dentro de outro módulo, devolve {módulo, interno}. */
function classify(file: string, spec: string): { module: string; internal: boolean } | null {
  const abs = resolve(dirname(file), spec);
  const rel = relative(MODULES_DIR, abs);
  if (rel.startsWith('..')) return null;                 // fora de modules/ (kernel etc.)
  const [mod, ...rest] = rel.split(/[\\/]/);
  // "modules/x" ou "modules/x/index" = porta pública; qualquer outra coisa é interno
  const internal = rest.length > 0 && rest.join('/') !== 'index';
  return { module: mod, internal };
}

describe('Fronteiras entre partições', () => {
  const manifests = new Map<string, Manifest>();

  beforeAll(() => {
    for (const mod of modules) {
      const path = join(MODULES_DIR, mod, 'module.json');
      if (existsSync(path)) manifests.set(mod, JSON.parse(readFileSync(path, 'utf8')));
    }
  });

  it('todo módulo tem porta pública (index.ts) e manifesto (module.json)', () => {
    const faltando = modules.filter((m) =>
      !existsSync(join(MODULES_DIR, m, 'index.ts')) || !existsSync(join(MODULES_DIR, m, 'module.json')));
    expect(faltando).toEqual([]);
  });

  it('nenhum módulo alcança arquivo interno de outro módulo', () => {
    const violacoes: string[] = [];
    for (const mod of modules) {
      for (const file of tsFiles(join(MODULES_DIR, mod))) {
        for (const spec of importsOf(file)) {
          const c = classify(file, spec);
          if (c && c.module !== mod && c.internal) {
            violacoes.push(`${relative(SRC, file)} → ${spec} (use a porta pública de "${c.module}")`);
          }
        }
      }
    }
    expect(violacoes).toEqual([]);
  });

  it('cada módulo só importa o que declarou em depends', () => {
    const violacoes: string[] = [];
    for (const mod of modules) {
      const declarados = new Set(manifests.get(mod)?.depends ?? []);
      for (const file of tsFiles(join(MODULES_DIR, mod))) {
        for (const spec of importsOf(file)) {
          const c = classify(file, spec);
          if (c && c.module !== mod && !declarados.has(c.module)) {
            violacoes.push(`"${mod}" importa "${c.module}" sem declarar em depends (${relative(SRC, file)})`);
          }
        }
      }
    }
    expect([...new Set(violacoes)]).toEqual([]);
  });

  it('o kernel não depende de nenhum módulo', () => {
    const violacoes: string[] = [];
    for (const file of tsFiles(join(SRC, 'kernel'))) {
      for (const spec of importsOf(file)) {
        if (classify(file, spec)) violacoes.push(`${relative(SRC, file)} → ${spec}`);
      }
    }
    expect(violacoes).toEqual([]);
  });

  it('não há ciclo de dependência entre módulos', () => {
    const grafo = new Map<string, string[]>();
    for (const mod of modules) grafo.set(mod, manifests.get(mod)?.depends ?? []);

    const ciclos: string[] = [];
    const visitando = new Set<string>(), pronto = new Set<string>();
    const dfs = (n: string, caminho: string[]) => {
      if (visitando.has(n)) { ciclos.push([...caminho, n].join(' → ')); return; }
      if (pronto.has(n)) return;
      visitando.add(n);
      for (const d of grafo.get(n) ?? []) dfs(d, [...caminho, n]);
      visitando.delete(n); pronto.add(n);
    };
    for (const mod of modules) dfs(mod, []);
    expect(ciclos).toEqual([]);
  });

  it('cada módulo é auto-contido: migrações moram dentro dele', () => {
    // Nenhuma migração solta fora das partições — remover a pasta do módulo
    // remove também o seu esquema.
    expect(existsSync(join(__dirname, '..', 'db', 'migrations'))).toBe(false);
    const comTabelas = [...manifests.values()].filter((m) => (m as any).tabelas?.length);
    for (const m of comTabelas) {
      expect(existsSync(join(MODULES_DIR, m.name, 'migrations'))).toBe(true);
    }
  });

  /**
   * JOIN com tabela protegida por RLS não filtra coluna — ele ELIMINA A LINHA,
   * em silêncio. Uma auditoria encontrou oito lugares com esse defeito, todos
   * com o mesmo efeito: o registro deixado numa casa desaparecia no dia em que
   * a criança era transferida.
   *
   * Não dá para proibir o JOIN — em muitos casos ele é seguro, porque as duas
   * tabelas compartilham a mesma política. O que dá para exigir é que alguém
   * TENHA PENSADO: cada JOIN com tabela protegida precisa de um comentário
   * `rls-join-ok:` dizendo por que o par sempre existe.
   *
   * Sem isso, use uma função SECURITY DEFINER de rótulo mínimo
   * (app_person_display_name, app_house_label, app_user_display_name).
   */
  it('todo JOIN com tabela protegida por RLS está justificado', () => {
    const PROTEGIDAS = ['person', 'house', 'app_user', 'incident', 'ata', 'prescription', 'statement'];
    const re = new RegExp(`\\bJOIN\\s+(${PROTEGIDAS.join('|')})\\b`, 'i');
    const violacoes: string[] = [];

    for (const file of [...tsFiles(MODULES_DIR), ...tsFiles(join(SRC, 'kernel'))]) {
      const linhas = readFileSync(file, 'utf8').split('\n');
      linhas.forEach((linha, i) => {
        // Comentários que apenas MENCIONAM um JOIN não contam.
        const semComentario = linha.replace(/--.*$/, '').replace(/\/\/.*$/, '');
        if (!re.test(semComentario)) return;
        const contexto = linhas.slice(Math.max(0, i - 4), i).join('\n');
        if (!contexto.includes('rls-join-ok')) {
          violacoes.push(`${relative(SRC, file)}:${i + 1} — ${semComentario.trim()}`);
        }
      });
    }
    expect(violacoes).toEqual([]);
  });

  it('a linha do tempo não conhece nenhum módulo de domínio', () => {
    // O ponto de encontro do sistema é justamente onde acoplamento seria fatal:
    // a timeline só fala com o registro de provedores, no kernel.
    const dir = join(MODULES_DIR, 'timeline');
    if (!existsSync(dir)) return;
    const violacoes: string[] = [];
    for (const file of tsFiles(dir)) {
      for (const spec of importsOf(file)) {
        const c = classify(file, spec);
        if (c && c.module !== 'timeline' && c.module !== 'identity') {
          violacoes.push(`timeline importa "${c.module}" — deveria usar o TimelineRegistry`);
        }
      }
    }
    expect(violacoes).toEqual([]);
  });
});
