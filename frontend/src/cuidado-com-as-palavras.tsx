import { useEffect, useRef, useState } from 'react';
import { palavrasQueRotulam, sugestaoDoFato } from '../../backend/src/modules/assistente/palavras-que-rotulam';

/**
 * O CUIDADO COM AS PALAVRAS (fase 243). Mora uma vez só no `App.tsx`, como o
 * microfone, e acompanha o campo de texto longo que tem o foco. Quando a pessoa
 * escreve uma palavra que rotula a criança, aparece embaixo do campo a sugestão
 * de escrever o fato. Só sugere: não impede de salvar, e nada é guardado nem
 * contado. "Entendi" fecha a sugestão daquela palavra naquele campo.
 */
export function CuidadoComAsPalavras() {
  const [campo, setCampo] = useState<HTMLTextAreaElement | null>(null);
  const [palavra, setPalavra] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; largura: number } | null>(null);
  const dispensadas = useRef(new WeakMap<HTMLTextAreaElement, Set<string>>());

  useEffect(() => {
    const aoFocar = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el instanceof HTMLTextAreaElement && !el.closest('.acolhe-painel, [data-sem-cuidado]')) setCampo(el);
      else if (!(el as HTMLElement)?.closest?.('.cuidado-palavras, .ditado')) setCampo(null);
    };
    document.addEventListener('focusin', aoFocar);
    return () => document.removeEventListener('focusin', aoFocar);
  }, []);

  /* Lê o campo enquanto a pessoa escreve (ou dita), com um pequeno atraso. */
  useEffect(() => {
    if (!campo) { setPalavra(null); return undefined; }
    let espera: ReturnType<typeof setTimeout> | null = null;
    const ler = () => {
      const fora = dispensadas.current.get(campo) ?? new Set<string>();
      setPalavra(palavrasQueRotulam(campo.value).find((p) => !fora.has(p)) ?? null);
    };
    const aoEscrever = () => { if (espera) clearTimeout(espera); espera = setTimeout(ler, 600); };
    ler();
    campo.addEventListener('input', aoEscrever);
    return () => { campo.removeEventListener('input', aoEscrever); if (espera) clearTimeout(espera); };
  }, [campo]);

  /* Acompanha o campo quando a folha rola ou a tela muda de tamanho. */
  useEffect(() => {
    if (!campo || !palavra) { setPos(null); return undefined; }
    let quadro = 0;
    const medir = () => {
      if (!campo.isConnected) { setCampo(null); return; }
      const r = campo.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.max(4, r.left), largura: Math.max(200, r.width) });
      quadro = requestAnimationFrame(medir);
    };
    medir();
    return () => cancelAnimationFrame(quadro);
  }, [campo, palavra]);

  if (!campo || !palavra || !pos) return null;
  return (
    <div className="cuidado-palavras" role="note" style={{ top: pos.top, left: pos.left, maxWidth: pos.largura }}>
      <span>{sugestaoDoFato(palavra)}</span>
      <button type="button" className="btn sm ghost"
              onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const fora = dispensadas.current.get(campo) ?? new Set<string>();
                fora.add(palavra);
                dispensadas.current.set(campo, fora);
                setPalavra(palavrasQueRotulam(campo.value).find((p) => !fora.has(p)) ?? null);
              }}>
        Entendi
      </button>
    </div>
  );
}
