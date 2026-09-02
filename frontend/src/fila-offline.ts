/**
 * A FILA LOCAL DO APARELHO (§17.1, §17.2).
 *
 * O servidor já sabia receber a fila (`POST /sync/push`), decidir o que
 * aplicar e devolver o que pode ser apagado. Faltava a outra metade: o
 * aparelho que GUARDA a operação quando não há sinal, tenta de novo sozinho e
 * só esquece o que o servidor confirmou ter aplicado.
 *
 * As quatro decisões que valem lembrar, porque cada uma tem um jeito errado
 * mais fácil:
 *
 * 1. **IndexedDB, não memória e não `localStorage`.** A educadora fecha a
 *    aba, o celular reinicia, a bateria acaba. Uma fila em memória perde a
 *    confirmação do jantar. O `localStorage` é síncrono e trava a tela no
 *    meio do turno, e some no primeiro "limpar dados do site".
 *
 * 2. **Apagar só o que voltou em `podeLimpar`.** O servidor devolve, operação
 *    por operação, o que aplicou. Tudo o mais — conflito, recusa, resposta que
 *    não chegou — CONTINUA AQUI. Uma fila que se limpa sozinha ao receber
 *    "200 OK" apaga registro que não existe em lugar nenhum, e ninguém fica
 *    sabendo. É o §17.2 ao pé da letra: dado local só some depois de
 *    sincronização VERIFICADA.
 *
 * 3. **O horário é o do ato, não o do envio.** `happenedAt` nasce quando a
 *    pessoa toca no botão. A dose das 22h que subiu às 7h da manhã é das 22h
 *    (§17.3). O `queuedAt` fica ao lado, porque a diferença entre os dois é
 *    informação de auditoria, não sujeira.
 *
 * 4. **A fila não é atalho para o que a regra recusa.** Ela guarda a mesma
 *    operação que a API receberia, e é o servidor que valida na chegada. O que
 *    não passa vira CONFLITO para decisão humana (§17.4) — nunca gravação
 *    silenciosa por baixo da validação, nunca descarte.
 *
 * E uma recusa que acontece AQUI, antes de guardar: confirmação de dose exige
 * o aparelho institucional (§11.7). Enfileirar uma dose num aparelho pessoal
 * seria deixar a educadora acreditar por horas que registrou algo que vai
 * voltar rejeitado. Melhor a frase na hora.
 */
import { TIPOS_OFFLINE, tipoOffline } from '../../backend/src/modules/sync/tipos-offline';

const BANCO = 'rede-acolher-fila';
const LOJA = 'operacoes';
const VERSAO = 1;

export type StatusLocal = 'pendente' | 'conflito' | 'rejeitada';

export interface OperacaoLocal {
  clientOpId: string;
  kind: string;
  houseId?: string;
  payload: Record<string, unknown>;
  /** Quando a pessoa fez. Nunca é substituído pelo horário do envio. */
  happenedAt: string;
  /** Quando entrou na fila. */
  queuedAt: string;
  status: StatusLocal;
  /** A frase do servidor, quando ele recusou ou abriu conflito. */
  motivo?: string;
  tentativas: number;
  ultimaTentativa?: string;
}

export interface EstadoDaFila {
  pendentes: number;
  paradas: number;          // conflito ou recusa: esperam gente
  enviando: boolean;
  online: boolean;
  ultimoEnvio?: string;
  ultimoErro?: string;
}

type Ouvinte = (estado: EstadoDaFila) => void;

/* ------------------------------------------------------------------ IndexedDB
 * Um embrulho mínimo. Não vale trazer uma biblioteca para quatro operações
 * numa loja só — e o pacote do protótipo é um arquivo que alguém baixa. */

let bancoAberto: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (bancoAberto) return bancoAberto;
  bancoAberto = new Promise((ok, falhou) => {
    const req = indexedDB.open(BANCO, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA)) {
        db.createObjectStore(LOJA, { keyPath: 'clientOpId' });
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falhou(req.error);
  });
  return bancoAberto;
}

async function comLoja<T>(modo: IDBTransactionMode, f: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise<T>((ok, falhou) => {
    const tx = db.transaction(LOJA, modo);
    const req = f(tx.objectStore(LOJA));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falhou(req.error);
  });
}

/* --------------------------------------------------------------------- Estado */

const ouvintes = new Set<Ouvinte>();
let enviando = false;
let ultimoEnvio: string | undefined;
let ultimoErro: string | undefined;
let cache: OperacaoLocal[] = [];

function estado(): EstadoDaFila {
  return {
    pendentes: cache.filter((o) => o.status === 'pendente').length,
    paradas: cache.filter((o) => o.status !== 'pendente').length,
    enviando,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    ultimoEnvio,
    ultimoErro,
  };
}

