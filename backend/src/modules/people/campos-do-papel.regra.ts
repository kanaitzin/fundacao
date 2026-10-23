/**
 * OS CAMPOS DO CADASTRO SUGERIDOS PELO PAPEL CONFERIDO (fase 235).
 *
 * A certidão de nascimento, o RG e o cartão do SUS chegam depois do acolhimento,
 * e o nome escrito de ouvido no ingresso de emergência é corrigido à mão. Com o
 * texto do papel conferido (fase 234), estas regras SUGEREM o nome, a data de
 * nascimento, o RG, o CNS e a filiação, cada um com o trecho de onde saiu. Nada
 * aqui grava, junta pessoas ou decide: a folha de corrigir mostra a sugestão, a
 * pessoa marca o que quer, confere e corrige com o motivo de sempre.
 *
 * Sem dependência de nada: o servidor e a tela leem a mesma regra, e o teste a
 * cobra com os papéis como eles chegam (maiúsculas, rótulos com e sem dois-pontos,
 * a data por extenso).
 */

export type CampoDoPapel = 'nome' | 'nascimento' | 'rg' | 'cns' | 'filiacao';

export interface SugestaoDoPapel {
  campo: CampoDoPapel;
  /** O valor no formato do campo: a data em AAAA-MM-DD, a filiação um nome por linha. */
  valor: string;
  /** O trecho do papel de onde saiu, para conferir. */
  trecho: string;
}

export const ROTULO_DO_CAMPO: Record<CampoDoPapel, string> = {
  nome: 'Nome civil', nascimento: 'Data de nascimento', rg: 'RG', cns: 'Cartão SUS', filiacao: 'Filiação',
};

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Nome como se escreve no cadastro: cada palavra com a primeira maiúscula, e "de", "da", "dos" minúsculos. */
export function nomeArrumado(t: string): string {
  return t.trim().replace(/\s+/g, ' ').toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && /^(d[aeo]s?|e)$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

const NOME = "[A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ' ]{3,90}[A-Za-zÀ-ÿ]";
const ehNome = (t: string) => {
  const p = t.trim().split(/\s+/);
  return p.length >= 2 && p.length <= 8 && !/\d/.test(t)
    && !/\b(nome|data|nascimento|filia|pai|mae|naturalidade|sexo|registro|cartorio|av[oó]s?)\b/i.test(semAcento(t));
};

function dataValida(a: number, m: number, d: number): string | null {
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** As linhas do papel, sem as vazias, com o trecho original guardado. */
const linhasDe = (texto: string) => texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function acharNome(linhas: string[]): SugestaoDoPapel | null {
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const s = semAcento(l).toLowerCase();
    if (!/^nome\b/.test(s) || /\b(pai|mae|genitor|declarante|cartorio|oficial|registrador)\b/.test(s)) continue;
    const resto = l.replace(/^nome(\s+(completo|civil|do registrado|da registrada))?\s*[:\-]?\s*/i, '');
    if (resto && ehNome(resto)) return { campo: 'nome', valor: nomeArrumado(resto), trecho: l };
    const prox = linhas[i + 1];
    if (!resto && prox && ehNome(prox)) return { campo: 'nome', valor: nomeArrumado(prox), trecho: `${l} ${prox}` };
  }
  return null;
}

function acharNascimento(texto: string): SugestaoDoPapel | null {
  const t = semAcento(texto);
  const numero = /data\s+de\s+nascimento[^0-9\n]{0,40}(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})/i.exec(t)
    ?? /\bnascid[oa]\s+em[^0-9\n]{0,10}(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})/i.exec(t);
  if (numero) {
    const v = dataValida(Number(numero[3]), Number(numero[2]), Number(numero[1]));
    if (v) return { campo: 'nascimento', valor: v, trecho: texto.slice(numero.index, numero.index + numero[0].length) };
  }
  const extenso = /(?:data\s+de\s+nascimento|nascid[oa]\s+em)[^0-9\n]{0,40}(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i.exec(t);
  if (extenso) {
    const m = MESES[extenso[2].toLowerCase()];
    const v = m ? dataValida(Number(extenso[3]), m, Number(extenso[1])) : null;
    if (v) return { campo: 'nascimento', valor: v, trecho: texto.slice(extenso.index, extenso.index + extenso[0].length) };
  }
  return null;
}

