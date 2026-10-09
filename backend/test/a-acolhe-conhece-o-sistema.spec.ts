/**
 * A ACOLHE+AI CONHECE O SISTEMA DE HOJE (fase 193; pedido de 08/10).
 *
 * O pedido foi uma regra: *"tudo que criamos a mais, atualizar também a nossa
 * IA interna, para ela estar sempre atualizada"*. Regra escrita que o teste
 * não cobra é conselho (fase 167), e por isso ela mora aqui, negando por
 * padrão (fase 153):
 *
 *  1. toda rota GET do servidor está no catálogo do guia, é arquivo (folha,
 *     foto, anexo) ou está em `FORA_DO_CATALOGO` com o motivo escrito. Rota
 *     nova reprova até alguém dizer à assistente o que ela é;
 *  2. toda tela do sistema (as abas do turno, as portas e o sino) está no guia
 *     pela chave, com a frase do que faz. Tela nova reprova do mesmo jeito;
 *  3. toda ferramenta está no guia e é executada pela tela;
 *  4. o guia não usa o travessão que ele próprio proíbe;
 *  5. botão marcado `data-acolhe-abre` só muda estado da tela: é o único que a
 *     assistente aperta, e o nome do botão não diz se ele grava;
 *  6. a conta que ela mostra à pessoa é exata.
 *
 * Estático, como o `contrato-rotas.spec.ts`: precisa reprovar no `npm test`
 * de quem acrescentou a rota, e não numa conversa com a assistente meses
 * depois.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FORA_DO_CATALOGO, GUIA_DA_ACOLHE } from '../src/modules/assistente/guia';
import { FERRAMENTAS, LEITURA_PROIBIDA, MEXEM_NA_TELA, rotaDeLeituraPermitida } from '../src/modules/assistente/ferramentas';
import { calcular } from '../src/modules/assistente/calculo';

const SRC = join(__dirname, '..', 'src');
const FRONT = join(__dirname, '..', '..', 'frontend', 'src');

function arquivos(dir: string, filtro: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...arquivos(p, filtro));
    else if (filtro(e)) out.push(p);
  }
  return out;
}

/** As rotas GET do servidor, com `:x` no lugar de todo parâmetro. */
function leiturasDoServidor(): string[] {
  const out = new Set<string>();
  for (const arq of arquivos(SRC, (f) => f.endsWith('.controller.ts'))) {
    const src = readFileSync(arq, 'utf8');
    const blocos = [...src.matchAll(/@Controller\(\s*'([^']*)'/g)].map((m) => ({ pos: m.index ?? 0, base: m[1] }));
    blocos.forEach((b, i) => {
      const trecho = src.slice(b.pos, i + 1 < blocos.length ? blocos[i + 1].pos : src.length);
      for (const m of trecho.matchAll(/@Get\(\s*(?:'([^']*)')?\s*\)/g)) {
        out.add(('/' + [b.base, m[1] ?? ''].filter(Boolean).join('/')).replace(/:\w+/g, ':x'));
      }
    });
  }
  return [...out].sort();
}

const catalogo = GUIA_DA_ACOLHE.split('\n').filter((l) => /^- \/[a-z]/.test(l))
  .map((l) => l.slice(2).split(/\s/)[0].split('?')[0].replace(/\bID\b/g, ':x'));

describe('a Acolhe+AI conhece o sistema de hoje', () => {
  it('toda rota de leitura do servidor está no catálogo, é arquivo, ou está fora com o motivo escrito', () => {
    const rotas = leiturasDoServidor();
    expect(rotas.length).toBeGreaterThan(150);
    const semLugar = rotas.filter((r) => !catalogo.includes(r) && !LEITURA_PROIBIDA.test(r) && !(r in FORA_DO_CATALOGO));
    // Rota nova? Escreva no catálogo do `guia.ts` (com a consulta e a frase), ou
    // em FORA_DO_CATALOGO com o motivo. É assim que a assistente acompanha a fase.
    expect(semLugar).toEqual([]);
  });

  it('a lista do que fica fora não guarda rota que não existe, nem rota que está no catálogo', () => {
    const rotas = leiturasDoServidor();
    const velhas = Object.keys(FORA_DO_CATALOGO).filter((r) => !rotas.includes(r) || catalogo.includes(r));
    expect(velhas).toEqual([]);
    for (const motivo of Object.values(FORA_DO_CATALOGO)) expect(motivo.length).toBeGreaterThan(10);
  });

  it('toda rota do catálogo passa pela conferência que a tela faz antes de ler', () => {
    expect(catalogo.filter((r) => !rotaDeLeituraPermitida(r.replace(/:x/g, 'x')))).toEqual([]);
  });

  it('toda tela do sistema está no guia pela chave', () => {
    const portas = [...readFileSync(join(FRONT, 'portas.ts'), 'utf8').matchAll(/aba: '([a-z_]+)'/g)].map((m) => m[1]);
    const app = readFileSync(join(FRONT, 'App.tsx'), 'utf8');
    const trecho = app.slice(app.indexOf('const abasDoTurno = ['), app.indexOf('].filter((t) => ve(t.aba))'));
    const doTurno = [...trecho.matchAll(/aba: '([a-z_]+)'/g)].map((m) => m[1]);
    expect(portas.length).toBeGreaterThan(20);
    expect(doTurno.length).toBeGreaterThanOrEqual(5);
    const telas = [...new Set([...doTurno, ...portas, 'avisos'])];
    const secao = GUIA_DA_ACOLHE.slice(GUIA_DA_ACOLHE.indexOf('# As telas do sistema'), GUIA_DA_ACOLHE.indexOf('# As rotas que você pode ler'));
    expect(telas.filter((t) => !new RegExp(`^- [^\\n]*\\(${t}\\): \\S`, 'm').test(secao))).toEqual([]);
    // E o guia não descreve tela que não existe mais.
    const noGuia = [...secao.matchAll(/^- [^(\n]*\(([a-z_]+)\):/gm)].map((m) => m[1]);
    expect(noGuia.filter((t) => !telas.includes(t))).toEqual([]);
  });

  it('toda ferramenta está explicada no guia e é executada pela tela', () => {
    const tela = readFileSync(join(FRONT, 'acolhe.tsx'), 'utf8');
    for (const f of FERRAMENTAS) {
      expect([f.name, GUIA_DA_ACOLHE.includes(f.name)]).toEqual([f.name, true]);
      const executada = tela.includes(`'${f.name}'`) || (f.name.startsWith('propor_') && tela.includes("nome.startsWith('propor_')"));
      expect([f.name, executada]).toEqual([f.name, true]);
    }
    const nomes = FERRAMENTAS.map((f) => f.name as string);
    expect(MEXEM_NA_TELA.filter((n) => !nomes.includes(n))).toEqual([]);
  });

  it('o guia escreve como pede: sem travessão', () => {
    expect(GUIA_DA_ACOLHE).not.toMatch(/[—–]/);
  });

  it('botão que a assistente pode apertar só abre: o clique dele não grava', () => {
    const achados: string[] = [];
    let total = 0;
    // O `acolhe.tsx` e o `acolhe-tela.ts` LEEM a marca; quem a põe são as telas.
    for (const arq of arquivos(FRONT, (f) => f.endsWith('.tsx') && f !== 'acolhe.tsx')) {
      const src = readFileSync(arq, 'utf8');
      for (const m of src.matchAll(/<button data-acolhe-abre=""[^>]*?onClick=\{\(\) => (\{[^}]*\}|[^}]*?)\}\s*>/g)) {
        total++;
        const corpo = m[1].trim().replace(/^\{\s*|\s*\}$/g, '');
        const soEstado = corpo.split(';').map((x) => x.trim()).filter(Boolean)
          .every((x) => /^set[A-Z]\w*\([^()]*\)$/.test(x));
        if (!soEstado) achados.push(`${arq.slice(FRONT.length + 1)}: ${corpo}`);
      }
      const marcados = (src.match(/data-acolhe-abre/g) ?? []).length;
      const conferidos = [...src.matchAll(/<button data-acolhe-abre=""[^>]*?onClick=\{\(\) => (?:\{[^}]*\}|[^}]*?)\}\s*>/g)].length;
      if (marcados !== conferidos) achados.push(`${arq.slice(FRONT.length + 1)}: ${marcados - conferidos} marcação fora do formato conferido`);
    }
    expect(total).toBeGreaterThan(15);
    expect(achados).toEqual([]);
  });
});

