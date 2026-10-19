/**
 * A regra da explicação recolhida (fase 230): quando o texto se recolhe, e o
 * que fica à vista. Não importa nada, para a suíte do servidor ler a mesma.
 */

/** Até aqui, o texto fica inteiro: recolher duas linhas não ajuda ninguém. */
export const PALAVRAS_SEM_RECOLHER = 20;

export const palavras = (t: string) => (t.trim().match(/\S+/g) ?? []).length;

/** A primeira frase de um texto, ou nada quando ele é uma frase só. */
export function primeiraFrase(texto: string): string | null {
  const m = /^(.+?[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ“"])/u.exec(texto.trim());
  if (!m) return null;
  const resto = texto.trim().slice(m[1].length).trim();
  return resto.length > 0 ? m[1] : null;
}

/**
 * A frase que diz o que o número NÃO é (não avalia a criança, não compara casas,
 * quem avalia é a equipe técnica) protege quem é contado, e fica à vista: quem
 * lê o número às 19h tem de ler a frase junto. Texto que a traz depois da
 * primeira frase não se recolhe.
 */
export const FRASE_QUE_PROTEGE =
  /não (é|são) avalia|não (é|são) julgamento|não compara|não ordena|não avalia|quem avalia|não julga|não mede|não é nota|não pontua|nunca (é|como|por|julg|avalia)|o que (ele|ela|eles|elas|isso) significa/i;

/** O que fica à vista de um texto puro, ou nada quando ele fica inteiro. */
export function resumoDoTexto(texto: string): string | null {
  if (palavras(texto) <= PALAVRAS_SEM_RECOLHER) return null;
  const primeira = primeiraFrase(texto);
  if (!primeira) return null;
  return FRASE_QUE_PROTEGE.test(texto.trim().slice(primeira.length)) ? null : primeira;
}