function avisar() {
  const e = estado();
  ouvintes.forEach((o) => o(e));
}

async function recarregar() {
  cache = (await comLoja<OperacaoLocal[]>('readonly', (l) => l.getAll() as IDBRequest<OperacaoLocal[]>)) ?? [];
  cache.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  avisar();
}

/** Assina o estado da fila. Devolve a função que cancela. */
export function observarFila(o: Ouvinte): () => void {
  ouvintes.add(o);
  o(estado());
  return () => { ouvintes.delete(o); };
}

export function filaAtual(): OperacaoLocal[] {
  return [...cache];
}

/* ------------------------------------------------------------------ Enfileirar */

export class RecusaDaFila extends Error {}

export interface AoEnfileirar {
  kind: string;
  houseId?: string;
  payload: Record<string, unknown>;
  /** Quando o ato aconteceu. Padrão: agora. */
  happenedAt?: string;
}

/**
 * Guarda a operação para enviar quando houver sinal.
 *
 * Recusa dois casos, e os dois com frase: tipo que o servidor não sabe
 * aplicar, e medicamento fora do aparelho institucional (§11.7).
 */
export async function enfileirar(op: AoEnfileirar): Promise<OperacaoLocal> {
  const tipo = tipoOffline(op.kind);
  if (!tipo) {
    throw new RecusaDaFila(
      'Esta ação não pode ser guardada sem internet. Tente de novo quando a conexão voltar.',
    );
  }
  if (tipo.exigeAparelhoInstitucional && !codigoDoAparelho()) {
    throw new RecusaDaFila(
      'Sem internet, somente o aparelho da casa confirma medicamento. '
      + 'Confirme neste aparelho quando a conexão voltar, ou use o aparelho institucional.',
    );
  }

  const agora = new Date().toISOString();
  const registro: OperacaoLocal = {
    clientOpId: novoId(),
    kind: op.kind,
    houseId: op.houseId,
    payload: op.payload,
    happenedAt: op.happenedAt ?? agora,
    queuedAt: agora,
    status: 'pendente',
    tentativas: 0,
  };
  await comLoja('readwrite', (l) => l.put(registro) as IDBRequest<IDBValidKey>);
  await recarregar();
  return registro;
}

/** `crypto.randomUUID` não existe em contexto inseguro; o sorteio serve. */
function novoId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'op-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* ------------------------------------------------------- Código do aparelho
 * O código nasce no cadastro do aparelho (fase 43) e aparece uma vez só. Ele
 * fica AQUI, neste aparelho, porque é ele que a credencial identifica — e o
 * servidor o confere contra o registro da casa. Guardá-lo não é guardar
 * segredo de pessoa: é o aparelho dizendo qual é, e quem decide continua
 * sendo o servidor. */

const CHAVE_APARELHO = 'rede-acolher-aparelho';

export function codigoDoAparelho(): string | null {
  try { return localStorage.getItem(CHAVE_APARELHO); } catch { return null; }
}

export function guardarCodigoDoAparelho(codigo: string | null) {
  try {
    if (codigo) localStorage.setItem(CHAVE_APARELHO, codigo);
    else localStorage.removeItem(CHAVE_APARELHO);
  } catch { /* aparelho sem armazenamento: segue sem confirmar dose offline */ }
}

/* --------------------------------------------------------------------- Enviar */

type Enviador = (ops: unknown[]) => Promise<RespostaPush>;

export interface RespostaPush {
  recebidas: number;
  resultados: Array<{ clientOpId: string; status: string; motivo?: string }>;
  podeLimpar: string[];
  sincronizadoEm: string;
}

let enviador: Enviador | null = null;

/**
 * Quem sabe falar com o servidor é o `api.ts`. A fila recebe o enviador de
 * fora para não importar o cliente HTTP — e para o ensaio poder pôr um
 * servidor de mentira no lugar sem tocar em nada daqui.
 */
export function definirEnviador(f: Enviador | null) {
  enviador = f;
}

const LOTE = 100;   // o servidor recusa acima de 500; 100 cabe em rede ruim

/**
 * Tenta enviar o que está pendente.
 *
 * Devolve quantas foram aplicadas. Não lança: sem sinal é situação normal, não
 * é erro de quem está trabalhando.
 */
