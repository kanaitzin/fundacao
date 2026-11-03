/**
 * O BOTÃO QUE GRAVA (fase 265).
 *
 * DUAS COISAS, num lugar só, para todo botão do sistema:
 *
 * 1. NÃO GRAVA DUAS VEZES. Medido no protótipo com a rede lenta: a educadora
 *    tocou duas vezes em "Registrar linha" e a mesma linha entrou duas vezes na
 *    ATA. O botão não se desligava enquanto gravava, e no sistema de verdade a
 *    linha da ATA não se apaga. Às 23h, num sinal fraco, o segundo toque é o
 *    gesto natural de quem acha que o primeiro não pegou. Cada tela tinha (ou
 *    não tinha) o seu `ocupado`; aqui a guarda vale para todas: o botão que
 *    disparou uma escrita não aceita outro toque até a resposta chegar.
 *
 * 2. DIZ QUE GRAVOU, ONDE O DEDO ESTÁ (o M5 do relatório 5 da equipe de design).
 *    O recado de que gravou nasce no alto da tela, fora da vista de quem rolou
 *    até o botão. Agora o próprio botão diz "Registrado às 23:04" por 1,6 s e
 *    volta. Diz o fato e a hora, nunca elogio; sem o ✓ que se desenha (o
 *    relatório o tira do remédio, e um gesto só vale para todos os botões).
 *
 * COMO: a tela não muda. O `api()` pergunta qual botão foi tocado há pouco
 * (`botaoDoToque`), e a escrita marca esse botão com `data-gravando` enquanto
 * está no ar e `data-feito` quando volta certa. São atributos que o React não
 * escreve, então ele não os apaga ao redesenhar. A frase aparece por CSS
 * (`.btn[data-feito]::after`, fora do nome acessível) e é lida pelo leitor de
 * tela numa região de estado só.
 *
 * O QUE NÃO GANHA A FRASE: botão que não começa por um verbo de gravar
 * (abrir, entrar, baixar: o recado do que aconteceu é outro), botão estreito
 * demais para a frase, e o botão que sumiu com a resposta (a folha fechou,
 * a criança saiu da lista). A guarda vale para todos.
 */
import { horaNaInstituicao } from './turno';
import { fraseDoFeito } from './botao-que-grava.regra';

export { fraseDoFeito };

/** O toque vale para a escrita que começar até este tempo depois dele. */
const JANELA_DO_TOQUE_MS = 1500;
/** Quanto tempo o botão diz que gravou. */
const DURA_O_FEITO_MS = 1600;
/** A guarda nunca prende o botão mais que isto, nem se a resposta não vier. */
const GUARDA_MAXIMA_MS = 60_000;

let ultimoToque: { botao: HTMLButtonElement; quando: number; rotulo: string } | null = null;
const noAr = new WeakMap<HTMLButtonElement, { n: number; falhou: boolean; solta: number; recusa?: string }>();
const apagaFeito = new WeakMap<HTMLButtonElement, number>();
let ligado = false;

/** Liga a guarda e a anotação do toque. Uma vez, quando o app abre. */
export function ligarBotaoQueGrava() {
  if (ligado || typeof window === 'undefined') return;
  ligado = true;
  /* Na CAPTURA da janela: roda antes do React, que ouve na raiz. O toque num
     botão que está gravando para aqui, e o clique (e o envio do formulário,
     que é o clique no botão de enviar) não chega a ninguém. */
  window.addEventListener('click', (ev) => {
    const botao = (ev.target as Element | null)?.closest?.('button');
    if (!(botao instanceof HTMLButtonElement)) return;
    if (botao.hasAttribute('data-gravando')) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      return;
    }
    /* O rótulo do instante do toque: a tela pode trocá-lo por "Registrando…". */
    ultimoToque = { botao, quando: performance.now(), rotulo: botao.innerText };
  }, true);
}

/** O botão tocado há pouco, se ainda está na tela. */
function botaoDoToque(): { botao: HTMLButtonElement; rotulo: string } | null {
  const t = ultimoToque;
  if (!t || performance.now() - t.quando > JANELA_DO_TOQUE_MS || !t.botao.isConnected) return null;
  return t;
}

/* A frase cabe no botão? Medida com a letra dele; botão estreito demais
   (o "Normal" da chamada) só ganha a guarda. */
