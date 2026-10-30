# Rede Acolher: referências de design e três direções visuais

*Pesquisa de design systems, 30/10/2026. Relatório 2 da equipe de design.*

---

## 0. Como foi feita a pesquisa (e o que não pude ler)

- **Lido na fonte, com os números de verdade:** baixei os pacotes oficiais pelo registro do npm e extraí os
  tokens dos arquivos SCSS e CSS. São eles: `govuk-frontend` 6.6.0, `nhsuk-frontend` 10.7.1, `@govbr-ds/core` 3.7.0,
  `@material/web` 2.5.0 (tokens M3 v0_192), `@carbon/type` 11.70 e `@carbon/layout` 11.62, `@primer/primitives` 11.10
  e `@radix-ui/colors` 3.0. Os números das seções 1 e 2 que vêm desses pacotes **não são de memória**.
- **Fontes conferidas na fonte:** baixei as versões variáveis do `@fontsource-variable` (licença **OFL-1.1** no
  pacote), medi o tamanho do woff2 latino e li os eixos, os recursos (`tnum`) e a altura-x com `fontTools`.
- **Pela busca na web** (o WebFetch não alcança m3.material.io, gov.br nem gov.uk nesta sessão, porque o
  proxy recusa esses domínios): Material 3 Expressive e o estudo do Google Research, Linear, NN/g (bottom
  sheet e modo escuro), Birdie, Nourish, Headspace, design informado por trauma e Apple HIG. Onde só
  achei resumo de terceiros, o texto diz isso.
- **De memória, para conferir:** os números do shadcn/ui e do Radix Themes (marcados com *conferir*).
- **O sistema de hoje:** li o `styles.css` (2.305 linhas), o `App.tsx` e o `fontes.css`, e olhei as
  fotos a 390 px (`/tmp/ensaio-celular/390/coordenador/162-Dia.png` e `164-Acolhidos.png`).

### 0.1 Por que hoje parece amador: o que medi no `styles.css`

