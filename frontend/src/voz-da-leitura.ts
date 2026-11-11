/**
 * A VOZ DA LEITURA EM VOZ ALTA (fase 311, pedido de 11/11: "a voz da IA é bem ruim,
 * arrastada e lenta; tem como colocar mais modelos de voz?").
 *
 * A Acolhe+AI lê com as vozes que o aparelho tem. Até aqui ela pegava a PRIMEIRA voz
 * em português da lista, que costuma ser a mais antiga e robótica, na velocidade
 * padrão. Agora ela escolhe a melhor que o aparelho oferece (as vozes naturais,
 * neurais ou aprimoradas primeiro, o português do Brasil antes do de Portugal), fala
 * um pouco mais ágil, e a pessoa pode trocar a voz e a velocidade na folha Voz da leitura.
 *
 * As vozes que leem pela internet (no Chrome, as do Google; no Edge, as naturais da
 * Microsoft) mandam o texto lido ao serviço delas. Por isso, sem escolha da pessoa, a
 * Acolhe+AI fica numa voz DESTE aparelho quando há uma; a da internet aparece na lista
 * com o aviso, e só lê se a pessoa escolher. O que fica guardado é a escolha, neste
 * aparelho, e nada mais.
 */

const CHAVE_VOZ = 'rede-acolher.voz-da-leitura';
const CHAVE_VELOCIDADE = 'rede-acolher.velocidade-da-leitura';

export const VELOCIDADES = [
  { valor: 1, rotulo: 'Calma' },
  { valor: 1.15, rotulo: 'Normal' },
  { valor: 1.3, rotulo: 'Rápida' },
] as const;
export const VELOCIDADE_PADRAO = 1.15;

/** O que a leitura usa de uma voz do aparelho, sem depender dos tipos do navegador (a suíte do servidor lê este arquivo). */
interface Voz { name: string; lang: string; localService: boolean; voiceURI: string }
interface Fala { lang: string; voice: unknown; rate: number; pitch: number }
interface Sintese {
  getVoices(): Voz[];
  addEventListener?(e: string, f: () => void): void;
  removeEventListener?(e: string, f: () => void): void;
}
const sintese = (): Sintese | null => {
  const w = (globalThis as { window?: { speechSynthesis?: Sintese } }).window;
  return w?.speechSynthesis ?? null;
};

export interface VozDoAparelho {
  id: string;
  nome: string;
  lingua: string;
  doAparelho: boolean;
}

/* O que diz que a voz é das boas: as naturais e neurais do Edge e do Windows, as
   aprimoradas e premium da Apple, e as do Google no Android e no Chrome. */
const BOA = /natural|neural|premium|enhanced|aprimorad|melhorad|online|google|luciana|francisca|thalita|antonio|felipe|fernanda|vitoria|vitória|daniel/i;
/* As antigas, que soam robóticas. */
const RUIM = /espeak|compact|maria(?!.*natural)|helena(?!.*natural)|desktop/i;

type Guarda = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const guarda = (): Guarda | undefined => (globalThis as { localStorage?: Guarda }).localStorage;
const ler = (chave: string): string | null => { try { return guarda()?.getItem(chave) ?? null; } catch { return null; } };
const gravar = (chave: string, valor: string) => { try { guarda()?.setItem(chave, valor); } catch { /* sem guarda */ } };

function pontos(v: Voz): number {
  const lingua = (v.lang ?? '').toLowerCase().replace('_', '-');
  let p = 0;
  if (lingua === 'pt-br') p += 40;
  else if (lingua.startsWith('pt')) p += 10;
  if (BOA.test(v.name)) p += 30;
  if (RUIM.test(v.name)) p -= 25;
  if (v.localService) p += 15;
  return p;
}

/** As vozes em português que o aparelho tem, da melhor para a pior. */
export function vozesEmPortugues(): Voz[] {
  const s = sintese();
  if (!s) return [];
  return s.getVoices()
    .filter((v) => (v.lang ?? '').toLowerCase().startsWith('pt'))
    .sort((a, b) => pontos(b) - pontos(a) || a.name.localeCompare(b.name));
}

export function listarVozes(): VozDoAparelho[] {
  return vozesEmPortugues().map((v) => ({ id: v.voiceURI || v.name, nome: v.name, lingua: v.lang, doAparelho: v.localService }));
}

/** A voz que lê: a escolhida neste aparelho, ou a melhor DESTE aparelho, ou a melhor que houver. */
export function vozDaLeitura(): Voz | undefined {
  const vozes = vozesEmPortugues();
  const escolhida = ler(CHAVE_VOZ);
  return (escolhida ? vozes.find((v) => (v.voiceURI || v.name) === escolhida) : undefined)
    ?? vozes.find((v) => v.localService)
    ?? vozes[0];
}

export function escolherVoz(id: string) { gravar(CHAVE_VOZ, id); }
export function vozEscolhida(): string | null { return ler(CHAVE_VOZ); }

export function velocidadeDaLeitura(): number {
  const v = Number(ler(CHAVE_VELOCIDADE));
  return VELOCIDADES.some((x) => x.valor === v) ? v : VELOCIDADE_PADRAO;
}
export function escolherVelocidade(v: number) { gravar(CHAVE_VELOCIDADE, String(v)); }

/** Põe na fala a voz, a língua e a velocidade da leitura. */
export function prepararFala<F extends Fala>(fala: F): F {
  fala.lang = 'pt-BR';
  const voz = vozDaLeitura();
  if (voz) { fala.voice = voz; fala.lang = voz.lang || 'pt-BR'; }
  fala.rate = velocidadeDaLeitura();
  fala.pitch = 1;
  return fala;
}

/** A lista de vozes chega depois da página no Chrome: avisa quando ela mudar. */
export function quandoAsVozesChegarem(f: () => void): () => void {
  const s = sintese();
  if (!s) return () => {};
  s.addEventListener?.('voiceschanged', f);
  return () => s.removeEventListener?.('voiceschanged', f);
}
