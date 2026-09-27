/**
 * O TEMA DA TELA (27/09): claro, escuro e alto contraste.
 *
 * Era um botão só do protótipo, que alternava claro/escuro. Agora vale no
 * sistema de verdade: o tema é preferência de quem USA o aparelho — a educadora
 * da madrugada escolhe o escuro, a colega que enxerga pouco escolhe o contraste
 * — e fica lembrado NESTE aparelho (localStorage), nunca na conta: o celular da
 * casa passa de mão em mão, e cada turno troca se quiser.
 *
 * Sem escolha guardada, vale o do sistema operacional (claro ou escuro), como
 * sempre foi.
 */
export type Tema = 'light' | 'dark' | 'contraste';

export const TEMAS: { cod: Tema; nome: string }[] = [
  { cod: 'light', nome: 'Claro' },
  { cod: 'dark', nome: 'Escuro' },
  { cod: 'contraste', nome: 'Alto contraste' },
];

const CHAVE = 'rede-acolher.tema';

export function temaGuardado(): Tema | null {
  try {
    const t = localStorage.getItem(CHAVE);
    return TEMAS.some((x) => x.cod === t) ? (t as Tema) : null;
  } catch { return null; }
}

/** O tema que está valendo agora — o escolhido, ou o do sistema operacional. */
export function temaAtual(): Tema {
  const t = document.documentElement.getAttribute('data-theme');
  if (TEMAS.some((x) => x.cod === t)) return t as Tema;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function aplicarTema(t: Tema) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(CHAVE, t); } catch { /* aparelho sem armazenamento: vale até fechar */ }
}

/** O seguinte na roda: claro → escuro → alto contraste → claro. */
export function proximoTema(t: Tema): Tema {
  const i = TEMAS.findIndex((x) => x.cod === t);
  return TEMAS[(i + 1) % TEMAS.length].cod;
}

export const nomeDoTema = (t: Tema) => TEMAS.find((x) => x.cod === t)?.nome ?? t;

/* Aplicado na carga do módulo, antes do primeiro desenho: sem isto a tela
   piscaria no tema do sistema e depois trocaria. */
const inicial = temaGuardado();
if (inicial && typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', inicial);
