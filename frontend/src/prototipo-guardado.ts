/**
 * O PROTÓTIPO GUARDA O QUE A PESSOA REGISTRA (fase 312, pedido de 11/11: "comece a salvar
 * alguma alteração, porque a cor da tela já fica quando eu atualizo a página").
 *
 * O servidor de mentira guarda tudo em memória, uma cópia por casa (`mock-casa.ts`), e
 * recarregar a página apagava o que a pessoa tinha feito. Aqui fica o diário: cada pedido
 * que grava (e cada leitura que cria dado de semente na primeira abertura de uma tela) é
 * anotado NESTE navegador, com a hora; quando a página abre, o diário é repetido, na ordem
 * e na hora de cada um, antes de a tela pedir qualquer coisa.
 *
 * Para a repetição dar o mesmo resultado, os identificadores que o servidor de mentira
 * inventa saem daqui: dentro de um pedido, do número do pedido no diário; fora dele (a
 * semente da casa), de um sorteio fixo pela casa. Assim o registro feito ontem acha amanhã
 * a criança e a ocorrência que ele aponta.
 *
 * Nada sai do navegador: o diário fica no IndexedDB do próprio aparelho, e Recomeçar a
 * demonstração (Minha conta) o apaga. Nos ensaios automáticos (`navigator.webdriver`) o
 * diário fica desligado, para cada ensaio abrir a demonstração limpa; o ensaio que quer
 * medir a guarda liga com `localStorage['rede-acolher.guardar-no-ensaio'] = '1'`.
 */

export interface Anotacao {
  /** A ordem de chegada no diário (o IndexedDB numera). */
  chave?: number;
  /** A abertura da página que anotou: com duas abas abertas, os números não se misturam. */
  sessao: string;
  seq: number;
  casa: string;
  caminho: string;
  corpo: string;
  metodo: string;
  quando: number;
  escrita: boolean;
}

const BANCO = 'rede-acolher-prototipo';
const LOJA = 'diario';

/* ---------- os identificadores ---------- */

let contexto: { sessao: string; seq: number; n: number } | null = null;

/* A marca desta abertura da página: cada aba conta os pedidos dela. */
const SESSAO = (() => {
  try { return crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 5); }
  catch { return DataRealAgora().toString(36).slice(-5); }
})();
function DataRealAgora() { return Date.now(); }

/** Um sorteio fixo (mulberry32), para a semente de cada casa sair igual a cada abertura. */
export function sorteioFixo(semente: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < semente.length; i++) h = Math.imul(h ^ semente.charCodeAt(i), 3432918353), h = (h << 13) | (h >>> 19);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** O identificador novo: dentro de um pedido, pelo número dele; fora, pela semente da casa. */
export function idDoPrototipo(daSemente: () => number): string {
  if (contexto) return `g${contexto.sessao}${contexto.seq.toString(36)}x${(contexto.n++).toString(36)}`;
  return daSemente().toString(36).slice(2, 10).padEnd(8, '0');
}

/** Um número de 0 a 1 que se repete igual: para a senha inicial sorteada no protótipo. */
export function sorteioDoPrototipo(daSemente: () => number): number {
  if (!contexto) return daSemente();
  return sorteioFixo(`${contexto.sessao}:${contexto.seq}:${contexto.n++}`)();
}

/** Roda sem o número do pedido: a criação de uma casa usa só a semente dela. */
export function semPedido<T>(f: () => T): T {
  const antes = contexto;
  contexto = null;
  try { return f(); } finally { contexto = antes; }
}

/* ---------- a hora de cada registro ---------- */

const DataReal = Date;
function naHora<T>(t: number, f: () => T): T {
  class DataDoRegistro extends DataReal {
    constructor(...a: unknown[]) {
      if (a.length === 0) super(t);
      else super(...(a as [string]));
    }
    static now() { return t; }
  }
  (globalThis as { Date: DateConstructor }).Date = DataDoRegistro as unknown as DateConstructor;
  try { return f(); } finally { (globalThis as { Date: DateConstructor }).Date = DataReal; }
}

