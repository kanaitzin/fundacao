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
export type Tema = 'light' | 'dark' | 'contraste' | 'rosa' | 'azul' | 'verde' | 'colorido';

/*
 * AS CORES PARA ESCOLHER (pedido de 30/09): rosa, azul claro, verde e
 * colorido, pela questão pedagógica. Todas claras, com a letra escura; mudam o
 * fundo e a moldura, nunca as cores que querem dizer alguma coisa (estado,
 * autor, cargo). A `amostra` é o que a folha de escolher mostra ao lado do nome.
 */
export const TEMAS: { cod: Tema; nome: string; amostra: string }[] = [
  { cod: 'light', nome: 'Claro', amostra: '#EDF1F7' },
  { cod: 'dark', nome: 'Escuro', amostra: '#151E28' },
  { cod: 'contraste', nome: 'Alto contraste', amostra: 'linear-gradient(135deg,#000 50%,#fff 50%)' },
  { cod: 'rosa', nome: 'Rosa', amostra: '#F4B8D3' },
  { cod: 'azul', nome: 'Azul claro', amostra: '#A9D8F2' },
  { cod: 'verde', nome: 'Verde', amostra: '#A8DBB8' },
  { cod: 'colorido', nome: 'Colorido',
    amostra: 'linear-gradient(135deg,#DB2777,#EA580C,#CA8A04,#16A34A,#0284C7,#7C3AED)' },
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

export const nomeDoTema = (t: Tema) => TEMAS.find((x) => x.cod === t)?.nome ?? t;

/* Aplicado na carga do módulo, antes do primeiro desenho: sem isto a tela
   piscaria no tema do sistema e depois trocaria. */
const inicial = temaGuardado();
if (inicial && typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', inicial);
