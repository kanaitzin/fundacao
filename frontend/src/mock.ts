/**
 * O SERVIDOR DE MENTIRA DO PROTÓTIPO, AS OITO CASAS (fase 225).
 *
 * Cada casa é uma cópia própria do servidor de mentira (`mock-casa.ts`), criada
 * na primeira vez que alguém entra nela, e com o estado dela: o que se registra
 * na Casa 01 fica na Casa 01. Até a fase 224 havia uma casa só, e quem entrava
 * na Casa 01 via as crianças da Casa 03.
 *
 * Este arquivo escolhe a casa de cada pedido: a do `houseId` (ou `casaId`) que
 * vem no pedido, a da página da unidade (`/houses/:id`) ou, sem nada disso, a
 * casa aberta na tela. O que é da instituição e não de uma casa (entrar, o Ver
 * como, o painel e as métricas das unidades, o dia de todas, a ATA Geral, o
 * trabalho social, a implantação, a Acolhe+AI) vai sempre à casa-modelo, que é
 * a Casa 03.
 *
 * Quem está entrado é um só para as oito: a pessoa da sessão vai junto em cada
 * pedido. Nas outras casas os nomes da casa-modelo que ainda aparecem numa
 * resposta (os que nascem dentro das funções) são trocados pelos desta casa na
 * saída.
 */
import { SemConexao, ErroApi } from './api';
import { CASA_MODELO, CASAS_DA_FUNDACAO, configDaCasa } from './casas-ficticias';
import { criarServidorDaCasa } from './mock-casa';

type Servidor = ReturnType<typeof criarServidorDaCasa>;
const CASAS = new Map<string, Servidor>();
function casa(id: string): Servidor {
  let s = CASAS.get(id);
  if (!s) { s = criarServidorDaCasa(configDaCasa(id)); CASAS.set(id, s); }
  return s;
}

/** As rotas da instituição: respondidas pela casa-modelo. */
const DA_INSTITUICAO = [
  /^\/auth\//, /^\/prototipo\//, /^\/users\/me$/, /^\/houses$/, /^\/houses\/directory$/,
  /^\/reports\/panel$/, /^\/reports\/metrics$/, /^\/timeline\/all$/, /^\/shifts\/general-ata/,
  /^\/impacto\/panorama$/, /^\/implantacao\//, /^\/assistente\//, /^\/staff\/alcance$/,
  /^\/avisos-no-celular\//, /^\/transfers\//,
];

let semSinal = false;
export function simularSemSinal(ligado: boolean) { semSinal = ligado; }
export function estaSemSinal() { return semSinal; }

/*
 * A SESSÃO QUE TERMINA, só para o ensaio (fase 168). Entrar de novo desfaz.
 */
let sessaoVencida = false;
if (typeof window !== 'undefined') {
  (window as unknown as { __ensaioVencerSessao?: () => void }).__ensaioVencerSessao =
    () => { sessaoVencida = true; };
}

/** A pessoa da sessão, a mesma nas oito casas. */
let eu: ReturnType<Servidor['lerEu']> | null = null;

/** A casa aberta na tela, dita pelo `App.tsx` (pelo `api.ts`). */
let casaAberta: string | null = null;
export function abrirCasaNoPrototipo(id: string | null) { casaAberta = id; }

/*
 * O IDENTIFICADOR COM A CASA. As cópias repetem as identificações (a p05 da
 * Casa 01 e a p05 da Casa-Lar 4 são crianças diferentes). Nas listas que juntam
 * casas, a identificação de outra casa vai como `casa-arm4~p05`; o pedido que a
 * traz vai a essa casa, com a identificação de volta ao normal.
 */
const comACasa = (casaId: string, id: string) => `${casaId}~${id}`;
const COM_A_CASA = /(casa-[a-z0-9]+)~/;
function tirarACasa(texto: string): { casa: string | null; texto: string } {
  const m = COM_A_CASA.exec(texto);
  return m ? { casa: m[1], texto: texto.split(`${m[1]}~`).join('') } : { casa: null, texto };
}

