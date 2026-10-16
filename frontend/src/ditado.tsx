import { useEffect, useRef, useState } from 'react';
import { Icone } from './icones';

/**
 * O DITADO (fase 195; pedido de 10/10: *"fazer relatórios pela voz"*).
 *
 * Em TODO campo de texto longo do sistema (o relatório do acompanhamento, a
 * linha da ATA, a evolução, o diário da internação, o relato da ocorrência)
 * aparece um microfone junto do campo. A pessoa fala, o texto aparece enquanto
 * ela fala (o provisório, em cinza, ao lado do botão), e o que o navegador deu
 * como certo entra no campo, no fim do que já estava escrito. Nada é salvo:
 * o campo continua sendo da pessoa, que confere, corrige e salva.
 *
 * A Acolhe+AI usa o mesmo ditado, longo, para o relatório que ela organiza.
 *
 * O ÁUDIO. O reconhecimento é do navegador; no Chrome, o áudio vai ao Google.
 * Por isso o primeiro uso, em qualquer campo, mostra o aviso que a Acolhe+AI já
 * mostrava (a mesma chave: aceito num lugar, vale para todos), e o navegador
 * pede o microfone uma vez. Sem reconhecimento no navegador, o botão não
 * aparece: escrever continua sendo o caminho.
 *
 * O ditado contínuo do Chrome para sozinho depois de um silêncio; aqui ele
 * volta a ouvir até a pessoa apertar Parar, porque relatório tem pausa para
 * pensar. Para no máximo em dez minutos, para o microfone não ficar ligado
 * esquecido.
 */
export type Reconhecedor = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e?: { error?: string }) => void) | null;
  start: () => void; stop: () => void;
};

export const CHAVE_AVISO_VOZ = 'rede-acolher.acolhe.aviso-do-microfone';
const MAXIMO_MS = 10 * 60 * 1000;

export function reconhecimentoDeVoz(): (new () => Reconhecedor) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function avisoDaVozAceito(): boolean {
  try { return localStorage.getItem(CHAVE_AVISO_VOZ) === '1'; } catch { return false; }
}
export function aceitarAvisoDaVoz() {
  try { localStorage.setItem(CHAVE_AVISO_VOZ, '1'); } catch { /* sem armazenamento: pergunta de novo */ }
}

/** Junta o que foi dito ao que já estava escrito, com o espaço e a maiúscula certos. */
export function juntarAoTexto(antes: string, dito: string): string {
  const d = dito.trim();
  if (!d) return antes;
  const a = antes.replace(/\s+$/, '');
  const inicioDeFrase = !a || /[.!?]$/.test(a);
  const pedaco = inicioDeFrase ? d.charAt(0).toUpperCase() + d.slice(1) : d;
  return a ? `${a} ${pedaco}` : pedaco;
}

/**
 * O CHROME DO ANDROID E O SAFARI DO IPHONE ouvem uma frase por vez (fase 222).
 * O Safari ignora o ditado contínuo; o Chrome do Android, contínuo, repete o que
 * já tinha reconhecido. Nos dois, uma frase por escuta e religar a cada frase
 * dá o mesmo texto que o ditado contínuo dá no computador.
 */