/* ---------- o diário ---------- */

const ligado = (() => {
  try {
    if (typeof indexedDB === 'undefined') return false;
    const ensaio = typeof navigator !== 'undefined' && (navigator as { webdriver?: boolean }).webdriver;
    if (!ensaio) return true;
    return localStorage.getItem('rede-acolher.guardar-no-ensaio') === '1';
  } catch { return false; }
})();

let proximo = 1;
let fila: Promise<unknown> = Promise.resolve();

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 2);
    r.onupgradeneeded = () => {
      if (r.result.objectStoreNames.contains(LOJA)) r.result.deleteObjectStore(LOJA);
      r.result.createObjectStore(LOJA, { keyPath: 'chave', autoIncrement: true });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

async function lerTudo(): Promise<Anotacao[]> {
  const db = await abrir();
  try {
    return await new Promise((ok, falha) => {
      const r = db.transaction(LOJA, 'readonly').objectStore(LOJA).getAll();
      r.onsuccess = () => ok((r.result as Anotacao[]).sort((a, b) => (a.chave ?? 0) - (b.chave ?? 0)));
      r.onerror = () => falha(r.error);
    });
  } finally { db.close(); }
}

function gravar(a: Anotacao) {
  fila = fila.then(async () => {
    const db = await abrir();
    try {
      await new Promise<void>((ok, falha) => {
        const t = db.transaction(LOJA, 'readwrite');
        t.objectStore(LOJA).put(a);
        t.oncomplete = () => ok();
        t.onerror = () => falha(t.error);
      });
    } finally { db.close(); }
  }).catch(() => { /* aparelho cheio ou guarda bloqueada: a demonstração segue, só não guarda */ });
}

/**
 * Executa um pedido com o número dele no diário, e o anota se ele gravou ou criou dado.
 * `executar` é o mesmo caminho do pedido de sempre, sem a pausa da rede.
 */
export function comODiario<T>(casa: string, caminho: string, corpo: string, metodo: string,
                              executar: () => T): T {
  const seq = proximo;
  contexto = { sessao: SESSAO, seq, n: 0 };
  let n = 0;
  try {
    return executar();
  } finally {
    n = contexto?.n ?? 0;
    contexto = null;
    const escrita = metodo !== 'GET';
    if (ligado && (escrita || n > 0) && !caminho.startsWith('/prototipo/sem-sinal')) {
      proximo = seq + 1;
      gravar({ sessao: SESSAO, seq, casa, caminho, corpo, metodo, quando: Date.now(), escrita });
    } else if (escrita || n > 0) {
      proximo = seq + 1;
    }
  }
}

/** Repete o diário guardado, na ordem e na hora de cada registro. Chamado uma vez, ao abrir. */
export async function repetirODiario(
  criarCasa: (id: string) => void,
  executar: (a: Anotacao) => void,
): Promise<number> {
  if (!ligado) return 0;
  let anotacoes: Anotacao[];
  try { anotacoes = await lerTudo(); } catch { return 0; }
  for (const a of anotacoes) {
    criarCasa(a.casa);
    contexto = { sessao: a.sessao ?? '', seq: a.seq, n: 0 };
    try {
      if (a.escrita) naHora(a.quando, () => executar(a));
      else executar(a);
    } catch { /* o que foi recusado na hora é recusado de novo, e segue */ }
    contexto = null;
  }
  return anotacoes.length;
}

/** Recomeçar a demonstração: apaga o diário deste aparelho. */
export async function apagarODiario(): Promise<void> {
  await fila;
  await new Promise<void>((ok) => {
    try {
      const r = indexedDB.deleteDatabase(BANCO);
      r.onsuccess = () => ok(); r.onerror = () => ok(); r.onblocked = () => ok();
    } catch { ok(); }
  });
}

export const oDiarioEstaLigado = () => ligado;
