/**
 * AS MÃOS DA ACOLHE+AI NA TELA (fase 193; pedido de 08/10).
 *
 * Ela lê o formulário aberto, escreve nos campos à vista da pessoa, letra por
 * letra, e aperta os botões que ABREM alguma coisa. Três limites, e nenhum é
 * promessa de texto:
 *
 *  - NUNCA SALVA. O botão que grava é da pessoa. E o nome do botão não diz se
 *    ele grava ("Abrir ocorrência e avisar" grava; "Registrar um episódio" só
 *    abre a folha), por isso a regra nega por padrão: só se aperta o que a
 *    tela marcou com `data-acolhe-abre` (e o teste confere que o clique desses
 *    botões só muda estado da tela), uma aba (`role="tab"`), ou a entrada num
 *    registro que a tela marcou com `data-acolhe-entra` (o cartão da internação,
 *    o detalhe que se abre ao tocar: fase 196, com a mesma conferência);
 *  - NUNCA ESCREVE SENHA. Campo de senha e de arquivo nem aparece na lista;
 *  - SÓ COM LICENÇA. Quem pede licença é o `acolhe.tsx`, uma vez por conversa.
 *
 * O que ela escreveu fica marcado (`acolhe-preenchido`) até a pessoa mexer no
 * campo: quem confere sabe o que veio da assistente.
 */

export interface CampoDaTela {
  n: number;
  campo: string;
  tipo: string;
  valor: string;
  opcoes?: string[];
  obrigatorio?: boolean;
}
export interface BotaoDaTela { botao: string; pode: boolean }

type Campo = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const limpo = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);

function visivel(el: Element): boolean {
  if (!(el as HTMLElement).getClientRects?.().length) return false;
  const st = getComputedStyle(el as HTMLElement);
  return st.visibility !== 'hidden' && st.display !== 'none';
}

const daAcolhe = (el: Element) => !!el.closest('.acolhe-painel, .acolhe-botao, .acolhe-faixa');

/** Onde a pessoa está trabalhando: a folha aberta por cima, ou a tela. */
export function raizDaTela(): HTMLElement {
  const folhas = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="alertdialog"]'))
    .filter((d) => !daAcolhe(d) && visivel(d));
  return folhas[folhas.length - 1]
    ?? document.querySelector<HTMLElement>('main.conteudo')
    ?? document.body;
}

function rotuloDe(el: Element): string {
  const c = el as Campo;
  const doLabel = 'labels' in c && c.labels?.length ? Array.from(c.labels).map((l) => l.innerText).join(' ') : '';
  const porId = el.getAttribute('aria-labelledby')?.split(/\s+/)
    .map((id) => document.getElementById(id)?.innerText ?? '').join(' ');
  return limpo(doLabel || el.getAttribute('aria-label') || porId || el.getAttribute('placeholder')
    || el.getAttribute('title') || el.getAttribute('name') || '');
}

function campos(): Campo[] {
  return Array.from(raizDaTela().querySelectorAll<Campo>('input, textarea, select'))
    .filter((el) => !daAcolhe(el) && visivel(el) && !el.disabled)
    .filter((el) => !(el instanceof HTMLInputElement && ['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image'].includes(el.type)))
    .filter((el) => !(el as HTMLInputElement).readOnly);
}

function tipoDe(el: Campo): string {
  if (el instanceof HTMLSelectElement) return 'lista de escolha';
  if (el instanceof HTMLTextAreaElement) return 'texto longo';
  return ({ checkbox: 'caixa de marcar', radio: 'opção', date: 'data', time: 'hora', number: 'número',
    email: 'e-mail', tel: 'telefone', 'datetime-local': 'data e hora', month: 'mês' } as Record<string, string>)[el.type] ?? 'texto';
}

function valorDe(el: Campo): string {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return el.checked ? 'sim' : 'não';
  if (el instanceof HTMLSelectElement) return limpo(el.selectedOptions[0]?.text ?? el.value);
  return el.value.slice(0, 300);
}

export function camposDaTela(): CampoDaTela[] {
  return campos().slice(0, 80).map((el, i) => ({
    n: i + 1,
    campo: rotuloDe(el) || `campo ${i + 1}`,
    tipo: tipoDe(el),
    valor: valorDe(el),
    ...(el instanceof HTMLSelectElement ? { opcoes: Array.from(el.options).map((o) => limpo(o.text)).filter(Boolean).slice(0, 40) } : {}),
    ...(el.required ? { obrigatorio: true } : {}),
  }));
}

function botoes(): { el: HTMLElement; nome: string; pode: boolean }[] {
  return Array.from(raizDaTela().querySelectorAll<HTMLElement>('button, [role="button"], [role="tab"]'))
    .filter((el) => !daAcolhe(el) && visivel(el) && !(el as HTMLButtonElement).disabled)
    .map((el) => ({
      el,
      nome: limpo(el.getAttribute('aria-label') || el.innerText || el.getAttribute('title')),
      pode: el.hasAttribute('data-acolhe-abre') || el.hasAttribute('data-acolhe-entra') || el.getAttribute('role') === 'tab',
    }))
    .filter((b) => b.nome);
}