let regua: CanvasRenderingContext2D | null = null;
function cabe(botao: HTMLButtonElement, frase: string): boolean {
  regua ??= document.createElement('canvas').getContext('2d');
  if (!regua) return false;
  const estilo = getComputedStyle(botao);
  regua.font = `${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
  return regua.measureText(frase).width + 16 <= botao.getBoundingClientRect().width;
}

function anunciar(frase: string) {
  let regiao = document.getElementById('anuncio-do-botao');
  if (!regiao) {
    regiao = document.createElement('div');
    regiao.id = 'anuncio-do-botao';
    regiao.className = 'so-leitor';
    regiao.setAttribute('role', 'status');
    document.body.appendChild(regiao);
  }
  regiao.textContent = '';
  window.setTimeout(() => { regiao!.textContent = frase; }, 30);
}

function soltar(botao: HTMLButtonElement) {
  const estado = noAr.get(botao);
  if (estado) window.clearTimeout(estado.solta);
  noAr.delete(botao);
  botao.removeAttribute('data-gravando');
  botao.removeAttribute('aria-busy');
}

/**
 * Marca o botão tocado há pouco enquanto a escrita está no ar. Devolve a função
 * que a escrita chama ao terminar, dizendo se deu certo. Sem botão, nada.
 */
export function comecarEscrita(caminho: string): (deuCerto: boolean, recusa?: string) => void {
  const toque = botaoDoToque();
  if (!toque) return () => {};
  const { botao, rotulo } = toque;
  const antes = noAr.get(botao);
  if (antes) antes.n += 1;
  else {
    const solta = window.setTimeout(() => soltar(botao), GUARDA_MAXIMA_MS);
    noAr.set(botao, { n: 1, falhou: false, solta });
    tirarRecusa();
    window.clearTimeout(apagaFeito.get(botao));
    botao.removeAttribute('data-feito');
    botao.setAttribute('data-gravando', '');
    botao.setAttribute('aria-busy', 'true');
  }
  const daEntrada = caminho.startsWith('/auth');
  return (deuCerto, recusa) => {
    const estado = noAr.get(botao);
    if (!estado) return;
    estado.n -= 1;
    if (!deuCerto) estado.falhou = true;
    if (recusa) estado.recusa = recusa;
    if (estado.n > 0) return;
    const falhou = estado.falhou;
    soltar(botao);
    if (falhou && estado.recusa && !daEntrada) {
      const frase = estado.recusa;
      /* Espera a tela desenhar a recusa dela, e só então confere se está à vista. */
      window.setTimeout(() => {
        const aVista = recusaAVista(frase);
        if (!aVista) mostrarRecusaPerto(botao, frase);
        ((globalThis as { __botoesQueGravaram?: unknown[] }).__botoesQueGravaram ??= [])
          .push({ rotulo: rotulo.trim().slice(0, 60), caminho, recusa: aVista ? 'a-vista' : 'perto-do-botao' });
      }, 400);
    }
    const frase = fraseDoFeito(rotulo, horaNaInstituicao());
    const fora = falhou ? 'falhou' : daEntrada ? 'entrada' : !botao.isConnected ? 'sumiu'
      : !botao.classList.contains('btn') ? 'nao-e-btn'
      : !frase ? 'outro-verbo' : !cabe(botao, frase) ? 'estreito' : null;
    /* Para os ensaios (só em memória): cada botão que gravou, e por que não ganhou a frase. */
    ((globalThis as { __botoesQueGravaram?: unknown[] }).__botoesQueGravaram ??= [])
      .push({ rotulo: rotulo.trim().slice(0, 60), caminho, frase, fora });
    if (fora || !frase) return;
    botao.setAttribute('data-feito', frase);
    anunciar(frase);
    apagaFeito.set(botao, window.setTimeout(() => botao.removeAttribute('data-feito'), DURA_O_FEITO_MS));
  };
}

/*
 * A RECUSA PERTO DO DEDO (fase 266). A tela escreve a recusa do servidor no
 * alto dela, e quem tocou no botão lá embaixo não a vê: acha que gravou, ou
 * toca de novo. Se a frase não está à vista quando a resposta chega, ela
 * aparece logo acima do botão tocado, com a cor de erro da tela e um Entendi.
 * A frase é a do servidor, a mesma que a tela escreveu lá em cima; sai com o
 * Entendi, com o próximo toque no botão, com a rolagem ou em quinze segundos.
 */
const RECUSA_DURA_MS = 15_000;
let recusaAberta: { el: HTMLElement; apaga: () => void } | null = null;

function tirarRecusa() {
  recusaAberta?.apaga();
  recusaAberta = null;
}

/** A frase está escrita em algum lugar que a pessoa enxerga agora? */
function recusaAVista(frase: string): boolean {
  const pedaco = frase.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!pedaco) return true;
  const alto = window.innerHeight;
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('[role=alert], .notice, p, div, span'))) {
    if (el.closest('#recusa-perto-do-botao')) continue;
    const tem = (e: Element) => ((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').includes(pedaco);
    if (!tem(el)) continue;
    /* Só o elemento mais de dentro: a raiz da página também "contém" a frase. */
    if (Array.from(el.children).some(tem)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < alto) return true;
  }
  return false;
}

function mostrarRecusaPerto(botao: HTMLButtonElement, frase: string) {
  tirarRecusa();
  if (!botao.isConnected) return;
  const r = botao.getBoundingClientRect();
  const el = document.createElement('div');
  el.id = 'recusa-perto-do-botao';
  el.className = 'notice c-crit recusa-perto';
  el.setAttribute('role', 'alert');
  const texto = document.createElement('span');
  texto.textContent = frase;
  const entendi = document.createElement('button');
  entendi.type = 'button';
  entendi.className = 'btn sm ghost';
  entendi.textContent = 'Entendi';
  el.append(texto, entendi);
  /* No celular, de lado a lado; no monitor, junto do botão. */
  const largura = window.innerWidth < 700 ? window.innerWidth - 32
    : Math.min(Math.max(r.width, 320), window.innerWidth - 32);
  el.style.left = `${Math.max(16, Math.min(r.left, window.innerWidth - 16 - largura))}px`;
  el.style.width = `${largura}px`;
  /* Acima do botão; se ele está no alto da tela, abaixo dele. */
  if (r.top > 140) el.style.bottom = `${window.innerHeight - r.top + 8}px`;
  else el.style.top = `${r.bottom + 8}px`;
  document.body.appendChild(el);
  const inicio = performance.now();
  const aoRolar = () => { if (performance.now() - inicio > 300) tirarRecusa(); };
  const vigia = window.setInterval(() => { if (!botao.isConnected) tirarRecusa(); }, 500);
  const prazo = window.setTimeout(tirarRecusa, RECUSA_DURA_MS);
  window.addEventListener('scroll', aoRolar, { passive: true, capture: true });
  entendi.addEventListener('click', tirarRecusa);
  recusaAberta = {
    el,
    apaga: () => {
      window.clearInterval(vigia); window.clearTimeout(prazo);
      window.removeEventListener('scroll', aoRolar, { capture: true });
      el.remove();
    },
  };
}