function casaDoPedido(rota: string, q: URLSearchParams, corpo: Record<string, unknown>, metodo: string): string {
  if (DA_INSTITUICAO.some((re) => re.test(rota))) return CASA_MODELO;
  if (rota === '/impacto/marcos' && metodo === 'GET' && !q.get('houseId')) return CASA_MODELO;
  const pedida = q.get('houseId') ?? q.get('casaId')
    ?? (typeof corpo.houseId === 'string' ? corpo.houseId : null)
    ?? (typeof corpo.casaId === 'string' ? corpo.casaId : null)
    ?? (/^\/houses\/([^/]+)/.exec(rota)?.[1] ?? null);
  const valida = (id: string | null) => (id && CASAS_DA_FUNDACAO.some((c) => c.id === id) ? id : null);
  return valida(pedida) ?? valida(casaAberta) ?? CASA_MODELO;
}

/** Na saída, os nomes da casa-modelo que sobraram viram os desta casa. */
function trocarNaSaida(v: unknown, trocar: (s: string) => string): unknown {
  if (typeof v === 'string') {
    /* O Word e as fotos vêm em base64: nada de nome lá dentro. */
    if (v.startsWith('data:') || (v.length > 2000 && !/\s/.test(v.slice(0, 2000)))) return v;
    return trocar(v);
  }
  if (Array.isArray(v)) return v.map((x) => trocarNaSaida(x, trocar));
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = k === 'conteudoBase64' ? x : trocarNaSaida(x, trocar);
    return o;
  }
  return v;
}

/** O que uma casa responde, com a pessoa da sessão e os nomes dela. */
function naCasa(id: string, rota: string, q: URLSearchParams, comNomes = true): unknown {
  const s = casa(id);
  if (eu) s.trocarEu(eu);
  const r = s.responder(rota, rota.split('/').filter(Boolean), q, {}, 'GET');
  /* Sem a troca nas somas: ela troca também o código "AI3", e a linha da Casa 03
     que a cópia devolve viraria uma segunda linha desta casa. */
  return id === CASA_MODELO || !comNomes || r instanceof Error ? r : trocarNaSaida(r, s.trocar);
}

/**
 * O QUE SOMA AS CASAS (fase 225). O painel das unidades, o trabalho social e o
 * dia de todas as unidades eram respondidos por uma casa só, com os números
 * das outras sete escritos à mão. Agora cada casa responde a parte dela, e a
 * soma é a soma do que se vê entrando em cada uma.
 */
function juntarAsCasas(rota: string, q: URLSearchParams, daModelo: unknown): unknown {
  if (daModelo instanceof Error) return daModelo;
  const deCadaCasa = <T extends { id: string }>(linhas: T[]): T[] => linhas.map((l) => {
    if (l.id === CASA_MODELO || !CASAS_DA_FUNDACAO.some((c) => c.id === l.id)) return l;
    const r = naCasa(l.id, rota, q, false);
    const lista = Array.isArray(r) ? r : (r as { casas?: T[] })?.casas;
    return (lista ?? []).find((x) => x.id === l.id) ?? l;
  });
  if (rota === '/reports/panel' && Array.isArray(daModelo)) return deCadaCasa(daModelo as { id: string }[]);
  if (rota === '/reports/metrics') {
    /* Cada casa diz a própria linha (os registros dela); a soma é refeita. */
    const p = daModelo as { casas: Record<string, unknown>[]; total: Record<string, number> };
    const casas = p.casas.map((c) => {
      const id = CASAS_DA_FUNDACAO.find((x) => x.code === c.codigo)?.id;
      if (!id || id === CASA_MODELO) return c;
      const r = naCasa(id, rota, q, false) as typeof p;
      return r?.casas?.find((x) => x.codigo === c.codigo) ?? c;
    });
    const total: Record<string, number> = { casas: casas.length };
    for (const k of Object.keys(p.total)) {
      if (k !== 'casas') total[k] = casas.reduce((t, c) => t + Number(c[k] ?? 0), 0);
    }
    return { ...p, casas, total };
  }
  if (rota === '/impacto/panorama' && !q.get('houseId')) {
    const p = daModelo as { casas: Record<string, unknown>[] & { id: string }[]; total: Record<string, number>;
      marcosPorTipo: { cod: string; n: number }[] };
    const casas = deCadaCasa(p.casas as { id: string }[]) as unknown as Record<string, number>[];
    const total: Record<string, number> = { ...p.total };
    for (const k of Object.keys(total)) if (k !== 'casas') total[k] = casas.reduce((t, c) => t + Number(c[k] ?? 0), 0);
    const porTipo = new Map(p.marcosPorTipo.map((t) => [t.cod, { ...t, n: 0 }]));
    for (const c of p.casas as { id: string }[]) {
      const r = c.id === CASA_MODELO ? p : naCasa(c.id, rota, new URLSearchParams({ houseId: c.id }), false);
      for (const t of (r as typeof p)?.marcosPorTipo ?? []) {
        const x = porTipo.get(t.cod) ?? { ...t, n: 0 };
        x.n += t.n; porTipo.set(t.cod, x);
      }
    }
    return { ...p, casas, total, marcosPorTipo: [...porTipo.values()].filter((t) => t.n > 0) };
  }
  if (rota === '/impacto/marcos' && !q.get('houseId') && Array.isArray(daModelo)) {
    /* Quem conquistou, nas oito: a lista de cada casa, com os nomes dela, por data. */
    const alcance = naCasa(CASA_MODELO, '/houses', new URLSearchParams()) as { id: string }[];
    const todas = (Array.isArray(alcance) ? alcance : []).flatMap((h) => {
      const r = h.id === CASA_MODELO ? daModelo : naCasa(h.id, rota, q);
      return Array.isArray(r)
        ? (r as { quando?: string; casaId?: string; acolhidoId?: string }[])
          .filter((m) => !m.casaId || m.casaId === h.id)
          .map((m) => (h.id === CASA_MODELO || !m.acolhidoId ? m : { ...m, acolhidoId: comACasa(h.id, m.acolhidoId) }))
        : [];
    });
    return todas.sort((x, y) => String(y.quando ?? '').localeCompare(String(x.quando ?? '')));
  }
  if (rota === '/timeline/all') {
    const alcance = naCasa(CASA_MODELO, '/houses', new URLSearchParams()) as { id: string }[];
    const partes = (Array.isArray(alcance) ? alcance : []).map((h) =>
      (h.id === CASA_MODELO ? daModelo : naCasa(h.id, rota, q)) as {
        eventos: { at: string }[]; unidades: unknown[] });
    const base = daModelo as Record<string, unknown>;
    return {
      ...base,
      unidades: partes.flatMap((x) => x?.unidades ?? []),
      eventos: partes.flatMap((x) => x?.eventos ?? [])
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
    };
  }
  return daModelo;
}