export function botoesDaTela(): BotaoDaTela[] {
  return botoes().slice(0, 80).map((b) => ({ botao: b.nome, pode: b.pode }));
}

export function textoDaTela(max = 6000): string {
  const t = (raizDaTela().innerText ?? '').replace(/\n{3,}/g, '\n\n').trim();
  return t.length > max ? `${t.slice(0, max)} …(cortado)` : t;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const semMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Escreve o valor como o React espera: pelo `value` nativo, e o evento que ele ouve. */
function porValor(el: Campo, v: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function marcar(el: HTMLElement) {
  el.classList.remove('acolhe-preenchido');
  el.classList.add('acolhe-mexendo');
  el.scrollIntoView({ block: 'center', behavior: semMovimento() ? 'auto' : 'smooth' });
}
function soltar(el: HTMLElement) {
  el.classList.remove('acolhe-mexendo');
  el.classList.add('acolhe-preenchido');
  const tirar = (e: Event) => {
    if (!e.isTrusted) return;
    el.classList.remove('acolhe-preenchido');
    el.removeEventListener('input', tirar); el.removeEventListener('change', tirar);
  };
  el.addEventListener('input', tirar); el.addEventListener('change', tirar);
}

function achar<T>(lista: T[], nome: (x: T) => string, pedido: string, numero?: (x: T) => number): T | string {
  const n = /^\s*(?:campo\s*)?(\d+)\s*$/i.exec(pedido);
  if (n && numero) {
    const x = lista.find((y) => numero(y) === Number(n[1]));
    if (x) return x;
  }
  const p = sem(pedido);
  const iguais = lista.filter((x) => sem(nome(x)) === p);
  if (iguais.length === 1) return iguais[0];
  const parecidos = iguais.length ? iguais : lista.filter((x) => sem(nome(x)).includes(p) || (p.length > 3 && p.includes(sem(nome(x)))));
  if (parecidos.length === 1) return parecidos[0];
  if (!parecidos.length) return `Não achei "${pedido}" na tela. Use ver_tela para ver os nomes.`;
  return `Há mais de um "${pedido}" na tela: ${parecidos.slice(0, 6).map(nome).join('; ')}. Diga qual, ou use o número.`;
}

/** Escreve num campo, à vista. Devolve a frase do que fez, ou o erro. */
export async function preencherCampo(pedido: string, valor: string): Promise<{ ok: boolean; frase: string; campo?: string }> {
  const lista = campos().map((el, i) => ({ el, n: i + 1, nome: rotuloDe(el) || `campo ${i + 1}` }));
  const a = achar(lista, (x) => x.nome, pedido, (x) => x.n);
  if (typeof a === 'string') return { ok: false, frase: a };
  const { el, nome } = a;
  marcar(el);
  await espera(semMovimento() ? 0 : 250);
  try {
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      const quer = /^(sim|s|marcar|marcado|verdadeiro|true|1|x)$/i.test(valor.trim());
      if (el.checked !== quer) el.click();
    } else if (el instanceof HTMLSelectElement) {
      const v = sem(valor);
      const op = Array.from(el.options).find((o) => sem(o.text) === v || sem(o.value) === v)
        ?? Array.from(el.options).find((o) => sem(o.text).includes(v));
      if (!op) return { ok: false, frase: `"${valor}" não é uma das opções de ${nome}: ${Array.from(el.options).map((o) => limpo(o.text)).filter(Boolean).slice(0, 12).join('; ')}.` };
      porValor(el, op.value);
    } else if (el instanceof HTMLTextAreaElement || ['text', 'search', 'email', 'tel', 'url', ''].includes((el as HTMLInputElement).type)) {
      if (semMovimento() || valor.length > 400) {
        porValor(el, valor);
      } else {
        const passo = Math.max(1, Math.ceil(valor.length / 60));
        const pausa = Math.min(35, Math.max(8, 900 / valor.length));
        for (let i = passo; i < valor.length + passo; i += passo) {
          porValor(el, valor.slice(0, i));
          await espera(pausa);
        }
      }
    } else {
      porValor(el, valor);
    }
  } finally {
    soltar(el);
  }
  return { ok: true, frase: `Escrevi em ${nome}.`, campo: nome };
}

/** Aperta um botão que abre algo. Botão que grava não se aperta. */
export async function apertarBotao(pedido: string): Promise<{ ok: boolean; frase: string }> {
  const a = achar(botoes(), (x) => x.nome, pedido);
  if (typeof a === 'string') return { ok: false, frase: a };
  if (!a.pode) {
    return { ok: false, frase: `O botão "${a.nome}" é da pessoa: ele pode gravar. Peça para ela apertar quando estiver tudo certo.` };
  }
  marcar(a.el);
  await espera(semMovimento() ? 0 : 300);
  a.el.click();
  a.el.classList.remove('acolhe-mexendo');
  await espera(250);
  return { ok: true, frase: `Apertei "${a.nome}".` };
}
