/**
 * A CONTA DA ACOLHE+AI (fase 193). Não importa nada: a tela executa, a suíte
 * confere.
 *
 * O modelo erra conta de cabeça como gente cansada erra: soma de nota fiscal,
 * saldo do armário, média de refeições. Por isso a conta que vai para a pessoa
 * sai daqui, exata, e a Acolhe+AI mostra a conta junto com o resultado.
 *
 * NÃO É `eval`. É um leitor de expressão escrito à mão, que só conhece número,
 * as quatro operações, potência, resto, parênteses e as funções da lista. Texto
 * que não for conta é recusado com a frase do que não entendeu.
 */
export type ResultadoDaConta = { ok: true; valor: number } | { ok: false; erro: string };

const FUNCOES: Record<string, (args: number[]) => number> = {
  soma: (a) => a.reduce((s, x) => s + x, 0),
  media: (a) => {
    if (!a.length) throw new Error('A média precisa de pelo menos um número.');
    return a.reduce((s, x) => s + x, 0) / a.length;
  },
  min: (a) => {
    if (!a.length) throw new Error('O mínimo precisa de pelo menos um número.');
    return Math.min(...a);
  },
  max: (a) => {
    if (!a.length) throw new Error('O máximo precisa de pelo menos um número.');
    return Math.max(...a);
  },
  abs: (a) => Math.abs(um(a, 'abs')),
  raiz: (a) => {
    const x = um(a, 'raiz');
    if (x < 0) throw new Error('Não há raiz de número negativo.');
    return Math.sqrt(x);
  },
  /** arred(x) arredonda em duas casas; arred(x, 0) em inteiro. */
  arred: (a) => {
    if (a.length < 1 || a.length > 2) throw new Error('arred leva o número e, se quiser, as casas.');
    const casas = a.length === 2 ? a[1] : 2;
    if (!Number.isInteger(casas) || casas < 0 || casas > 10) throw new Error('As casas do arred vão de 0 a 10.');
    const f = 10 ** casas;
    return Math.round((a[0] + Number.EPSILON) * f) / f;
  },
  /** pct(parte, total): quanto a parte é do total, em por cento. */
  pct: (a) => {
    if (a.length !== 2) throw new Error('pct leva a parte e o total.');
    if (a[1] === 0) throw new Error('Não dá para dividir por zero.');
    return (a[0] / a[1]) * 100;
  },
};
FUNCOES.média = FUNCOES.media;
FUNCOES.mín = FUNCOES.min;
FUNCOES.máx = FUNCOES.max;

function um(a: number[], nome: string): number {
  if (a.length !== 1) throw new Error(`${nome} leva um número só.`);
  return a[0];
}

type Ficha = { t: 'num'; v: number } | { t: 'nome'; v: string } | { t: 'op'; v: string };

function fichas(texto: string): Ficha[] {
  const out: Ficha[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?/.exec(texto.slice(i));
      if (!m) throw new Error(`Não entendi o número perto de "${texto.slice(i, i + 8)}".`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-ZÀ-ÿ_]/.test(c)) {
      const m = /^[a-zA-ZÀ-ÿ_]+/.exec(texto.slice(i))!;
      out.push({ t: 'nome', v: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if ('+-*/^%(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`Não entendi o sinal "${c}".`);
  }
  return out;
}

export function calcular(conta: string): ResultadoDaConta {
  if (typeof conta !== 'string' || !conta.trim()) return { ok: false, erro: 'A conta veio vazia.' };
  if (conta.length > 4000) return { ok: false, erro: 'A conta é longa demais: divida em partes.' };
  try {
    const f = fichas(conta);
    if (f.length > 2000) throw new Error('A conta é longa demais: divida em partes.');
    let p = 0;
    const olhar = () => f[p];
    const ehOp = (v: string) => olhar()?.t === 'op' && olhar()!.v === v;
    const esperar = (v: string) => {
      if (!ehOp(v)) throw new Error(`Faltou "${v}" na conta.`);
      p++;
    };

    const expr = (): number => {
      let v = termo();
      while (ehOp('+') || ehOp('-')) {
        const op = f[p++].v;
        const d = termo();
        v = op === '+' ? v + d : v - d;
      }
      return v;
    };
    const termo = (): number => {
      let v = potencia();
      while (ehOp('*') || ehOp('/') || ehOp('%')) {
        const op = f[p++].v;
        const d = potencia();
        if ((op === '/' || op === '%') && d === 0) throw new Error('Não dá para dividir por zero.');
        v = op === '*' ? v * d : op === '/' ? v / d : v % d;
      }
      return v;
    };
    const potencia = (): number => {
      const base = unario();
      if (ehOp('^')) { p++; return base ** potencia(); }
      return base;
    };
    const unario = (): number => {
      if (ehOp('-')) { p++; return -unario(); }
      if (ehOp('+')) { p++; return unario(); }
      return primario();
    };
    const primario = (): number => {
      const x = olhar();
      if (!x) throw new Error('A conta terminou no meio.');
      if (x.t === 'num') { p++; return x.v; }
      if (x.t === 'nome') {
        const fn = FUNCOES[x.v];
        if (!fn) throw new Error(`Não conheço "${x.v}". Use soma, media, min, max, arred, pct, abs ou raiz.`);
        p++;
        esperar('(');
        const args: number[] = [];
        if (!ehOp(')')) {
          args.push(expr());
          while (ehOp(',')) { p++; args.push(expr()); }
        }
        esperar(')');
        return fn(args);
      }
      if (ehOp('(')) { p++; const v = expr(); esperar(')'); return v; }
      throw new Error(`Não esperava "${x.v}" aqui.`);
    };

    const v = expr();
    if (p < f.length) throw new Error(`Sobrou "${f[p].v}" no fim da conta.`);
    if (!Number.isFinite(v)) throw new Error('O resultado não é um número que se escreva.');
    return { ok: true, valor: v };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Não entendi a conta.' };
  }
}

/** O número como a equipe escreve: vírgula decimal, ponto no milhar, até seis casas. */
export function numeroEmPortugues(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
}