export async function mockApi<T>(path: string, init?: RequestInit): Promise<T> {
  await new Promise((r) => setTimeout(r, 120));   // uma pausa curta, como a rede real
  if (semSinal) {
    throw new SemConexao(
      'Sem conexão com o servidor. O que você registrar fica guardado neste aparelho.',
    );
  }
  const comCasa = tirarACasa(path);
  const corpoTexto = init?.body ? tirarACasa(String(init.body)) : { casa: null, texto: '' };
  const daOutraCasa = comCasa.casa ?? corpoTexto.casa;
  const [rota, busca] = comCasa.texto.split('?');
  const q = new URLSearchParams(busca ?? '');
  const corpo = corpoTexto.texto ? JSON.parse(corpoTexto.texto) : {};
  const seg = rota.split('/').filter(Boolean);
  if (sessaoVencida && rota !== '/auth/login') {
    throw new ErroApi(401, 'Sua sessão terminou. Entre de novo para continuar. O que você digitou '
      + 'nesta tela não foi salvo.');
  }

  const id = daOutraCasa && CASAS_DA_FUNDACAO.some((c) => c.id === daOutraCasa)
    ? daOutraCasa : casaDoPedido(rota, q, corpo, init?.method ?? 'GET');
  const s = casa(id);
  const modelo = id === CASA_MODELO;
  if (!eu) eu = casa(CASA_MODELO).lerEu();
  s.trocarEu(eu);
  const r = s.responder(rota, seg, q, corpo, init?.method ?? 'GET');
  eu = s.lerEu();
  if (rota === '/auth/login' || rota === '/auth/convite/concluir') sessaoVencida = false;
  if (r instanceof Error) {
    if (!modelo) r.message = s.trocar(r.message);
    throw r;
  }
  /* Quem a pessoa é, dito na casa aberta: no "Ver como" da Casa 01 o educador
     é o da Casa 01, com o nome que a equipe dela vê nos registros. */
  if ((rota === '/prototipo/cargo' || rota === '/users/me') && casaAberta && casaAberta !== CASA_MODELO
      && CASAS_DA_FUNDACAO.some((c) => c.id === casaAberta)) {
    return trocarNaSaida(r, casa(casaAberta).trocar) as T;
  }
  if (modelo && (init?.method ?? 'GET') === 'GET') return juntarAsCasas(rota, q, r) as T;
  return (modelo ? r : trocarNaSaida(r, s.trocar)) as T;
}