export async function sincronizar(): Promise<{ aplicadas: number; paradas: number }> {
  if (enviando || !enviador) return { aplicadas: 0, paradas: 0 };
  const pendentes = cache.filter((o) => o.status === 'pendente');
  if (!pendentes.length) return { aplicadas: 0, paradas: 0 };

  enviando = true; ultimoErro = undefined; avisar();
  let aplicadas = 0; let paradas = 0;

  try {
    for (let i = 0; i < pendentes.length; i += LOTE) {
      const lote = pendentes.slice(i, i + LOTE);
      const corpo = lote.map((o) => ({
        clientOpId: o.clientOpId,
        kind: o.kind,
        houseId: o.houseId,
        payload: o.payload,
        happenedAt: o.happenedAt,
        queuedAt: o.queuedAt,
        /* O aparelho DIZ o código; quem decide se ele é institucional é o
         * servidor, contra o cadastro da casa. O cliente não afirma nada
         * sobre si (fase 43). */
        deviceToken: codigoDoAparelho() ?? undefined,
      }));

      const r = await enviador(corpo);
      const limpar = new Set(r.podeLimpar ?? []);
      const porId = new Map((r.resultados ?? []).map((x) => [x.clientOpId, x]));

      for (const o of lote) {
        if (limpar.has(o.clientOpId)) {
          await comLoja('readwrite', (l) => l.delete(o.clientOpId) as unknown as IDBRequest<undefined>);
          aplicadas++;
          continue;
        }
        /* Não veio em `podeLimpar`: FICA. Se o servidor disse por quê, o
         * motivo fica junto, para a tela poder mostrar a frase dele em vez de
         * "algo deu errado". Sem resposta nenhuma para esta operação, ela
         * continua pendente e vai na próxima tentativa. */
        const res = porId.get(o.clientOpId);
        const atualizado: OperacaoLocal = {
          ...o,
          tentativas: o.tentativas + 1,
          ultimaTentativa: new Date().toISOString(),
          status: res?.status === 'conflito' ? 'conflito'
                : res?.status === 'rejeitada' ? 'rejeitada'
                : 'pendente',
          motivo: res?.motivo,
        };
        if (atualizado.status !== 'pendente') paradas++;
        await comLoja('readwrite', (l) => l.put(atualizado) as IDBRequest<IDBValidKey>);
      }
      ultimoEnvio = r.sincronizadoEm ?? new Date().toISOString();
    }
  } catch (e) {
    /* Sem sinal, servidor fora do ar, sessão vencida: nada é apagado e nada
     * muda de status. A próxima tentativa manda tudo de novo — o servidor é
     * idempotente por `clientOpId`. */
    ultimoErro = e instanceof Error ? e.message : 'Não foi possível sincronizar agora.';
  } finally {
    enviando = false;
    await recarregar();
  }
  return { aplicadas, paradas };
}

/** Tira da fila uma operação parada, depois de a equipe resolver o que fazer. */
export async function descartar(clientOpId: string) {
  const o = cache.find((x) => x.clientOpId === clientOpId);
  /* Só o que está PARADO pode ser descartado à mão. Descartar pendente seria
   * apagar trabalho que ainda vai subir. */
  if (!o || o.status === 'pendente') return;
  await comLoja('readwrite', (l) => l.delete(clientOpId) as unknown as IDBRequest<undefined>);
  await recarregar();
}

/** Põe de volta na fila o que ficou parado — depois de o motivo ter mudado. */
export async function tentarDeNovo(clientOpId: string) {
  const o = cache.find((x) => x.clientOpId === clientOpId);
  if (!o || o.status === 'pendente') return;
  await comLoja('readwrite', (l) => l.put({ ...o, status: 'pendente', motivo: undefined }) as IDBRequest<IDBValidKey>);
  await recarregar();
  await sincronizar();
}

/* ---------------------------------------------------------------- Ligar tudo */

let ligada = false;

/**
 * Liga a fila: lê o que ficou do turno anterior e passa a tentar sozinha.
 *
 * A tentativa periódica existe porque `navigator.onLine` mente com frequência
 * — o celular na casa fica "conectado" a um wi-fi que não alcança a internet,
 * e o evento `online` nunca dispara. Quem sabe se há sinal é a resposta do
 * servidor.
 */
export async function ligarFila(intervaloMs = 30_000): Promise<void> {
  await recarregar();
  if (ligada) return;
  ligada = true;
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { avisar(); void sincronizar(); });
    window.addEventListener('offline', avisar);
    setInterval(() => { void sincronizar(); }, intervaloMs);
  }
  await sincronizar();
}

/** Só para o ensaio: esvazia tudo e desliga. Não é usada pelo aplicativo. */
export async function esvaziarParaEnsaio(): Promise<void> {
  await comLoja('readwrite', (l) => l.clear() as unknown as IDBRequest<undefined>);
  await recarregar();
}

export { TIPOS_OFFLINE };
