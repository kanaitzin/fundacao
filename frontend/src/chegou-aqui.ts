/**
 * "FOI AQUI": O REALCE DO DESTINO (fase 259, do relatório 5 da equipe de design).
 *
 * Quando um aviso, a linha do dia ou a busca levam a pessoa a outra tela, o que
 * ela foi buscar ganha um contorno que se apaga sozinho em 1,4 s. Sem isso, a
 * tela troca inteira e a pessoa procura de novo o que acabou de tocar.
 *
 * É cor, e não deslocamento: vale igual com Reduzir movimento. Não rola a tela
 * nem rouba o foco; quem usa leitor de tela já ouve o título da tela nova.
 */

let pendente: number | null = null;

export function marcarChegada() {
  if (typeof window === 'undefined') return;
  if (pendente !== null) window.clearTimeout(pendente);
  /* A tela nova pede o dado ao abrir: espera ele chegar, para não acender o
     cartão de "carregando" que logo some. */
  pendente = window.setTimeout(() => {
    pendente = null;
    /* O que recebe o realce: o cabeçalho do perfil, ou o primeiro cartão da tela. */
    const alvo = document.querySelector<HTMLElement>('main.conteudo [data-chegou-aqui]')
      ?? document.querySelector<HTMLElement>('main.conteudo .card');
    if (!alvo) return;
    alvo.classList.remove('chegou-aqui');
    void alvo.offsetWidth; // recomeça a animação, se o mesmo cartão for o destino de novo
    alvo.classList.add('chegou-aqui');
    window.setTimeout(() => alvo.classList.remove('chegou-aqui'), 2200);
  }, 450);
}