describe('a conta da Acolhe+AI', () => {
  const v = (c: string) => {
    const r = calcular(c);
    if (!r.ok) throw new Error(r.erro);
    return r.valor;
  };
  it('faz as quatro operações na ordem certa, com parênteses e potência', () => {
    expect(v('2 + 3 * 4')).toBe(14);
    expect(v('(2 + 3) * 4')).toBe(20);
    expect(v('2 ^ 3 ^ 2')).toBe(512);
    expect(v('-3 + 10 / 4')).toBe(-0.5);
    expect(v('17 % 5')).toBe(2);
  });
  it('soma uma nota fiscal sem o erro do ponto flutuante na tela', () => {
    expect(v('arred(soma(12.9, 7.35, 30, 4.1))')).toBe(54.35);
    expect(v('arred(0.1 + 0.2)')).toBe(0.3);
  });
  it('conhece média, mínimo, máximo, porcentagem e raiz', () => {
    expect(v('media(10, 20, 30)')).toBe(20);
    expect(v('média(1, 2)')).toBe(1.5);
    expect(v('min(4, 2, 9)')).toBe(2);
    expect(v('max(4, 2, 9)')).toBe(9);
    expect(v('pct(18, 20)')).toBe(90);
    expect(v('raiz(81)')).toBe(9);
    expect(v('arred(2 / 3, 0)')).toBe(1);
  });
  it('recusa o que não é conta, em português, e nunca executa código', () => {
    for (const c of ['', '1 / 0', 'alert(1)', 'process.exit()', '2 +', '(1 + 2', '1 + 2)', 'soma(1, 2', 'pct(1)', '3 ; 4', 'raiz(-1)']) {
      const r = calcular(c);
      expect([c, r.ok]).toEqual([c, false]);
      if (!r.ok) expect(r.erro).toMatch(/[a-zà-ú]/i);
    }
    expect(calcular('x'.repeat(5000))).toEqual({ ok: false, erro: 'A conta é longa demais: divida em partes.' });
  });
});