| Medida | Hoje | O que um sistema maduro tem |
|---|---|---|
| Tamanhos de letra diferentes | **23** (de 9px a 38px; 20 usos de 12,5px, 17 de 13px e 17 de 13,5px) | de 7 a 9 degraus |
| Texto abaixo de 12px | 8 usos de 10,5px, 3 de 11px, 14 de 11,5px e 1 de 9px | nada abaixo de 12px (piso do M3 é label-small, 11px; NHS e GOV.UK, 16px) |
| Raios diferentes | **14** (2, 3, 4, 6, 8, 9, 10, 11, 12, 14, 16, 18, 20 e 999px) | de 5 a 6, cada um com um papel |
| Sombras escritas à mão | 23 `box-shadow` literais | 3 níveis nomeados (Primer: *resting* e *floating*) |
| Cores literais fora do `:root` | 211 hex | perto de zero, tudo por token |
| Fontes de tamanho em `style={{fontSize}}` nas telas | 32 | zero |
| **Borda do campo de texto** (`--line-2` #BDCBDC) | **1,65:1** sobre o branco e 1,56:1 sobre o `--raised` | **3:1** (WCAG 2.1, critério 1.4.11, contraste não textual). O axe não mede isso, e por isso o `ensaio:acessibilidade` passa. Nos temas rosa, azul e verde a borda também fica abaixo de 3:1 |
| Rótulo da pílula e do *eyebrow* | 11 a 11,5px, peso 800, CAIXA ALTA espaçada | 12px, peso 600 a 700, caixa normal |
| Aviso (`.notice`) | barra colorida de 4px à esquerda | a barra à esquerda já é a **cor de autor** na linha da ATA. O aviso deve usar ícone mais fundo tingido, sem a barra |

O que a Fundação chama de "amador" é sobretudo **falta de escala**: muitos tamanhos parecidos (12,5, 13
e 13,5px) que o olho não distingue como níveis, tudo pequeno e em negrito 800, e os cartões todos com o
mesmo peso. A paleta de estado está **boa e validada**. Não se mexe nela; muda o resto.

---

## 1. As referências mais úteis (16), e o que copiar de cada uma

### 1.1 GOV.UK Design System: o padrão de seriedade
<https://design-system.service.gov.uk/> · lido em `govuk-frontend` 6.6.0
- **Botão:** borda de 2px (`border-width-form-element`) e "sombra" **sólida** de 2px na tonalidade escura da cor
  (verde shade-50), raio **0**, texto 19px, padding de 8px em cima e 10px nos lados (descontada a borda). Ao apertar,
  o botão desce 2px e a sombra some. Primário verde `#0f7a52`, secundário cinza e de aviso vermelho.
- **Foco:** amarelo `#ffdd00` com sublinhado preto de 2px, visível sobre qualquer fundo.
- **Tipografia** (celular e tablet): 16/20, 19/25, 24 (21 no celular)/30, 27 (21)/30, 36 (27)/40, 48 (32)/50.
  **O corpo é 19px.**
- **Espaço:** 5, 10, 15, 20, 25, 30, 40, 50 e 60.
- **Copiar:** o **botão com fundo sólido de 2 a 3px** (dá "peso de apertar" sem sombra borrada), o foco em
  **dois tons** (anel claro e anel escuro, que aparece em qualquer tema) e a disciplina de **um botão primário
  por tela**.

### 1.2 NHS.UK frontend: cuidado de saúde, para gente cansada
<https://service-manual.nhs.uk/design-system> · lido em `nhsuk-frontend` 10.7.1
- **Espaço:** 4, 8, 16, 24, 32, 40, 48, 56 e 64.
- **Botão:** altura **48** (60 no tablet), raio **4px**, sombra sólida de **4px**, sem sombra ao apertar.
  Campo com 40px (grande, 48px). Foco: **4px** amarelo e texto preto.
- **Etiqueta (tag):** padding de 4px por 8px, 16px em negrito, borda de 1px num tom 10% mais escuro, fundo
  pálido (pale-blue `#ccdff1`, pale-green `#cce5d8`, pale-red `#f7d4d1`, pale-warm-yellow `#fff1d2`). É a mesma
  anatomia da nossa pílula, e a NHS a usa com **16px**.
- **Texto destacado (inset text):** borda de 8px. **Care cards** (urgente, não urgente, emergência): o cabeçalho
  colorido diz o nível, e o corpo traz o que fazer.
- **Copiar:** **alvo de 48px** no ato principal, a pílula com o texto maior (o nosso piso deve ser 12px, nunca
  11,5) e o modelo do *care card* para o cartão "O que fazer agora" quando há algo crítico.

### 1.3 Padrão Digital de Governo (gov.br DS): o que é familiar ao brasileiro
<https://www.gov.br/ds/> · lido em `@govbr-ds/core` 3.7.0
- **Escala tipográfica:** base de 14px e razão **1,2** (16,8, 20,16, 24,19, 29,04, 34,83 e 41,80), com pesos de
  100 a 900. Fonte: Rawline (Raleway).
- **Espaço:** base 8, com meios passos (4, 8, 12, 16, 20, 24, 28, 32...).
- **Raios:** sm **4**, md **8**, lg **16** e pill. **Botão em pílula** (`--button-radius:100em`) nas alturas
  24, 32, **40** e **48**. Primária `#1351b4`.
- **Sombra:** deslocamento de 1, 3, 6 e 9px, desfoque de 1, 3, 6 e 9px, e opacidade baixa.
- **Copiar:** a **razão de 1,2** e as **alturas de controle de 40 e 48**, que a pessoa já conhece do gov.br. **Não
  copiar:** a base de 14px, pequena demais para às 23h.

### 1.4 Material 3: a referência numérica mais completa
<https://m3.material.io/> · lido em `@material/web` 2.5.0 (tokens v0_192)
- **Tipografia** (tamanho/entrelinha e peso):
  - body L 16/24, M 14/20 e S 12/16 (400);
  - title L 22/28 (400), M 16/24 (500) e S 14/20 (500);
  - label L 14/20, M 12/16 e S 11/16 (500);
  - headline S 24/32, M 28/36 e L 32/40.
- **Forma:** 0, **4, 8, 12, 16, 28** e full (9999).
- **Barra de navegação:** altura **80**, indicador **64×32 em pílula** atrás do ícone, ícone de 24px e rótulo
  label-medium (12/16).
- **Botão cheio:** **40px**, forma full, ícone de 18px. **Chip de filtro:** 32px e raio 8 (o chip **não** é pílula).
- **Lista:** 1 linha **56**, 2 linhas **72**, 3 linhas **88**, margem de 16 e ícone de 24.
- **Aba primária:** 48px, indicador de **3px**.
- **Elevação (dp):** 0, 1, 3, 6, 8 e 12. No escuro, a elevação vira **tom de superfície**, e não sombra.
- **Copiar:** o **indicador em pílula atrás do ícone** na barra do pé (troca o "botão inteiro azul" de hoje), as
  alturas de lista, e a ideia de que **chip tem canto, pílula é redonda**: duas formas para dois sentidos.

### 1.5 Material 3 Expressive (2025): a parte "viva" com dado
<https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/>
- Google: 46 estudos e mais de 18 mil participantes. Com rastreio do olhar, a pessoa achou o botão principal
  **até 4× mais rápido**. No artigo do Google Research (48 pessoas, 10 apps), o olhar chegou ao elemento certo
  **33% mais rápido** e a tarefa terminou **20% mais rápido**; quem tinha 45 anos ou mais foi tão bem quanto os
  mais novos. *São estudos do próprio Google.*
- **O que dá o efeito:** o ato principal **maior**, com **cor própria** e **perto do polegar**; contraste de
  **forma** entre os grupos (o cartão principal com outra forma); **contenção** (agrupar em superfícies
  tonais); movimento com **mola**.
- **Forma expressiva** (pacote Flutter de terceiros, a conferir): acrescenta 20, 32 e 48 à escala de 4/8/12/16/28.
- **Copiar:** o cartão **"Agora"** com forma e cor diferentes do resto, o ato principal de 48 a 56px na zona do
  polegar, e a mola **só** na navegação e na folha (nunca no dado).

### 1.6 Apple Human Interface Guidelines
<https://developer.apple.com/design/human-interface-guidelines/> · *pela busca, por resumos de terceiros; conferir*
- Alvo mínimo de **44×44 pt**. Corpo de **17 pt**; o *caption 2* (11 pt) é o piso absoluto. Dynamic Type
  chega a cerca de 200%.
- **Título grande** (34 pt) que encolhe para 17 pt ao rolar. **Lista agrupada inset**. **Folha** com
  *detents* (meia altura e altura cheia) e alça.
- **Copiar:** o **título grande "Hoje" que encolhe** ao rolar (devolve altura ao conteúdo), a **lista agrupada**
  para o perfil e a Minha conta, e o controle segmentado para *Agora / Minhas / Tudo / Por criança*.

### 1.7 IBM Carbon: densidade para quem gere
<https://carbondesignsystem.com/> · lido em `@carbon/type` e `@carbon/layout`
- **Escala produtiva:** label01 12/16 (+0,32px), heading01 14/20 (600), heading02 16/24 (600), e duas escalas
  separadas, *productive* e *expressive*.
- **Espaço:** 2, 4, 8, 12, 16, 24, 32, 40 e 48 (miniunidade de 8).
- **Copiar:** a ideia de **duas densidades com os mesmos tokens**: a *expressiva* no celular do plantão e a
  *produtiva* no monitor da coordenação e da gestão (Equipe, Painel das unidades, Período). Liga-se por uma
  classe na moldura, sem tela nova.

### 1.8 GitHub Primer: sombras e controles bem calibrados
<https://primer.style/> · lido em `@primer/primitives` 11.10
- **Controles:** 28, 32, **40** e **48**, com padding lateral de 8, 12 ou 16.
- **Raios:** 3, **6** (padrão), **12** e full.
- **Sombra em repouso** (pequena): `0 1px 1px #1f23280a, 0 1px 2px #1f232808`. Média (cartão):
  `0 1px 1px #25292e1a, 0 3px 6px #25292e1f`.
- **Sombra flutuante** (média): quatro camadas de 8, 32, 48 e 96px de desfoque com alfa de 8%.
- **Copiar:** a **receita de sombra em duas camadas com alfa baixíssimo**, e os nomes de papel: *em repouso*
  (cartão) e *flutuante* (folha e menu). Hoje temos 23 sombras soltas.

### 1.9 Radix Colors 3.0: neutros com matiz, por papel
<https://www.radix-ui.com/colors> · lido em `@radix-ui/colors`
- **Doze degraus**, cada um com um papel: 1 e 2 são fundo, 3 a 5 fundo de componente, 6 a 8 borda, 9 e 10
  sólido, 11 e 12 texto. Cada escala tem o par escuro.
- **Cinzas com matiz:** *slate* (azulado: `#fcfcfd … #60646c #1c2024`), *sand* (quente: `#fdfdfc … #63635e #21201c`),
  *sage*, *olive* e *mauve*. Azul escuro: `#0d1520 #111927 #0d2847 #003362 …`. O 4º degrau do azul escuro é
  praticamente o **navy da Fundação** (`#003262`).
- **Copiar:** o **método** (cada token com papel: fundo, borda, sólido, texto). É o que resolve a borda do campo
  (degrau 8, e não 6) e os 211 hex soltos.

### 1.10 Linear: temas gerados, e não escritos à mão
<https://linear.app/now/how-we-redesigned-the-linear-ui>
- Em 2024 trocaram **98 variáveis por tema** por **três**: *base*, *acento* e *contraste*, num gerador em **LCH**
  (cores com a mesma luminosidade parecem igualmente claras). Moldura mais apagada, conteúdo à frente.
- **Copiar:** é o que os **oito temas** pedem. Hoje cada tema reescreve de 15 a 20 tokens à mão, e os temas
  rosa, azul e verde erraram a borda do campo. Com *base, acento e contraste* em `oklch()` e `color-mix()`
  (que o CSS já usa), cada tema vira três linhas. A medição continua no `ensaio:acessibilidade`.

### 1.11 shadcn/ui e Radix Themes: a estética atual da web
<https://ui.shadcn.com/> · <https://www.radix-ui.com/themes> · *de memória, conferir*
- shadcn: um raio-base (`--radius: 0.625rem`, 10px) do qual saem os outros (sm = base − 4, lg = base + 4).
  Botões h-9 (36), h-8 (32) e h-10 (40). Anel de foco de 3px com 50% de alfa. `muted-foreground` para o apoio.
- Radix Themes: escala de raio 3, 4, 6, 8, 12, 16 e full, com fator de escala por tema.
- **Copiar:** **derivar os raios de um só** (`--r-base`), para um tema "mais quadrado" ou "mais redondo" mudar
  uma linha só.

### 1.12 NN/g: folha de baixo e modo escuro
<https://www.nngroup.com/articles/bottom-sheet/> · <https://www.nngroup.com/articles/dark-mode/>
- **Folha de baixo:** mostra informação temporária **sem esconder** a tela de trás. Os problemas mais vistos
  são não ter um jeito **claro de fechar** e **empilhar folhas** (o pior deles). A folha em tela cheia parece
  uma página, e a pessoa se perde.
- **Modo escuro:** no claro a pessoa **lê e acerta mais**; o escuro é **mais confortável** com pouca luz;
  a fadiga não muda. Halação para quem tem astigmatismo. Cinza escuro, e não preto puro.
- **Copiar:** a folha com **alça e botão Fechar escrito**, **nunca uma folha sobre outra** (a segunda substitui a
  primeira, com Voltar), e o rodapé fixo. O escuro das 20h às 8h continua **escolha**, com neutros que não
  são preto puro.

### 1.13 Birdie e Nourish: apps de quem cuida
<https://www.birdie.care/product-features/carer-app> · <https://nourishcare.com/product/care>
- **Birdie:** o fluxo é ver a escala, fazer a visita e registrar. A **linha do tempo das mudanças com quem
  fez** fica na lateral da visita. Blocos verdes para o feito e vermelhos para o não feito. Funciona sem
  internet (0,6 MB por visita, dado da empresa).
- **Nourish:** nota por **voz** e **foto**, e *Quick-Close Tags*: registro em **um toque**.
- **Person Centred Software:** registro **por ícone**, quase sem digitar.
- **Copiar:** o **"Concluir" em um toque** na própria linha do dia (já temos), as escolhas rápidas como
  **chips grandes** e o microfone em evidência. **Não copiar:** o vermelho para "não feito": aqui o não feito
  é **estado** (atenção), nunca falha de alguém.

### 1.14 Headspace: o tom acolhedor sem infantilizar
<https://designcompass.org/en/2024/04/30/headspace/>
- No *rebrand* de 2024 (interno, com a Italic Studio, e a fonte própria da Colophon), a marca foi
  **mais profissional**, além da meditação. O fundo é creme (perto de `#FAF4EE`, *extração de terceiros*), a tinta
  é carvão quente e a **ilustração é a identidade**.
- **Copiar:** **o calor vem do fundo e da ilustração, não da cor saturada.** Já temos os retratos ilustrados
  (`retratos.ts`). Encaixar o retrato num círculo com fundo tonal suave, e usar a ilustração no estado vazio,
  é o que dá vida sem fazer a tela parecer de criança.

### 1.15 Design informado por trauma
<https://blog.chayn.co/trauma-informed-design-understanding-trauma-and-healing-f289d281495c> · UXPA Journal,
*Trauma-Informed Design: Leveraging Usability Heuristics on a Social Services Website*
- Os oito princípios da Chayn: segurança, escolha, equidade, privacidade, responsabilidade, pluralidade,
  partilha de poder e esperança. O tom é decisão de design ("a pessoa se sente empurrada ou tem espaço?").
  Há muita sobreposição com as heurísticas de usabilidade.
- **Copiar:** **previsibilidade** (o mesmo botão no mesmo lugar em toda tela), **nada de alarme sem motivo** (o
  vermelho só para o crítico de verdade), **nada de celebração** (sem confete nem medalha) e o estado vazio
  **calmo**: "Nada esperando por você agora", e não "Parabéns!".

### 1.16 Atkinson Hyperlegible Next: a fonte do texto
<https://www.brailleinstitute.org/freefont/> · lido em `@fontsource-variable/atkinson-hyperlegible-next` 5.3
- Lançada em fevereiro de 2025 pelo Braille Institute, em **OFL-1.1**. **Variável de 200 a 800** (a de hoje tem
  só 400 e 700). Tem `tnum` (números de largura igual, para as horas da linha do dia) e altura-x de 0,496 do em.
- **Tamanho medido:** woff2 latino variável com **34 KB**; acentos do português incluídos.
- **Copiar:** trocar a Atkinson v1 (dois pesos) pela **Next variável**. Com ela vêm os pesos 500 e 600, que
  faltam hoje; é por isso que tudo sai em 700 e 800.

#### As fontes candidatas medidas (todas OFL-1.1 e embutíveis; woff2 latino, eixo de peso)

| Fonte | Eixos | Peso do arquivo | `tnum` | Altura-x / em | Papel |
|---|---|---|---|---|---|
| Atkinson Hyperlegible Next | wght 200–800 | 34,0 KB | sim | 0,496 | texto, nas três direções |
| Bricolage Grotesque | wght 200–800 (opsz e wdth no arquivo completo, 77 KB) | 41,3 KB | sim | 0,528 | títulos, direção C |
| Fraunces | wght 100–900 (SOFT, WONK e opsz no completo, 121 KB; só SOFT, 62 KB) | 36,6 KB | não | 0,482 | títulos, direção A |
| Public Sans | wght 100–900 | 26,8 KB | sim | 0,517 | títulos, direção B |
| Figtree | wght 300–900 | 20,2 KB | sim | 0,500 | alternativa enxuta |
| Manrope | wght 200–800 | 24,8 KB | sim | 0,540 | alternativa |
| Onest | wght 100–900 | 33,8 KB | sim | 0,527 | alternativa |
| Literata | wght 200–900 | 52,5 KB | sim | 0,507 | serifa de texto (relatório) |

**Conta do peso:** o `fontes.css` de hoje tem **120 KB** para seis faces estáticas. Duas fontes variáveis
(Atkinson Next com 34 KB mais Bricolage com 41 KB) somam 75 KB, perto de **100 KB em base64**. O arquivo fica
**menor**, com todos os pesos. O `scripts/gerar-fontes.mjs` já faz o embutido.

---

## 2. Três direções visuais

As três mantêm, sem negociar:
- **as quatro cores com sentidos separados:**
  - estado: pílula clara com letra colorida, a única forma totalmente redonda e pequena;
  - autor: só a borda da linha da ATA;
  - cargo: só o círculo cheio com as iniciais;
  - casa: só a barra e o ponto do cartão da chamada.
- **a paleta de estado de hoje** (validada; recalculei as pílulas sobre os fundos novos, tabela 2.4);
- **o azul da Fundação** (`#003262` navy e `#005993` azul; o logotipo é um coração em degradê desses dois);
- **Atkinson Hyperlegible Next no texto** (a legibilidade não é o que diferencia as direções);
- **360 px sem rolagem lateral**, com 16px de margem;
- **nenhum número de pessoa ou criança em destaque comparativo.**

### Direção A: "Casa": acolhedora e quente

**A ideia:** papel e tinta. Fundo creme, tinta navy, cantos generosos e títulos com serifa macia. Parece o
caderno bom da casa, não um sistema; a seriedade vem da tinta escura e do texto, o calor vem do papel.

- **Fontes:**
  - títulos: **Fraunces**, com o eixo SOFT em 50 a 100 (cantos suaves), pesos 600 e 700 e opsz automático. Usar o
    arquivo "soft" (62 KB) ou o de peso só (37 KB);
  - texto: **Atkinson Hyperlegible Next**.
  - Fraunces não tem `tnum`, então horas e números ficam sempre na Atkinson.
- **Escala** (razão de cerca de 1,25):
  - display 32/38 Fraunces 700;
  - título 1, 24/30;
  - título 2, 20/26 Fraunces 600;
  - título 3, 17/24 Atkinson 700;
  - corpo 16/25;
  - pequeno 15/22;
  - rótulo 14/20 (600);
  - legenda 13/18;
  - mínimo 12/16 (700).
- **Paleta clara:**
  - ground `#F6F1E9` · surface `#FFFDF9` · sunken `#ECE5DA`;
  - ink `#1D2433` (navy quase preto) · muted `#635A4F` · line `#E5DCCF` · borda de campo `#8C8070`;
  - marca `#005993` · container da marca `#E1ECF6`, com a tinta `#003262` sobre ele;
  - títulos `#003262`.
- **Paleta escura** (castanho noturno, sem preto):
  - ground `#16130F` · surface `#1F1B16` · sunken `#110F0C`;
  - ink `#F3EDE4` · muted `#ADA293` · line `#342E27` · campo `#7A6F61`;
  - marca `#8CC1EA`, com a tinta escura sobre ela.
- **Raios:** campo 12, botão 16, cartão **22**, folha **28**, pílula full.
- **Sombras:** quentes, `0 1px 2px rgba(60,40,20,.06), 0 6px 18px -6px rgba(60,40,20,.10)`, e flutuante
  `0 24px 48px -12px rgba(40,25,10,.28)`.
- **Densidade:** arejada. Margem de 20 no cartão, 12 entre cartões, linha de lista de 68.
- **Cartão:** sem borda, papel mais claro sobre o creme e sombra quente. O título em Fraunces, com o ícone da
  categoria num quadrado de 40 e raio 12, no tom da categoria a 14%.
- **Botão:**
  - primário cheio navy `#003262`, 48px, raio 16, texto 16/600 branco, ícone de 20;
  - secundário: contorno de 1,5px em `#8C8070` com tinta navy;
  - terciário: só texto azul sublinhado.
- **Navegação:** a barra do pé creme com borda de cima; o item ativo com a **pílula navy cheia** (56×32) atrás do
  ícone (honra a decisão de 27/09 do "item aberto preenchido"); rótulo de 12/16 a 600.
- **A tela "Dia":**
  - no alto, sobre o creme: "**Hoje**" em Fraunces 32, e embaixo "quinta, 30 de outubro · Plantão noturno, 20h–8h"
    em 15px muted, com o chip da casa "AI3 · Casa 03" à direita;
  - o cartão **"O que mudou desde o seu último plantão"** em papel branco, com três linhas de lista com ícone
    (ocorrência, ATA, remédio) e uma ação de texto "Ver tudo";
  - a **linha do dia** com trilho fino de 2px, as horas em 13/600 com números de largura igual à esquerda e os
    eventos como cartões leves; o marcador **"agora 23:12"** é uma pílula navy que corta o trilho;
  - o ato do momento (Assinar minha passagem) vem como botão navy de largura cheia.
- **O perfil da criança:**
  - capa creme com o **retrato ilustrado** de 96px num círculo de fundo tonal, o nome em Fraunces 28, e
    "9 anos · na casa há 1 ano e 3 meses" em muted;
  - logo abaixo, o bloco **"Cuidados"**: alergia, restrição e remédio de hoje, cada um como linha com ícone e a
    pílula de estado só quando há estado;
  - as abas em linha rolável com indicador de 3px; as seções como **lista agrupada inset** (raio 22), estilo
    Ajustes do iPhone.
- **Risco:** o creme pode ler como "velho" sob a lâmpada fria. A Fraunces exige cuidado com o peso: abaixo de 600,
  vira editorial demais.

### Direção B: "Prontuário": clínica e precisa

**A ideia:** um instrumento de trabalho. Neutros frios, linhas finas, cantos pequenos, nada de sombra no conteúdo
e informação densa e alinhada. A beleza vem do alinhamento e do ritmo, como o Linear, o Primer e o Carbon.

- **Fontes:**
  - títulos: **Public Sans** 600 e 700 (a fonte do governo dos EUA, sóbria);
  - texto: **Atkinson Hyperlegible Next** com `tnum` ligado em toda tabela e hora.
- **Escala** (razão de cerca de 1,2, produtiva):
  - display 26/32 (700);
  - título 1, 20/28;
  - título 2, 17/24 (600);
  - título 3, 15/22 (700);
  - corpo 15/22;
  - pequeno 14/20;
  - rótulo 14/20 (600);
  - legenda 13/18;
  - mínimo 12/16 (600, +0,02em).
- **Paleta clara** (com base na *slate* do Radix):
  - ground `#F6F7F9` · surface `#FFFFFF` · sunken `#ECEEF2`;
  - ink `#151B23` · muted `#59626F` · line `#DFE3E8` · campo `#868F9B`;
  - marca `#005993` · container `#E3EEF7`;
  - títulos `#003262`.
- **Paleta escura:**
  - ground `#0F1114` · surface `#17191D` · sunken `#0B0C0E`;
  - ink `#ECEEF1` · muted `#A3AAB4` · line `#2A2E34` · campo `#6B727C`;
  - marca `#86BDEB`.
- **Raios:** 4 nos chips e campos, **6** nos botões, **8** nos cartões, **12** nas folhas, full nas pílulas.
- **Sombras:** o conteúdo não tem sombra (borda de 1px `line`); a flutuante é a da Primer
  (`0 8px 16px -4px #25292e14, 0 24px 48px -12px #25292e14`).
- **Densidade:** compacta. Linha de lista de **52** (com avatar de 36), botão de **40** (44 no celular), margem de 12.
- **Cartão:** "painel" com cabeçalho de 40px separado por linha, rótulo em 12px muted e conteúdo em linhas
  zebradas suaves.
- **Botão:**
  - primário azul `#005993`, 40 a 44px, raio 6, texto 15/600;
  - secundário: contorno de 1px em `line` com tinta ink;
  - terciário: texto azul.
- **Navegação:** a barra do pé branca, o ativo com **traço de 3px em cima** e a tinta da marca. No monitor, a coluna
  lateral de 232px com o item ativo em fundo `sunken`.
- **A tela "Dia":** um cabeçalho compacto ("Hoje · Noturno 20h–8h · AI3"); uma **tabela-linha do tempo**
  (coluna da hora de 52px, a categoria por ponto de 8px, o título e a pílula de estado à direita, o botão
  "Concluir" compacto); filtros em controle segmentado de 36px. Cabem 9 a 10 eventos numa tela de 390.
- **O perfil da criança:** cabeçalho em linha (avatar de 56, nome a 20/600, idade e tempo na casa); a faixa
  "Cuidados" em fundo `sunken` com três colunas no monitor e uma no celular; as abas com traço; cada seção como
  tabela de pares rótulo e valor (o rótulo em 13 muted, o valor em 15 ink).
- **Risco:** é exatamente o oposto do que a Fundação pediu ("vivas e interativas"). Serve à gestão e à
  coordenação no monitor e cansa no plantão. **Entra como a densidade "produtiva" da direção C**, não como
  direção própria.

### Direção C: "Coração": viva e expressiva (a RECOMENDADA)

**A ideia:** o coração em degradê do logotipo virou linguagem. O "Agora" é um cartão navy em degradê,
diferente de tudo; o resto é calmo, branco e arejado, com forma clara para cada coisa. É Material 3 Expressive
com a disciplina da NHS: um destaque por tela, o resto em silêncio.

- **Fontes:**
  - títulos: **Bricolage Grotesque** 650 a 800 (grotesca com personalidade, contemporânea, nada infantil; no
    arquivo completo o eixo opsz afina os títulos grandes);
  - texto: **Atkinson Hyperlegible Next** 400 a 700.
- **Escala** (razão de cerca de 1,2, piso de 12):
  - display 30/36 (800, −0,02em);
  - título 1, 24/30 (750);
  - título 2, 20/26 (700);
  - título 3, 17/24 (Atkinson 700);
  - corpo **16/24**;
  - pequeno 15/22;
  - rótulo 14/20 (600);
  - legenda 13/18 (500);
  - mínimo **12/16** (700).
- **Paleta clara:**
  - ground `#F1F4F9` · surface `#FFFFFF` · raised `#F8FAFD` · sunken `#E5EBF3`;
  - ink `#0D1A2B` · ink-2 `#28384D` · muted `#536174` · line `#DAE2EC` · **campo `#7A889C`** (3,6:1);
  - marca `#005993` · navy `#003262` · **container da marca `#D9E9F8`**, com a tinta `#002E5A`;
  - **degradê do coração** `#003262 → #004A80 → #0B6AAE`.
- **Paleta escura:**
  - ground `#0A1220` · surface `#111B29` · raised `#192536` · sunken `#070D17`;
  - ink `#E8EEF6` · muted `#97A7BA` · line `#22314A` · campo `#5D6F89`;
  - marca `#8EC5F2` (fundo cheio com tinta escura) · container `#12304E`.
- **Raios** (uma forma para cada sentido):

  | Raio | Onde |
  |---|---|
  | 6 | caixa de marcar |
  | **10** | chips e escolhas, quando se pode tocar |
  | **12** | campos |
  | **14** | botões e avisos |
  | **20** | cartões |
  | **28** | folha de baixo e cartão "Agora" |
  | **full** | **só** a pílula de estado, o indicador da barra do pé e os avatares |

  Com isso, botão e pílula nunca têm a mesma forma: hoje o `.btn.sec` (tinta azul sobre azul claro) é quase uma
  pílula `c-info`.
- **Sombras** (tinta azulada, duas camadas):
  - em repouso: `0 1px 2px rgba(13,26,43,.06), 0 1px 1px rgba(13,26,43,.04)`;
  - erguida: `0 2px 4px rgba(13,26,43,.05), 0 10px 24px -6px rgba(0,50,98,.16)`;
  - flutuante: `0 16px 48px -8px rgba(0,30,60,.30)`.
  - No escuro, sem sombra: elevação por tom de superfície e borda de 1px.
- **Densidade:** duas.
  - **Plantão (padrão):** lista de 64, botão primário de 48, controles de 44 e margem de 16.
  - **Gestão** (classe `.densa` na moldura, monitor de 1080px ou mais): lista de 52, controle de 40 e margem de 12,
    com a escala produtiva da direção B.
- **Cartão:** branco, raio 20, borda de 1px `line` e sombra em repouso, com margem de 16. O cabeçalho tem o ícone
  da categoria num **quadrado de 40 e raio 12**, o fundo no tom da categoria a 14% e o ícone na tinta sólida (é cor
  de *categoria*, que já existe). O título em 17/24 e a meta em 13 muted. O **cartão "Agora"** é o único navy em
  degradê, com raio 28 e texto branco.
- **Botões** (âncora de 48px no celular):
  - **Primário:** fundo `#005993`, texto branco 16/600, raio 14, ícone de 20 à esquerda e padding de 0 por 20.
    Ao apertar, escala de 0,97 e fundo `#00497A`; a sombra erguida só no botão "do momento".
  - **Secundário (tonal):** fundo `#D9E9F8` com a tinta `#002E5A` (11:1), sem borda e 44px.
  - **Terciário:** sem fundo, tinta `#005993` 15/600, sublinhado de 1px com afastamento de 3px e alvo de 44px.
  - **Foco:** anel de 3px `#0A7BC4` afastado 2px, mais um anel interno de 2px na cor da superfície (aparece sobre o
    navy e sobre o branco).
  - **Desligado:** fundo `sunken` com tinta muted, nunca só opacidade (a opacidade de 0,42 de hoje reprova o
    contraste do texto).
- **Navegação:**
  - **barra do pé** de 64px mais a área segura, com fundo `surface` a 92%, desfoque de 12px e borda de cima de 1px;
  - o ativo com **pílula navy cheia de 56×32** atrás do ícone (decisão de 27/09), o ícone branco e o rótulo
    12/16 a 700 em ink; o inativo com o ícone muted;
  - o indicador **escorrega com mola** entre os itens (220ms, só sem `prefers-reduced-motion`);
  - **topo:** o título grande "Hoje" em 30/36 encolhe para 17 ao rolar;
  - **abas internas:** controle segmentado de 40px, trilho `sunken` com raio 12 e o ativo branco com sombra em repouso;
  - **abas do perfil:** roláveis, de 48px, com indicador de 3px na cor da aba (a cor da aba **nunca** em pílula,
    regra da 208).
- **Folha de baixo:**
  - raio 28 em cima, alça de 36×4 e **"Fechar" escrito** no canto (NN/g);
  - o título em Bricolage 20;
  - **rodapé fixo** com os botões e fundo `surface`, separado por uma sombra só quando o conteúdo rola por baixo;
  - altura máxima de 92dvh, e **nunca folha sobre folha**.
- **Avisos:**
  - fundo do estado a 10%, raio 14, ícone de 20 na tinta sólida e o título em 15/700 ink. **Sem a barra
    à esquerda** (é a cor de autor);
  - o crítico ganha uma borda de 1,5px da tinta sólida em volta toda (o *care card* da NHS).
- **Estado vazio:** um círculo de 72 em `brand-container` com o ícone de traço de 32, o título em 17/24 ("Nada
  esperando por você agora"), uma frase em 15 muted e no máximo uma ação. Sem confete.
- **Linha do tempo:**
  - coluna da hora de 48 (13/600 com números de largura igual), trilho de 2px `line` a 60px e nó de 12px na cor
    da categoria, com anel de 3px da superfície;
  - o que passou fica com o nó vazado e o título em ink-2;
  - **agora:** pílula navy "agora · 23:12" e um traço de 2px `#0A7BC4` atravessando.
- **Calendário:** grade de 7, células de no mínimo 44×52, o dia em 15/600 com números de largura igual e duas barras
  de 4px embaixo (manhã e noite) na cor de **estado**. Hoje com anel de 2px da marca; o escolhido com fundo da
  marca e tinta branca.
- **A tela "Dia":**
  1. o topo de uma linha (logotipo, casa e sino);
  2. o título grande "**Hoje**" em Bricolage 30, com "qui, 30 out · Noturno 20h–8h" em 15 muted;
  3. o **cartão "Agora"** em degradê navy, raio 28: "**3 coisas esperam você**" em 20/700 branco, embaixo as três
     linhas (o ícone num círculo branco a 16%, o texto em branco a 92%) e o botão branco de 48px "Começar pela
     primeira", com tinta navy. É a única peça de cor forte da tela, e o olho vai lá primeiro (a lição do M3
     Expressive). Quando nada espera, o cartão encolhe para uma linha clara: "Nada esperando por você agora";
  4. o "O que mudou" como cartão branco recolhível;
  5. o controle segmentado *Agora · Minhas · Tudo · Por criança*;
  6. a **linha do dia**, com o marcador do agora;
  7. a barra do pé com a pílula.
- **O perfil da criança:**
  - a **capa:** faixa `brand-container` de 120px com o retrato ilustrado de 96px num círculo branco com borda de 4px
    `surface`, que transborda a faixa pela metade;
  - o nome em Bricolage 28/34 e "9 anos · Casa 03 · na casa há 1 ano e 3 meses" em 15 muted;
  - logo abaixo, **"O que protege"**: um cartão com alergia, restrição e cuidados como linhas de 52 com ícone. A
    pílula de estado só aparece se há estado (a alergia é *informação*, não alarme: ícone âmbar e texto ink, sem
    fundo vermelho);
  - as abas roláveis com indicador colorido; a aba **Geral** como cartões de 20 em grade de duas colunas a
    partir de 600px e lista agrupada no celular;
  - os atos ("Registrar", "Anexar") como **um botão flutuante estendido** de 56 (Registrar), raio 16 e ícone mais
    texto, acima da barra do pé. É um ato só, e os outros ficam na folha que ele abre.
- **Por que recomendo:**
  - responde ao pedido literal ("lindas, vivas, interativas, saindo do padrão");
  - tem **dado de usabilidade** a favor (destaque único, forma e cor distintas);
  - nasce do **logotipo** (o degradê e o coração);
  - mantém o branco e a Atkinson onde se lê;
  - **absorve a B** como densidade de gestão.
- **Da A, vale levar o calor do fundo:** a variante "C com neutros quentes" troca só os sete tokens de neutros
  pelos da A, e é um bom tema de escolha.

### 2.4 Contraste conferido (WCAG 2.1; calculado com a fórmula da norma)

| Par | A claro | A escuro | B claro | B escuro | **C claro** | **C escuro** |
|---|---|---|---|---|---|---|
| tinta sobre ground / surface / sunken | 13,8 / 15,3 / 12,4 | 15,9 / 14,7 / 16,4 | 16,2 / 17,3 / 14,9 | 16,3 / 15,1 / 16,8 | **15,9 / 17,5 / 14,6** | **16,1 / 14,8 / 16,7** |
| apoio (muted) sobre ground / surface / sunken | 6,01 / 6,66 / 5,40 | 7,38 / 6,82 / 7,62 | 5,76 / 6,17 / 5,32 | 8,07 / 7,51 / 8,36 | **5,72 / 6,31 / 5,26** | **7,63 / 7,05 / 7,93** |
| borda de campo sobre surface (exige 3:1) | 3,80 | 3,48 | 3,27 | 3,62 | **3,60** | **3,38** |
| texto sobre a marca cheia | 7,37 | 9,64 | 7,37 | 9,45 | **7,37** | **10,19** |
| tinta sobre o container da marca | 10,74 | 10,15 | 10,93 | 10,96 | **11,03** | **10,62** |
| foco sobre surface (exige 3:1) | 4,45 | 8,91 | 4,52 | 8,79 | **4,52** | **9,42** |
| pílulas (ok/warn/crit/info/med/move/other/mute) | 4,70 / 6,25 / 5,24 / 5,58 / 5,82 / 4,59 / 4,95 / 6,18 | todas ≥ 7,15 | todas ≥ 4,67 | todas ≥ 7,45 | **4,74 / 6,31 / 5,32 / 5,64 / 5,92 / 4,67 / 5,03 / 6,29** | **todas ≥ 7,37** |

Outros pares:
- o botão tonal C (`#005993` sobre `#D9E9F8`): 5,95;
- o branco sobre o fim do degradê (`#0B6AAE`): 5,70; sobre `#0A7BC4`, só 4,52 (no limite, por isso o degradê
  termina em `#0B6AAE`);
- a borda de campo de hoje: **1,65** (reprova o critério 1.4.11).

O `ensaio:acessibilidade` continua sendo a prova; estes números são da proposta.

---

## 3. Tokens CSS da direção C, prontos para substituir o `:root`

**Compatibilidade:**
- os **nomes que as telas já usam ficam** (`--ground`, `--surface`, `--raised`, `--sunken`, `--ink`, `--ink-2`,
  `--muted`, `--line`, `--line-2`, `--navy`, `--navy-2`, `--titulo`, `--brand`, `--brand-2`, `--brand-soft`,
  `--brand-solid`, `--on-navy`, a paleta de estado, `--on-solid`, `--shadow-1`, `--shadow-2`, `--focus`, `--r-sm`,
  `--r-md` e `--r-lg`). A troca do bloco não quebra tela nenhuma;
- **a paleta de estado está idêntica à de hoje** (validada pelo ensaio);
- o que é novo vem com prefixo próprio, para os componentes migrarem aos poucos;
- **sai** o tema `contraste`. A família da fonte cai na Atkinson v1 e na Plus Jakarta enquanto o
  `gerar-fontes.mjs` não embutir as duas novas.

```css
/* ============================================================
   REDE ACOLHER: tokens, direção "Coração" (viva e expressiva)
   Cor comunica ESTADO OPERACIONAL e categoria, nunca julgamento.
   Quatro cores, quatro sentidos: estado (pílula), autor (borda da
   linha da ATA), cargo (círculo de iniciais), casa (barra e ponto).
   ============================================================ */
:root {
  color-scheme: light;

  /* ---- Neutros (matiz do navy, croma baixo) ---- */
  --ground:#F1F4F9; --surface:#FFFFFF; --raised:#F8FAFD; --sunken:#E5EBF3;
  --ink:#0D1A2B; --ink-2:#28384D; --muted:#536174;           /* muted ≥ 5,26:1 nos três fundos */
  --line:#DAE2EC;                                              /* divisória, só enfeite */
  --line-2:#7A889C;                                            /* BORDA DE CAMPO: 3,6:1 (WCAG 1.4.11) */
  --line-3:#C4CFDC;                                            /* contorno de cartão em hover, alça da folha */

  /* ---- Marca da Fundação ---- */
  --navy:#003262; --navy-2:#00254A; --titulo:#003262;
  --brand:#005993; --brand-2:#0A7BC4; --brand-solid:#005993; --brand-press:#00497A;
  --brand-soft:#D9E9F8;            /* container tonal (botão secundário, capa do perfil) */
  --on-brand-soft:#002E5A;         /* tinta sobre o container: 11:1 */
  --on-navy:#DCEBF7;
  --coracao:linear-gradient(135deg,#003262 0%,#004A80 55%,#0B6AAE 100%); /* só o cartão "Agora" e a entrada */

  /* ---- Estado e categoria (IGUAIS aos de hoje; não mexer sem o ensaio) ---- */
  --emerald:#10B981; --emerald-solid:#047857;
  --amber:#F59E0B;   --amber-solid:#92400E;
  --red:#EF4444;     --red-solid:#B91C1C;
  --blue:#3B82F6;    --blue-solid:#1D4ED8;
  --violet:#8B5CF6;  --violet-solid:#6D28D9;
  --cyan:#06B6D4;    --cyan-solid:#0E7490;
  --pink:#EC4899;    --pink-solid:#BE185D;
  --slate:#64748B;   --slate-solid:#475569;
  --on-solid:#FFFFFF;

  /* ---- Foco: dois anéis, aparece no branco e no navy ---- */
  --focus:#0A7BC4;
  --focus-ring:0 0 0 2px var(--surface), 0 0 0 5px var(--focus);

  /* ---- Tipografia ---- */
  --font-ui:"Atkinson Hyperlegible Next","Atkinson Hyperlegible",system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-display:"Bricolage Grotesque","Plus Jakarta Sans","Atkinson Hyperlegible Next",system-ui,sans-serif;
  /* tamanho / entrelinha / peso: escala de ~1,2, piso de 12px */
  --t-display:800 30px/36px var(--font-display);  --t-display-track:-.02em;
  --t-title-1:750 24px/30px var(--font-display);  --t-title-1-track:-.015em;
  --t-title-2:700 20px/26px var(--font-display);  --t-title-2-track:-.01em;
  --t-title-3:700 17px/24px var(--font-ui);
  --t-body:400 16px/24px var(--font-ui);
  --t-body-sm:400 15px/22px var(--font-ui);
  --t-label:600 14px/20px var(--font-ui);
  --t-caption:500 13px/18px var(--font-ui);
  --t-micro:700 12px/16px var(--font-ui);          /* pílula, contador, eyebrow: nunca abaixo disto */
  --t-num:tabular-nums;                            /* horas, contadores, calendário */

  /* ---- Espaço (grade de 4) ---- */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px;
  --sp-6:24px; --sp-7:32px; --sp-8:40px; --sp-9:48px;
  --gutter:16px;                                   /* margem lateral a 360 px */

  /* ---- Forma: uma para cada sentido ---- */
  --r-check:6px;
  --r-chip:10px;      /* escolha que se toca (chip, opção) */
  --r-field:12px;     /* campo, select, textarea */
  --r-btn:14px;       /* botão e aviso: NUNCA redondo, para não parecer pílula de estado */
  --r-card:20px;
  --r-sheet:28px;     /* folha de baixo e cartão "Agora" */
  --r-pill:999px;     /* SÓ pílula de estado, indicador da barra do pé e avatar */
  /* nomes antigos, apontando para os novos papéis */
  --r-sm:var(--r-field); --r-md:var(--r-btn); --r-lg:var(--r-card);

  /* ---- Alturas (alvo mínimo 44, ato principal 48) ---- */
  --h-ctl-sm:36px;    /* chip, controle compacto (o alvo é completado pelo espaço em volta) */
  --h-ctl:44px;       /* botão secundário, campo, segmentado */
  --h-ctl-lg:48px;    /* botão primário */
  --h-fab:56px;       /* botão flutuante estendido do perfil */
  --h-row:64px;       /* linha de lista com avatar de 44 e duas linhas */
  --h-row-1:52px;     /* linha de uma linha só */
  --h-nav:64px;       /* barra do pé, sem a área segura */
  --nav-pill-w:56px; --nav-pill-h:32px;
  --avatar-sm:32px; --avatar:44px; --avatar-lg:96px;

  /* ---- Elevação (no claro, sombra; no escuro, tom) ---- */
  --shadow-1:0 1px 2px rgba(13,26,43,.06), 0 1px 1px rgba(13,26,43,.04);            /* em repouso: cartão */
  --shadow-2:0 2px 4px rgba(13,26,43,.05), 0 10px 24px -6px rgba(0,50,98,.16);       /* erguido: o "Agora", o ato do momento */
  --shadow-3:0 16px 48px -8px rgba(0,30,60,.30), 0 2px 6px rgba(0,30,60,.08);        /* flutuante: folha, menu */
  --scrim:rgba(7,18,32,.48);

  /* ---- Movimento (só sem prefers-reduced-motion) ---- */
  --dur-1:120ms; --dur-2:200ms; --dur-3:320ms;
  --ease-out:cubic-bezier(.2,0,0,1);
  --ease-emph:cubic-bezier(.05,.7,.1,1);
  --ease-mola:linear(0, .25 6%, .66 17%, .92 28%, 1.03 40%, 1.04 52%, 1.01 68%, 1);  /* indicador da barra, folha */
}

/* ---------- Escuro: neutros azul-noite, sem preto puro ---------- */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
    --ground:#0A1220; --surface:#111B29; --raised:#192536; --sunken:#070D17;
    --ink:#E8EEF6; --ink-2:#C3CFDD; --muted:#97A7BA;
    --line:#22314A; --line-2:#5D6F89; --line-3:#33445E;
    --navy:#0A1B2C; --navy-2:#061420; --titulo:#E8EEF6;
    --brand:#8EC5F2; --brand-2:#7BC0EC; --brand-solid:#8EC5F2; --brand-press:#B3D8F6;
    --brand-soft:#12304E; --on-brand-soft:#D2E7FA; --on-navy:#BFDCF2;
    --coracao:linear-gradient(135deg,#0B2747 0%,#103A63 55%,#14507F 100%);
    --emerald:#34D399; --emerald-solid:#6EE7B7;
    --amber:#FBBF24;   --amber-solid:#FCD34D;
    --red:#F87171;     --red-solid:#FCA5A5;
    --blue:#60A5FA;    --blue-solid:#93C5FD;
    --violet:#A78BFA;  --violet-solid:#C4B5FD;
    --cyan:#22D3EE;    --cyan-solid:#67E8F9;
    --pink:#F472B6;    --pink-solid:#F9A8D4;
    --slate:#94A3B8;   --slate-solid:#CBD5E1;
    --on-solid:#07121C;
    --focus:#8EC5F2;
    --shadow-1:0 0 0 1px var(--line);
    --shadow-2:0 0 0 1px var(--line-3), 0 8px 24px rgba(0,0,0,.35);
    --shadow-3:0 0 0 1px var(--line-3), 0 24px 56px rgba(0,0,0,.55);
    --scrim:rgba(0,0,0,.6);
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --ground:#0A1220; --surface:#111B29; --raised:#192536; --sunken:#070D17;
  --ink:#E8EEF6; --ink-2:#C3CFDD; --muted:#97A7BA;
  --line:#22314A; --line-2:#5D6F89; --line-3:#33445E;
  --navy:#0A1B2C; --navy-2:#061420; --titulo:#E8EEF6;
  --brand:#8EC5F2; --brand-2:#7BC0EC; --brand-solid:#8EC5F2; --brand-press:#B3D8F6;
  --brand-soft:#12304E; --on-brand-soft:#D2E7FA; --on-navy:#BFDCF2;
  --coracao:linear-gradient(135deg,#0B2747 0%,#103A63 55%,#14507F 100%);
  --emerald:#34D399; --emerald-solid:#6EE7B7;
  --amber:#FBBF24;   --amber-solid:#FCD34D;
  --red:#F87171;     --red-solid:#FCA5A5;
  --blue:#60A5FA;    --blue-solid:#93C5FD;
  --violet:#A78BFA;  --violet-solid:#C4B5FD;
  --cyan:#22D3EE;    --cyan-solid:#67E8F9;
  --pink:#F472B6;    --pink-solid:#F9A8D4;
  --slate:#94A3B8;   --slate-solid:#CBD5E1;
  --on-solid:#07121C;
  --focus:#8EC5F2;
  --shadow-1:0 0 0 1px var(--line);
  --shadow-2:0 0 0 1px var(--line-3), 0 8px 24px rgba(0,0,0,.35);
  --shadow-3:0 0 0 1px var(--line-3), 0 24px 56px rgba(0,0,0,.55);
  --scrim:rgba(0,0,0,.6);
}

/* ---------- Densidade de gestão (monitor), mesma escala de cor ---------- */
@media (min-width:1080px) {
  .densa {
    --t-body:400 15px/22px var(--font-ui);
    --t-title-3:700 15px/22px var(--font-ui);
    --h-ctl:40px; --h-ctl-lg:44px; --h-row:52px; --h-row-1:44px;
    --sp-4:12px; --gutter:20px; --r-card:14px;
  }
}

/* ---------- Variante "C com neutros quentes" (tema de escolha) ---------- */
:root[data-theme="quente"] {
  --ground:#F6F1E9; --surface:#FFFDF9; --raised:#FBF8F3; --sunken:#ECE5DA;
  --ink:#1D2433; --ink-2:#3A3F4B; --muted:#635A4F;
  --line:#E5DCCF; --line-2:#8C8070; --line-3:#D3C8B8;
  --brand-soft:#E1ECF6; --on-brand-soft:#003262;
}
```

### 3.1 Componentes-âncora (CSS curto, para guiar a migração)

```css
body{ background:var(--ground); color:var(--ink); font:var(--t-body); font-optical-sizing:auto; }
h1,.t-display{ font:var(--t-display); letter-spacing:var(--t-display-track); color:var(--titulo); }
h2{ font:var(--t-title-1); letter-spacing:var(--t-title-1-track); color:var(--titulo); }
h3{ font:var(--t-title-2); letter-spacing:var(--t-title-2-track); color:var(--titulo); }
:focus-visible{ outline:none; box-shadow:var(--focus-ring); }

.btn{ min-height:var(--h-ctl-lg); padding:0 var(--sp-5); border-radius:var(--r-btn);
      background:var(--brand-solid); color:var(--on-solid); font:600 16px/20px var(--font-ui); }
.btn:active{ background:var(--brand-press); transform:scale(.97); }
.btn.sec{ min-height:var(--h-ctl); background:var(--brand-soft); color:var(--on-brand-soft); border:0; }
.btn.ghost{ min-height:var(--h-ctl); background:transparent; color:var(--brand-solid); border:0;
            text-decoration:underline; text-underline-offset:3px; }
.btn:disabled{ background:var(--sunken); color:var(--muted); opacity:1; }

input,select,textarea{ min-height:var(--h-ctl); border:1.5px solid var(--line-2);
      border-radius:var(--r-field); background:var(--surface); font:var(--t-body); }

.card{ background:var(--surface); border:1px solid var(--line); border-radius:var(--r-card);
       padding:var(--sp-4); box-shadow:var(--shadow-1); }
.card.agora{ background:var(--coracao); color:#fff; border:0; border-radius:var(--r-sheet);
             box-shadow:var(--shadow-2); }

.pill{ font:var(--t-micro); padding:4px 10px; border-radius:var(--r-pill); }  /* 12px, nunca 11,5 */
.chip{ min-height:var(--h-ctl-sm); border-radius:var(--r-chip); border:1.5px solid var(--line-2); }
.notice{ border-left:0; border-radius:var(--r-btn);
         background:color-mix(in srgb,var(--c) 10%,var(--surface)); }  /* sem a barra: ela é do autor */

.tabbar{ height:calc(var(--h-nav) + env(safe-area-inset-bottom));
         background:color-mix(in srgb,var(--surface) 92%,transparent); backdrop-filter:blur(12px);
         border-top:1px solid var(--line); }
.tabbar .ind{ width:var(--nav-pill-w); height:var(--nav-pill-h); border-radius:var(--r-pill);
              background:var(--navy); }                /* "o item aberto continua preenchido" */
.sheet{ border-radius:var(--r-sheet) var(--r-sheet) 0 0; box-shadow:var(--shadow-3); }
.hora{ font:var(--t-label); font-variant-numeric:var(--t-num); }
```

---

## 4. O que a equipe deve decidir, e a ordem que eu seguiria

1. **A Fundação escolhe a direção** (eu recomendo a C). Mostrar as três no protótipo, na tela Dia e no perfil, a
   390 px, de dia e às 23h no escuro.
2. **Primeiro os tokens, depois as telas:**
   1. trocar o `:root` (é compatível);
   2. embutir a Atkinson Next e a Bricolage pelo `gerar-fontes.mjs` (com o subconjunto latino, o arquivo diminui);
   3. rodar o `ensaio:acessibilidade` nos temas que ficam.
3. **Consertar de saída, qualquer que seja a direção:** a borda do campo (1,65:1, critério 1.4.11, também nos
   temas rosa, azul e verde), o piso de 12px e o aviso sem a barra de autor.
4. **Reduzir os 23 tamanhos para 9 e os 14 raios para 7**, de tela em tela, trocando os literais pelos tokens. Os
   211 hex soltos e os 32 `fontSize` inline são o mapa do trabalho.
5. **Os oito temas** viram *base, acento e contraste* (a lição do Linear). A Fundação perde o "contraste" (já
   decidido) e pode ganhar o "quente".
6. **Medir:** o `ensaio:celular` a 360 e 390 px (alvo de 44, nada encostado) e o `ensaio:uso`. Em tela nova, abrir
   no protótipo por dois cliques e contra o servidor.