export function escutaUmaFrasePorVez(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

/** Tira do começo de `dito` o que já entrou (o resultado cumulativo do Android). */
export function semORepetido(jaEntrou: string, dito: string): string {
  const d = dito.trim();
  const j = jaEntrou.trim();
  if (!j) return d;
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ');
  if (norm(d) === norm(j)) return '';
  return norm(d).startsWith(`${norm(j)} `) ? d.slice(d.length - (norm(d).length - norm(j).length)).trim() : d;
}

export interface Ditado { parar: () => void }

/** Liga o microfone e entrega o que foi dito: o provisório enquanto fala, o certo quando fecha a frase. */
export function iniciarDitado({ onCerto, onProvisorio, onFim, onErro }: {
  onCerto: (texto: string) => void;
  onProvisorio?: (texto: string) => void;
  onFim: () => void;
  onErro: (frase: string) => void;
}): Ditado | null {
  const R = reconhecimentoDeVoz();
  if (!R) { onErro('Este navegador não ouve pelo microfone. Escreva, por favor.'); return null; }
  let parado = false;
  const inicio = Date.now();
  let atual: Reconhecedor | null = null;
  /* Escutas seguidas que terminaram logo, sem ouvir nada: o aparelho está
     recusando, e religar sem parar só esquenta o celular (fase 222). */
  let curtasSeguidas = 0;
  const umaFrasePorEscuta = escutaUmaFrasePorVez();

  const ligar = () => {
    const r = new R();
    const comecou = Date.now();
    /* O silêncio (`no-speech`) também conta como escuta: ninguém falou, e o
       microfone segue ouvindo. Só a escuta recusada é que conta para desistir. */
    let ouviu = false;
    /* O que já entrou como certo nesta escuta. O Chrome do Android, em ditado
       contínuo, repete no resultado novo o que já tinha dado como certo; aqui
       entra só o pedaço novo. */
    let jaEntrou = '';
    r.lang = 'pt-BR'; r.interimResults = true; r.continuous = !umaFrasePorEscuta;
    r.onresult = (e) => {
      ouviu = true;
      let provisorio = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0]?.transcript ?? '';
        if (res.isFinal) {
          const novo = semORepetido(jaEntrou, t);
          jaEntrou = `${jaEntrou} ${novo}`.trim();
          if (novo) onCerto(novo);
        } else provisorio += semORepetido(jaEntrou, t);
      }
      onProvisorio?.(provisorio);
    };
    r.onerror = (e) => {
      const erro = e?.error ?? '';
      if (erro === 'no-speech') ouviu = true;
      if (erro === 'not-allowed' || erro === 'service-not-allowed') {
        parado = true;
        onErro('O microfone está bloqueado neste navegador. Para liberar, toque no cadeado ao lado do endereço.');
      } else if (erro === 'network') {
        parado = true;
        onErro('Sem internet o navegador não reconhece a fala. Escreva, ou tente quando o sinal voltar.');
      } else if (erro === 'audio-capture') {
        parado = true;
        onErro('Não achei um microfone funcionando neste aparelho. Escreva, ou confira se outro aplicativo está usando o microfone.');
      }
    };
    r.onend = () => {
      onProvisorio?.('');
      curtasSeguidas = !ouviu && Date.now() - comecou < 1500 ? curtasSeguidas + 1 : 0;
      if (!parado && curtasSeguidas >= 3) {
        parado = true;
        onErro('O microfone parou de responder. Toque de novo para tentar, ou escreva.');
      }
      if (!parado && Date.now() - inicio < MAXIMO_MS) { ligar(); return; }
      onFim();
    };
    atual = r;
    try { r.start(); } catch { parado = true; onFim(); }
  };
  ligar();
  return { parar: () => { parado = true; atual?.stop(); } };
}

/** O aviso do primeiro uso do microfone, o mesmo em todo lugar. */
export function AvisoDoMicrofone({ onAceitar, onFechar }: { onAceitar: () => void; onFechar: () => void }) {
  return (
    <div className="overlay" role="alertdialog" aria-modal="true" aria-labelledby="t-aviso-microfone">
      <div className="sheet modal">
        <h3 id="t-aviso-microfone">Antes de usar o microfone</h3>
        <p>
          O que você falar é transformado em texto pelo serviço do navegador (no Chrome, o do Google).
          Evite dizer nome completo e dados de criança em voz alta; quando puder, use o primeiro nome.
          O texto entra no campo e só é guardado quando você salvar.
        </p>
        <div className="row rodape">
          <button className="btn sec grow" onClick={onFechar}>Agora não</button>
          <button className="btn grow" onClick={() => { aceitarAvisoDaVoz(); onAceitar(); }}>Entendi, usar o microfone</button>
        </div>
      </div>
    </div>
  );
}

