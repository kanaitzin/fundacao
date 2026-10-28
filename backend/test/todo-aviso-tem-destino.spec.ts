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
import { join, relative } from 'path';
import { ALCANCE_POR_CARGO } from '../src/modules/identity/alcance';

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

/**
 * Os cargos de cada nível de aviso, lidos das migrações das notificações (0290 e
 * as seguintes). A Coordenação Geral não tem cargo próprio: é a coordenação com a
 * marca das oito casas (1634).
 */
function cargosDosNiveis(): Map<string, string[]> {
  const dir = join(RAIZ, 'backend', 'src', 'modules', 'notifications', 'migrations');
  const mapa = new Map<string, string[]>();
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8');
    for (const m of sql.matchAll(/\('([a-z_]+)',\s*ARRAY\[([^\]]*)\]/g)) {
      mapa.set(m[1], [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
    }
  }
  if (mapa.has('coordenacao_geral')) mapa.set('coordenacao_geral', ['coordenador']);
  return mapa;
}

/**
 * Os níveis de um aviso: o texto fixo, as duas pontas de um `? :`, ou a lista do
 * laço que o envolve (`for (const level of ['equipe', 'lider_noturno'])`, ou de
 * uma constante do arquivo, com os `push` dela). O que não se lê volta vazio, e
 * reprova: nível que a conferência não sabe ler é nível que ninguém conferiu.
 */
function niveisDe(no: ts.ObjectLiteralExpression, src: ts.SourceFile): string[] {
  const lv = no.properties.find((p) => p.name?.getText() === 'level');
  if (!lv) return [];
  const textos = (n: ts.Node): string[] => {
    if (ts.isStringLiteral(n)) return [n.text];
    if (ts.isConditionalExpression(n)) return [...textos(n.whenTrue), ...textos(n.whenFalse)];
    if (ts.isAsExpression(n)) return textos(n.expression);
    if (ts.isArrayLiteralExpression(n)) return n.elements.flatMap(textos);
    return [];
  };
  if (ts.isPropertyAssignment(lv) && !ts.isIdentifier(lv.initializer)) return textos(lv.initializer);
  const nome = ts.isPropertyAssignment(lv) ? lv.initializer.getText() : lv.name!.getText();
  for (let p: ts.Node | undefined = no.parent; p; p = p.parent) {
    if (ts.isForOfStatement(p) && p.initializer.getText().endsWith(nome)) {
      if (ts.isArrayLiteralExpression(p.expression)) return textos(p.expression);
      const lista = p.expression.getText();
      const achados: string[] = [];
      const visita = (n: ts.Node) => {
        if (ts.isVariableDeclaration(n) && n.name.getText() === lista && n.initializer) achados.push(...textos(n.initializer));
        if (ts.isCallExpression(n) && n.expression.getText() === `${lista}.push`) achados.push(...n.arguments.flatMap(textos));
        ts.forEachChild(n, visita);
      };
      visita(src);
      return achados;
    }
  }
  return [];
}

describe('Todo aviso tem destino', () => {
  it('quem recebe o aviso alcança a tela para onde ele leva', () => {
    /* O combinado da reunião era avisado de propósito ao Líder Noturno Geral, que
       também responde a pauta (fase 94), e a tela dos Combinados não estava no
       mapa dele: o aviso levava a uma porta que ele não abria (fase 251). */
    const destinos = destinosDoSino();
    const niveis = cargosDosNiveis();
    const alcance = new Map(ALCANCE_POR_CARGO.map((a) => [a.cargo, new Set(a.areas.map((x) => x.area))]));
    const problemas: string[] = [];
    let conferidos = 0;
    for (const f of arquivos(join(RAIZ, 'backend', 'src'))) {
      const src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
      const visita = (no: ts.Node) => {
        if (ts.isObjectLiteralExpression(no)) {
          const en = no.properties.find((p) => p.name?.getText() === 'entity');
          const temNivel = no.properties.some((p) => p.name?.getText() === 'level');
          if (temNivel && en && ts.isPropertyAssignment(en) && ts.isStringLiteral(en.initializer)) {
            const onde = `${relative(RAIZ, f)}:${src.getLineAndCharacterOfPosition(no.getStart()).line + 1}`;
            const aba = destinos.get(en.initializer.text);
            const lidos = niveisDe(no, src);
            if (!lidos.length) problemas.push(`${onde} o nível do aviso não se lê`);
            for (const nivel of lidos) {
              const cargos = niveis.get(nivel);
              if (!cargos) { problemas.push(`${onde} nível ${nivel} não existe`); continue; }
              conferidos += 1;
              for (const c of cargos) {
                if (aba && !alcance.get(c)?.has(aba)) {
                  problemas.push(`${onde} ${en.initializer.text} leva a ${aba}, e ${c} (nível ${nivel}) não alcança`);
                }
              }
            }
          }
        }
        ts.forEachChild(no, visita);
      };
      visita(src);
    }
    expect(conferidos).toBeGreaterThan(20);
    expect(problemas).toEqual([]);
  });

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
