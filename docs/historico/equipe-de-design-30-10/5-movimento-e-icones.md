# 5. Movimento e ícones — Rede Acolher

*Designer de interação e movimento. 30/10/2026. Nenhum arquivo do repositório foi alterado.*

**Material de apoio** (tudo em `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/movimento/`):
os dois percursos (`percurso.mjs`, `percurso2.mjs`), os registros (`log.txt`, `log2.txt`), os vídeos (`video/`, `video2/`),
as fotos quadro a quadro (`fotos/`, `f2/`), as tiras montadas (`tira-*.png`) e a grade dos 85 ícones (`icones-grade.png`, `icones-32.png`).

---

## 0. Em uma frase

A tela não está "parada" por falta de enfeite. Ela está parada porque **não responde ao toque no instante em que ele
acontece**, e em três lugares ela **diz uma coisa falsa por uma fração de segundo** (o vazio antes de carregar, o sino
com número diferente da lista, o perfil que pula quando a foto chega). Movimento bom aqui é **resposta**, não decoração:
curto, no lugar do dedo, nunca bloqueando o próximo toque e nunca em cima de remédio ou ocorrência grave.

---

## 1. O que eu vi, tocando o protótipo como a educadora

Percurso a 390 × 844, toque emulado, com Playwright; fotos em 0, 40 a 80, 120 a 250 e 300 a 700 ms depois de cada toque,
e `document.getAnimations()` medido no instante seguinte. **Em nove de onze interações havia zero animações vivas.**
A única coisa que se mexe no sistema inteiro é o botão `.btn` encolhendo para 97,5 % quando pressionado (`styles.css:124`)
e, no monitor, o item da coluna que anda 2 px no passar do mouse.

| # | Interação | O que acontece hoje (medido) | Problema | Peso |
|---|---|---|---|---|
| 1 | **Abrir a Chamada** pela aba | No quadro 0 aparece *"Nenhuma chamada aberta hoje. Abra a do café…"*; aos 40 ms as cinco chamadas surgem (`tira-03-aba-Chamada.png`) | **Vazio que mente.** `useState<Resumo[]>([])` não distingue "ainda não chegou" de "não há". No protótipo dura 40 ms; no servidor de verdade, num 3G às 23h, dura o tempo da rede, e a educadora lê "não há chamada aberta" | **Alto** |
| 2 | **Abrir o sino** | Quadro 0: *"Nada esperando você"*, com o selo dizendo **6** logo acima. Aos 80 ms, os seis avisos (`tira-06-sino.png`) | O mesmo vazio que mente, agora contradizendo o selo. É a lição da 158 (*"o vazio mentia"*) do lado da tela | **Alto** |
| 3 | **Marcar "Normal"** na chamada | O botão fica pálido (bom: é o "estou gravando"); aos 200 ms o cartão da Alice **some sem rastro**, a lista inteira sobe ~140 px, o contador vai de 16 para 15 seco (`tira-f-chamada.png`). Quando dá certo não há recado nenhum (o sumiço é a confirmação); quando falta sinal, o recado *"ficou guardada neste aparelho"* nasce **no alto da tela** (`Chamada.tsx:203`), fora da vista de quem rolou | A pessoa não vê para onde a criança foi; o botão do próximo (Caio) **muda de lugar sob o polegar**; a confirmação, quando há, não está onde o olho está | **Alto** |
| 4 | **Marcar aviso como lido** | O cartão some e o seguinte toma o lugar no mesmo quadro; a aba diz *"Não lidos · 5"* aos 200 ms, mas **o selo do sino ainda diz 6 até ~600 ms** (`tira-g-aviso.png`) | Dois números da mesma coisa discordando por meio segundo; sumiço sem transição | Médio |
| 5 | **Abrir o perfil** da Alice | *"Abrindo…"* em tela branca; depois o perfil com a inicial **A**; depois chega o retrato e o cabeçalho **cresce ~25 px**, empurrando a faixa vermelha da alergia para baixo (`tira-10-perfil-abre.png`) | **Salto de leiaute** justamente sobre o bloco que protege a criança; "Abrindo…" em vez de esqueleto | **Alto** |
| 6 | **Folha "Mais"** e **folha de dose** | Aparecem inteiras no quadro 0 e somem inteiras (`tira-05-folha-mais-abre.png`, `tira-d-dose.png`) | Sem relação espacial: a folha não "vem de baixo", ela troca a tela. Funciona, mas é o que dá a sensação de "parado" | Médio |
| 7 | **Esc com a folha aberta** | Duas vezes Esc e a folha "Mais" **continua aberta** (`log2.txt`); não há tratamento de `Escape` no `App.tsx` | Não é movimento, é o padrão de diálogo (WAI-ARIA). A decisão de 27/09 é sobre o *voltar* com texto escrito; a folha de navegação, sem texto, pode fechar no Esc | Médio (anotar) |
| 8 | **Trocar de aba** no pé | A pílula azul pula de uma aba para a outra; o conteúdo troca seco | Aceitável; é onde o movimento mais curto (≤ 150 ms) dá a sensação de "vivo" sem custo | Baixo |
| 9 | **Pressionar** um cartão-botão (`button.card`, `.opt`, aba) | Nada muda entre o dedo descer e subir; só o `.btn` reage | No celular, sem `:hover`, o toque sem resposta em 100 ms parece não ter pegado, e a pessoa toca de novo | Médio |
| 10 | **Acolhe+AI pensando** | Texto *"Pensando…"* com `role="status"` (`acolhe.tsx:1267`), sem indicação de que está vivo; no modo guia a resposta vem no mesmo quadro | Com o modelo do Pão (fase 239, fila), a espera pode passar de 2 s com nada se mexendo | Médio |
| 11 | **"Como funciona"** | O texto troca de uma vez (`explica.tsx`) e o resto da tela pula | Pequeno salto de leiaute | Baixo |
| 12 | **Ícone "Mais"** na barra | Os três pontos são `h.01` com traço 1,75: ~1,5 px na tela, o desenho mais fraco da barra (`icones-20a.png`) | É a porta para metade do sistema | Baixo |

