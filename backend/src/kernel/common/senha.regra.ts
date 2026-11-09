/**
 * A REGRA DA SENHA (fase 291; decisão do dono do projeto em 08/11).
 *
 * Pelo menos 8 caracteres, com uma letra maiúscula e um símbolo. Vale para toda
 * senha que alguém escreve: a pessoal, a do primeiro acesso pelo convite, a do
 * esqueci minha senha, a inicial que a coordenação escolhe e a redefinida. A
 * senha que já existe continua entrando; a regra pesa quando a senha é escrita.
 *
 * Este arquivo não importa nada: o servidor, a tela e o protótipo leem o mesmo,
 * como o `alcance.ts`. Duas cópias da mesma regra divergem no primeiro ajuste.
 */
export const SENHA_MINIMO = 8;

/** O que a pessoa lê quando a senha não serve. Diz o que fazer, sem argumentar. */
export const FRASE_DA_SENHA =
  'A senha precisa de pelo menos 8 caracteres, com uma letra maiúscula e um símbolo, como ! @ # - ou ponto.';

/** Letra maiúscula de qualquer alfabeto (inclui Á, Ç). */
const MAIUSCULA = /\p{Lu}/u;
/** Símbolo: o que não é letra, número nem espaço. */
/* Pontuação ou símbolo que se vê: o espaço, o caractere invisível e o acento solto não contam. */
const SIMBOLO = /[\p{P}\p{S}]/u;

/** A senha segue a regra? */
export function senhaAceita(senha: unknown): boolean {
  if (typeof senha !== 'string') return false;
  return [...senha].length >= SENHA_MINIMO && MAIUSCULA.test(senha) && SIMBOLO.test(senha);
}

/** O que falta, para a tela dizer junto do campo enquanto a pessoa digita. */
export function oQueFaltaNaSenha(senha: string): string[] {
  const falta: string[] = [];
  if ([...(senha ?? '')].length < SENHA_MINIMO) falta.push('pelo menos 8 caracteres');
  if (!MAIUSCULA.test(senha ?? '')) falta.push('uma letra maiúscula');
  if (!SIMBOLO.test(senha ?? '')) falta.push('um símbolo');
  return falta;
}

/**
 * A SENHA INICIAL: duas palavras e quatro algarismos (*Farol-pipa-0427*), legível para
 * ditar por telefone, e na regra (maiúscula e hífen). 64 palavras, uns 41 milhões de
 * combinações. Quem sorteia é de fora, porque o servidor e o protótipo sorteiam por
 * caminhos diferentes, e os dois para segredo: o `randomInt` do `node:crypto` e o
 * `crypto.getRandomValues` do navegador. Nunca o `Math.random`.
 */
export const PALAVRAS_DA_SENHA = [
  'acolher', 'cuidado', 'plantao', 'unidade', 'equipe', 'rotina', 'abrigo', 'jardim',
  'janela', 'caderno', 'lapis', 'mochila', 'parque', 'quintal', 'varanda', 'ponte',
  'barco', 'nuvem', 'chuva', 'vento', 'estrela', 'lua', 'sol', 'rio',
  'campo', 'trilha', 'colina', 'praia', 'onda', 'farol', 'ilha', 'serra',
  'pinheiro', 'figueira', 'ipe', 'girassol', 'violeta', 'orquidea', 'canela', 'cravo',
  'laranja', 'goiaba', 'pitanga', 'butia', 'bergamota', 'amora', 'caju', 'manga',
  'tucano', 'sabia', 'joao', 'quero', 'gaivota', 'coruja', 'tatu', 'capivara',
  'tambor', 'viola', 'cuica', 'flauta', 'ciranda', 'roda', 'pipa', 'peteca',
];

/** `sortear(n)` devolve um inteiro de 0 a n - 1, de um sorteio próprio para segredo. */
export function senhaInicialSorteada(sortear: (n: number) => number): string {
  const a = PALAVRAS_DA_SENHA[sortear(PALAVRAS_DA_SENHA.length)];
  const b = PALAVRAS_DA_SENHA[sortear(PALAVRAS_DA_SENHA.length)];
  const n = String(sortear(10000)).padStart(4, '0');
  return `${a[0].toUpperCase()}${a.slice(1)}-${b}-${n}`;
}
