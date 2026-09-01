/**
 * O TIMBRE, em bytes, para o documento que o navegador monta.
 *
 * É a mesma imagem que o servidor usa (`backend/assets/timbre.png`) e a mesma
 * que aparece na barra do sistema — a marca da Fundação O Pão dos Pobres. O
 * `?inline` obriga o Vite a embutir o arquivo como data URI, porque o
 * protótipo é UM arquivo aberto de `file://`: um caminho relativo para a
 * imagem não carregaria em máquina nenhuma.
 */
import timbreDataUrl from './assets/logo-marca.png?inline';

/** Devolve os bytes do PNG, ou `null` se por algum motivo não vieram embutidos. */
export function timbreEmBytes(): Uint8Array | null {
  const base64 = String(timbreDataUrl).split(',')[1];
  if (!base64) return null;
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    // Sem timbre o documento sai mesmo assim, com o nome da Fundação escrito.
    return null;
  }
}
