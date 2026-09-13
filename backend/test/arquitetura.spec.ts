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

interface Manifest {
  name: string; depends: string[]; descricao: string;
  tabelas?: string[];
  /** Partições cujas TABELAS este módulo lê no SQL das migrações (fase 96). */
  dependeDoEsquemaDe?: string[];
}

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

  /*
   * A FRONTEIRA QUE NINGUÉM CONFERIA: O SQL (fase 96).
   *
   * As conferências acima leem `import` de TypeScript. As MIGRAÇÕES escapavam:
   * dez partições liam tabelas de outras sem declarar nada — `shifts` lendo a
   * prescrição e a dose, `nursing` lendo a restrição alimentar, `identity`
   * lendo `house_stay`. O §4.3 prometia que remover um módulo era apagar uma
   * linha de `import`, e não era: apagar `medications` quebraria migrações de
   * `shifts` e de `nursing`, e só se descobriria ao aplicar num banco virgem.
   * Achado na fase 89, conferido a partir da 96.
   *
   * É um campo PRÓPRIO, `dependeDoEsquemaDe`, e não `depends`, porque são
   * coisas diferentes e uma delas tem CICLO: `identity` lê `house_stay` de
   * `people`, e `people` lê tabela de `identity`; o mesmo entre `identity` e
   * `archive`. Em código, ciclo é defeito e o teste acima o proíbe. No banco,
   * que é um só, a chave estrangeira aponta nos dois sentidos e isso é normal —
   * jogar tudo em `depends` criaria 34 ciclos e derrubaria a conferência que
   * funciona.
   *
   * Esta cobra as duas direções: uso não declarado reprova, e declaração que
   * deixou de ser usada também — senão a lista envelhece e vira enfeite.
   */
  it('toda tabela de outra partição usada no SQL está declarada', () => {
    const donoDaTabela = new Map<string, string>();
    for (const mod of modules) {
      for (const t of manifests.get(mod)?.tabelas ?? []) donoDaTabela.set(t, mod);
    }
    expect(donoDaTabela.size).toBeGreaterThan(50);

    const violacoes: string[] = [];
    for (const mod of modules) {
      const dir = join(MODULES_DIR, mod, 'migrations');
      if (!existsSync(dir)) continue;
      const m = manifests.get(mod);
      const declarado = new Set([...(m?.depends ?? []), ...(m?.dependeDoEsquemaDe ?? [])]);
      const usado = new Map<string, string>();
      for (const arq of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
        const sql = readFileSync(join(dir, arq), 'utf8');
        for (const [tabela, dono] of donoDaTabela) {
          if (dono === mod) continue;
          const re = new RegExp(`\\b(FROM|JOIN|UPDATE|INTO|REFERENCES)\\s+${tabela}\\b`, 'i');
          if (re.test(sql)) usado.set(dono, `${tabela} em ${arq}`);
        }
      }
      for (const [dono, onde] of usado) {
        if (!declarado.has(dono)) {
          violacoes.push(`"${mod}" lê tabela de "${dono}" no SQL sem declarar (${onde})`);
        }
      }
      for (const dono of m?.dependeDoEsquemaDe ?? []) {
        if (!usado.has(dono)) {
          violacoes.push(`"${mod}" declara dependeDoEsquemaDe "${dono}" e não usa nenhuma tabela dele — retire`);
        }
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

/**
 * ESTADO CONFERIDO NUMA LEITURA, E GRAVADO SÓ PELO ID (regra 11).
 *
 * A fase 89 achou o retorno familiar sobrescrevendo outro retorno, e a
 * varredura que veio atrás achou mais quatro funções com o mesmo desenho —
 * recusa e cancelamento de transferência, fechamento da ATA Geral, mudança de
 * combinado. As cinco foram provadas reprovando com duas conexões
 * (`setup/corrida-no-banco.ts`) e consertadas nas fases 89 e 90.
 *
 * O desenho é sempre o mesmo: `IF x.status <> 'esperado' THEN RAISE`, e mais
 * abaixo `UPDATE … SET status = … WHERE id = …`, sem o estado no WHERE e sem
 * `FOR UPDATE` na leitura. Quem chega durante o ato do outro passa pela
 * leitura, espera a trava e grava POR CIMA — e as duas pessoas recebem
 * sucesso. Nada quebra; é por isso que esta conferência existe.
 *
 * Lê a definição VIGENTE de cada função (a da última migração que a define).
 * É heurística, e diz o que não pega: o mesmo desenho escrito no TypeScript
 * dos serviços, e função que muda estado sem conferir `status` antes.
 */
describe('Estado e concorrência nas funções do banco', () => {
  function definicoesVigentes(): Map<string, { arquivo: string; corpo: string }> {
    const arquivos: string[] = [];
    for (const m of modules) {
      const dir = join(MODULES_DIR, m, 'migrations');
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) if (f.endsWith('.sql')) arquivos.push(join(dir, f));
    }
    arquivos.sort((a, b) => relative(dirname(a), a).localeCompare(relative(dirname(b), b)));
    const defs = new Map<string, { arquivo: string; corpo: string }>();
    for (const arq of arquivos) {
      const sql = readFileSync(arq, 'utf8');
      for (const m of sql.matchAll(/CREATE OR REPLACE FUNCTION\s+(\w+)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$/g)) {
        defs.set(m[1], { arquivo: relative(MODULES_DIR, arq), corpo: m[3] });
      }
    }
    return defs;
  }

  it('nenhuma função confere o estado numa leitura e grava só pelo id', () => {
    const defs = definicoesVigentes();
    /* Um conferidor que não leu nada passaria dizendo "sim". */
    expect(defs.size).toBeGreaterThan(100);

    const violacoes: string[] = [];
    for (const [nome, { arquivo, corpo }] of defs) {
      if (!/IF\s+\w+\.status\s*(<>|=|!=|NOT IN|IN)/.test(corpo)) continue;
      if (/FOR UPDATE/.test(corpo)) continue;
      for (const u of corpo.matchAll(/UPDATE\s+(\w+)\s+SET([\s\S]*?);/g)) {
        const where = /WHERE([\s\S]*)$/.exec(u[2])?.[1] ?? '';
        if (/\bstatus\s*=/.test(u[2]) && !/status/.test(where)) {
          violacoes.push(`${nome} (${arquivo}): UPDATE ${u[1]} muda o estado sem conferi-lo no WHERE`);
        }
      }
    }
    expect(violacoes).toEqual([]);
  });


  /*
   * O MESMO DESENHO NO TYPESCRIPT DOS SERVIÇOS (fase 91).
   *
   * A triagem da Enfermagem lia o estado numa consulta e gravava com
   * `UPDATE health_evolution SET status = … WHERE id = $1`: assinar e devolver
   * ao mesmo tempo passavam as duas, e a evolução assinada voltava a
   * "complemento solicitado". A conferência acima só lia SQL de migração.
   *
   * Aqui: todo `UPDATE … SET status = …` escrito num serviço confere o estado
   * no WHERE — ou está na lista abaixo, com o motivo por extenso, como as
   * rotas sem porta. Serviço não usa `FOR UPDATE` para isso: sob RLS a leitura
   * travada aplica a policy de UPDATE e a linha some (regra 11).
   */
  const EDICAO_NAO_E_TRANSICAO: Record<string, string> = {
    'modules/people/benefits.service.ts':
      'edição do cadastro de benefício pela coordenação: `status` é a situação do benefício '
      + '(campo do formulário), não um estado que se decide uma vez. Duas edições ao mesmo '
      + 'tempo deixam valer a última, como em todo formulário, e o antes fica na auditoria',
  };

  /*
   * E AS COLUNAS DE FECHAMENTO, não só `status` (fase 96).
   *
   * A conferência abaixo olha `status`. Nem todo estado se chama assim: há
   * `signed_at`, `decided_at`, `revoked_at`, `answered_at`. Na fase 91 isso foi
   * lido UMA VEZ, à mão, e a §9 anotou que não tinha virado conferência.
   *
   * As ocorrências de hoje estão abaixo com o motivo, e nenhuma é defeito: são
   * idempotentes — reescrever "lida" e "ciente" com os mesmos valores não muda
   * nada — ou edição de formulário, em que vale a última. A de `user_session`
   * saiu na fase 101, quando a revogação virou função no banco: exceção que
   * deixa de ser usada reprova.
   */
  const FECHAMENTO_SEM_GUARDA: Record<string, string> = {
    'modules/notifications/notifications.service.ts::notification':
      'marcar aviso como lido e como ciente é idempotente, e é do próprio dono '
      + '(`WHERE user_id`): duas abas do mesmo aparelho gravam o mesmo',
    'modules/people/contatos.service.ts::person_contact':
      'autorizar visita é edição de cadastro, não transição única: duas pessoas mexendo ao '
      + 'mesmo tempo deixam valer a última, como em todo formulário, e o antes fica na '
      + 'auditoria. A conferência que importa ali é outra, e está no banco '
      + '(`contato_restrito_nao_visita`)',
  };

  /*
   * "HOJE" EM UTC É O DIA ERRADO DEPOIS DAS 21H (fase 99).
   *
   * O defeito mais caro deste projeto é o do fuso: às 22h de Porto Alegre o
   * UTC já é o dia seguinte, e o sistema é usado justamente à noite. O kernel
   * tem `hojeNaInstituicao()` para isso desde a fase 4 — e mesmo assim dois
   * serviços calculavam o dia com `new Date().toISOString().slice(0, 10)`,
   * que é UTC:
   *
   *   * o estatuto marcava como "ainda não vale" uma regra que passou a valer
   *     hoje, durante três horas toda noite;
   *   * a folha de restrições da cozinha saía datada de amanhã — impressa às
   *     22h, chega à cozinha dizendo um dia que não chegou.
   *
   * A fase 98 achou o mesmo erro DENTRO de um teste, e foi a rodada das 23h
   * que reprovou. Uma rodada só acha o que ela toca; esta conferência lê o
   * código todo, a qualquer hora.
   */
  it('nenhum serviço calcula o dia de hoje em UTC', () => {
    const arquivos = [...tsFiles(join(SRC, 'modules')), ...tsFiles(join(SRC, 'kernel'))];
    const violacoes: string[] = [];
    for (const arq of arquivos) {
      const rel = relative(SRC, arq);
      /* O kernel do tempo é quem define o fuso — é lá que a conversão mora. */
      if (rel === 'kernel/common/tempo.ts') continue;
      const src = readFileSync(arq, 'utf8');
      src.split('\n').forEach((linha, i) => {
        if (/new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/.test(linha)
            || /new Date\(\)\.getUTCFullYear\(\)/.test(linha)) {
          violacoes.push(`${rel}:${i + 1}: o dia de hoje sai em UTC — use hojeNaInstituicao()`);
        }
      });
    }
    expect(violacoes).toEqual([]);
  });

  it('nenhum serviço grava coluna de fechamento sem guarda, salvo exceção declarada', () => {
    const COLS = /(signed_at|closed_at|decided_at|decided_by|approved_at|confirmed_at|returned_at|revoked_at|ended_at|resolved_at|answered_at|status_at|visit_authorized_at|acknowledged_at|read_at|received_at)/;
    const arquivos = [...tsFiles(join(SRC, 'modules')), ...tsFiles(join(SRC, 'kernel'))];
    const violacoes: string[] = [];
    const usadas = new Set<string>();
    let vistos = 0;

    for (const arq of arquivos) {
      const src = readFileSync(arq, 'utf8');
      const rel = relative(SRC, arq);
      for (const m of src.matchAll(/`\s*UPDATE\s+(\w+)\s+SET([\s\S]*?)`/g)) {
        const resto = m[2];
        const w = /\bWHERE\b([\s\S]*)$/.exec(resto);
        const set = w ? resto.slice(0, w.index) : resto;
        const where = w ? w[1] : '';
        if (!new RegExp(COLS.source + '\\s*=').test(set)) continue;
        vistos++;
        if (/status/.test(where) || /IS NULL|IS NOT NULL/.test(where) || COLS.test(where)) continue;
        const chave = `${rel}::${m[1]}`;
        if (FECHAMENTO_SEM_GUARDA[chave]) { usadas.add(chave); continue; }
        const linha = src.slice(0, m.index ?? 0).split('\n').length;
        violacoes.push(`${rel}:${linha}: UPDATE ${m[1]} fecha sem conferir o estado no WHERE`);
      }
    }
    expect(vistos).toBeGreaterThan(10);
    for (const chave of Object.keys(FECHAMENTO_SEM_GUARDA)) {
      if (!usadas.has(chave)) violacoes.push(`${chave}: exceção declarada e não usada — retire da lista`);
    }
    expect(violacoes).toEqual([]);
  });

  it('nenhum serviço muda o estado gravando só pelo id', () => {
    const arquivos = [...tsFiles(join(SRC, 'modules')), ...tsFiles(join(SRC, 'kernel'))];
    let updates = 0;
    const violacoes: string[] = [];
    const excecoesUsadas = new Set<string>();
    for (const arq of arquivos) {
      const src = readFileSync(arq, 'utf8');
      const rel = relative(SRC, arq);
      for (const m of src.matchAll(/`\s*UPDATE\s+(\w+)\s+SET([\s\S]*?)`/g)) {
        updates++;
        const resto = m[2];
        const w = /\bWHERE\b([\s\S]*)$/.exec(resto);
        const set = w ? resto.slice(0, w.index) : resto;
        if (!/\bstatus\s*=/.test(set)) continue;
        if (w && /status/.test(w[1])) continue;
        if (EDICAO_NAO_E_TRANSICAO[rel]) { excecoesUsadas.add(rel); continue; }
        const linha = src.slice(0, m.index ?? 0).split('\n').length;
        violacoes.push(`${rel}:${linha}: UPDATE ${m[1]} muda o estado sem conferi-lo no WHERE`);
      }
    }
    /* Um conferidor que não achou UPDATE nenhum não leu os serviços. */
    expect(updates).toBeGreaterThan(30);
    /* Exceção que não é mais usada reprova: lista escrita à mão vira promessa. */
    for (const rel of Object.keys(EDICAO_NAO_E_TRANSICAO)) {
      if (!excecoesUsadas.has(rel)) violacoes.push(`${rel}: exceção declarada e não usada — retire da lista`);
    }
    expect(violacoes).toEqual([]);
  });
});
