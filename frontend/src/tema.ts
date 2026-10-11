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
export type Tema = 'light' | 'dark' | 'contraste' | 'rosa' | 'azul' | 'verde' | 'colorido' | 'rs';

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
  /* O RIO GRANDE DO SUL (pedido de 11/10): o verde, o vermelho e o amarelo da
     bandeira. O verde é a marca; o vermelho e o amarelo ficam na faixa do topo,
     no fundo e nos azulejos da navegação, nunca nas pílulas, porque ali vermelho
     e amarelo são o crítico e a atenção. */
  { cod: 'rs', nome: 'Rio Grande do Sul',
    amostra: 'linear-gradient(135deg,#009739 0 38%,#DA291C 38% 62%,#FFCD00 62%)' },
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
  try { localStorage.setItem(CHAVE, t); } catch { /* aparelho sem armazenamento: vale até fechar */ }
  temaEscolhidoNestaAba = t;
  pintar();
}

/*
 * O ESCURO AUTOMÁTICO À NOITE (fase 183): das 20h às 8h de Porto Alegre, para
 * quem ligar. Vale POR CIMA da cor escolhida e não a apaga: às 8h a tela volta
 * ao rosa de quem tinha escolhido rosa. A hora é a da instituição, não a do
 * aparelho, pelo mesmo motivo de todo o resto (§23).
 */
const CHAVE_NOITE = 'rede-acolher.escuro-a-noite';
let temaEscolhidoNestaAba: Tema | null = null;

export function escuroANoiteLigado(): boolean {
  try { return localStorage.getItem(CHAVE_NOITE) === '1'; } catch { return false; }
}
export function ligarEscuroANoite(ligar: boolean) {
  try { localStorage.setItem(CHAVE_NOITE, ligar ? '1' : '0'); } catch { /* vale até fechar */ }
  noiteNestaAba = ligar;
  pintar();
}
let noiteNestaAba: boolean | null = null;

export function eNoiteNaInstituicao(agora = new Date()): boolean {
  const h = Number(new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(agora));
  return h >= 20 || h < 8;
}

/** Põe na tela o que vale agora: o escuro da noite, a cor escolhida, ou a do sistema. */
export function pintar() {
  if (typeof document === 'undefined') return;
  const escolhido = temaEscolhidoNestaAba ?? temaGuardado();
  const noite = (noiteNestaAba ?? escuroANoiteLigado()) && eNoiteNaInstituicao();
  const vale = noite ? 'dark' : escolhido;
  if (vale) document.documentElement.setAttribute('data-theme', vale);
  else document.documentElement.removeAttribute('data-theme');
}

/*
 * O TAMANHO DA LETRA (fase 183): normal, grande e maior, guardado no aparelho
 * como o tema. É um `zoom` da página inteira, e não letra por letra: o botão
 * cresce junto com a palavra, e a proporção que o ensaio de acessibilidade
 * mediu continua a mesma.
 */
export type Letra = 'normal' | 'grande' | 'maior';
export const LETRAS: { cod: Letra; nome: string }[] = [
  { cod: 'normal', nome: 'Normal' },
  { cod: 'grande', nome: 'Grande' },
  { cod: 'maior', nome: 'Maior' },
];
const CHAVE_LETRA = 'rede-acolher.letra';
export function letraGuardada(): Letra {
  try {
    const l = localStorage.getItem(CHAVE_LETRA);
    return LETRAS.some((x) => x.cod === l) ? (l as Letra) : 'normal';
  } catch { return 'normal'; }
}
export function aplicarLetra(l: Letra) {
  try { localStorage.setItem(CHAVE_LETRA, l); } catch { /* vale até fechar */ }
  if (typeof document === 'undefined') return;
  if (l === 'normal') document.documentElement.removeAttribute('data-letra');
  else document.documentElement.setAttribute('data-letra', l);
}

export const nomeDoTema = (t: Tema) => TEMAS.find((x) => x.cod === t)?.nome ?? t;

/* Aplicado na carga do módulo, antes do primeiro desenho: sem isto a tela
   piscaria no tema do sistema e depois trocaria. E de minuto em minuto, para
   o escuro da noite entrar às 20h e sair às 8h com a tela aberta. */
if (typeof document !== 'undefined') {
  pintar();
  const l = letraGuardada();
  if (l !== 'normal') document.documentElement.setAttribute('data-letra', l);
  setInterval(pintar, 60_000);
}
