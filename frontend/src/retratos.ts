/**
 * OS RETRATOS FICTÍCIOS DO PROTÓTIPO (pedido de 11/10: *"fotos fictícias para
 * vermos algo ali já como se fosse real"*).
 *
 * São DESENHOS, e não fotografia, de propósito: num sistema de acolhimento não
 * se põe rosto realista de criança nem de mentira, e um retrato que parece foto
 * de alguém ensina a tela errada a quem demonstra. O desenho mostra o lugar da
 * foto ocupado, como vai ficar com a foto de verdade, e ninguém o confunde com
 * uma pessoa.
 *
 * Só o protótipo usa (o `mock.ts`). No sistema de verdade a foto de
 * identificação é a que a técnica tira, e sem ela a tela mostra as iniciais.
 *
 * O mesmo nome dá sempre o mesmo retrato (a semente vira o sorteio), para a
 * Alice ser a Alice em toda tela e em toda demonstração.
 */

export type Feitio = 'menina' | 'menino' | 'mulher' | 'homem' | 'senhora' | 'senhor';

const PELES = ['#F6D3B3', '#EBC09A', '#D9A57B', '#C68B5E', '#A86F46', '#8A5634', '#6B3F25'];
const CABELOS = ['#1F1612', '#2E2018', '#4A2E1E', '#6B4226', '#8C5A33', '#B07D45', '#C9A15E'];
const GRISALHOS = ['#9A9A9A', '#B8B8B8', '#D6D6D6'];
const ROUPAS = ['#2563EB', '#DB2777', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DC2626', '#4B5563', '#65A30D', '#EA580C'];
const FUNDOS = ['#DBEAFE', '#FCE7F3', '#DCFCE7', '#FEF3C7', '#EDE9FE', '#CFFAFE', '#FFE4E6', '#E0E7FF', '#ECFCCB', '#FFEDD5'];

/** O sorteio que sempre dá o mesmo resultado para a mesma semente. */
function sorteio(semente: string) {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) { h ^= semente.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const escurecer = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.round(v * (1 - f))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

/** O retrato em SVG, como texto. */
export function retratoSvg(semente: string, feitio: Feitio): string {
  const r = sorteio(`${semente}|${feitio}`);
  const um = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const crianca = feitio === 'menina' || feitio === 'menino';
  const idoso = feitio === 'senhora' || feitio === 'senhor';
  const fem = feitio === 'menina' || feitio === 'mulher' || feitio === 'senhora';

  const pele = um(PELES);
  const sombra = escurecer(pele, 0.12);
  const cabelo = idoso ? um(GRISALHOS) : um(CABELOS);
  const roupa = um(ROUPAS);
  const fundo = um(FUNDOS);

  /* Criança: cabeça maior e mais redonda, olhos maiores. Adulto: rosto mais longo. */
  const cx = 60;
  const cy = crianca ? 54 : 52;
  const rx = crianca ? 25 : 22;
  const ry = crianca ? 27 : 28;
  const olho = crianca ? 2.9 : 2.4;

  const estilos = fem
    ? (crianca ? ['longo', 'rabo', 'cacheado', 'tranca', 'coque'] : idoso ? ['curtoF', 'coque', 'cacheado'] : ['longo', 'cacheado', 'coque', 'curtoF', 'black'])
    : (crianca ? ['curto', 'cacheado', 'raspado', 'franja', 'black'] : idoso ? ['careca', 'curto', 'raspado'] : ['curto', 'raspado', 'cacheado', 'franja', 'black']);
  const estilo = um(estilos);

  const atras: string[] = [];
  const frente: string[] = [];
  const topo = cy - ry;
  switch (estilo) {
    case 'longo':
      atras.push(`<path d="M${cx - rx - 6} ${cy - 4} Q${cx - rx - 8} ${cy + ry + 14} ${cx - rx + 4} ${cy + ry + 18} L${cx + rx - 4} ${cy + ry + 18} Q${cx + rx + 8} ${cy + ry + 14} ${cx + rx + 6} ${cy - 4} Z" fill="${cabelo}"/>`);
      frente.push(`<path d="M${cx - rx - 2} ${cy - 2} Q${cx - rx} ${topo - 8} ${cx} ${topo - 6} Q${cx + rx} ${topo - 8} ${cx + rx + 2} ${cy - 2} Q${cx + 8} ${topo + 6} ${cx - 6} ${topo + 8} Q${cx - rx + 4} ${topo + 14} ${cx - rx - 2} ${cy - 2} Z" fill="${cabelo}"/>`);
      break;
    case 'tranca':
      atras.push(`<rect x="${cx + rx - 4}" y="${cy}" width="9" height="34" rx="4.5" fill="${cabelo}"/><rect x="${cx - rx - 5}" y="${cy}" width="9" height="34" rx="4.5" fill="${cabelo}"/>`);
      frente.push(`<path d="M${cx - rx - 2} ${cy} Q${cx - rx} ${topo - 8} ${cx} ${topo - 6} Q${cx + rx} ${topo - 8} ${cx + rx + 2} ${cy} Q${cx + rx - 4} ${topo + 10} ${cx} ${topo + 8} Q${cx - rx + 4} ${topo + 10} ${cx - rx - 2} ${cy} Z" fill="${cabelo}"/>`);
      break;
    case 'rabo':
      atras.push(`<ellipse cx="${cx + rx + 4}" cy="${cy - 6}" rx="8" ry="16" fill="${cabelo}"/>`);
      frente.push(`<path d="M${cx - rx - 2} ${cy - 2} Q${cx - rx} ${topo - 8} ${cx} ${topo - 6} Q${cx + rx} ${topo - 8} ${cx + rx + 2} ${cy - 2} Q${cx + rx - 6} ${topo + 8} ${cx} ${topo + 7} Q${cx - rx + 6} ${topo + 8} ${cx - rx - 2} ${cy - 2} Z" fill="${cabelo}"/>`);
      break;
    case 'coque':
      frente.push(`<circle cx="${cx}" cy="${topo - 6}" r="11" fill="${cabelo}"/>`);
      frente.push(`<path d="M${cx - rx - 1} ${cy - 4} Q${cx - rx} ${topo - 6} ${cx} ${topo - 5} Q${cx + rx} ${topo - 6} ${cx + rx + 1} ${cy - 4} Q${cx + rx - 6} ${topo + 7} ${cx} ${topo + 6} Q${cx - rx + 6} ${topo + 7} ${cx - rx - 1} ${cy - 4} Z" fill="${cabelo}"/>`);
      break;
    case 'cacheado': {
      const bolas: string[] = [];
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.05 + (i / 8) * 0.9);
        bolas.push(`<circle cx="${(cx + Math.cos(a) * (rx + 1)).toFixed(1)}" cy="${(cy - 6 + Math.sin(a) * (ry + 1)).toFixed(1)}" r="${fem ? 9 : 7.5}" fill="${cabelo}"/>`);
      }
      if (fem && !idoso) atras.push(`<ellipse cx="${cx}" cy="${cy + 6}" rx="${rx + 10}" ry="${ry + 8}" fill="${cabelo}"/>`);
      frente.push(bolas.join(''));
      break;
    }
    case 'black':
      atras.push(`<circle cx="${cx}" cy="${cy - 8}" r="${rx + 15}" fill="${cabelo}"/>`);
      break;
    case 'franja':
      frente.push(`<path d="M${cx - rx - 1} ${cy - 2} Q${cx - rx - 2} ${topo - 6} ${cx} ${topo - 5} Q${cx + rx + 2} ${topo - 6} ${cx + rx + 1} ${cy - 2} L${cx + rx - 2} ${topo + 12} Q${cx} ${topo + 18} ${cx - rx + 2} ${topo + 12} Z" fill="${cabelo}"/>`);
      break;
    case 'curtoF':
      frente.push(`<path d="M${cx - rx - 3} ${cy + 4} Q${cx - rx - 4} ${topo - 7} ${cx} ${topo - 6} Q${cx + rx + 4} ${topo - 7} ${cx + rx + 3} ${cy + 4} Q${cx + rx - 2} ${topo + 8} ${cx - 4} ${topo + 9} Q${cx - rx + 2} ${topo + 10} ${cx - rx - 3} ${cy + 4} Z" fill="${cabelo}"/>`);
      break;
    case 'raspado':
      frente.push(`<path d="M${cx - rx + 1} ${cy - 8} Q${cx - rx + 2} ${topo - 2} ${cx} ${topo - 2} Q${cx + rx - 2} ${topo - 2} ${cx + rx - 1} ${cy - 8} Q${cx} ${topo + 4} ${cx - rx + 1} ${cy - 8} Z" fill="${cabelo}" opacity=".85"/>`);
      break;
    case 'careca':
      frente.push(`<path d="M${cx - rx} ${cy - 2} Q${cx - rx - 1} ${cy - 14} ${cx - rx + 5} ${cy - 18} L${cx - rx + 7} ${cy - 8} Z M${cx + rx} ${cy - 2} Q${cx + rx + 1} ${cy - 14} ${cx + rx - 5} ${cy - 18} L${cx + rx - 7} ${cy - 8} Z" fill="${cabelo}"/>`);
      break;
    default: // curto
      frente.push(`<path d="M${cx - rx - 1} ${cy - 4} Q${cx - rx - 2} ${topo - 7} ${cx} ${topo - 6} Q${cx + rx + 2} ${topo - 7} ${cx + rx + 1} ${cy - 4} Q${cx + rx - 4} ${topo + 6} ${cx} ${topo + 5} Q${cx - rx + 4} ${topo + 6} ${cx - rx - 1} ${cy - 4} Z" fill="${cabelo}"/>`);
  }

  const oculos = !crianca && r() < 0.3
    ? `<g fill="none" stroke="#1F2937" stroke-width="1.6"><circle cx="${cx - 9}" cy="${cy + 1}" r="6"/><circle cx="${cx + 9}" cy="${cy + 1}" r="6"/><path d="M${cx - 3} ${cy + 1}h6"/></g>`
    : '';
  const barba = (feitio === 'homem' || feitio === 'senhor') && r() < 0.35
    ? `<path d="M${cx - rx + 3} ${cy + 6} Q${cx - rx + 6} ${cy + ry + 2} ${cx} ${cy + ry + 3} Q${cx + rx - 6} ${cy + ry + 2} ${cx + rx - 3} ${cy + 6} Q${cx} ${cy + 18} ${cx - rx + 3} ${cy + 6} Z" fill="${cabelo}" opacity=".9"/>`
    : '';
  const bochechas = crianca
    ? `<circle cx="${cx - 13}" cy="${cy + 10}" r="4" fill="#F472B6" opacity=".28"/><circle cx="${cx + 13}" cy="${cy + 10}" r="4" fill="#F472B6" opacity=".28"/>`
    : '';
  const largoSorriso = crianca ? 8 : 7;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="7 6 106 106" width="240" height="240">`
    + `<rect width="120" height="120" fill="${fundo}"/>`
    + atras.join('')
    + `<path d="M18 120 Q22 ${crianca ? 92 : 90} 60 ${crianca ? 90 : 88} Q98 ${crianca ? 92 : 90} 102 120 Z" fill="${roupa}"/>`
    + `<path d="M48 ${crianca ? 90 : 88} Q60 ${crianca ? 100 : 99} 72 ${crianca ? 90 : 88}" fill="none" stroke="${escurecer(roupa, 0.25)}" stroke-width="2.5"/>`
    + `<rect x="${cx - 8}" y="${cy + ry - 8}" width="16" height="16" rx="6" fill="${sombra}"/>`
    + `<ellipse cx="${cx - rx}" cy="${cy + 3}" rx="4" ry="5.5" fill="${sombra}"/><ellipse cx="${cx + rx}" cy="${cy + 3}" rx="4" ry="5.5" fill="${sombra}"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${pele}"/>`
    + barba
    + bochechas
    + `<path d="M${cx - 14} ${cy - 7} q5 -3.5 9 -0.5 M${cx + 5} ${cy - 7.5} q4 -3 9 0.5" fill="none" stroke="${escurecer(cabelo, 0.1)}" stroke-width="1.8" stroke-linecap="round"/>`
    + `<ellipse cx="${cx - 9}" cy="${cy + 1}" rx="${olho}" ry="${olho + 0.6}" fill="#1F2937"/><ellipse cx="${cx + 9}" cy="${cy + 1}" rx="${olho}" ry="${olho + 0.6}" fill="#1F2937"/>`
    + `<circle cx="${cx - 8.2}" cy="${cy}" r="0.9" fill="#fff"/><circle cx="${cx + 9.8}" cy="${cy}" r="0.9" fill="#fff"/>`
    + `<path d="M${cx - 1.5} ${cy + 6} q1.5 2.5 3 0" fill="none" stroke="${escurecer(pele, 0.28)}" stroke-width="1.4" stroke-linecap="round"/>`
    + `<path d="M${cx - largoSorriso} ${cy + 12} Q${cx} ${cy + 18} ${cx + largoSorriso} ${cy + 12}" fill="none" stroke="#9F1239" stroke-width="2.2" stroke-linecap="round"/>`
    + oculos
    + frente.join('')
    + `</svg>`;
}

/** O retrato pronto para guardar como a foto: base64 e o tipo. */
export function retratoFicticio(semente: string, feitio: Feitio): { conteudo: string; tipo: string } {
  const svg = retratoSvg(semente, feitio);
  const b64 = btoa(svg);
  return { conteudo: b64, tipo: 'image/svg+xml' };
}
