/**
 * OS RETRATOS FICTÍCIOS DO PROTÓTIPO, segunda versão (proposta da ilustração).
 *
 * Linguagem "recorte editorial": formas chapadas e orgânicas, sem contorno,
 * paleta terrosa e calma, poucos traços no rosto. É DESENHO, de propósito:
 * ninguém o confunde com a foto de uma criança.
 *
 * O que muda em relação à primeira versão:
 * - a idade muda o corpo (bebê, criança, adolescente, adulto), e não só o tamanho;
 * - o cabelo é uma silhueta que emoldura o rosto (atrás e na frente), com textura
 *   própria: liso, ondulado, cacheado, crespo, tranças, nagô, coque, puffs, raspado;
 * - a cor do cabelo e da boca nasce da pele, e não de um sorteio solto;
 * - a roupa usa tons apagados que nunca lembram as cores de estado da tela.
 *
 * Sem dependência. O mesmo nome dá sempre o mesmo retrato.
 */

export type Feitio = 'menina' | 'menino' | 'mulher' | 'homem' | 'senhora' | 'senhor';
export type Escolhas = { idade?: number; pele?: number; cabelo?: string; cor?: number; oculos?: boolean };

/* Do claro ao retinto. */
const PELES = ['#F7DAC4', '#EEC3A0', '#DFAA80', '#CA8E62', '#AE7449', '#8D5A39', '#6E432A', '#4E2E1D'];
const FIOS = ['#1D1512', '#2E2019', '#45301F', '#6A4630', '#9C6B44', '#CDA165', '#9A4A2B'];
const BRANCOS = ['#C9C4BD', '#9E9993', '#E7E3DC'];
const ROUPAS = ['#5E7FA8', '#6E9A7E', '#8E7CB0', '#4C8585', '#C08468', '#B98AA0', '#56657A', '#7F9C55', '#3F4C66', '#D9CBB4', '#A9884F'];
const FUNDOS = ['#E6EDF5', '#F3E7DE', '#E3EFE6', '#ECE6F3', '#F5EEDC', '#E1EEEE', '#F3E4E8', '#EAE8E1'];

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

/** Mistura duas cores: f=0 é a primeira, f=1 é a segunda. */
const mix = (a: string, b: string, f: number) => {
  const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * f).toString(16).padStart(2, '0')).join('');
};
const n = (v: number) => +v.toFixed(1);

/** Borda ondulada sobre uma elipse, de um ângulo a outro (graus, 0 = direita, sentido horário). */
function nuvem(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, bolas: number, k: number) {
  const pt = (a: number, f: number) => [n(cx + Math.cos(a * Math.PI / 180) * rx * f), n(cy + Math.sin(a * Math.PI / 180) * ry * f)];
  let d = `M${pt(a0, 1)}`;
  const passo = (a1 - a0) / bolas;
  for (let i = 0; i < bolas; i++) {
    const a = a0 + passo * i;
    d += `Q${pt(a + passo / 2, 1 + k)} ${pt(a + passo, 1)}`;
  }
  return d;
}