function acharRg(texto: string): SugestaoDoPapel | null {
  const r = /\b(?:RG|R\.G\.|registro\s+geral|carteira\s+de\s+identidade|identidade)\b[^0-9\n]{0,25}(\d[\d.\-]{4,14}[\dxX])/i.exec(texto);
  return r ? { campo: 'rg', valor: r[1], trecho: r[0] } : null;
}

function acharCns(texto: string): SugestaoDoPapel | null {
  const r = /\b(?:CNS|cart[aã]o\s+(?:nacional\s+de\s+sa[uú]de|do\s+sus|sus))\b[^0-9\n]{0,25}((?:\d[\s.]?){15})/i.exec(texto);
  if (!r) return null;
  const digitos = r[1].replace(/\D/g, '');
  return digitos.length === 15 ? { campo: 'cns', valor: digitos, trecho: r[0].trim() } : null;
}

function acharFiliacao(linhas: string[]): SugestaoDoPapel | null {
  const nomes: string[] = [];
  const trechos: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const s = semAcento(l).toLowerCase();
    const rotulado = /^(?:nome\s+d[ao]\s+)?(mae|pai|genitora|genitor)\b\s*[:\-]?\s*(.*)$/.exec(s);
    if (rotulado) {
      const resto = l.slice(l.length - rotulado[2].length);
      if (resto && ehNome(resto)) { nomes.push(nomeArrumado(resto)); trechos.push(l); }
      continue;
    }
    if (/^filiacao\b/.test(s)) {
      const resto = l.replace(/^filia[cç][aã]o\s*[:\-]?\s*/i, '');
      const candidatos = [resto, linhas[i + 1], linhas[i + 2]].filter((x): x is string => !!x);
      for (const c of candidatos) {
        if (/^(av[oó]s?|naturalidade|data|sexo)\b/i.test(semAcento(c))) break;
        for (const parte of c.split(/\s+e\s+|;|,/)) {
          if (ehNome(parte) && nomes.length < 2) { nomes.push(nomeArrumado(parte)); }
        }
        trechos.push(c);
        if (nomes.length >= 2) break;
      }
    }
  }
  const unicos = nomes.filter((n, k) => nomes.indexOf(n) === k).slice(0, 2);
  return unicos.length ? { campo: 'filiacao', valor: unicos.join('\n'), trecho: trechos.join(' / ') } : null;
}

/** As sugestões que o papel sustenta. O que ele não diz claramente, não entra. */
export function camposDoPapel(texto: string): SugestaoDoPapel[] {
  if (!texto?.trim()) return [];
  const linhas = linhasDe(texto);
  return [acharNome(linhas), acharNascimento(texto), acharRg(texto), acharCns(texto), acharFiliacao(linhas)]
    .filter((x): x is SugestaoDoPapel => !!x);
}

/**
 * O nome do papel parece de outra pessoa? Compara as palavras dos dois nomes:
 * menos da metade em comum é aviso para conferir se o papel é desta criança.
 */
export function nomeDiferente(doCadastro: string, doPapel: string): boolean {
  const palavras = (t: string) => new Set(semAcento(t).toLowerCase().split(/\s+/).filter((p) => p.length > 2));
  const a = palavras(doCadastro);
  const b = palavras(doPapel);
  if (!a.size || !b.size) return false;
  const comum = [...b].filter((p) => a.has(p)).length;
  return comum / Math.min(a.size, b.size) < 0.5;
}