/** Escreve no campo como o React espera (o mesmo jeito do `acolhe-tela.ts`). */
function porValor(el: HTMLTextAreaElement, v: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * O MICROFONE JUNTO DO CAMPO. Mora uma vez só no `App.tsx` e acompanha o campo
 * de texto longo que tem o foco, em qualquer tela e em qualquer folha. O botão
 * não rouba o foco (o `pointerdown` é anulado): o cursor continua no campo, e a
 * pessoa pode escrever e falar no mesmo campo, alternando.
 */
export function DitadoNosCampos() {
  const [campo, setCampo] = useState<HTMLTextAreaElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [provisorio, setProvisorio] = useState('');
  const [aviso, setAviso] = useState(false);
  const [erro, setErro] = useState('');
  const ditado = useRef<Ditado | null>(null);
  const alvo = useRef<HTMLTextAreaElement | null>(null);
  const temVoz = !!reconhecimentoDeVoz();

  useEffect(() => {
    if (!temVoz) return undefined;
    const aoFocar = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el instanceof HTMLTextAreaElement && !el.disabled && !el.readOnly
          && !el.closest('.acolhe-painel, .camera, [data-sem-ditado]')) {
        setCampo(el); setErro('');
      } else if (!(el as HTMLElement)?.closest?.('.ditado')) {
        if (!ditado.current) setCampo(null);
      }
    };
    document.addEventListener('focusin', aoFocar);
    return () => document.removeEventListener('focusin', aoFocar);
  }, [temVoz]);

  /* Acompanha o campo: rolar a folha ou mudar o tamanho da tela move o botão junto. */
  useEffect(() => {
    if (!campo) { setPos(null); return undefined; }
    let quadro = 0;
    const medir = () => {
      if (!campo.isConnected) { setCampo(null); return; }
      const r = campo.getBoundingClientRect();
      setPos({ top: Math.max(4, r.bottom - 44), left: Math.max(4, r.right - 44) });
      quadro = requestAnimationFrame(medir);
    };
    medir();
    return () => cancelAnimationFrame(quadro);
  }, [campo]);

  useEffect(() => () => ditado.current?.parar(), []);

  /* O campo é guardado no clique: o aviso do primeiro uso tira o foco dele. */
  function comecar() {
    if (campo) alvo.current = campo;
    if (!alvo.current) return;
    if (!avisoDaVozAceito()) { setAviso(true); return; }
    alvo.current.focus();
    setErro('');
    ditado.current = iniciarDitado({
      onCerto: (t) => { const el = alvo.current; if (el) porValor(el, juntarAoTexto(el.value, t)); },
      onProvisorio: setProvisorio,
      onFim: () => { ditado.current = null; setOuvindo(false); setProvisorio(''); },
      onErro: (f) => setErro(f),
    });
    if (ditado.current) setOuvindo(true);
  }
  function parar() { ditado.current?.parar(); }

  if (!temVoz) return null;
  return (
    <>
      {campo && pos && (
        <div className="ditado" style={{ top: pos.top, left: pos.left }}>
          {(ouvindo && provisorio) || erro ? (
            <span className={`ditado-fala${erro ? ' erro' : ''}`} role="status" aria-live="polite">{erro || provisorio}</span>
          ) : ouvindo ? <span className="ditado-fala" role="status">Ouvindo…</span> : null}
          <button type="button" className={`ditado-botao${ouvindo ? ' ativo' : ''}`}
                  aria-label={ouvindo ? 'Parar de ditar' : 'Ditar neste campo'} aria-pressed={ouvindo}
                  title={ouvindo ? 'Parar de ditar' : 'Ditar neste campo'}
                  onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (ouvindo ? parar() : comecar())}>
            <Icone nome="microfone" />
          </button>
        </div>
      )}
      {aviso && <AvisoDoMicrofone onFechar={() => setAviso(false)} onAceitar={() => { setAviso(false); comecar(); }} />}
    </>
  );
}