export function retratoSvg(semente: string, feitio: Feitio, e: Escolhas = {}): string {
  const r = sorteio(`${semente}|${feitio}`);
  const um = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const fem = /^(menina|mulher|senhora)$/.test(feitio);
  const velho = feitio[0] === 's';
  const crianca = feitio.startsWith('men');
  const idade = e.idade ?? (crianca ? 3 + Math.floor(r() * 13) : velho ? 66 : 28 + Math.floor(r() * 25));
  /* De 0 (recém-nascido) a 1 (adulto): é o que dá a proporção. */
  const t = Math.min(1, idade / 18);
  const bebe = idade < 3;

  const iPele = e.pele ?? Math.floor(r() * PELES.length);
  const pele = PELES[iPele];
  const sombra = mix(pele, '#3A1D12', 0.2);
  const boca = mix(pele, '#6E2422', iPele > 5 ? 0.45 : 0.38);
  const traco = mix('#21160F', pele, 0.08);
  const fios = velho ? um(BRANCOS)
    : um(iPele > 4 ? [0, 0, 1, 1, 2] : iPele > 2 ? [0, 1, 1, 2, 3, 4] : [1, 2, 3, 3, 4, 5, 5, 6]).toString();
  const cabelo = velho ? fios : FIOS[+fios];
  const brilho = mix(cabelo, '#FFFFFF', 0.14);
  const fundo = um(FUNDOS);
  const roupa = ROUPAS[e.cor ?? Math.floor(r() * ROUPAS.length)];

  /* A cabeça: o bebê é quase redondo, o adulto tem rosto mais longo e queixo. */
  const cx = 60;
  const w = 24 - t * 5.5;
  const h = w * (1 + t * 0.24);
  const cy = 54 - t * 2;
  const queixo = 0.62 - t * 0.2;
  const testa = cy - h * 0.1;
  const topo = cy - h * 0.81;
  const cara = `M${n(cx - w)} ${n(testa)}C${n(cx - w)} ${n(cy - h * 1.05)} ${n(cx + w)} ${n(cy - h * 1.05)} ${n(cx + w)} ${n(testa)}`
    + `C${n(cx + w)} ${n(cy + h * 0.55)} ${n(cx + w * queixo)} ${n(cy + h)} ${cx} ${n(cy + h)}`
    + `C${n(cx - w * queixo)} ${n(cy + h)} ${n(cx - w)} ${n(cy + h * 0.55)} ${n(cx - w)} ${n(testa)}Z`;

  /* O corpo: o bebê quase sem pescoço, o adulto com ombros largos. */
  const queixoY = cy + h;
  const pesc = w * (0.42 - t * 0.04);
  const ombroY = queixoY + 2 + t * 7;
  const ombro = 27 + t * 15;
  const corpo = `M${cx - ombro} 121V${n(ombroY + 16)}Q${cx - ombro} ${n(ombroY)} ${cx - ombro + 18} ${n(ombroY)}H${cx + ombro - 18}Q${cx + ombro} ${n(ombroY)} ${cx + ombro} ${n(ombroY + 16)}V121Z`;

  /* O cabelo: o que fica atrás da cabeça e o que cai na frente. */
  const estilos = bebe ? [iPele > 3 ? 'cachinho' : 'bebe']
    : velho ? (fem ? ['curtoF', 'coque', 'cacheado', 'chanel'] : ['careca', 'curto', 'raspado'])
    : fem ? (iPele > 3 ? ['crespo', 'trancas', 'puffs', 'cacheado', 'coque', 'nago', 'liso', 'rabo'] : ['liso', 'ondulado', 'cacheado', 'rabo', 'chanel', 'coque', 'trancas'])
    : (iPele > 3 ? ['raspado', 'crespo', 'curto', 'nago', 'cacheado', 'raspado'] : ['curto', 'ondulado', 'raspado', 'cacheado', 'curto']);
  const estilo = e.cabelo ?? um(estilos);
  const atras: string[] = [];
  const frente: string[] = [];
  const fill = (d: string, c = cabelo, x = '') => `<path d="${d}" fill="${c}"${x}/>`;
  /* A calota: cobre o crânio até a têmpora; a borda da frente muda com o penteado. */
  const calota = (borda: string, desce = 0.12, g = 3.2) => {
    const yd = cy + h * desce, ys = Math.min(yd - 2, cy - h * 0.3);
    return `M${n(cx - w + 1.5)} ${n(yd)}C${n(cx - w - g * 0.6)} ${n(yd - 2)} ${n(cx - w - g)} ${n(ys + 4)} ${n(cx - w - g)} ${n(ys)}`
      + `C${n(cx - w - g)} ${n(cy - h * 1.12 - g)} ${n(cx + w + g)} ${n(cy - h * 1.12 - g)} ${n(cx + w + g)} ${n(ys)}`
      + `C${n(cx + w + g)} ${n(ys + 4)} ${n(cx + w + g * 0.6)} ${n(yd - 2)} ${n(cx + w - 1.5)} ${n(yd)}` + borda + 'Z';
  };
  /* Bordas da franja (vão da têmpora direita à esquerda). */
  const risca = `C${n(cx + w - 2)} ${n(cy - h * 0.5)} ${n(cx + w * 0.2)} ${n(topo + 5)} ${n(cx - w * 0.15)} ${n(topo + 3)}`
    + `C${n(cx - w * 0.55)} ${n(topo + 9)} ${n(cx - w + 1)} ${n(cy - h * 0.35)} ${n(cx - w + 1)} ${n(cy + h * 0.12)}`;
  const meio = `C${n(cx + w - 2)} ${n(cy - h * 0.6)} ${n(cx + 4)} ${n(topo + 6)} ${cx} ${n(topo + 3)}`
    + `C${n(cx - 4)} ${n(topo + 6)} ${n(cx - w + 2)} ${n(cy - h * 0.6)} ${n(cx - w + 1)} ${n(cy + h * 0.12)}`;
  const reta = (y: number) => `C${n(cx + w)} ${n(y)} ${n(cx + w * 0.6)} ${n(y)} ${cx} ${n(y)}C${n(cx - w * 0.6)} ${n(y)} ${n(cx - w)} ${n(y)} ${n(cx - w + 1)} ${n(cy + h * 0.12)}`;
  const linha = (y: number) => `C${n(cx + w - 1)} ${n(y + 3)} ${n(cx + w * 0.5)} ${n(y)} ${cx} ${n(y)}C${n(cx - w * 0.5)} ${n(y)} ${n(cx - w + 1)} ${n(y + 3)} ${n(cx - w + 1)} ${n(cy + h * 0.12)}`;
  const longoAte = (y: number, onda: boolean) => {
    const L = cx - w - 5.2, R = cx + w + 5.2;
    if (!onda) return `M${L} ${n(cy - h * 0.3)}C${L - 1} ${n(y - 6)} ${L} ${y} ${L + 8} ${y}H${R - 8}C${R} ${y} ${R + 1} ${n(y - 6)} ${R} ${n(cy - h * 0.3)}Z`;
    let d = `M${L} ${n(cy - h * 0.3)}`;
    for (let yy = cy - h * 0.3, s = 1; yy < y - 8; yy += 10, s = -s) d += `Q${L - 3 * s - 2} ${n(yy + 5)} ${L - 1} ${n(yy + 10)}`;
    d += `Q${L} ${y} ${L + 9} ${y}H${R - 9}Q${R} ${y} ${R + 1}`;
    let yy = y - 8; d += ` ${n(yy)}`;
    for (let s = 1; yy > cy - h * 0.3 + 4; yy -= 10, s = -s) d += `Q${R + 3 * s + 2} ${n(yy - 5)} ${R} ${n(yy - 10)}`;
    return d + 'Z';
  };
  switch (estilo) {
    case 'liso': case 'ondulado':
      atras.push(fill(longoAte(fem ? ombroY + 14 + r() * 10 : queixoY + 3, estilo === 'ondulado')));
      frente.push(fill(calota(r() < 0.5 ? risca : meio)));
      break;
    case 'chanel':
      atras.push(fill(longoAte(queixoY + 2, false)));
      frente.push(fill(calota(risca)));
      break;
    case 'rabo':
      atras.push(fill(`M${n(cx + w - 2)} ${n(topo + 4)}C${n(cx + w + 16)} ${n(topo)} ${n(cx + w + 14)} ${n(cy + h * 0.7)} ${n(cx + w + 4)} ${n(queixoY + 8)}C${n(cx + w + 2)} ${n(cy + h * 0.4)} ${n(cx + w - 2)} ${n(cy - h * 0.2)} ${n(cx + w - 6)} ${n(topo + 10)}Z`));
      frente.push(fill(calota(meio, 0.02)));
      break;
    case 'coque':
      frente.push(`<circle cx="${cx}" cy="${n(topo - 7)}" r="${8.5 + (iPele > 3 ? 1 : 0)}" fill="${cabelo}"/>`);
      frente.push(fill(calota(meio, 0.02)));
      break;
    case 'puffs':
      for (const s of [-1, 1]) atras.push(fill(nuvem(cx + s * (w + 3), topo + 2, 9.5, 9, 0, 360, 9, 0.08) + 'Z'));
      frente.push(fill(calota(meio, 0.02)));
      break;
    case 'crespo': {
      const R = w + 7 + r() * 2;
      atras.push(fill(nuvem(cx, cy - h * 0.32, R, R * 0.9, 140, 400, 12, 0.07) + `Q${cx} ${n(cy + h * 0.2)} ${n(cx + Math.cos(2.44) * R)} ${n(cy - h * 0.32 + Math.sin(2.44) * R * 0.9)}Z`));
      frente.push(fill(calota(nuvem(cx, cy - h * 0.2, w - 1, h * 0.62, 5, -185, 6, -0.07).replace(/^M[^QC]+/, ''))));
      break;
    }
    case 'cacheado':
      atras.push(fill(nuvem(cx, cy - h * 0.1, w + 5, fem ? h * 1.15 : h * 0.85, 150, 390, 12, 0.08) + 'Z'));
      frente.push(fill(calota(nuvem(cx, cy - h * 0.28, w - 1, h * 0.55, 5, -185, 7, 0.12).replace(/^M[^QC]+/, ''))));
      break;
    case 'bebe': case 'cachinho': {
      const a = cy - h * (estilo === 'bebe' ? 0.5 : 0.3);
      frente.push(fill(`M${n(cx - w * 0.78)} ${n(a)}C${n(cx - w * 0.6)} ${n(topo - 3)} ${n(cx + w * 0.6)} ${n(topo - 3)} ${n(cx + w * 0.78)} ${n(a)}`
        + (estilo === 'bebe' ? `C${n(cx + w * 0.4)} ${n(topo + 6)} ${n(cx - w * 0.4)} ${n(topo + 6)} ${n(cx - w * 0.78)} ${n(a)}Z`
          : nuvem(cx, a + 2, w * 0.78, h * 0.36, -5, -175, 6, -0.12).replace(/^M[^QC]+/, '') + 'Z'), mix(cabelo, pele, estilo === 'bebe' ? 0.45 : 0.15)));
      if (estilo === 'bebe') frente.push(`<path d="M${n(cx - 2)} ${n(topo + 2)}c0 -4 3 -6 6 -5c-3 1 -4 3 -3 6z" fill="${mix(cabelo, pele, 0.3)}"/>`);
      break;
    }
    case 'trancas': {
      const fim = ombroY + 16 + r() * 8;
      const mios: string[] = [];
      for (let i = 0; i < 10; i++) {
        const s = i < 5 ? -1 : 1, k = i < 5 ? i : 9 - i;
        const x = cx + s * (w + 2.5 - k * 2.6);
        mios.push(`M${n(x)} ${n(cy - h * 0.45)}Q${n(x + s * 2)} ${n(cy + h * 0.4)} ${n(x + s * (3 - k * 0.4))} ${n(fim - k * 2)}`);
      }
      const d = mios.join('');
      atras.push(`<g fill="none" stroke-linecap="round"><path d="${d}" stroke="${cabelo}" stroke-width="4.6"/><path d="${d}" stroke="${brilho}" stroke-width="1" stroke-dasharray="1.6 2.4"/></g>`);
      frente.push(fill(calota(meio)));
      frente.push(`<path d="M${cx} ${n(topo - 1)}V${n(topo + 4)}" stroke="${mix(cabelo, pele, 0.4)}" stroke-width="1"/>`);
      break;
    }
    case 'nago': {
      frente.push(fill(calota(linha(topo + 8), 0.02)));
      const linhas: string[] = [];
      for (let i = -2; i <= 2; i++) linhas.push(`M${n(cx + i * w * 0.34)} ${n(topo + 7.5 - Math.abs(i) * 0.6)}Q${n(cx + i * w * 0.3)} ${n(topo + 1)} ${n(cx + i * w * 0.12)} ${n(topo - 3.5)}`);
      frente.push(`<path d="${linhas.join('')}" fill="none" stroke="${brilho}" stroke-width=".9" stroke-linecap="round"/>`);
      if (fem) atras.push(`<circle cx="${cx}" cy="${n(topo - 6)}" r="8.5" fill="${cabelo}"/>`);
      break;
    }
    case 'curtoF':
      frente.push(fill(calota(risca, 0.3)));
      break;
    case 'raspado':
      frente.push(fill(calota(`Q${n(cx + w - 3)} ${n(topo + 9)} ${n(cx + w * 0.45)} ${n(topo + 7)}Q${cx} ${n(topo + 5)} ${n(cx - w * 0.45)} ${n(topo + 7)}Q${n(cx - w + 3)} ${n(topo + 9)} ${n(cx - w + 1.5)} ${n(cy - h * 0.12)}`, -0.12, 0.7), mix(cabelo, pele, 0.28)));
      break;
    case 'careca':
      frente.push(fill(`M${n(cx - w - 1)} ${n(cy + 2)}C${n(cx - w - 1)} ${n(cy - h * 0.4)} ${n(cx - w + 2)} ${n(cy - h * 0.55)} ${n(cx - w + 4)} ${n(cy - h * 0.55)}L${n(cx - w + 2)} ${n(cy + 2)}Z`
        + `M${n(cx + w + 1)} ${n(cy + 2)}C${n(cx + w + 1)} ${n(cy - h * 0.4)} ${n(cx + w - 2)} ${n(cy - h * 0.55)} ${n(cx + w - 4)} ${n(cy - h * 0.55)}L${n(cx + w - 2)} ${n(cy + 2)}Z`));
      break;
    default: // curto
      frente.push(fill(calota(`C${n(cx + w - 2)} ${n(topo + 9)} ${n(cx + w * 0.3)} ${n(topo + 10)} ${n(cx - w * 0.2)} ${n(topo + 7)}C${n(cx - w * 0.6)} ${n(topo + 6)} ${n(cx - w + 1)} ${n(topo + 9)} ${n(cx - w + 1)} ${n(cy + h * 0.12)}`, -0.02, 2)));
  }

  if (!/crespo|cache|raspado|careca|bebe|cachinho|nago|puffs/.test(estilo))
    frente.push(`<path d="M${n(cx - w * 0.62)} ${n(topo + 1)}Q${n(cx - w * 0.3)} ${n(topo - 4)} ${n(cx + w * 0.05)} ${n(topo - 4)}" fill="none" stroke="${brilho}" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>`);

  /* O rosto: olhos baixos no bebê, sobrancelha leve, boca pequena e calma. */
  const olhoY = cy + h * (0.22 - t * 0.17);
  const ex = w * (0.4 - t * 0.02);
  const ro = 2.5 - t * 0.6;
  const semblante = r();
  const olhos = bebe && semblante < 0.35
    ? `<path d="M${n(cx - ex - 2.6)} ${n(olhoY)}q2.6 2.4 5.2 0M${n(cx + ex - 2.6)} ${n(olhoY)}q2.6 2.4 5.2 0" fill="none" stroke="${traco}" stroke-width="1.5" stroke-linecap="round"/>`
    : `<g fill="${traco}"><ellipse cx="${n(cx - ex)}" cy="${n(olhoY)}" rx="${n(ro * 0.85)}" ry="${n(ro)}"/><ellipse cx="${n(cx + ex)}" cy="${n(olhoY)}" rx="${n(ro * 0.85)}" ry="${n(ro)}"/></g>`
      + `<g fill="#fff" opacity=".85"><circle cx="${n(cx - ex + 0.7)}" cy="${n(olhoY - 0.8)}" r=".7"/><circle cx="${n(cx + ex + 0.7)}" cy="${n(olhoY - 0.8)}" r=".7"/></g>`;
  const sobY = olhoY - 5 - t * 1.5;
  const corSob = velho ? mix(cabelo, traco, 0.4) : mix(cabelo, traco, 0.3);
  const sobr = bebe ? '' : `<path d="M${n(cx - ex - 3.2)} ${n(sobY + 0.6)}q3.2 -1.8 6.2 -0.4M${n(cx + ex + 3.2)} ${n(sobY + 0.6)}q-3.2 -1.8 -6.2 -0.4" fill="none" stroke="${corSob}" stroke-width="${n(1.3 + t * 0.4)}" stroke-linecap="round"/>`;
  const narizY = olhoY + 4 + t * 3;
  const nariz = `<path d="M${n(cx - 1.6)} ${n(narizY)}q1.6 1.3 3.2 0" fill="none" stroke="${sombra}" stroke-width="1.4" stroke-linecap="round"/>`;
  const bocaY = narizY + 4.2 + t * 1.2;
  const lb = 3.4 + t * 0.6;
  const sorriso = semblante > 0.55
    ? `<path d="M${n(cx - lb)} ${n(bocaY - 0.4)}Q${cx} ${n(bocaY + 3.6)} ${n(cx + lb)} ${n(bocaY - 0.4)}Z" fill="${boca}"/>`
    : `<path d="M${n(cx - lb)} ${n(bocaY)}q${n(lb)} ${n(2.2)} ${n(lb * 2)} 0" fill="none" stroke="${boca}" stroke-width="1.5" stroke-linecap="round"/>`;
  const rubor = mix(pele, '#F0907A', iPele > 4 ? 0.28 : 0.34);
  const bochecha = `<g fill="${rubor}" opacity=".55"><ellipse cx="${n(cx - ex - 2.5)}" cy="${n(narizY + 2)}" rx="3.6" ry="2.3"/><ellipse cx="${n(cx + ex + 2.5)}" cy="${n(narizY + 2)}" rx="3.6" ry="2.3"/></g>`;

  const oculos = e.oculos ?? (!crianca && r() < 0.3)
    ? `<g fill="none" stroke="${mix(traco, roupa, 0.25)}" stroke-width="1.1"><rect x="${n(cx - ex - 5)}" y="${n(olhoY - 4)}" width="10" height="8" rx="3.5"/><rect x="${n(cx + ex - 5)}" y="${n(olhoY - 4)}" width="10" height="8" rx="3.5"/><path d="M${n(cx - ex + 5)} ${n(olhoY - 1)}q${n(ex - 5)} -2 ${n(2 * ex - 10)} 0"/></g>`
    : '';
  const barba = feitio.endsWith('m') || feitio === 'senhor'
    ? (r() < 0.35 ? fill(`M${n(cx - w + 0.5)} ${n(cy + h * 0.1)}C${n(cx - w + 1)} ${n(cy + h * 0.8)} ${n(cx - w * 0.4)} ${n(cy + h + 1.5)} ${cx} ${n(cy + h + 1.5)}C${n(cx + w * 0.4)} ${n(cy + h + 1.5)} ${n(cx + w - 1)} ${n(cy + h * 0.75)} ${n(cx + w - 0.5)} ${n(cy + h * 0.1)}C${n(cx + w * 0.45)} ${n(bocaY - 2.5)} ${n(cx - w * 0.45)} ${n(bocaY - 2.5)} ${n(cx - w + 0.5)} ${n(cy + h * 0.1)}Z`
      + `M${n(cx - lb - 1.5)} ${n(bocaY + 1)}Q${cx} ${n(bocaY + 6)} ${n(cx + lb + 1.5)} ${n(bocaY + 1)}Q${cx} ${n(bocaY + 3)} ${n(cx - lb - 1.5)} ${n(bocaY + 1)}Z`, velho ? mix(cabelo, pele, 0.25) : cabelo, ' fill-rule="evenodd" opacity=".92"') : '')
    : '';

  /* A gola: careca, em V ou com capuz; o bebê de macacão. */
  const gola = r();
  const decote = bebe || gola < 0.45
    ? `M${n(cx - pesc - 2)} ${n(ombroY - 0.5)}Q${cx} ${n(ombroY + 8)} ${n(cx + pesc + 2)} ${n(ombroY - 0.5)}Z`
    : gola < 0.75 ? `M${n(cx - pesc - 1)} ${n(ombroY - 0.5)}L${cx} ${n(ombroY + 11)}L${n(cx + pesc + 1)} ${n(ombroY - 0.5)}Z`
    : `M${n(cx - pesc - 1)} ${n(ombroY - 0.5)}Q${cx} ${n(ombroY + 7)} ${n(cx + pesc + 1)} ${n(ombroY - 0.5)}Z`;
  const capuz = !bebe && gola >= 0.75
    ? `<path d="M${n(cx - pesc - 9)} ${n(ombroY + 1)}Q${cx} ${n(ombroY + 16)} ${n(cx + pesc + 9)} ${n(ombroY + 1)}" fill="none" stroke="${mix(roupa, '#000000', 0.16)}" stroke-width="3.2" stroke-linecap="round"/><path d="M${cx - 4} ${n(ombroY + 9)}v8M${cx + 4} ${n(ombroY + 9)}v8" stroke="${mix(roupa, '#ffffff', 0.5)}" stroke-width="1.2" stroke-linecap="round"/>`
    : bebe ? `<g fill="${mix(roupa, '#ffffff', 0.55)}"><circle cx="${cx}" cy="${n(ombroY + 12)}" r="1.3"/><circle cx="${cx}" cy="${n(ombroY + 18)}" r="1.3"/></g>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="16 13 88 88" width="240" height="240">`
    + `<rect width="120" height="120" fill="${fundo}"/>`
    + `<circle cx="${n(cx + 14 - r() * 28)}" cy="${n(64 + r() * 12)}" r="${n(40 + r() * 6)}" fill="${mix(fundo, '#ffffff', 0.4)}"/>`
    + atras.join('')
    + `<path d="M${n(cx - pesc)} ${n(cy + h * 0.5)}V${n(ombroY + 4)}H${n(cx + pesc)}V${n(cy + h * 0.5)}Z" fill="${sombra}"/>`
    + `<path d="${corpo}" fill="${roupa}"/>`
    + `<path d="${decote}" fill="${sombra}"/>`
    + capuz
    + `<g fill="${sombra}"><ellipse cx="${n(cx - w + 0.5)}" cy="${n(olhoY + 2)}" rx="3.4" ry="4.4"/><ellipse cx="${n(cx + w - 0.5)}" cy="${n(olhoY + 2)}" rx="3.4" ry="4.4"/></g>`
    + `<path d="${cara}" fill="${pele}"/>`
    + `<g id="rosto">${bochecha + barba + nariz + sorriso + olhos + sobr + oculos}</g>`
    + frente.join('')
    + `</svg>`;
}

export function retratoFicticio(semente: string, feitio: Feitio, e: Escolhas = {}): { conteudo: string; tipo: string } {
  return { conteudo: btoa(retratoSvg(semente, feitio, e)), tipo: 'image/svg+xml' };
}