O que **já está certo** e deve ficar: o `.btn:active` com escala 0,975; o `prefers-reduced-motion` usado em todo bloco de
movimento existente; o botão que fica pálido enquanto grava (é o melhor "carregando" do sistema); a regra de que a
folha de texto não fecha sozinha; o realce `acolhe-mexendo` quando a Acolhe+AI escreve num campo.

---

## 2. O que a pesquisa diz (e o que isso decide aqui)

- **Material 3, durações e curvas.** Os *tokens* publicados: *short* 50 a 200 ms, *medium* 250 a 400 ms, *long* acima disso;
  curva *standard* `cubic-bezier(0.2, 0, 0, 1)`, *emphasized decelerate* `cubic-bezier(0.05, 0.7, 0.1, 1)` para entrada,
  *emphasized accelerate* `cubic-bezier(0.3, 0, 0.8, 0.15)` para saída; saída mais curta que entrada. (O site m3.material.io
  não resolve nesta sessão; confirmei os valores em portas dos *tokens*: [hydrolysis-m3](https://docs.rs/crate/hydrolysis-m3/latest/source/src/theme/motion/tokens.rs),
  [frust-material](https://docs.rs/frust-material/0.6.2/src/frust_material/tokens/motion.rs.html),
  [material_3_expressive](https://pub.dev/documentation/material_3_expressive/1.0.3/foundations_m3e_motion/M3EMotion-class.html).)
  **Decide:** nada aqui passa de 250 ms; o normal é 120 a 200.
- **Apple HIG, Motion.** *"Make motion optional"*; feedback **breve e preciso** comunica melhor que movimento proeminente;
  movimento **nunca é o único portador** da informação; com *Reduzir movimento*, trocar deslocamento por **dissolver,
  realce ou mudança de cor** ([HIG Motion](https://developer-mdn.apple.com/design/human-interface-guidelines/foundations/motion),
  [critérios de Reduced Motion da App Store](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria)).
  **Decide:** com `reduce`, o feedback continua (cor, opacidade), só o deslocamento e a escala saem.
- **WCAG 2.3.3 (AAA) e o vestibular.** Movimento disparado por interação pode causar náusea, enxaqueca e tontura em quem
  tem distúrbio vestibular; a técnica C39 é o `prefers-reduced-motion` ([W3C, entendendo 2.3.3](https://w3.org/WAI/WCAG21/Understanding/animation-from-interactions),
  [técnica C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html)). Não achei estudo revisado por pares sobre
  *cansaço* e movimento de interface; o que existe é orientação de prática. **Minha leitura para o plantão:** pessoa
  cansada tem menos atenção sobrando, então movimento que **pede** atenção (pulsar, piscar, contar) custa mais, e
  movimento que **responde** (o lugar onde o dedo tocou muda) custa menos que a dúvida *"pegou?"*.
- **Tempos de resposta (Nielsen).** 0,1 s parece instantâneo; 1 s ainda mantém o fluxo; de 1 a 10 s, indicador
  indeterminado ou esqueleto; acima disso, progresso com estimativa ([NN/g, response time](https://www.nngroup.com/topic/response-time/),
  [UX Tigers, progress indicators](https://www.uxtigers.com/post/progress-indicators)). **Decide:** resposta ao toque em
  ≤ 100 ms sempre; esqueleto só depois de ~150 ms de espera (para não piscar quando a resposta é rápida).
- **View Transitions API.** Mesmo documento: Chrome/Edge 111, Safari 18, Firefox 144 ([Chrome for Developers](https://developer.chrome.com/docs/web-platform/view-transitions)).
  Funciona nos celulares da casa, **mas durante a transição a página não recebe toque** (o navegador mostra uma foto
  da tela). Numa chamada de 20 crianças tocadas em sequência, isso engole toques. **Decide:** não usar no que se toca
  em rajada; animação CSS ao montar resolve a troca de tela sem bloquear nada.
- **Entrada de folha sem JavaScript.** `@starting-style` e `transition-behavior: allow-discrete` são *Baseline* (Chrome 117,
  Safari 17.5, Firefox 129) ([web.dev](https://web.dev/blog/baseline-entry-animations)). **Decide:** a folha sobe com
  CSS puro, sem mudar uma linha dos componentes; o navegador antigo só a mostra pronta, como hoje.
- **Vibração.** `navigator.vibrate()` funciona no Chrome do Android e é **ignorada no Safari do iPhone**; o truque do
  `<input type="checkbox" switch>` que dispara o motor do iPhone é efeito colateral, não padrão, e pode parar
  ([azukiazusa](https://azukiazusa.dev/en/blog/ios-safari-web-haptics), [kimsal 2026](https://kimsal.com/blog/2026/03/20/a-bit-of-feedback/)).
  **Decide:** vibração curta só como reforço, desligada por padrão, ligada por aparelho na Minha conta; nunca o truque
  do iPhone (é gambiarra que quebra calada, e o sistema não depende de gambiarra).
- **Esqueleto e interface otimista.** Esqueleto que tem a forma do conteúdo reduz a sensação de espera e, aqui, resolve
  o vazio que mente. **Otimista** (mostrar como gravado antes do servidor responder) **não serve** para chamada, dose
  e ocorrência: a regra da casa é *"NÃO foi salvo"* dito com clareza (fase 219), e a fila do aparelho (fase 168) já é o
  caminho honesto do sem-sinal. Otimismo só no que é desfeito sem dano: marcar aviso como lido, trocar filtro, abrir aba.

---

## 3. O sistema de movimento

### 3.1 Os *tokens* (entram no `:root` do `styles.css`, junto de `--r-sm`)

```css
:root{
  /* DURAÇÃO. Nada passa de 250 ms: é resposta, não espetáculo. */
  --mov-toque: 90ms;      /* pressionar: tem de chegar antes do dedo subir      */
  --mov-curto: 140ms;     /* trocar aba, realce de estado, contador             */
  --mov-medio: 200ms;     /* folha que sobe, tela que entra, linha que sai      */
  --mov-saida: 120ms;     /* sair é sempre mais rápido que entrar               */
  --mov-espera: 150ms;    /* só depois disso o esqueleto aparece                */
  --mov-marca: 1400ms;    /* quanto o realce de "foi aqui" fica antes de sumir  */

  /* CURVAS (Material 3). Entrar desacelera; sair acelera; o resto é padrão. */
  --curva-padrao: cubic-bezier(.2, 0, 0, 1);
  --curva-entra:  cubic-bezier(.05, .7, .1, 1);
  --curva-sai:    cubic-bezier(.3, 0, .8, .15);

  /* DISTÂNCIA. Pouca: o olho acompanha 8 px sem esforço; 40 px já é viagem. */
  --mov-sobe: 8px;
}
/* Com "Reduzir movimento" o feedback CONTINUA: some só o que desloca e escala.
   As durações ficam, para a cor e a opacidade ainda mudarem com suavidade. */
@media (prefers-reduced-motion: reduce){
  :root{ --mov-sobe: 0px; }
}
```

### 3.2 As sete regras

1. **Movimento responde a um toque ou a uma mudança de estado. Nunca roda sozinho**, nunca em laço (a única exceção
   é o que está *de fato* acontecendo e acaba: gravando a voz, enviando a fila, a Acolhe+AI pensando).
2. **Nada bloqueia o próximo toque.** Nenhuma animação usa `pointer-events: none` na tela, nenhuma espera o fim para
   liberar o botão seguinte. A View Transitions API não entra no que se toca em sequência.
3. **O alvo não foge do dedo.** Se a lista muda, o que estava embaixo do polegar só se move depois que o dedo subiu,
   e devagar o bastante para o olho seguir (200 ms).
4. **A confirmação nasce onde o olho está**, no próprio botão ou na própria linha; o recado no alto da tela continua
   (é o registro para o leitor de tela), mas não é mais a única resposta.
5. **Só `transform` e `opacity`** (e `background-color` curto). Nada de animar `height`, `top`, `width`: no celular
   barato da casa isso engasga.
6. **`reduce` troca, não apaga**: deslocamento vira dissolver; escala vira mudança de cor; laço vira estático.
7. **Movimento nunca é o único sinal.** Toda animação tem a palavra ao lado (*Registrado às 23:04*, *Pensando…*).

---

## 4. As doze micro-interações (em ordem do que mais muda o plantão)

Todas em CSS puro ou com poucas linhas de React; nenhuma biblioteca. Os nomes de classe seguem o português da casa.

### M1. O esqueleto no lugar do vazio que mente *(corrige os achados 1, 2 e 5)*

O conserto de verdade é de estado, não de CSS: **`null` quer dizer "ainda não chegou"**, `[]` quer dizer "não há".

```tsx
// esqueleto.tsx — 20 linhas, sem biblioteca
export function Esqueleto({ linhas = 3, alto = 64 }: { linhas?: number; alto?: number }) {
  return (
    <div className="esqueleto" role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="esqueleto-linha" style={{ height: alto }} />
      ))}
    </div>
  );
}

// No Avisos.tsx (o mesmo vale para Chamada.tsx e as ~119 frases de vazio):
const [lista, setLista] = useState<Aviso[] | null>(null);   // era useState<Aviso[]>([])
// ...
{lista === null ? <Esqueleto linhas={3} alto={150} />
 : lista.length === 0 ? <p className="card mutetxt">Nada esperando você…</p>
 : lista.map(/* … */)}
```

```css
.esqueleto{ display:grid; gap:10px;
  /* Só aparece se a espera passar de 150 ms: resposta rápida não pisca. */
  opacity:0; animation:mov-aparece var(--mov-curto) linear var(--mov-espera) forwards; }
.esqueleto-linha{ border-radius:var(--r-md); background:var(--sunken); position:relative; overflow:hidden }
@media (prefers-reduced-motion: no-preference){
  .esqueleto-linha::after{ content:""; position:absolute; inset:0;
    background:linear-gradient(90deg, transparent, color-mix(in srgb, var(--surface) 55%, transparent), transparent);
    transform:translateX(-100%); animation:mov-brilho 1.4s var(--curva-padrao) infinite; }
}
@keyframes mov-aparece{ to{ opacity:1 } }
@keyframes mov-brilho{ to{ transform:translateX(100%) } }
```

O brilho é o único laço da lista, e é aceitável porque **termina sozinho** quando o dado chega; com `reduce`, o
esqueleto fica parado e cinza. **No perfil**, o cabeçalho reserva o lugar do retrato e da linha *"no acolhimento há…"*
desde o primeiro quadro (altura mínima fixa), e o retrato entra por cima da inicial com `opacity` em 200 ms: a faixa
da alergia **nunca** se move depois de aparecer.

### M2. O toque que responde em 90 ms *(achado 9)*

```css
@media (prefers-reduced-motion: no-preference){
  .btn, button.card, .opt, .tabbar button, .iconbtn, .portas-lateral button{
    transition: transform var(--mov-toque) var(--curva-padrao),
                background-color var(--mov-curto) var(--curva-padrao),
                box-shadow var(--mov-curto) var(--curva-padrao);
  }
  .btn:active, .opt:active, .iconbtn:active{ transform:scale(.97) }
  button.card:active{ transform:scale(.99) }      /* cartão grande: escala menor */
}
/* Com ou sem movimento, o toque muda a COR: é o feedback que fica no reduce. */
button.card:active, .opt:active, .tabbar button:active{
  background-color: color-mix(in srgb, var(--brand) 8%, var(--surface));
}
/* Tira o atraso de 300 ms do toque duplo e o clarão cinza do WebKit. */
button, a, [role=tab]{ touch-action: manipulation; -webkit-tap-highlight-color: transparent }
```

### M3. A folha que vem de baixo *(achado 6)*, sem mudar componente nenhum

```css
@media (max-width:640px) and (prefers-reduced-motion: no-preference){
  .overlay{ transition: background-color var(--mov-medio) var(--curva-padrao) }
  .overlay .sheet{ transition: transform var(--mov-medio) var(--curva-entra) }
  @starting-style{
    .overlay{ background-color: rgba(4,18,36,0) }
    .overlay .sheet{ transform: translateY(24px) }   /* 24 px, não a tela inteira */
  }
}
@media (prefers-reduced-motion: reduce){
  .overlay .sheet{ transition: opacity var(--mov-curto) linear }
  @starting-style{ .overlay .sheet{ opacity:0 } }
}
/* A alça diz "isto é uma folha"; é desenho, não controle (sem arrastar, ver abaixo). */
@media (max-width:640px){
  .overlay .sheet::before{ content:""; display:block; width:36px; height:4px; border-radius:2px;
    background:var(--line-2); margin:-14px auto 12px; }
}
```

A folha **sobe 24 px e não a tela inteira**: chega em 200 ms, o olho entende de onde ela veio, e ninguém espera.
A **saída fica instantânea**, como hoje: os componentes desmontam a folha (`{x && <div className="overlay">}`), e animar
a saída pediria segurar o componente montado; ganho pequeno para código novo em todas as folhas.
**Arrastar para fechar: não.** A folha de dose e a de ocorrência guardam texto escrito, e a decisão de 27/09 é que nada
feche sozinho; um arrasto sem querer ao rolar o formulário perderia o relato. Se a Fundação quiser, só a folha **Mais**
(navegação, sem texto) poderia ganhar o arrasto, e com ela o **Esc** (achado 7).

### M4. A tela que entra *(troca de aba e de tela)*

```css
@media (prefers-reduced-motion: no-preference){
  main.conteudo > *{ animation: mov-entra var(--mov-medio) var(--curva-entra) both }
}
@media (prefers-reduced-motion: reduce){
  main.conteudo > *{ animation: mov-aparece var(--mov-curto) linear both }
}
@keyframes mov-entra{ from{ opacity:0; transform:translateY(var(--mov-sobe)) } }
```

Precisa só que o `main` remonte ao trocar de tela (um `key={tela}` no `App.tsx`, se ainda não houver). **Sem
deslizar de lado** entre abas: deslizar sugere ordem espacial entre Dia, Chamada e Acolhidos, que não existe, e é o
movimento que mais incomoda quem tem sensibilidade vestibular. A pílula azul da aba ganha
`transition: background-color var(--mov-curto)`; não precisa "viajar" de uma aba para a outra.

### M5. "Registrado às 23:04" no próprio botão *(achado 3)*

O botão já fica pálido enquanto grava. Falta o terceiro estado, **gravou**, no mesmo lugar:

```tsx
// usar-confirmacao.ts — o botão diz o que aconteceu por 1,6 s e volta
export function useConfirmacao() {
  const [feito, setFeito] = useState<string | null>(null);
  const confirmar = (frase: string) => {
    setFeito(frase);
    if (vibrarLigado()) navigator.vibrate?.(12);   // Android; o iPhone ignora, e está tudo bem
    window.setTimeout(() => setFeito(null), 1600);
  };
  return { feito, confirmar };
}
// <button className={`btn ${feito ? 'feito' : ''}`} disabled={ocupado}>
//   {feito ? <><Icone nome="certo" tamanho={18} /> {feito}</> : 'Registrar com o meu nome'}
// </button>
// <span role="status" className="sr-only">{feito ?? ''}</span>
```

```css
.btn.feito{ background:var(--emerald-solid); color:var(--on-solid) }
@media (prefers-reduced-motion: no-preference){
  .btn.feito .icone{ animation: mov-traco 220ms var(--curva-entra) both }
}
/* o ✓ se desenha; com reduce, aparece pronto */
.btn.feito .icone path{ stroke-dasharray:24; }
@keyframes mov-traco{ from{ stroke-dashoffset:24 } to{ stroke-dashoffset:0 } }
```

O ✓ que se desenha em 220 ms é o máximo de "festa" permitido, e a frase diz **o fato e a hora**, nunca elogio.
**Nos registros de remédio a frase é a mesma, sem o traço animado** (ver §5).

### M6. A linha que sai da lista sem fugir do dedo *(achados 3 e 4)*

Na chamada e nos avisos, a linha conferida **primeiro muda de cor no lugar** (a pessoa vê que pegou), **depois
encolhe** em 200 ms; os cartões de baixo sobem junto, em vez de saltar.

```tsx
// usar-saida.ts — segura a linha 320 ms antes de tirá-la da lista
export function useSaida<T>(tirar: (id: T) => void) {
  const [saindo, setSaindo] = useState<Set<T>>(new Set());
  const sair = (id: T) => {
    setSaindo((s) => new Set(s).add(id));
    const espera = matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 320;
    window.setTimeout(() => tirar(id), espera);
  };
  return { saindo, sair };
}
// <li className={`ev ${saindo.has(l.acolhidoId) ? 'saindo' : ''}`}> …
```

```css
.ev, .aviso-cartao{ display:grid; grid-template-rows:1fr;
  transition: grid-template-rows var(--mov-medio) var(--curva-padrao) 120ms,
              opacity var(--mov-curto) linear 120ms,
              background-color var(--mov-curto) var(--curva-padrao); }
.ev > *, .aviso-cartao > *{ min-height:0; overflow:hidden }
.ev.saindo, .aviso-cartao.saindo{
  background-color: color-mix(in srgb, var(--emerald) 12%, var(--surface));   /* 1º: pegou */
  grid-template-rows:0fr; opacity:0;                                          /* 2º: sai   */
}
@media (prefers-reduced-motion: reduce){
  .ev, .aviso-cartao{ transition: background-color var(--mov-curto), opacity var(--mov-curto) 120ms }
  .ev.saindo, .aviso-cartao.saindo{ grid-template-rows:1fr }   /* só a cor e o sumiço */
}
```

Anima `grid-template-rows` (de 1fr a 0fr), o único jeito de encolher para "altura nenhuma" sem medir em JS; suportado
em Chrome 107+, Safari 16+, Firefox 66+. **Pergunta para a Fundação:** a criança conferida podia **ficar no lugar**, numa
linha fina *"Alice · Normal · 23:04"*, em vez de ir para o fim da lista; ninguém perde o fio, e o botão do Caio não
anda nunca. Muda o desenho da Chamada, por isso é decisão, e não meu.

### M7. O número que muda, sem contar *(achado 4)*

```css
.conta-mudou{ animation: mov-realce 600ms var(--curva-padrao) }
@keyframes mov-realce{ from{ background-color: color-mix(in srgb, var(--brand) 22%, transparent) } }
.badge.mudou{ animation: mov-selo 180ms var(--curva-entra) }
@media (prefers-reduced-motion: no-preference){
  @keyframes mov-selo{ 50%{ transform:scale(1.18) } }
}
```

O número **aparece já no valor final** e só o fundo dele acende e apaga: nada de contar de 16 até 15 (atrasa a leitura
e parece placar). **O selo do sino e a lista têm de mudar no mesmo quadro**: hoje o sino espera a próxima consulta;
ao marcar como lido, a tela deve descontar o selo na hora (é o único otimismo que proponho: desfaz-se sem dano, e a
consulta seguinte corrige se precisar).

### M8. "Foi aqui": o realce do destino

Quando um aviso leva a uma tela (*Abrir ATA*, *Abrir Ocorrências*) ou a busca abre um perfil, o registro de destino
recebe **um contorno que se apaga em 1,4 s**. Reaproveita o `.acolhe-mexendo` que já existe:

```css
.chegou-aqui{ outline:3px solid var(--focus); outline-offset:3px; border-radius:var(--r-md);
  animation: mov-apaga-contorno var(--mov-marca) var(--curva-padrao) 400ms forwards; }
@keyframes mov-apaga-contorno{ to{ outline-color: transparent } }
```

Funciona igual com `reduce` (é cor, não deslocamento). Com `scrollIntoView({ block: 'center', behavior: reduz ? 'auto' : 'smooth' })`.

### M9. "Como funciona" que abre sem empurrar *(achado 11)*

```css
[data-explica]{ interpolate-size: allow-keywords; }      /* Chrome 129+; nos outros, abre seco como hoje */
@media (prefers-reduced-motion: no-preference){
  [data-explica]{ transition: height var(--mov-medio) var(--curva-padrao); overflow:hidden }
}
```

É a única exceção à regra 5 (animar altura), porque é uma caixa só, pequena, e o recurso é ganho progressivo.

### M10. A Acolhe+AI viva enquanto pensa *(achado 10)*

```tsx
<p className="mutetxt acolhe-pensa" role="status">
  Pensando<span className="pontos" aria-hidden="true"><i/><i/><i/></span>
</p>
```

```css
.acolhe-pensa .pontos i{ display:inline-block; width:4px; height:4px; margin-left:3px; border-radius:50%;
  background:currentColor; opacity:.35 }
@media (prefers-reduced-motion: no-preference){
  .acolhe-pensa .pontos i{ animation: mov-respira 1.2s var(--curva-padrao) infinite }
  .acolhe-pensa .pontos i:nth-child(2){ animation-delay:.2s }
  .acolhe-pensa .pontos i:nth-child(3){ animation-delay:.4s }
}
@keyframes mov-respira{ 40%{ opacity:1 } }
```

Os pontos **respiram** (opacidade), não pulam. A resposta que já vem aos poucos (fase 240) é o melhor indicador; o
cursor no fim do texto (`.escrevendo::after{ content:"▍" }`) piscando a 1 Hz basta. **Exceção:** a frase de urgência
(*"ligue para o SAMU, 192"*) aparece **inteira e de uma vez**, nunca letra por letra.

### M11. O ouvir e o enviar: estado que está acontecendo

O microfone ligado ganha um anel que respira (a mesma `mov-respira`, 1,6 s) **e** a palavra *Ouvindo*; o ícone de
sincronização gira **só enquanto a fila está subindo**, e para quando termina. Com `reduce`, anel parado e ícone
parado; a palavra fica. São os dois únicos laços além do esqueleto e do "Pensando", e os quatro acabam sozinhos.

### M12. A vibração curta, por aparelho

Uma linha na folha **Minha conta**, como o *Aviso neste celular*: *"Vibrar quando um registro for gravado (neste
aparelho)"*, **desligada por padrão**. 12 ms ao gravar; nada ao errar (vibração de erro é a que a gente associa a
bronca). Só funciona no Android; no iPhone a linha diz *"Este aparelho não vibra pelo navegador"*. **Por que desligada:**
o celular apoiado na mesa do quarto vibra alto, e às 23h o quarto tem criança dormindo.

---

## 5. Onde movimento NÃO entra

| Lugar | Por quê |
|---|---|
| **Ocorrência grave, contenção, evasão** | A tela tem de ser a mais calma do sistema. Nada que lembre alarme (piscar, tremer, girar), nada que pareça "tarefa concluída". A folha sobe como as outras (M3), e só. |
| **Remédio: confirmar dose, saldo do armário, receita vencendo** | Sem o ✓ que se desenha, sem cor de comemoração além da pílula de estado que já existe. Dose é ato clínico registrado, não meta cumprida. O botão diz *Registrado às 23:04 por Ana* e pronto. |
| **Faixa da alergia e restrição** | **Nunca pulsa, nunca pisca.** Alerta permanente que se mexe vira ruído em uma semana (fadiga de alarme) e piscar perto de 3 Hz é risco de convulsão (WCAG 2.3.1). Ela só precisa **não sair do lugar** (M1). |
| **Erro, recusa do servidor** | Sem tremer o campo (o *shake*): é gesto de bronca. A recusa aparece com a frase e a cor de atenção; o foco vai para ela. |
| **Contadores de criança, painel de unidades, métricas** | Sem contar de zero até o número, sem barra de progresso crescendo. Número que anima vira placar, e placar entre casas ou pessoas é proibido (§5 do documento). |
| **Qualquer recompensa** | Sem confete, sem estrela, sem "sequência de dias", sem som de vitória, sem selo de conquista animado (inclusive na aba *conquistas* da criança: conquista é da criança, não ponto de quem registrou). |
| **A Acolhe+AI em urgência** | Sem efeito de digitação na frase de proteção; ela aparece inteira. |
| **Documentos e impressão** | `@media print{ *{ animation:none !important; transition:none !important } }`. |
| **Login depois da sessão vencida** | A folha *A sessão terminou* abre seca: quem estava escrevendo precisa ver o texto no lugar, não uma transição. |
| **Fundo, parallax, carrossel, ícones que dançam no passar** | Decoração que roda sozinha. Não. |
| **Rolagem suave forçada** (`scroll-behavior: smooth` global) | Rolar até o fim de uma chamada de 20 crianças com animação é mais lento que sem. Só no M8, e respeitando `reduce`. |

---

## 6. Iconografia

### 6.1 O que temos (medido em `icones-grade.png`)

O conjunto já é bom no essencial: **grade 24, traço 1,75, pontas e cantos redondos, `currentColor`, sempre com a
palavra ao lado**, sem arquivo para buscar (vale para o protótipo por dois cliques). Em estilo ele é praticamente
Lucide. Os problemas são de **coerência**, não de estilo:

- **85 nomes, 81 desenhos.** Quatro são o mesmo desenho com dois nomes: `cozinha` = `refeicao`, `olho` = `olhar`,
  `setores` = `busca` (a lupa) e `ocorrencias` = `alerta` (o triângulo de perigo).
- **Quase iguais com sentidos diferentes:** `cofre` e `cadeado`; `banco` e `instituicao`; `agenda` e `periodo`;
  `rotina` e `linha_do_dia` (dois relógios); `painel_numeros` e `com_sinal` (barras).
- **O triângulo de perigo como porta das Ocorrências** contraria o próprio comentário do `icones.tsx` (*"o 🚨 grita
  numa tela que a equipe abre todo dia"*): a porta de uso diário não deveria ter o desenho do alerta. Proposta: uma
  prancheta com uma marca, e o triângulo **só** para estado (`alerta`).
- **`setores` como lupa** não diz "setores"; e a busca de criança usa a mesma lupa no topo.
- **Peso ótico desigual:** `mais`, `ponto` e `impacto` ocupam um terço da área de `equipe` ou `unidades`. O `mais`
  são três `h.01` de 1,75 de traço: a 20 px, pontos de 1,5 px, o desenho mais fraco justamente na barra (achado 12).
- **`ferramenta`** está torto (a chave inglesa não fecha), **`saida`** lê como mesa ou cama, **`lanche`** tem um arco
  `a0 0 0 1 0 0` sem efeito.
- **Tamanhos soltos:** 13, 14, 16, 18, 20, 22, 26, 38, 40, 44, 46, 48 e 52 px no código, todos com o mesmo traço de
  1,75 numa grade de 24: a 13 px o traço fica com 0,95 px (some no escuro), a 52 px com 3,8 px (fica gordo).

### 6.2 Trocar por Lucide, Phosphor ou Tabler?

Licenças conferidas no registro do npm em 30/10/2026: **Lucide ISC** (`lucide-static` 1.65.0), **Tabler MIT**
(`@tabler/icons` 3.50.0), **Phosphor MIT** (`@phosphor-icons/core` 2.1.1). As três permitem uso e cópia com o aviso
de licença. Peso: um ícone desses tem de 300 a 700 bytes; o pacote inteiro do Lucide tem 54 MB desempacotado, e por isso
**não se instala pacote**, copia-se o `d` dos que forem usados.

| | Lucide | Tabler | Phosphor |
|---|---|---|---|
| Grade e traço | 24, traço 2, redondo | 24, traço 2, redondo | 256, seis pesos (thin a fill, duotone) |
| Parecido com o nosso | **quase idêntico** | parecido | outro desenho; trocaria a cara do sistema |
| Tem o que nos falta | prancheta, mamadeira, cama, pílula, porta, chave inglesa, sinal | ainda mais (6 mil) | tem pesos para o item ativo |

**Recomendação: manter o nosso `icones.tsx` como dono do desenho, e usar o Lucide como fonte.** Isto é: os 81 que
estão certos ficam; os que estão tortos, repetidos ou fracos (uns 15) são substituídos pelo `d` do ícone equivalente
do Lucide, copiado para o `DESENHOS` com uma linha de crédito e o texto da licença ISC num `LICENSE-icones.txt`.
Ganha-se desenho testado por milhares de projetos, sem dependência, sem rede, sem mudar o estilo. Tabler serve de
segunda fonte quando o Lucide não tiver; Phosphor só se a Fundação quiser **mudar a cara** do sistema, o que não é o caso.

### 6.3 A grade da casa (para quem desenhar ícone novo)

- **Prancheta 24 × 24, área viva 20 × 20** (2 px de respiro). Formas-base: círculo de 18 a 20, quadrado de 18,
  retrato 16 × 20, paisagem 20 × 16. Ícone que ocupa menos que um círculo de 16 está pequeno.
- **Traço constante na tela, não na grade:** 1,5 px em qualquer tamanho. No `Icone`:
  `strokeWidth={1.5 * 24 / (tamanho ?? 20)}` (é o `absoluteStrokeWidth` do Lucide). Resolve o 0,95 px e o 3,8 px.
- **Ponto é círculo cheio**, `r=1.25`, e não `h.01` com traço (resolve o `mais`).
- **Quatro tamanhos, e só eles:** 16 (dentro de pílula e de texto), 20 (botão, lista), 24 (aba do pé e azulejo da
  coluna), 32 (estado vazio, cabeçalho de folha). Retrato e símbolo da Acolhe+AI ficam fora da escala (não são ícones).
- **Aba ativa:** o mesmo desenho com traço 2 em vez de 1,5, além do fundo azul. A diferença de peso ajuda quem não
  distingue bem a cor, e não pede segundo desenho.
- **Um desenho, um sentido.** Nome novo que repete desenho reprova: um teste de três linhas no
  `icones-das-portas.spec.ts` (`new Set(Object.values(DESENHOS).map(d => d.join())).size === ICONES.length`), com a lista
  escrita dos sinônimos de propósito, se houver.
- **Ícone não se mexe**, com as duas exceções do M11 (sincronizando, ouvindo), que são estado.
- **Nunca sozinho:** continua valendo a regra do `icones.tsx`. Botão só de ícone (o sino, a lupa) tem `aria-label`
  e, no celular, a palavra embaixo quando houver lugar.

---

## 7. Ordem sugerida para entrar no sistema

1. **M1 (esqueleto e `null` no lugar de `[]`)** e a **altura reservada do perfil**: corrigem frases falsas, não são
   enfeite. Começar por Avisos, Chamada, Dia e Acolhidos.
2. **Os tokens (3.1)**, **M2 (toque)**, **M3 (folha)** e **M4 (tela)**: CSS puro, uma tarde, e é o que mais tira a
   sensação de "parado".
3. **M5, M6 e M7** (gravou no botão, linha que sai, número e selo juntos): mexem em três telas e em dois ganchos pequenos.
4. **M8 a M11** e a **revisão dos ~15 ícones**.
5. **M12 (vibração)** e o **Esc na folha Mais**: dependem de a Fundação dizer sim.

Depois de cada passo: `ensaio:celular` e `ensaio:acessibilidade` (cor nova no `.btn.feito` e no realce), e o
`ensaio:aparelhos` com `reducedMotion: 'reduce'` emulado, conferindo que o feedback por cor continua.

**Perguntas para a Fundação** (decisão de produto, não minha): a criança conferida fica no lugar ou vai para o fim
(M6); a vibração existe, e desligada por padrão (M12); a folha **Mais** fecha com Esc e com arrasto (M3, achado 7).

**Anotado, fora do movimento:** o Esc não fecha nenhuma folha (`App.tsx` não trata `Escape`); e o recado de sem sinal
da Chamada (*"ficou guardada neste aparelho"*) nasce no alto da tela, fora da vista de quem rolou até a criança.
