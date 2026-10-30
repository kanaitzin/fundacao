# 4. A cor do Rede Acolher: diagnóstico e o sistema novo

*Especialista em cor, 30/10/2026. Nada do repositório foi alterado. Tudo o que está aqui foi medido por script
(`cor/paleta.mjs`, sem dependências) e conferido no protótipo aberto por `file://`, primeiro como ele está
(`fotos-cor/`, 7 temas × 1366 e 390 px × Dia, Acolhidos, perfil e Saúde) e depois com os tokens propostos
injetados por Playwright (`cor/previa/`, 9 casos × 2 larguras × Dia, perfil, Saúde e O dia, em ordem).*

Arquivos desta entrega, todos em `/tmp/claude-0/-home-user-fundacao/5c08f1de-d6ca-5b1d-ad4a-ca6d90528502/scratchpad/design/`:

| arquivo | o que é |
|---|---|
| `4-cor.md` | este documento |
| `cor/paleta.mjs` | o sistema em OKLCH, a conversão para hex e a medida de contraste; gera os três abaixo |
| `cor/tokens.css` | as variáveis prontas, por tema, com hex e com OKLCH dentro de `@supports` |
| `cor/contraste.md` | a tabela inteira de contraste (também copiada no fim deste documento) |
| `cor/tokens.json` | os mesmos valores, para a prévia e para um teste futuro |
| `cor/previa.mjs`, `cor/previa/*.png` | o protótipo com os tokens novos, sem tocar no código |
| `fotografar.mjs`, `fotos-cor/*.png` | o protótipo como está hoje, tema por tema |
| `cor/casa-ajuste.mjs` | a medida das 48 cores da casa e o ajuste das nove que não passam |

---

## 1. Diagnóstico, tema por tema

### O que é bom e fica (em todos)

- **O navy `#003262` e o azul `#005993` da Fundação.** São a identidade e têm ótimo contraste. Ficam exatos no
  tema Claro (o OKLCH proposto foi tirado deles, não aproximado).
- **A ideia das quatro cores com perguntas separadas** (estado, autor, cargo, casa) e a regra de que a cor nunca
  anda sozinha. É o melhor do sistema e é o que a proposta protege.
- **A pílula clara com letra colorida para o estado, o círculo cheio para o cargo.** A forma já separa os dois de
  relance. Fica.
- **Os neutros já têm matiz** no Claro (`#EDF1F7` é `oklch(95.7% 0.009 258)`) e no Escuro (`#151E28` é
  `oklch(23% 0.024 252)`). O problema não é *falta* de matiz; é que a escala foi montada à mão, passo a passo, e
  cada tema pedagógico repete o desenho com outros números sem a mesma lógica.
- **Os avisos com borda esquerda** (alergia, o que ficou para o próximo turno) funcionam: são o que o olho acha
  primeiro no perfil.

### O que é amador, e onde (visto nas fotos)

1. **A cor de estado é feita por `color-mix` com a superfície** (`.pill`, `.notice`, `.err`). No claro dá certo; no
   escuro, 12 a 15 % de âmbar sobre azul-noite vira **verde-oliva barrento** (o aviso do *próximo turno* e a
   restrição alimentar da Alice, `fotos-cor/dark-390-4-perfil.png`), e o vermelho vira marrom. O estado precisa de
   tokens próprios por modo, e não de mistura.
2. **No escuro, as áreas grandes de marca brilham.** A aba ativa da coluna, a aba ativa do celular, o botão da
   Acolhe+AI e o "Doses do dia" ativo são `#7BC0EC` cheio com letra escura (`fotos-cor/dark-390-5-saude.png`). O
   contraste passa (9,5), mas é a mancha mais clara da tela, e às 3h é o que a pupila da educadora fecha para ver.
   No escuro, seleção é **recipiente tonal** (fundo pouco mais claro, borda de marca), não fundo cheio luminoso.
3. **Borda de campo invisível.** `--line-2` `#BDCBDC` sobre o campo `#F6F9FC` dá **1,51:1**; no escuro, `#3B4C5D`
   sobre `#151E28` dá **1,90:1**. O WCAG 1.4.11 pede 3:1 para o contorno que identifica o controle. O axe do
   `ensaio:acessibilidade` não mede contraste de não texto, por isso nunca apareceu.
4. **As categorias do dia não passam de 3:1** como borda de 5 px: lazer `#10B981` 2,54, alimentação `#F59E0B`
   2,15, saída `#06B6D4` 2,43 contra o branco. Usam a paleta *viva* (500 do Tailwind), feita para fundo, não para
   traço fino. O comentário do CSS diz que *passaram pelo axe*; o axe não mede borda.
5. **Três cores de cargo são, ao hex, cores de estado** (a §6 e o próprio `cargos.tsx` dizem que o cargo não usa a
   família do estado):
   - Educador `#047857` = `--emerald-solid`, a letra da pílula **concluída/ok**.
   - Líder Diurno `#92400E` = `--amber-solid`, a letra da pílula **em atenção**.
   - Coordenação `#1D4ED8` = `--blue-solid`, a letra da pílula **informação**.
   A forma separa (círculo cheio contra pílula clara), mas a cor idêntica ao lado de uma pílula diz "esta pessoa
   está em atenção". É exatamente o que o arquivo quis evitar.
6. **As 48 cores da casa não passam todas de 3:1** como o comentário de `cores-da-casa.ts` afirma. Contra o fundo
   claro de hoje (`#EDF1F7`), **nove reprovam** (Girassol 2,14, Milho 2,46, Laranja 2,74, Pêssego 2,76, Mel 2,82,
   Pistache 2,83, Limão 2,84, Tangerina 2,84, Areia 2,89); contra o branco, Girassol e Milho. No escuro, **onze**
   reprovam (Chocolate 2,10, Noite 2,13, Vinho 2,19, Ameixa 2,20...).
7. **O Colorido pinta os azulejos por posição** (`nth-child(6n+k)`). A mesma tela muda de cor conforme o cargo,
   porque o menu muda: a cor não significa nada nem para quem a aprendeu. E o fundo em degradê de quatro cores
   sob tudo é o "papel de bala".
8. **O Rio Grande do Sul põe azulejo vermelho com o desenho de alerta ao lado de "Ocorrências"**
   (`fotos-cor/rs-1366-5-saude.png`: Chamada, A rotina da casa, Ocorrências e Portaria em vermelho; Agenda, ATA,
   Combinados em amarelo). O vermelho e o amarelo da bandeira **chegam à navegação**, que é vizinha das pílulas, e
   o fundo em degradê amarelo-rosado passa por trás das pílulas de atenção e crítico. O pedido de 11/10 dizia que
   eles nunca chegariam às pílulas; chegam ao lado delas.
9. **O Rosa é rosa demais e confunde o crítico.** O fundo `#FBE9F2` e o aviso crítico (vermelho a 13 %) ficam quase
   da mesma cor: a alergia da Alice perde o destaque justo no tema rosa (`fotos-cor/rosa-1366-4-perfil.png`). A
   marca `#9D2463` (matiz 354) está a 33° do vermelho de estado (27°).
10. **O Azul claro é o Claro.** Lado a lado (`azul-1366-5-saude.png` e `light-1366-...`), só a faixa do topo os
    separa. Quem escolhe "azul claro" não vê o que escolheu.
11. **O Verde e o RS usam a marca no matiz do ok.** `#146C36` (151°) e `#006B2C` (149°) contra o ok `#047857` (166°):
    o botão principal e a aba ativa ficam da cor de "concluída". Inevitável no RS (é a bandeira); dá para afastar
    um pouco no Verde.
12. **Sombra de cinza puro e sombra no escuro.** As sombras são `rgba(15,28,46,…)` (ok no claro) e, no escuro,
    `rgba(0,0,0,.5)`, que não se vê. No escuro, a camada de cima se mostra por luminosidade, não por sombra.
13. **O botão secundário cheio de ponta a ponta** ("Abrir as ocorrências", "Abrir a ATA") é `--brand-soft` com
    borda de marca: no meio de um cartão, pesa como o principal. É questão de componente (para quem cuida dos
    botões), mas a cor ajuda: o secundário passa a ser contorno `--linha-forte` com letra `--marca`.

### O Escuro "cinza demais"?

Medido, não é: a superfície de hoje tem croma 0,024 no matiz 252, mais que a média dos escuros de referência. O
que faz o escuro parecer amador são os itens 1, 2 e 12 (avisos barrentos, manchas luminosas, camadas que não se
separam), e não o cinza. A proposta mantém o azul-noite (croma 0,017 no matiz 255) e corrige os três.

### O tema Alto contraste sai

Ele hoje é o que garantia a leitura no sol e para quem enxerga pouco. Para nada se perder com a saída, a proposta
sobe a régua de **todos** os temas: texto principal acima de 12:1, texto de apoio acima de 5:1 em qualquer
superfície (o pior par medido é 5,16), borda de campo acima de 3:1 e foco acima de 3:1. Junto com o tamanho de
letra que já existe (fase 183), cobre o que o contraste cobria.

---

## 2. O que as referências dizem (e o que tirei de cada uma)

A busca funcionou; os sites `radix-ui.com` e `m3.material.io` **não abrem desta sessão** (fora dos domínios
permitidos), por isso o que vem deles é de resumos secundários e da minha leitura anterior, e está marcado assim.
O código do Tailwind v4 abriu e os valores de lá são exatos.

- **Radix Colors** (resumo secundário): escala de 12 passos, cada passo com um uso. 1 e 2 fundos de app e de
  componente, 3 a 5 fundos de componente interativo (normal, hover, pressionado), 6 a 8 bordas (sutil, de controle,
  forte/foco), 9 e 10 sólido (o 9 é a cor "pura" com letra branca), 11 texto de baixo contraste, 12 texto de alto
  contraste. E os **cinzas com matiz** (slate, mauve, sage, olive, sand) pareados com a cor de marca do mesmo lado
  do círculo. **Tirei:** a ideia de que *cada token tem um uso, e não um número*; os neutros de cada tema com o
  matiz da marca e croma baixo; e a regra de que a borda de controle é um passo próprio, mais escuro que a linha
  divisória.
- **Material 3** (resumo secundário): paletas tonais de 0 a 100; no escuro a cor de marca é o tom 80 com a letra no
  tom 20, e a superfície sobe de *Container Lowest* a *Highest* por **tom**, não por sombra (o blog de 23/03/2023
  troca a elevação por sombra pelos *surface containers*). Os neutros carregam um croma pequeno da cor de origem.
  **Tirei:** as camadas do escuro (fundo 17 %, cartão 21 %, elevado 24,6 %, folha 26,8 % de luminosidade) e a marca
  clara com letra escura no escuro, usada em botão, nunca em área grande.
- **Tailwind v4** (exato, de `theme.css`): a paleta inteira em OKLCH, com o slate em matiz 248 a 265 e croma 0,003 a
  0,046 (`slate-500 = oklch(55.4% 0.046 257.4)`), e o stone em croma 0,001 a 0,013. **Tirei:** a confirmação de que
  croma de 0,01 a 0,04 é o território dos neutros "com alma", e os pontos de referência dos tons de estado
  (`red-700 = oklch(50.5% 0.213 27.5)`, `amber-800 = oklch(47.3% 0.137 46.2)`, `emerald-700 = oklch(50.8% 0.118
  165.6)`). A letra das pílulas fica perto desses 700 e 800, e a borda das categorias passa do 500 para algo entre o
  600 e o 500.
- **Apple, cores semânticas** (resumo secundário): *label, secondaryLabel, tertiaryLabel* e
  *systemBackground / secondary / tertiary*, com o **escuro elevado** mais claro que o de base; testar o contraste no
  estado elevado. **Tirei:** os três níveis de texto (texto, texto-2, apoio) e a medida de cada um contra as cinco
  superfícies, inclusive a folha elevada.
- **Modo escuro bem feito** (vários guias): nada de preto puro nem branco puro (halação), elevação por luminosidade
  (5 a 12 % de branco por nível), cores de acento menos saturadas e mais claras. **Tirei:** texto a 93,5 %, não
  100 %; marca a croma 0,10 em vez de 0,15; estados a croma 0,05 no fundo e 0,10 na letra.
- **gov.br DS** (não confirmado pela busca): de memória, a primária é um azul `#1351B4` e a base é cinza neutro com
  muito branco; a referência que importa daqui é a **obrigação de 4,5:1** e a borda de campo escura. Os valores não
  foram conferidos e não entram na proposta.
- **Saúde e serviço social** (guias de mercado e o USWDS): azul e verde-azulado para confiança, verdes suaves e
  neutros quentes para não ficar clínico, saturação moderada e **nunca** estado só por cor. **Tirei:** os temas
  pedagógicos com croma baixa no fundo e a marca média-escura, e nada de áreas grandes de vermelho ou laranja.

Fontes: [Radix Colors (pub.dev)](https://pub.dev/documentation/radix_colors/latest/),
[composing a palette (Radix)](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette),
[Material blog: tone-based surface color](https://material.io/blog/tone-based-surface-color-m3),
[Pushing Pixels: surface containment](https://www.pushing-pixels.org/2025/06/24/chroma-color-system-part-iv-surface-containment.html),
[Flutter: new ColorScheme roles](https://docs.flutter.dev/release/breaking-changes/new-color-scheme-roles.md),
[Tailwind v4 theme.css](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/main/packages/tailwindcss/theme.css),
[Uxcel: dark mode](https://uxcel.com/blog/12-principles-of-dark-mode-design-627),
[Atmos: dark mode UI](https://atmos.style/blog/dark-mode-ui-best-practices),
[resumo da HIG (axiom)](https://playbooks.com/skills/charleswiltgen/axiom/axiom-hig-ref),
[Serpro: Design System 4.0](https://www.serpro.gov.br/menu/noticias/noticias-2024/design-system-4.0),
[USWDS colors](https://v1.designsystem.digital.gov/components/colors/),
[Progress: healthcare color](https://www.progress.com/blogs/using-color-psychology-healthcare-web-design).

---

## 3. O sistema de cor novo

### 3.1 Duas escolhas separadas: a COR e o MODO

Hoje `data-theme` guarda uma coisa só, e por isso o escuro da noite **apaga** o rosa de quem escolheu rosa. A
proposta separa:

- `data-cor` = `claro` (o da Fundação) | `rosa` | `azul` | `verde` | `colorido` | `rs`
- `data-modo` = `claro` | `escuro`

Toda cor tem o seu escuro (§5). O tema "Escuro" de hoje vira **Claro (a cor da Fundação) no modo escuro**.

### 3.2 Os tokens, por uso

| token | uso | regra medida |
|---|---|---|
| `--fundo` | atrás de tudo | — |
| `--cartao` | cartão, linha do dia, campo | texto ≥ 12:1 |
| `--elevado` | cartão em destaque, menu aberto | no claro é branco + `--sombra-2`; no escuro, +3,4 pontos de L |
| `--folha` | folha que sobe (sheet), diálogo | no claro, branco + `--sombra-3` + véu; no escuro, +5,6 pontos de L |
| `--rebaixado` | trilho, legenda, campo dentro de cartão | apoio ≥ 4,5 sobre ele |
| `--realce` | hover de linha e de botão fantasma | — |
| `--linha` | divisória (não é controle) | sem mínimo, é enfeite |
| `--linha-forte` | contorno de campo, botão secundário, caixa de marcar | ≥ 3:1 contra cartão e rebaixado |
| `--texto` | texto principal | ≥ 12:1 |
| `--texto-2` | texto de corpo secundário | ≥ 8,9:1 |
| `--apoio` | legenda, data, quem escreveu | ≥ 5:1 em todas as superfícies |
| `--titulo` | títulos (navy no claro) | ≥ 4,5 |
| `--marca` | link, ícone ativo, letra do botão secundário | ≥ 4,5 contra cartão, fundo e marca-suave |
| `--marca-forte` | botão principal, aba ativa no claro | `--sobre-marca` ≥ 4,5 |
| `--marca-hover` | hover do principal | `--sobre-marca` ≥ 4,5 |
| `--marca-suave` | aba ativa no escuro, botão tonal, seleção | `--titulo` e `--marca` ≥ 4,5 sobre ela |
| `--foco` | anel de foco de 3 px | ≥ 3:1 contra cartão e fundo |
| `--moldura` | faixa do topo do tema | enfeite |
| `--{crit,warn,ok,info}-fundo` | fundo da pílula e do aviso | — |
| `--{…}-borda` | contorno da pílula e borda esquerda do aviso | enfeite (a palavra e o desenho carregam o sentido) |
| `--{…}-texto` | letra da pílula, título do aviso | ≥ 4,5 sobre o próprio fundo **e** sobre o cartão |
| `--{…}-solido` + `--sobre-solido` | pílula cheia (`.pill.solid`) | ≥ 4,5 |

**Sombras** (no matiz do neutro, não cinza puro):

```css
:root {
  --sombra-1: 0 1px 2px oklch(25% 0.03 250 / .06), 0 1px 3px oklch(25% 0.03 250 / .07);
  --sombra-2: 0 2px 4px oklch(25% 0.03 250 / .05), 0 8px 20px oklch(25% 0.03 250 / .08);
  --sombra-3: 0 12px 32px oklch(25% 0.03 250 / .16), 0 2px 6px oklch(25% 0.03 250 / .08);
  --veu: oklch(22% 0.03 250 / .45);           /* atrás da folha */
}
:root[data-modo="escuro"] {
  --sombra-1: none;
  --sombra-2: 0 0 0 1px oklch(100% 0 0 / .06);  /* a camada se mostra pela luz, o fio só desenha a borda */
  --sombra-3: 0 0 0 1px oklch(100% 0 0 / .08), 0 16px 40px oklch(0% 0 0 / .5);
  --veu: oklch(5% 0.01 255 / .6);
}
```

### 3.3 Os estados (as mesmas cores em todos os temas, um par por modo)

- **Matizes fixos e afastados:** crítico 27°, atenção 55° (letra) / 85° (fundo), ok 165°, informação 262°. Nenhum
  tema mexe neles.
- **Pílula = fundo próprio + borda + letra**, sem `color-mix`. No escuro, fundo a 28 % de L com croma 0,045 a 0,065
  e letra a 83–87 %: acabou o oliva.
- **A letra de estado passa também contra o cartão** (≥ 6,3 no claro), para o número do painel e o título do aviso.

```css
.pill { background: var(--p-fundo); border: 1px solid var(--p-borda); color: var(--p-texto); }
.pill.solid { background: var(--p-solido); border-color: var(--p-solido); color: var(--sobre-solido); }
.notice { background: var(--p-fundo); border-left: 4px solid var(--p-borda); color: var(--texto-2); }
.notice b { color: var(--p-texto); }
.c-crit { --p-fundo: var(--crit-fundo); --p-borda: var(--crit-borda); --p-texto: var(--crit-texto); --p-solido: var(--crit-solido); }
.c-warn { --p-fundo: var(--warn-fundo); --p-borda: var(--warn-borda); --p-texto: var(--warn-texto); --p-solido: var(--warn-solido); }
.c-ok   { --p-fundo: var(--ok-fundo);   --p-borda: var(--ok-borda);   --p-texto: var(--ok-texto);   --p-solido: var(--ok-solido); }
.c-info { --p-fundo: var(--info-fundo); --p-borda: var(--info-borda); --p-texto: var(--info-texto); --p-solido: var(--info-solido); }
/* .c-med, .c-move, .c-other, .c-mute e .c-brand (categorias e autor) continuam no esquema de hoje,
   com a mesma troca de color-mix por tokens quando alguém mexer neles. */
```

### 3.4 O cargo (proposta; a decisão é da Fundação, porque as cores de cargo foram escolhidas em 23/09)

Mesmas famílias, para quem já aprendeu não estranhar, mas **nenhuma igual a uma letra de estado**, e todas com
letra branca acima de 6:1:

| cargo | hoje | proposto | por quê |
|---|---|---|---|
| coordenador | `#1D4ED8` (= info) | `#21459D` `oklch(42% 0.15 264)` | mais profundo que a letra de informação |
| lider_diurno | `#92400E` (= atenção) | `#73452B` `oklch(44% 0.075 50)` | castanho, sai do âmbar de atenção |
| lider_noturno_geral | `#3730A3` | `#3D3291` `oklch(39% 0.15 282)` | quase igual |
| equipe_tecnica | `#6D28D9` | `#6F2FB7` `oklch(47% 0.20 300)` | quase igual |
| educador | `#047857` (= ok) | `#006459` `oklch(45% 0.08 182)` | verde-pinho, 17° longe do ok e mais escuro |
| enfermagem | `#0E7490` | `#026B85` `oklch(49% 0.09 222)` | quase igual |
| cozinha | `#9D174D` | `#8D2157` `oklch(44% 0.15 355)` | um pouco mais longe do vermelho |
| portaria | `#4D5B0E` | `#4F5C1B` `oklch(45% 0.09 120)` | quase igual |
| gestor_geral | `#334155` | `#364355` | igual |
| admin_tecnico | `#52525B` | `#525259` | igual |

O anel de 2 px na cor da superfície (`box-shadow: 0 0 0 2px var(--cartao)`) continua: contra o cartão escuro os
círculos dão 1,7 a 2,9, e é o anel que os recorta.

### 3.5 A casa (as 48 cores das chamadas)

- **No claro:** as nove que não passam de 3:1 contra o fundo descem só a luminosidade, mantendo o matiz e o nome
  (tabela abaixo). As outras 39 ficam.
- **No escuro:** em vez de uma segunda lista, a mesma cor clareada, que o navegador calcula:
  `:root[data-modo="escuro"] .chamada { --cor-casa-tela: oklch(from var(--cor-casa) calc(l + 0.14) c h); }`
  (Chrome 119+, Safari 16.4+; sem suporte, cai na cor original, que só perde contraste). Medido: as 48 passam, a
  pior com 3,81.

| cor | hoje | contra `#EDF1F7` | contra branco | ajuste | contra `#EDF1F7` |
|---|---|---:|---:|---|---:|
| Limão | `#7E9A1C` | 2.84 | 3.22 | `oklch(62.2% 0.147 122.2)` `#789410` | 3.07 |
| Pistache | `#7A9A45` | 2.83 | 3.21 | `oklch(62.3% 0.119 126.7)` `#74943F` | 3.06 |
| Girassol | `#C9A21A` | 2.14 | 2.42 | `oklch(63.2% 0.143 90.6)` `#AB8400` | 3.07 |
| Milho | `#C4931A` | 2.46 | 2.79 | `oklch(63.2% 0.136 83.4)` `#B18100` | 3.08 |
| Mel | `#C08422` | 2.82 | 3.20 | `oklch(63.3% 0.129 73.9)` `#B87C15` | 3.12 |
| Laranja | `#D97A1C` | 2.74 | 3.11 | `oklch(64.2% 0.152 58.0)` `#CF7106` | 3.08 |
| Tangerina | `#E0702A` | 2.84 | 3.22 | `oklch(64.6% 0.160 48.4)` `#D96A22` | 3.07 |
| Pêssego | `#D9774F` | 2.76 | 3.13 | `oklch(64.6% 0.134 42.4)` `#D06F47` | 3.06 |
| Areia | `#A68A5B` | 2.89 | 3.28 | `oklch(63.3% 0.072 79.9)` `#A18557` | 3.08 |

### 3.6 As categorias do dia

Mesmos matizes, com a luminosidade de traço (≥ 3,78 contra o branco) e uma versão clara para o escuro (≥ 6,1):
saúde `#CD4290`, medicamento `#8151DB`, educação `#2A71D6`, lazer `#15915C`, alimentação `#BE7100`, saída
`#0090A8`, ocorrência `#D73431`, rotina `#6C7989`. Ficam em tokens próprios (`--cat-*`) e não emprestam mais a
paleta viva: assim mudar a cor de um estado nunca muda uma categoria por acidente. A ocorrência continua vermelha
de propósito (é o mesmo assunto que a pílula crítica); a alimentação fica em laranja-queimado, longe do âmbar da
atenção.

### 3.7 O hex de reserva, e a armadilha das variáveis

O OKLCH vai dentro de `@supports (color: oklch(0% 0 0))`, **depois** do hex. Não basta escrever as duas linhas
seguidas: variável CSS não é conferida quando é lida, e um navegador sem OKLCH guardaria o texto da segunda linha e
pintaria *transparente* (valor inválido no uso), em vez de cair no hex da primeira. O `@supports` resolve. Todos os
valores OKLCH entregues já estão dentro da gama sRGB (o croma foi cortado onde saía, e o corte está anotado no fim),
por isso hex e OKLCH são a mesma cor também numa tela P3.

### 3.8 Para não quebrar o que existe: os nomes de hoje apontam para os novos

```css
:root {
  --ground: var(--fundo);   --surface: var(--cartao);  --raised: var(--realce);  --sunken: var(--rebaixado);
  --ink: var(--texto);      --ink-2: var(--texto-2);   --muted: var(--apoio);
  --line: var(--linha);     --line-2: var(--linha-forte);
  --brand: var(--marca);    --brand-2: var(--marca);   --brand-solid: var(--marca-forte);
  --brand-soft: var(--marca-suave);                    --on-solid: var(--sobre-marca);
  --focus: var(--foco);     --navy: var(--moldura);
  --red-solid: var(--crit-texto);   --amber-solid: var(--warn-texto);
  --emerald-solid: var(--ok-texto); --blue-solid: var(--info-texto);
  --shadow-1: var(--sombra-1); --shadow-2: var(--sombra-2);
}
```

Foi exatamente esse mapeamento que a prévia injetou no protótipo (`cor/previa.mjs`), e as telas abriram inteiras
nos sete temas e nos dois escuros de exemplo, a 1366 e a 390 px.

---

## 4. Cada tema que fica

Todos: cartão branco no claro (a letra sempre sobre fundo liso), fundo com o matiz do tema a croma 0,01, e **nenhum
degradê por trás do conteúdo**. A cor do tema vive na moldura (faixa do topo de 4 px), na marca (botão, aba ativa,
link) e nos neutros. O que muda em relação a hoje:

| tema | ideia | marca | o que muda de hoje |
|---|---|---|---|
| **Claro** | o navy da Fundação | `#005993`, títulos `#003262` | fundo um pouco mais claro (`#F1F5F9`), borda de campo `#76828E` (3:1), sombras no matiz |
| **Escuro** | noite azul | `#7DC0EE` letra, `#6DB3E4` botão | camadas por luz (17 / 21 / 24,6 / 26,8 %), estados com fundo próprio, aba ativa tonal, Acolhe+AI tonal, texto a 93,5 % |
| **Rosa** | rosa-chá com ameixa | `#8D3060` | fundo `#FAF2F5` (antes `#FBE9F2`, metade da croma): o aviso crítico volta a destacar; marca mais escura e longe do vermelho |
| **Azul claro** | céu e piscina | `#006787`, faixa `#1F93B8` | matiz 225 a 232 (o Claro é 250): agora se vê que é outro tema |
| **Verde** | sálvia e mata | `#33642E` | marca no 142°, mais amarelada e menos saturada, longe do ok (165°) |
| **Colorido** | lilás de base, cor nas portas | `#6738C1` | fundo liso `#F5F3FA` no lugar do degradê; **a cor de cada porta é fixa pela porta** (Dia sempre framboesa, Chamada sempre azul…), seis azulejos sem vermelho nem amarelo; faixa do topo nas mesmas seis |
| **Rio Grande do Sul** | campo e bandeira | `#0B6729` | fundo liso `#F2F6EF`; **o vermelho e o amarelo só na faixa do topo** (60 / 20 / 20, o verde domina), os azulejos todos no verde da marca; nada da bandeira ao lado de "Ocorrências" |

Os azulejos do Colorido (desenho sobre azulejo, todos acima de 5,3:1): framboesa `#942D66`/`#FFE2EE`, azul
`#2454B3`/`#E0ECFF`, água `#006B74`/`#CDF4F6`, violeta `#6F2FB7`/`#EEE7FF`, folha `#36692A`/`#DAF4D4`, céu
`#06658E`/`#D6EFFF`. A porta escolhe o seu pela lista de `portas.ts` (um campo novo, `azulejo`), nunca por posição.

A faixa da bandeira no RS: `linear-gradient(90deg, #009739 0 60%, #DA291C 60% 80%, #FFCD00 80%)` em 5 px.

---

## 5. O escuro das 20h às 8h, e o tema escolhido

**O que fazer:**

1. **O escuro da noite respeita a cor escolhida.** Às 20h, o rosa de quem escolheu rosa vira o *rosa escuro*
   (neutros escuros no matiz 350, marca `#EFA9C7`), e às 8h volta. Hoje ele vira o escuro azul de todo mundo, e
   quem escolheu uma cor perde a escolha na metade do plantão. Com `data-cor` e `data-modo` separados (§3.1) isso é
   só `data-modo="escuro"`; os cinco escuros estão prontos em `tokens.css`.
2. **Três opções de modo na Minha conta:** *Claro*, *Escuro*, *Automático (escuro das 20h às 8h)*. Sem escolha
   guardada, segue o aparelho, como hoje. **Sugestão para a Fundação decidir:** os celulares da casa saírem com o
   *Automático* ligado, porque é o aparelho que passa de mão em mão e a madrugada é de todo turno noturno.
3. **A troca nunca no meio de um registro.** Hoje o `setInterval` de um minuto troca a tela com a folha aberta e o
   dedo digitando. A troca espera não haver campo com foco nem folha aberta (e acontece de qualquer jeito na próxima
   troca de tela), com transição de 200 ms em `background-color` e `color`, desligada com `prefers-reduced-motion`.
4. **À noite, nada grande e luminoso.** Aba ativa, item da coluna e o botão da Acolhe+AI no escuro são
   **tonais** (`--marca-suave` com o desenho em `--marca` e um traço de 3 px), e o botão principal cheio fica só
   onde é o ato da tela. A faixa "PROTÓTIPO" só existe no protótipo, mas no escuro ela é o maior bloco claro; no
   sistema de verdade não aparece.
5. **O que o escuro NÃO muda:** os sentidos. As pílulas trocam de valor (estão na tabela, todas acima de 8,4), não
   de matiz; a categoria, o cargo e a casa idem.
6. **Medir os dois modos de cada cor.** O `ensaio:acessibilidade` hoje mede oito temas; com a proposta, mede seis
   cores × dois modos (doze), e o teste de contraste de não texto (borda de campo, foco, borda de categoria, barra da
   casa) entra junto, porque o axe não o faz. O `paleta.mjs` já faz essa conta e pode virar o teste.

---

## 6. Para quem for implementar (ordem sugerida, cada passo com o seu ensaio)

1. Tokens novos + nomes antigos apontando para eles (§3.8): nada muda de desenho; roda o `ensaio:acessibilidade`.
2. Pílulas e avisos por token (§3.3): some o oliva do escuro.
3. Borda de campo `--linha-forte`, categorias e as nove cores da casa.
4. Rosa, Azul claro, Verde, Colorido e RS refinados; tirar os degradês de fundo; azulejo por porta.
5. `data-cor` + `data-modo`, os cinco escuros, o *Automático* e a troca que espera o registro.
6. Cargos (só com a decisão da Fundação).

**Achados que não são de cor, anotados para avisar:** o comentário de `cores-da-casa.ts` (*"qualquer uma passa no
contraste de elemento gráfico (3:1)"*) e o da linha do tempo (*"os nove tons já passaram pelo axe-core"*) afirmam
medidas que não valem; e o `cargos.tsx` diz que o cargo não usa a família de estado enquanto três cargos usam o hex
exato de uma letra de estado.

---

## 7. A paleta de cada tema em hex (resumo)

| token | claro | escuro | rosa | azul | verde | colorido | rs | rosa-escuro | azul-escuro | verde-escuro | colorido-escuro | rs-escuro |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fundo | `#F1F5F9` | `#0B1016` | `#FAF2F5` | `#EDF6FA` | `#F1F6F0` | `#F5F3FA` | `#F2F6EF` | `#140D10` | `#091114` | `#0B110C` | `#100E15` | `#0C110C` |
| cartao | `#FFFFFF` | `#141921` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#1F161A` | `#101A1F` | `#131B15` | `#191720` | `#141B14` |
| elevado | `#FFFFFF` | `#1B212A` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#281D22` | `#172328` | `#1A231C` | `#211F29` | `#1B231B` |
| folha | `#FFFFFF` | `#20272F` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#2D2227` | `#1C282D` | `#202921` | `#26242E` | `#202820` |
| rebaixado | `#E8EEF4` | `#0E1319` | `#F5EAEE` | `#E2F0F5` | `#E8F0E7` | `#EEEBF5` | `#EAEFE6` | `#181014` | `#0B1418` | `#0E150F` | `#131119` | `#0E150F` |
| linha | `#D9E0E8` | `#282E37` | `#E9DBE1` | `#D2E3EA` | `#DAE3D8` | `#E1DDE9` | `#DCE2D6` | `#352A2F` | `#243035` | `#273129` | `#2E2C36` | `#283028` |
| linha-forte | `#76828E` | `#727D8B` | `#907883` | `#688692` | `#768573` | `#837C90` | `#7A8470` | `#88767E` | `#6D7F88` | `#728074` | `#7C798A` | `#738073` |
| texto | `#131C29` | `#E6EAEF` | `#29141E` | `#001F2D` | `#0D2112` | `#1E182A` | `#102010` | `#EEE7EA` | `#E4EBEE` | `#E6EBE6` | `#EAE8EF` | `#E6EBE6` |
| texto-2 | `#353F4D` | `#C5CBD3` | `#4E3641` | `#234352` | `#304434` | `#413A4E` | `#324432` | `#D2C7CC` | `#C2CCD2` | `#C5CDC6` | `#CBC9D3` | `#C5CDC5` |
| apoio | `#586371` | `#9BA4B0` | `#725A65` | `#496775` | `#546857` | `#645E72` | `#566756` | `#AE9EA5` | `#97A6AD` | `#9BA79C` | `#A4A1AF` | `#9CA79B` |
| titulo | `#003262` | `#EAEFF5` | `#652545` | `#004964` | `#1D4825` | `#4A2292` | `#114C24` | `#F4ECEF` | `#E8F0F4` | `#EAF0EB` | `#EFEDF5` | `#EAF0EA` |
| marca | `#005993` | `#7DC0EE` | `#8D3060` | `#006787` | `#33642E` | `#6738C1` | `#0B6729` | `#EFA9C7` | `#82CDEA` | `#98D299` | `#C0B0FE` | `#86D391` |
| marca-forte | `#005993` | `#6DB3E4` | `#8D3060` | `#006787` | `#33642E` | `#6738C1` | `#0B6729` | `#DB96B4` | `#6FBAD7` | `#85BF86` | `#AD9DEA` | `#73C07F` |
| marca-suave | `#E1F0FE` | `#17344C` | `#FDE7F0` | `#D9F3FC` | `#E4F4E1` | `#F1EBFF` | `#E3F4E2` | `#452734` | `#0F3745` | `#213821` | `#322D49` | `#1F3923` |
| foco | `#0074B8` | `#78C7FD` | `#B3417B` | `#0080A7` | `#3F8439` | `#7A4FD9` | `#18883A` | `#F7A9CB` | `#7CD1F3` | `#96D798` | `#C3B4FF` | `#83D890` |
| moldura | `#003262` | `#6DB3E4` | `#8D3060` | `#1F93B8` | `#33642E` | `#6738C1` | `#0B6729` | `#DB96B4` | `#6FBAD7` | `#85BF86` | `#AD9DEA` | `#73C07F` |

Estados (iguais em todos os temas claros; e iguais em todos os escuros):

| token | claro | escuro |
|---|---|---|
| crit-fundo | `#FFEFEF` | `#451B19` |
| crit-borda | `#FBBBB8` | `#A03F3C` |
| crit-texto | `#A91D1D` | `#FFAFAC` |
| crit-solido | `#B91C1E` | `#FDA19E` |
| warn-fundo | `#FFF5E0` | `#3A250B` |
| warn-borda | `#F4CA89` | `#8C5E1A` |
| warn-texto | `#8C4705` | `#FACD78` |
| warn-solido | `#8C4705` | `#FAC463` |
| ok-fundo | `#E2FBEF` | `#0E2F22` |
| ok-borda | `#9FDEC2` | `#2A7257` |
| ok-texto | `#006D4E` | `#83E5BC` |
| ok-solido | `#006D4E` | `#69D6AA` |
| info-fundo | `#EBF4FF` | `#182A45` |
| info-borda | `#B6D0F6` | `#3963A1` |
| info-texto | `#2556B4` | `#AACDFB` |
| info-solido | `#2556B4` | `#97C1F7` |
| sobre-solido | `#FFFFFF` | `#0E141D` |

---

## 8. As variáveis CSS prontas, por tema (`cor/tokens.css`)

Seletores no esquema novo (`data-cor` e `data-modo`). Para usar antes da troca, basta trocar `[data-cor="rosa"]` por `[data-theme="rosa"]` e `[data-modo="escuro"]` por `[data-theme="dark"]`; os temas pedagógicos só trazem neutros e marca, e herdam os estados do `:root`.

```css
:root, :root[data-cor="claro"] {
  --fundo: #F1F5F9;
  --cartao: #FFFFFF;
  --elevado: #FFFFFF;
  --folha: #FFFFFF;
  --rebaixado: #E8EEF4;
  --realce: #F5F8FB;
  --linha: #D9E0E8;
  --linha-forte: #76828E;
  --texto: #131C29;
  --texto-2: #353F4D;
  --apoio: #586371;
  --titulo: #003262;
  --marca: #005993;
  --marca-forte: #005993;
  --marca-hover: #00497A;
  --marca-suave: #E1F0FE;
  --sobre-marca: #FFFFFF;
  --foco: #0074B8;
  --moldura: #003262;
  --crit-fundo: #FFEFEF;
  --crit-borda: #FBBBB8;
  --crit-texto: #A91D1D;
  --crit-solido: #B91C1E;
  --warn-fundo: #FFF5E0;
  --warn-borda: #F4CA89;
  --warn-texto: #8C4705;
  --warn-solido: #8C4705;
  --ok-fundo: #E2FBEF;
  --ok-borda: #9FDEC2;
  --ok-texto: #006D4E;
  --ok-solido: #006D4E;
  --info-fundo: #EBF4FF;
  --info-borda: #B6D0F6;
  --info-texto: #2556B4;
  --info-solido: #2556B4;
  --sobre-solido: #FFFFFF;
}
@supports (color: oklch(0% 0 0)) {
  :root, :root[data-cor="claro"] {
    --fundo: oklch(96.8% 0.007 250);
    --cartao: oklch(100% 0.000 0);
    --elevado: oklch(100% 0.000 0);
    --folha: oklch(100% 0.000 0);
    --rebaixado: oklch(94.6% 0.010 250);
    --realce: oklch(97.7% 0.006 250);
    --linha: oklch(90.5% 0.013 250);
    --linha-forte: oklch(60% 0.024 250);
    --texto: oklch(22.5% 0.028 255);
    --texto-2: oklch(36.5% 0.028 255);
    --apoio: oklch(49.5% 0.026 255);
    --titulo: oklch(31.76% 0.098 253);
    --marca: oklch(45.13% 0.118 246.9);
    --marca-forte: oklch(45.13% 0.118 246.9);
    --marca-hover: oklch(39.5% 0.104 247);
    --marca-suave: oklch(94.8% 0.025 245);
    --sobre-marca: oklch(100% 0.000 0);
    --foco: oklch(54% 0.136 245);
    --moldura: oklch(31.76% 0.098 253);
    --crit-fundo: oklch(96.5% 0.017 20);
    --crit-borda: oklch(85% 0.075 22);
    --crit-texto: oklch(47.5% 0.175 27);
    --crit-solido: oklch(50.5% 0.190 27);
    --warn-fundo: oklch(97.2% 0.029 85);
    --warn-borda: oklch(86% 0.095 78);
    --warn-texto: oklch(47.5% 0.115 55);
    --warn-solido: oklch(47.5% 0.115 55);
    --ok-fundo: oklch(96.6% 0.030 165);
    --ok-borda: oklch(85% 0.075 165);
    --ok-texto: oklch(47.5% 0.099 165);
    --ok-solido: oklch(47.5% 0.099 165);
    --info-fundo: oklch(96.3% 0.017 255);
    --info-borda: oklch(85% 0.060 258);
    --info-texto: oklch(47.5% 0.160 262);
    --info-solido: oklch(47.5% 0.160 262);
    --sobre-solido: oklch(100% 0.000 0);
  }
}
:root[data-modo="escuro"] {
  --fundo: #0B1016;
  --cartao: #141921;
  --elevado: #1B212A;
  --folha: #20272F;
  --rebaixado: #0E1319;
  --realce: #192028;
  --linha: #282E37;
  --linha-forte: #727D8B;
  --texto: #E6EAEF;
  --texto-2: #C5CBD3;
  --apoio: #9BA4B0;
  --titulo: #EAEFF5;
  --marca: #7DC0EE;
  --marca-forte: #6DB3E4;
  --marca-hover: #80C3F2;
  --marca-suave: #17344C;
  --sobre-marca: #091521;
  --foco: #78C7FD;
  --moldura: #6DB3E4;
  --crit-fundo: #451B19;
  --crit-borda: #A03F3C;
  --crit-texto: #FFAFAC;
  --crit-solido: #FDA19E;
  --warn-fundo: #3A250B;
  --warn-borda: #8C5E1A;
  --warn-texto: #FACD78;
  --warn-solido: #FAC463;
  --ok-fundo: #0E2F22;
  --ok-borda: #2A7257;
  --ok-texto: #83E5BC;
  --ok-solido: #69D6AA;
  --info-fundo: #182A45;
  --info-borda: #3963A1;
  --info-texto: #AACDFB;
  --info-solido: #97C1F7;
  --sobre-solido: #0E141D;
}
@supports (color: oklch(0% 0 0)) {
  :root[data-modo="escuro"] {
    --fundo: oklch(17% 0.014 255);
    --cartao: oklch(21.2% 0.017 255);
    --elevado: oklch(24.6% 0.019 255);
    --folha: oklch(26.8% 0.019 255);
    --rebaixado: oklch(18.5% 0.015 255);
    --realce: oklch(24% 0.019 255);
    --linha: oklch(30% 0.019 255);
    --linha-forte: oklch(58.5% 0.026 255);
    --texto: oklch(93.5% 0.009 255);
    --texto-2: oklch(84% 0.014 255);
    --apoio: oklch(71.5% 0.020 255);
    --titulo: oklch(95% 0.010 250);
    --marca: oklch(78% 0.095 240);
    --marca-forte: oklch(74% 0.100 240);
    --marca-hover: oklch(79% 0.095 240);
    --marca-suave: oklch(31.5% 0.055 245);
    --sobre-marca: oklch(19% 0.030 250);
    --foco: oklch(80% 0.110 240);
    --moldura: oklch(74% 0.100 240);
    --crit-fundo: oklch(28.5% 0.065 25);
    --crit-borda: oklch(50% 0.130 25);
    --crit-texto: oklch(83% 0.094 22);
    --crit-solido: oklch(80% 0.110 22);
    --warn-fundo: oklch(28.5% 0.050 68);
    --warn-borda: oklch(52% 0.100 72);
    --warn-texto: oklch(87% 0.115 82);
    --warn-solido: oklch(85% 0.130 80);
    --ok-fundo: oklch(27.5% 0.045 165);
    --ok-borda: oklch(50% 0.085 165);
    --ok-texto: oklch(85% 0.110 165);
    --ok-solido: oklch(80% 0.120 165);
    --info-fundo: oklch(28.5% 0.055 258);
    --info-borda: oklch(50% 0.110 258);
    --info-texto: oklch(84% 0.075 255);
    --info-solido: oklch(80% 0.090 255);
    --sobre-solido: oklch(19% 0.020 255);
  }
}
:root[data-cor="rosa"] {
  --fundo: #FAF2F5;
  --cartao: #FFFFFF;
  --elevado: #FFFFFF;
  --folha: #FFFFFF;
  --rebaixado: #F5EAEE;
  --realce: #FCF5F8;
  --linha: #E9DBE1;
  --linha-forte: #907883;
  --texto: #29141E;
  --texto-2: #4E3641;
  --apoio: #725A65;
  --titulo: #652545;
  --marca: #8D3060;
  --marca-forte: #8D3060;
  --marca-hover: #782450;
  --marca-suave: #FDE7F0;
  --sobre-marca: #FFFFFF;
  --foco: #B3417B;
  --moldura: #8D3060;
}
@supports (color: oklch(0% 0 0)) {
  :root[data-cor="rosa"] {
    --fundo: oklch(96.8% 0.010 350);
    --cartao: oklch(100% 0.000 0);
    --elevado: oklch(100% 0.000 0);
    --folha: oklch(100% 0.000 0);
    --rebaixado: oklch(94.6% 0.014 350);
    --realce: oklch(97.7% 0.008 350);
    --linha: oklch(90.5% 0.018 350);
    --linha-forte: oklch(60% 0.033 350);
    --texto: oklch(22.5% 0.038 350);
    --texto-2: oklch(36.5% 0.038 350);
    --apoio: oklch(49.5% 0.035 350);
    --titulo: oklch(37% 0.100 352);
    --marca: oklch(46% 0.135 352);
    --marca-forte: oklch(46% 0.135 352);
    --marca-hover: oklch(40.5% 0.125 352);
    --marca-suave: oklch(94.8% 0.027 350);
    --sobre-marca: oklch(100% 0.000 0);
    --foco: oklch(55% 0.160 352);
    --moldura: oklch(46% 0.135 352);
  }
}
:root[data-cor="azul"] {
  --fundo: #EDF6FA;
  --cartao: #FFFFFF;
  --elevado: #FFFFFF;
  --folha: #FFFFFF;
  --rebaixado: #E2F0F5;
  --realce: #F1F9FC;
  --linha: #D2E3EA;
  --linha-forte: #688692;
  --texto: #001F2D;
  --texto-2: #234352;
  --apoio: #496775;
  --titulo: #004964;
  --marca: #006787;
  --marca-forte: #006787;
  --marca-hover: #005572;
  --marca-suave: #D9F3FC;
  --sobre-marca: #FFFFFF;
  --foco: #0080A7;
  --moldura: #1F93B8;
}
@supports (color: oklch(0% 0 0)) {
  :root[data-cor="azul"] {
    --fundo: oklch(96.8% 0.012 225);
    --cartao: oklch(100% 0.000 0);
    --elevado: oklch(100% 0.000 0);
    --folha: oklch(100% 0.000 0);
    --rebaixado: oklch(94.6% 0.016 225);
    --realce: oklch(97.7% 0.009 225);
    --linha: oklch(90.5% 0.021 225);
    --linha-forte: oklch(60% 0.039 225);
    --texto: oklch(22.5% 0.045 230);
    --texto-2: oklch(36.5% 0.045 230);
    --apoio: oklch(49.5% 0.042 230);
    --titulo: oklch(38% 0.077 232);
    --marca: oklch(48% 0.093 228);
    --marca-forte: oklch(48% 0.093 228);
    --marca-hover: oklch(42% 0.083 230);
    --marca-suave: oklch(94.8% 0.030 222);
    --sobre-marca: oklch(100% 0.000 0);
    --foco: oklch(56% 0.109 228);
    --moldura: oklch(62% 0.110 225);
  }
}
:root[data-cor="verde"] {
  --fundo: #F1F6F0;
  --cartao: #FFFFFF;
  --elevado: #FFFFFF;
  --folha: #FFFFFF;
  --rebaixado: #E8F0E7;
  --realce: #F5F9F4;
  --linha: #DAE3D8;
  --linha-forte: #768573;
  --texto: #0D2112;
  --texto-2: #304434;
  --apoio: #546857;
  --titulo: #1D4825;
  --marca: #33642E;
  --marca-forte: #33642E;
  --marca-hover: #265421;
  --marca-suave: #E4F4E1;
  --sobre-marca: #FFFFFF;
  --foco: #3F8439;
  --moldura: #33642E;
}
@supports (color: oklch(0% 0 0)) {
  :root[data-cor="verde"] {
    --fundo: oklch(96.8% 0.010 140);
    --cartao: oklch(100% 0.000 0);
    --elevado: oklch(100% 0.000 0);
    --folha: oklch(100% 0.000 0);
    --rebaixado: oklch(94.6% 0.014 140);
    --realce: oklch(97.7% 0.008 140);
    --linha: oklch(90.5% 0.018 140);
    --linha-forte: oklch(60% 0.033 140);
    --texto: oklch(22.5% 0.038 150);
    --texto-2: oklch(36.5% 0.038 150);
    --apoio: oklch(49.5% 0.035 150);
    --titulo: oklch(36% 0.075 148);
    --marca: oklch(45.5% 0.100 142);
    --marca-forte: oklch(45.5% 0.100 142);
    --marca-hover: oklch(40% 0.095 142);
    --marca-suave: oklch(95% 0.030 140);
    --sobre-marca: oklch(100% 0.000 0);
    --foco: oklch(55% 0.130 142);
    --moldura: oklch(45.5% 0.100 142);
  }
}
:root[data-cor="colorido"] {
  --fundo: #F5F3FA;
  --cartao: #FFFFFF;
  --elevado: #FFFFFF;
  --folha: #FFFFFF;
  --rebaixado: #EEEBF5;
  --realce: #F8F6FC;
  --linha: #E1DDE9;
  --linha-forte: #837C90;
  --texto: #1E182A;
  --texto-2: #413A4E;
  --apoio: #645E72;
  --titulo: #4A2292;
  --marca: #6738C1;
  --marca-forte: #6738C1;
  --marca-hover: #5627A8;
  --marca-suave: #F1EBFF;
  --sobre-marca: #FFFFFF;
  --foco: #7A4FD9;
  --moldura: #6738C1;
}
@supports (color: oklch(0% 0 0)) {
  :root[data-cor="colorido"] {
    --fundo: oklch(96.8% 0.009 300);
    --cartao: oklch(100% 0.000 0);
    --elevado: oklch(100% 0.000 0);
    --folha: oklch(100% 0.000 0);
    --rebaixado: oklch(94.6% 0.013 300);
    --realce: oklch(97.7% 0.007 300);
    --linha: oklch(90.5% 0.016 300);
    --linha-forte: oklch(60% 0.030 300);
    --texto: oklch(22.5% 0.035 300);
    --texto-2: oklch(36.5% 0.035 300);
    --apoio: oklch(49.5% 0.032 300);
    --titulo: oklch(38% 0.170 293);
    --marca: oklch(48% 0.200 293);
    --marca-forte: oklch(48% 0.200 293);
    --marca-hover: oklch(42% 0.190 293);
    --marca-suave: oklch(95% 0.027 300);
    --sobre-marca: oklch(100% 0.000 0);
    --foco: oklch(55% 0.200 293);
    --moldura: oklch(48% 0.200 293);
  }
}
:root[data-cor="rs"] {
  --fundo: #F2F6EF;
  --cartao: #FFFFFF;
  --elevado: #FFFFFF;
  --folha: #FFFFFF;
  --rebaixado: #EAEFE6;
  --realce: #F6F9F3;
  --linha: #DCE2D6;
  --linha-forte: #7A8470;
  --texto: #102010;
  --texto-2: #324432;
  --apoio: #566756;
  --titulo: #114C24;
  --marca: #0B6729;
  --marca-forte: #0B6729;
  --marca-hover: #00561E;
  --marca-suave: #E3F4E2;
  --sobre-marca: #FFFFFF;
  --foco: #18883A;
  --moldura: #0B6729;
}
@supports (color: oklch(0% 0 0)) {
  :root[data-cor="rs"] {
    --fundo: oklch(96.8% 0.010 130);
    --cartao: oklch(100% 0.000 0);
    --elevado: oklch(100% 0.000 0);
    --folha: oklch(100% 0.000 0);
    --rebaixado: oklch(94.6% 0.014 130);
    --realce: oklch(97.7% 0.008 130);
    --linha: oklch(90.5% 0.018 130);
    --linha-forte: oklch(60% 0.033 130);
    --texto: oklch(22.5% 0.038 145);
    --texto-2: oklch(36.5% 0.038 145);
    --apoio: oklch(49.5% 0.035 145);
    --titulo: oklch(37% 0.090 150);
    --marca: oklch(45% 0.125 148);
    --marca-forte: oklch(45% 0.125 148);
    --marca-hover: oklch(39.5% 0.114 148);
    --marca-suave: oklch(95% 0.030 145);
    --sobre-marca: oklch(100% 0.000 0);
    --foco: oklch(55% 0.150 148);
    --moldura: oklch(45% 0.125 148);
  }
}
:root[data-cor="rosa"][data-modo="escuro"] {
  --fundo: #140D10;
  --cartao: #1F161A;
  --elevado: #281D22;
  --folha: #2D2227;
  --rebaixado: #181014;
  --realce: #261C20;
  --linha: #352A2F;
  --linha-forte: #88767E;
  --texto: #EEE7EA;
  --texto-2: #D2C7CC;
  --apoio: #AE9EA5;
  --titulo: #F4ECEF;
  --marca: #EFA9C7;
  --marca-forte: #DB96B4;
  --marca-hover: #EFA9C7;
  --marca-suave: #452734;
  --sobre-marca: #1E0E16;
  --foco: #F7A9CB;
  --moldura: #DB96B4;
}
@supports (color: oklch(0% 0 0)) {
  :root[data-cor="rosa"][data-modo="escuro"] {
    --fundo: oklch(17% 0.014 350);
    --cartao: oklch(21.2% 0.017 350);
    --elevado: oklch(24.6% 0.019 350);
    --folha: oklch(26.8% 0.019 350);
    --rebaixado: oklch(18.5% 0.015 350);
    --realce: oklch(24% 0.019 350);
    --linha: oklch(30% 0.019 350);
    --linha-forte: oklch(58.5% 0.026 350);
    --texto: oklch(93.5% 0.009 350);
    --texto-2: oklch(84% 0.014 350);
    --apoio: oklch(71.5% 0.020 350);
    --titulo: oklch(95% 0.010 350);
    --marca: oklch(81% 0.090 352);
    --marca-forte: oklch(75% 0.090 352);
    --marca-hover: oklch(81% 0.090 352);
    --marca-suave: oklch(31.5% 0.050 352);
    --sobre-marca: oklch(19% 0.030 350);
    --foco: oklch(82% 0.100 352);
    --moldura: oklch(75% 0.090 352);
  }
}
:root[data-cor="azul"][data-modo="escuro"] {
  --fundo: #091114;
  --cartao: #101A1F;
  --elevado: #172328;
  --folha: #1C282D;
  --rebaixado: #0B1418;
  --realce: #162126;
  --linha: #243035;
  --linha-forte: #6D7F88;
  --texto: #E4EBEE;
  --texto-2: #C2CCD2;
  --apoio: #97A6AD;
  --titulo: #E8F0F4;
  --marca: #82CDEA;
  --marca-forte: #6FBAD7;
  --marca-hover: #82CDEA;
  --marca-suave: #0F3745;
  --sobre-marca: #04161E;
  --foco: #7CD1F3;
  --moldura: #6FBAD7;
}
@supports (color: oklch(0% 0 0)) {
  :root[data-cor="azul"][data-modo="escuro"] {
    --fundo: oklch(17% 0.014 228);
    --cartao: oklch(21.2% 0.017 228);
    --elevado: oklch(24.6% 0.019 228);
    --folha: oklch(26.8% 0.019 228);
    --rebaixado: oklch(18.5% 0.015 228);
    --realce: oklch(24% 0.019 228);
    --linha: oklch(30% 0.019 228);
    --linha-forte: oklch(58.5% 0.026 228);
    --texto: oklch(93.5% 0.009 228);
    --texto-2: oklch(84% 0.014 228);
    --apoio: oklch(71.5% 0.020 228);
    --titulo: oklch(95% 0.010 228);
    --marca: oklch(81% 0.085 225);
    --marca-forte: oklch(75% 0.085 225);
    --marca-hover: oklch(81% 0.085 225);
    --marca-suave: oklch(31.5% 0.050 225);
    --sobre-marca: oklch(19% 0.030 228);
    --foco: oklch(82% 0.095 225);
    --moldura: oklch(75% 0.085 225);
  }
}
:root[data-cor="verde"][data-modo="escuro"] {
  --fundo: #0B110C;
  --cartao: #131B15;
  --elevado: #1A231C;
  --folha: #202921;
  --rebaixado: #0E150F;
  --realce: #19221B;
  --linha: #273129;
  --linha-forte: #728074;
  --texto: #E6EBE6;
  --texto-2: #C5CDC6;
  --apoio: #9BA79C;
  --titulo: #EAF0EB;
  --marca: #98D299;
  --marca-forte: #85BF86;
  --marca-hover: #98D299;
  --marca-suave: #213821;
  --sobre-marca: #09180C;
  --foco: #96D798;
  --moldura: #85BF86;
}
@supports (color: oklch(0% 0 0)) {
  :root[data-cor="verde"][data-modo="escuro"] {
    --fundo: oklch(17% 0.014 150);
    --cartao: oklch(21.2% 0.017 150);
    --elevado: oklch(24.6% 0.019 150);
    --folha: oklch(26.8% 0.019 150);
    --rebaixado: oklch(18.5% 0.015 150);
    --realce: oklch(24% 0.019 150);
    --linha: oklch(30% 0.019 150);
    --linha-forte: oklch(58.5% 0.026 150);
    --texto: oklch(93.5% 0.009 150);
    --texto-2: oklch(84% 0.014 150);
    --apoio: oklch(71.5% 0.020 150);
    --titulo: oklch(95% 0.010 150);
    --marca: oklch(81% 0.100 145);
    --marca-forte: oklch(75% 0.100 145);
    --marca-hover: oklch(81% 0.100 145);
    --marca-suave: oklch(31.5% 0.050 145);
    --sobre-marca: oklch(19% 0.030 150);
    --foco: oklch(82% 0.110 145);
    --moldura: oklch(75% 0.100 145);
  }
}
:root[data-cor="colorido"][data-modo="escuro"] {
  --fundo: #100E15;
  --cartao: #191720;
  --elevado: #211F29;
  --folha: #26242E;
  --rebaixado: #131119;
  --realce: #201E27;
  --linha: #2E2C36;
  --linha-forte: #7C798A;
  --texto: #EAE8EF;
  --texto-2: #CBC9D3;
  --apoio: #A4A1AF;
  --titulo: #EFEDF5;
  --marca: #C0B0FE;
  --marca-forte: #AD9DEA;
  --marca-hover: #C0B0FE;
  --marca-suave: #322D49;
  --sobre-marca: #151120;
  --foco: #C3B4FF;
  --moldura: #AD9DEA;
}
@supports (color: oklch(0% 0 0)) {
  :root[data-cor="colorido"][data-modo="escuro"] {
    --fundo: oklch(17% 0.014 295);
    --cartao: oklch(21.2% 0.017 295);
    --elevado: oklch(24.6% 0.019 295);
    --folha: oklch(26.8% 0.019 295);
    --rebaixado: oklch(18.5% 0.015 295);
    --realce: oklch(24% 0.019 295);
    --linha: oklch(30% 0.019 295);
    --linha-forte: oklch(58.5% 0.026 295);
    --texto: oklch(93.5% 0.009 295);
    --texto-2: oklch(84% 0.014 295);
    --apoio: oklch(71.5% 0.020 295);
    --titulo: oklch(95% 0.010 295);
    --marca: oklch(80% 0.110 293);
    --marca-forte: oklch(74% 0.110 293);
    --marca-hover: oklch(80% 0.110 293);
    --marca-suave: oklch(31.5% 0.050 293);
    --sobre-marca: oklch(19% 0.030 295);
    --foco: oklch(81% 0.105 293);
    --moldura: oklch(74% 0.110 293);
  }
}
:root[data-cor="rs"][data-modo="escuro"] {
  --fundo: #0C110C;
  --cartao: #141B14;
  --elevado: #1B231B;
  --folha: #202820;
  --rebaixado: #0E150F;
  --realce: #1A221A;
  --linha: #283028;
  --linha-forte: #738073;
  --texto: #E6EBE6;
  --texto-2: #C5CDC5;
  --apoio: #9CA79B;
  --titulo: #EAF0EA;
  --marca: #86D391;
  --marca-forte: #73C07F;
  --marca-hover: #86D391;
  --marca-suave: #1F3923;
  --sobre-marca: #0B170B;
  --foco: #83D890;
  --moldura: #73C07F;
}
@supports (color: oklch(0% 0 0)) {
  :root[data-cor="rs"][data-modo="escuro"] {
    --fundo: oklch(17% 0.014 145);
    --cartao: oklch(21.2% 0.017 145);
    --elevado: oklch(24.6% 0.019 145);
    --folha: oklch(26.8% 0.019 145);
    --rebaixado: oklch(18.5% 0.015 145);
    --realce: oklch(24% 0.019 145);
    --linha: oklch(30% 0.019 145);
    --linha-forte: oklch(58.5% 0.026 145);
    --texto: oklch(93.5% 0.009 145);
    --texto-2: oklch(84% 0.014 145);
    --apoio: oklch(71.5% 0.020 145);
    --titulo: oklch(95% 0.010 145);
    --marca: oklch(80% 0.120 148);
    --marca-forte: oklch(74% 0.120 148);
    --marca-hover: oklch(80% 0.120 148);
    --marca-suave: oklch(31.5% 0.050 148);
    --sobre-marca: oklch(19% 0.030 145);
    --foco: oklch(81% 0.130 148);
    --moldura: oklch(74% 0.120 148);
  }
}

/* cargos: círculo cheio, letra branca (proposta; decisão da Fundação) */
:root {
  --cargo-coordenador: #21459D; /* oklch(42% 0.150 264) */
  --cargo-lider-diurno: #73452B; /* oklch(44% 0.075 50) */
  --cargo-lider-noturno-geral: #3D3291; /* oklch(39% 0.150 282) */
  --cargo-equipe-tecnica: #6F2FB7; /* oklch(47% 0.200 300) */
  --cargo-educador: #006459; /* oklch(45% 0.080 182) */
  --cargo-enfermagem: #026B85; /* oklch(49% 0.090 222) */
  --cargo-cozinha: #8D2157; /* oklch(44% 0.150 355) */
  --cargo-portaria: #4F5C1B; /* oklch(45% 0.090 120) */
  --cargo-gestor-geral: #364355; /* oklch(38% 0.035 255) */
  --cargo-admin-tecnico: #525259; /* oklch(44% 0.012 285) */
}

:root {
  --cat-saude: #CD4290; /* oklch(60% 0.190 350) */
  --cat-medicamento: #8151DB; /* oklch(56% 0.200 295) */
  --cat-educacao: #2A71D6; /* oklch(56% 0.170 258) */
  --cat-lazer: #15915C; /* oklch(58% 0.130 158) */
  --cat-alimentacao: #BE7100; /* oklch(62% 0.139 65) */
  --cat-saida: #0090A8; /* oklch(60% 0.106 215) */
  --cat-ocorrencia: #D73431; /* oklch(58% 0.200 27) */
  --cat-rotina: #6C7989; /* oklch(57% 0.030 255) */
}
:root[data-modo="escuro"] {
  --cat-saude: #E57DB1; /* oklch(72% 0.140 350) */
  --cat-medicamento: #A58BEC; /* oklch(70% 0.140 295) */
  --cat-educacao: #6EA0E8; /* oklch(70% 0.120 258) */
  --cat-lazer: #57BC8A; /* oklch(72% 0.120 160) */
  --cat-alimentacao: #E8AA4E; /* oklch(78% 0.130 75) */
  --cat-saida: #54BBD2; /* oklch(74% 0.100 215) */
  --cat-ocorrencia: #ED756E; /* oklch(70% 0.150 25) */
  --cat-rotina: #8E99A8; /* oklch(68% 0.025 255) */
}

/* azulejos do Colorido */
/* 1. framboesa */ --azulejo-framboesa-fundo: #FFE2EE; --azulejo-framboesa-tinta: #942D66;
/* 2. azul */ --azulejo-azul-fundo: #E0ECFF; --azulejo-azul-tinta: #2454B3;
/* 3. agua */ --azulejo-agua-fundo: #CDF4F6; --azulejo-agua-tinta: #006B74;
/* 4. violeta */ --azulejo-violeta-fundo: #EEE7FF; --azulejo-violeta-tinta: #6F2FB7;
/* 5. folha */ --azulejo-folha-fundo: #DAF4D4; --azulejo-folha-tinta: #36692A;
/* 6. ceu */ --azulejo-ceu-fundo: #D6EFFF; --azulejo-ceu-tinta: #06658E;
```

---

## 9. Tabela de contraste (medida pelo script)

Razão WCAG 2.x calculada sobre o hex de cada token (o OKLCH é convertido para sRGB, com corte de croma quando sai da gama). Mínimos: 4,5 para texto, 3 para borda de controle, foco e elemento grande. A linha "borda do aviso" é só informativa (a borda é enfeite; a palavra e o desenho carregam o sentido).

### Claro (navy da Fundação)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#131C29` | `#F1F5F9` | 15.64 | 4.5 | passa |
| texto-2 / fundo | `#353F4D` | `#F1F5F9` | 9.73 | 4.5 | passa |
| apoio / fundo | `#586371` | `#F1F5F9` | 5.58 | 4.5 | passa |
| texto / cartao | `#131C29` | `#FFFFFF` | 17.13 | 4.5 | passa |
| texto-2 / cartao | `#353F4D` | `#FFFFFF` | 10.66 | 4.5 | passa |
| apoio / cartao | `#586371` | `#FFFFFF` | 6.11 | 4.5 | passa |
| texto / rebaixado | `#131C29` | `#E8EEF4` | 14.66 | 4.5 | passa |
| texto-2 / rebaixado | `#353F4D` | `#E8EEF4` | 9.12 | 4.5 | passa |
| apoio / rebaixado | `#586371` | `#E8EEF4` | 5.23 | 4.5 | passa |
| texto / elevado | `#131C29` | `#FFFFFF` | 17.13 | 4.5 | passa |
| texto-2 / elevado | `#353F4D` | `#FFFFFF` | 10.66 | 4.5 | passa |
| apoio / elevado | `#586371` | `#FFFFFF` | 6.11 | 4.5 | passa |
| texto / folha | `#131C29` | `#FFFFFF` | 17.13 | 4.5 | passa |
| texto-2 / folha | `#353F4D` | `#FFFFFF` | 10.66 | 4.5 | passa |
| apoio / folha | `#586371` | `#FFFFFF` | 6.11 | 4.5 | passa |
| título / fundo | `#003262` | `#F1F5F9` | 11.74 | 4.5 | passa |
| título / cartão | `#003262` | `#FFFFFF` | 12.86 | 4.5 | passa |
| marca (link) / cartão | `#005993` | `#FFFFFF` | 7.37 | 4.5 | passa |
| marca (link) / fundo | `#005993` | `#F1F5F9` | 6.73 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#005993` | `#E1F0FE` | 6.35 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#005993` | 7.37 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#00497A` | 9.40 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#003262` | `#E1F0FE` | 11.08 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#76828E` | `#FFFFFF` | 3.92 | 3 | passa |
| linha-forte / rebaixado | `#76828E` | `#E8EEF4` | 3.36 | 3 | passa |
| foco / cartão | `#0074B8` | `#FFFFFF` | 5.01 | 3 | passa |
| foco / fundo | `#0074B8` | `#F1F5F9` | 4.57 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#005993` | `#F1F5F9` | 6.73 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#353F4D` | `#FFEFEF` | 9.57 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#353F4D` | `#FFF5E0` | 9.84 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#353F4D` | `#E2FBEF` | 9.79 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#353F4D` | `#EBF4FF` | 9.60 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### Escuro (noite azul, não cinza)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#E6EAEF` | `#0B1016` | 15.80 | 4.5 | passa |
| texto-2 / fundo | `#C5CBD3` | `#0B1016` | 11.69 | 4.5 | passa |
| apoio / fundo | `#9BA4B0` | `#0B1016` | 7.57 | 4.5 | passa |
| texto / cartao | `#E6EAEF` | `#141921` | 14.60 | 4.5 | passa |
| texto-2 / cartao | `#C5CBD3` | `#141921` | 10.80 | 4.5 | passa |
| apoio / cartao | `#9BA4B0` | `#141921` | 7.00 | 4.5 | passa |
| texto / rebaixado | `#E6EAEF` | `#0E1319` | 15.44 | 4.5 | passa |
| texto-2 / rebaixado | `#C5CBD3` | `#0E1319` | 11.42 | 4.5 | passa |
| apoio / rebaixado | `#9BA4B0` | `#0E1319` | 7.40 | 4.5 | passa |
| texto / elevado | `#E6EAEF` | `#1B212A` | 13.39 | 4.5 | passa |
| texto-2 / elevado | `#C5CBD3` | `#1B212A` | 9.91 | 4.5 | passa |
| apoio / elevado | `#9BA4B0` | `#1B212A` | 6.42 | 4.5 | passa |
| texto / folha | `#E6EAEF` | `#20272F` | 12.48 | 4.5 | passa |
| texto-2 / folha | `#C5CBD3` | `#20272F` | 9.23 | 4.5 | passa |
| apoio / folha | `#9BA4B0` | `#20272F` | 5.98 | 4.5 | passa |
| título / fundo | `#EAEFF5` | `#0B1016` | 16.51 | 4.5 | passa |
| título / cartão | `#EAEFF5` | `#141921` | 15.25 | 4.5 | passa |
| marca (link) / cartão | `#7DC0EE` | `#141921` | 8.94 | 4.5 | passa |
| marca (link) / fundo | `#7DC0EE` | `#0B1016` | 9.68 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#7DC0EE` | `#17344C` | 6.52 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#091521` | `#6DB3E4` | 8.08 | 4.5 | passa |
| sobre-marca / marca-hover | `#091521` | `#80C3F2` | 9.65 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#EAEFF5` | `#17344C` | 11.13 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#727D8B` | `#141921` | 4.22 | 3 | passa |
| linha-forte / rebaixado | `#727D8B` | `#0E1319` | 4.46 | 3 | passa |
| foco / cartão | `#78C7FD` | `#141921` | 9.56 | 3 | passa |
| foco / fundo | `#78C7FD` | `#0B1016` | 10.35 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#6DB3E4` | `#0B1016` | 8.38 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#141921` | 10.06 | 4.5 | passa |
| crit: texto-2 / aviso | `#C5CBD3` | `#451B19` | 9.03 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#141921` | 2.75 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#141921` | 11.81 | 4.5 | passa |
| warn: texto-2 / aviso | `#C5CBD3` | `#3A250B` | 8.87 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#141921` | 3.13 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#141921` | 11.67 | 4.5 | passa |
| ok: texto-2 / aviso | `#C5CBD3` | `#0E2F22` | 8.88 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#141921` | 3.06 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#141921` | 10.78 | 4.5 | passa |
| info: texto-2 / aviso | `#C5CBD3` | `#182A45` | 8.83 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#141921` | 2.92 | — | info |

### Rosa (rosa-chá com ameixa)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#29141E` | `#FAF2F5` | 15.73 | 4.5 | passa |
| texto-2 / fundo | `#4E3641` | `#FAF2F5` | 9.90 | 4.5 | passa |
| apoio / fundo | `#725A65` | `#FAF2F5` | 5.67 | 4.5 | passa |
| texto / cartao | `#29141E` | `#FFFFFF` | 17.31 | 4.5 | passa |
| texto-2 / cartao | `#4E3641` | `#FFFFFF` | 10.89 | 4.5 | passa |
| apoio / cartao | `#725A65` | `#FFFFFF` | 6.24 | 4.5 | passa |
| texto / rebaixado | `#29141E` | `#F5EAEE` | 14.74 | 4.5 | passa |
| texto-2 / rebaixado | `#4E3641` | `#F5EAEE` | 9.28 | 4.5 | passa |
| apoio / rebaixado | `#725A65` | `#F5EAEE` | 5.31 | 4.5 | passa |
| texto / elevado | `#29141E` | `#FFFFFF` | 17.31 | 4.5 | passa |
| texto-2 / elevado | `#4E3641` | `#FFFFFF` | 10.89 | 4.5 | passa |
| apoio / elevado | `#725A65` | `#FFFFFF` | 6.24 | 4.5 | passa |
| texto / folha | `#29141E` | `#FFFFFF` | 17.31 | 4.5 | passa |
| texto-2 / folha | `#4E3641` | `#FFFFFF` | 10.89 | 4.5 | passa |
| apoio / folha | `#725A65` | `#FFFFFF` | 6.24 | 4.5 | passa |
| título / fundo | `#652545` | `#FAF2F5` | 10.02 | 4.5 | passa |
| título / cartão | `#652545` | `#FFFFFF` | 11.03 | 4.5 | passa |
| marca (link) / cartão | `#8D3060` | `#FFFFFF` | 7.71 | 4.5 | passa |
| marca (link) / fundo | `#8D3060` | `#FAF2F5` | 7.01 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#8D3060` | `#FDE7F0` | 6.56 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#8D3060` | 7.71 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#782450` | 9.69 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#652545` | `#FDE7F0` | 9.38 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#907883` | `#FFFFFF` | 4.04 | 3 | passa |
| linha-forte / rebaixado | `#907883` | `#F5EAEE` | 3.44 | 3 | passa |
| foco / cartão | `#B3417B` | `#FFFFFF` | 5.30 | 3 | passa |
| foco / fundo | `#B3417B` | `#FAF2F5` | 4.82 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#8D3060` | `#FAF2F5` | 7.01 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#4E3641` | `#FFEFEF` | 9.77 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#4E3641` | `#FFF5E0` | 10.06 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#4E3641` | `#E2FBEF` | 10.00 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#4E3641` | `#EBF4FF` | 9.81 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### Azul claro (céu, separado do Claro)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#001F2D` | `#EDF6FA` | 15.53 | 4.5 | passa |
| texto-2 / fundo | `#234352` | `#EDF6FA` | 9.60 | 4.5 | passa |
| apoio / fundo | `#496775` | `#EDF6FA` | 5.51 | 4.5 | passa |
| texto / cartao | `#001F2D` | `#FFFFFF` | 17.02 | 4.5 | passa |
| texto-2 / cartao | `#234352` | `#FFFFFF` | 10.52 | 4.5 | passa |
| apoio / cartao | `#496775` | `#FFFFFF` | 6.03 | 4.5 | passa |
| texto / rebaixado | `#001F2D` | `#E2F0F5` | 14.60 | 4.5 | passa |
| texto-2 / rebaixado | `#234352` | `#E2F0F5` | 9.03 | 4.5 | passa |
| apoio / rebaixado | `#496775` | `#E2F0F5` | 5.18 | 4.5 | passa |
| texto / elevado | `#001F2D` | `#FFFFFF` | 17.02 | 4.5 | passa |
| texto-2 / elevado | `#234352` | `#FFFFFF` | 10.52 | 4.5 | passa |
| apoio / elevado | `#496775` | `#FFFFFF` | 6.03 | 4.5 | passa |
| texto / folha | `#001F2D` | `#FFFFFF` | 17.02 | 4.5 | passa |
| texto-2 / folha | `#234352` | `#FFFFFF` | 10.52 | 4.5 | passa |
| apoio / folha | `#496775` | `#FFFFFF` | 6.03 | 4.5 | passa |
| título / fundo | `#004964` | `#EDF6FA` | 8.97 | 4.5 | passa |
| título / cartão | `#004964` | `#FFFFFF` | 9.83 | 4.5 | passa |
| marca (link) / cartão | `#006787` | `#FFFFFF` | 6.38 | 4.5 | passa |
| marca (link) / fundo | `#006787` | `#EDF6FA` | 5.82 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#006787` | `#D9F3FC` | 5.52 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#006787` | 6.38 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#005572` | 8.26 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#004964` | `#D9F3FC` | 8.51 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#688692` | `#FFFFFF` | 3.88 | 3 | passa |
| linha-forte / rebaixado | `#688692` | `#E2F0F5` | 3.33 | 3 | passa |
| foco / cartão | `#0080A7` | `#FFFFFF` | 4.52 | 3 | passa |
| foco / fundo | `#0080A7` | `#EDF6FA` | 4.13 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#006787` | `#EDF6FA` | 5.82 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#234352` | `#FFEFEF` | 9.44 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#234352` | `#FFF5E0` | 9.71 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#234352` | `#E2FBEF` | 9.66 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#234352` | `#EBF4FF` | 9.48 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### Verde (sálvia e mata)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#0D2112` | `#F1F6F0` | 15.43 | 4.5 | passa |
| texto-2 / fundo | `#304434` | `#F1F6F0` | 9.58 | 4.5 | passa |
| apoio / fundo | `#546857` | `#F1F6F0` | 5.49 | 4.5 | passa |
| texto / cartao | `#0D2112` | `#FFFFFF` | 16.89 | 4.5 | passa |
| texto-2 / cartao | `#304434` | `#FFFFFF` | 10.49 | 4.5 | passa |
| apoio / cartao | `#546857` | `#FFFFFF` | 6.01 | 4.5 | passa |
| texto / rebaixado | `#0D2112` | `#E8F0E7` | 14.52 | 4.5 | passa |
| texto-2 / rebaixado | `#304434` | `#E8F0E7` | 9.02 | 4.5 | passa |
| apoio / rebaixado | `#546857` | `#E8F0E7` | 5.16 | 4.5 | passa |
| texto / elevado | `#0D2112` | `#FFFFFF` | 16.89 | 4.5 | passa |
| texto-2 / elevado | `#304434` | `#FFFFFF` | 10.49 | 4.5 | passa |
| apoio / elevado | `#546857` | `#FFFFFF` | 6.01 | 4.5 | passa |
| texto / folha | `#0D2112` | `#FFFFFF` | 16.89 | 4.5 | passa |
| texto-2 / folha | `#304434` | `#FFFFFF` | 10.49 | 4.5 | passa |
| apoio / folha | `#546857` | `#FFFFFF` | 6.01 | 4.5 | passa |
| título / fundo | `#1D4825` | `#F1F6F0` | 9.56 | 4.5 | passa |
| título / cartão | `#1D4825` | `#FFFFFF` | 10.47 | 4.5 | passa |
| marca (link) / cartão | `#33642E` | `#FFFFFF` | 6.99 | 4.5 | passa |
| marca (link) / fundo | `#33642E` | `#F1F6F0` | 6.39 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#33642E` | `#E4F4E1` | 6.10 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#33642E` | 6.99 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#265421` | 8.85 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#1D4825` | `#E4F4E1` | 9.14 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#768573` | `#FFFFFF` | 3.91 | 3 | passa |
| linha-forte / rebaixado | `#768573` | `#E8F0E7` | 3.36 | 3 | passa |
| foco / cartão | `#3F8439` | `#FFFFFF` | 4.59 | 3 | passa |
| foco / fundo | `#3F8439` | `#F1F6F0` | 4.20 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#33642E` | `#F1F6F0` | 6.39 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#304434` | `#FFEFEF` | 9.41 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#304434` | `#FFF5E0` | 9.68 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#304434` | `#E2FBEF` | 9.63 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#304434` | `#EBF4FF` | 9.45 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### Colorido (lilás de base, cor nas portas)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#1E182A` | `#F5F3FA` | 15.65 | 4.5 | passa |
| texto-2 / fundo | `#413A4E` | `#F5F3FA` | 9.84 | 4.5 | passa |
| apoio / fundo | `#645E72` | `#F5F3FA` | 5.64 | 4.5 | passa |
| texto / cartao | `#1E182A` | `#FFFFFF` | 17.22 | 4.5 | passa |
| texto-2 / cartao | `#413A4E` | `#FFFFFF` | 10.82 | 4.5 | passa |
| apoio / cartao | `#645E72` | `#FFFFFF` | 6.20 | 4.5 | passa |
| texto / rebaixado | `#1E182A` | `#EEEBF5` | 14.63 | 4.5 | passa |
| texto-2 / rebaixado | `#413A4E` | `#EEEBF5` | 9.19 | 4.5 | passa |
| apoio / rebaixado | `#645E72` | `#EEEBF5` | 5.27 | 4.5 | passa |
| texto / elevado | `#1E182A` | `#FFFFFF` | 17.22 | 4.5 | passa |
| texto-2 / elevado | `#413A4E` | `#FFFFFF` | 10.82 | 4.5 | passa |
| apoio / elevado | `#645E72` | `#FFFFFF` | 6.20 | 4.5 | passa |
| texto / folha | `#1E182A` | `#FFFFFF` | 17.22 | 4.5 | passa |
| texto-2 / folha | `#413A4E` | `#FFFFFF` | 10.82 | 4.5 | passa |
| apoio / folha | `#645E72` | `#FFFFFF` | 6.20 | 4.5 | passa |
| título / fundo | `#4A2292` | `#F5F3FA` | 9.86 | 4.5 | passa |
| título / cartão | `#4A2292` | `#FFFFFF` | 10.85 | 4.5 | passa |
| marca (link) / cartão | `#6738C1` | `#FFFFFF` | 7.21 | 4.5 | passa |
| marca (link) / fundo | `#6738C1` | `#F5F3FA` | 6.55 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#6738C1` | `#F1EBFF` | 6.20 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#6738C1` | 7.21 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#5627A8` | 9.33 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#4A2292` | `#F1EBFF` | 9.34 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#837C90` | `#FFFFFF` | 4.00 | 3 | passa |
| linha-forte / rebaixado | `#837C90` | `#EEEBF5` | 3.40 | 3 | passa |
| foco / cartão | `#7A4FD9` | `#FFFFFF` | 5.32 | 3 | passa |
| foco / fundo | `#7A4FD9` | `#F5F3FA` | 4.83 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#6738C1` | `#F5F3FA` | 6.55 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#413A4E` | `#FFEFEF` | 9.71 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#413A4E` | `#FFF5E0` | 9.99 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#413A4E` | `#E2FBEF` | 9.94 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#413A4E` | `#EBF4FF` | 9.75 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### Rio Grande do Sul (campo e bandeira)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#102010` | `#F2F6EF` | 15.54 | 4.5 | passa |
| texto-2 / fundo | `#324432` | `#F2F6EF` | 9.56 | 4.5 | passa |
| apoio / fundo | `#566756` | `#F2F6EF` | 5.53 | 4.5 | passa |
| texto / cartao | `#102010` | `#FFFFFF` | 16.99 | 4.5 | passa |
| texto-2 / cartao | `#324432` | `#FFFFFF` | 10.46 | 4.5 | passa |
| apoio / cartao | `#566756` | `#FFFFFF` | 6.05 | 4.5 | passa |
| texto / rebaixado | `#102010` | `#EAEFE6` | 14.55 | 4.5 | passa |
| texto-2 / rebaixado | `#324432` | `#EAEFE6` | 8.96 | 4.5 | passa |
| apoio / rebaixado | `#566756` | `#EAEFE6` | 5.18 | 4.5 | passa |
| texto / elevado | `#102010` | `#FFFFFF` | 16.99 | 4.5 | passa |
| texto-2 / elevado | `#324432` | `#FFFFFF` | 10.46 | 4.5 | passa |
| apoio / elevado | `#566756` | `#FFFFFF` | 6.05 | 4.5 | passa |
| texto / folha | `#102010` | `#FFFFFF` | 16.99 | 4.5 | passa |
| texto-2 / folha | `#324432` | `#FFFFFF` | 10.46 | 4.5 | passa |
| apoio / folha | `#566756` | `#FFFFFF` | 6.05 | 4.5 | passa |
| título / fundo | `#114C24` | `#F2F6EF` | 9.22 | 4.5 | passa |
| título / cartão | `#114C24` | `#FFFFFF` | 10.08 | 4.5 | passa |
| marca (link) / cartão | `#0B6729` | `#FFFFFF` | 7.03 | 4.5 | passa |
| marca (link) / fundo | `#0B6729` | `#F2F6EF` | 6.43 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#0B6729` | `#E3F4E2` | 6.13 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#FFFFFF` | `#0B6729` | 7.03 | 4.5 | passa |
| sobre-marca / marca-hover | `#FFFFFF` | `#00561E` | 8.94 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#114C24` | `#E3F4E2` | 8.79 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#7A8470` | `#FFFFFF` | 3.92 | 3 | passa |
| linha-forte / rebaixado | `#7A8470` | `#EAEFE6` | 3.35 | 3 | passa |
| foco / cartão | `#18883A` | `#FFFFFF` | 4.54 | 3 | passa |
| foco / fundo | `#18883A` | `#F2F6EF` | 4.16 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#0B6729` | `#F2F6EF` | 6.43 | 3 | passa |
| crit: texto / pílula | `#A91D1D` | `#FFEFEF` | 6.54 | 4.5 | passa |
| crit: texto / cartão | `#A91D1D` | `#FFFFFF` | 7.29 | 4.5 | passa |
| crit: texto-2 / aviso | `#324432` | `#FFEFEF` | 9.38 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#FFFFFF` | `#B91C1E` | 6.47 | 4.5 | passa |
| crit: borda do aviso / cartão | `#FBBBB8` | `#FFFFFF` | 1.63 | — | info |
| warn: texto / pílula | `#8C4705` | `#FFF5E0` | 6.42 | 4.5 | passa |
| warn: texto / cartão | `#8C4705` | `#FFFFFF` | 6.96 | 4.5 | passa |
| warn: texto-2 / aviso | `#324432` | `#FFF5E0` | 9.65 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#FFFFFF` | `#8C4705` | 6.96 | 4.5 | passa |
| warn: borda do aviso / cartão | `#F4CA89` | `#FFFFFF` | 1.54 | — | info |
| ok: texto / pílula | `#006D4E` | `#E2FBEF` | 5.85 | 4.5 | passa |
| ok: texto / cartão | `#006D4E` | `#FFFFFF` | 6.37 | 4.5 | passa |
| ok: texto-2 / aviso | `#324432` | `#E2FBEF` | 9.60 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#FFFFFF` | `#006D4E` | 6.37 | 4.5 | passa |
| ok: borda do aviso / cartão | `#9FDEC2` | `#FFFFFF` | 1.53 | — | info |
| info: texto / pílula | `#2556B4` | `#EBF4FF` | 6.16 | 4.5 | passa |
| info: texto / cartão | `#2556B4` | `#FFFFFF` | 6.84 | 4.5 | passa |
| info: texto-2 / aviso | `#324432` | `#EBF4FF` | 9.42 | 4.5 | passa |
| info: sobre-sólido / sólido | `#FFFFFF` | `#2556B4` | 6.84 | 4.5 | passa |
| info: borda do aviso / cartão | `#B6D0F6` | `#FFFFFF` | 1.57 | — | info |

### rosa-escuro (o escuro da noite desta cor)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#EEE7EA` | `#140D10` | 15.76 | 4.5 | passa |
| texto-2 / fundo | `#D2C7CC` | `#140D10` | 11.67 | 4.5 | passa |
| apoio / fundo | `#AE9EA5` | `#140D10` | 7.52 | 4.5 | passa |
| texto / cartao | `#EEE7EA` | `#1F161A` | 14.52 | 4.5 | passa |
| texto-2 / cartao | `#D2C7CC` | `#1F161A` | 10.76 | 4.5 | passa |
| apoio / cartao | `#AE9EA5` | `#1F161A` | 6.93 | 4.5 | passa |
| texto / rebaixado | `#EEE7EA` | `#181014` | 15.36 | 4.5 | passa |
| texto-2 / rebaixado | `#D2C7CC` | `#181014` | 11.38 | 4.5 | passa |
| apoio / rebaixado | `#AE9EA5` | `#181014` | 7.33 | 4.5 | passa |
| texto / elevado | `#EEE7EA` | `#281D22` | 13.38 | 4.5 | passa |
| texto-2 / elevado | `#D2C7CC` | `#281D22` | 9.92 | 4.5 | passa |
| apoio / elevado | `#AE9EA5` | `#281D22` | 6.39 | 4.5 | passa |
| texto / folha | `#EEE7EA` | `#2D2227` | 12.60 | 4.5 | passa |
| texto-2 / folha | `#D2C7CC` | `#2D2227` | 9.33 | 4.5 | passa |
| apoio / folha | `#AE9EA5` | `#2D2227` | 6.01 | 4.5 | passa |
| título / fundo | `#F4ECEF` | `#140D10` | 16.52 | 4.5 | passa |
| título / cartão | `#F4ECEF` | `#1F161A` | 15.23 | 4.5 | passa |
| marca (link) / cartão | `#EFA9C7` | `#1F161A` | 9.40 | 4.5 | passa |
| marca (link) / fundo | `#EFA9C7` | `#140D10` | 10.20 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#EFA9C7` | `#452734` | 7.01 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#1E0E16` | `#DB96B4` | 8.00 | 4.5 | passa |
| sobre-marca / marca-hover | `#1E0E16` | `#EFA9C7` | 9.89 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#F4ECEF` | `#452734` | 11.36 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#88767E` | `#1F161A` | 4.16 | 3 | passa |
| linha-forte / rebaixado | `#88767E` | `#181014` | 4.40 | 3 | passa |
| foco / cartão | `#F7A9CB` | `#1F161A` | 9.67 | 3 | passa |
| foco / fundo | `#F7A9CB` | `#140D10` | 10.50 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#DB96B4` | `#140D10` | 8.25 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#1F161A` | 10.08 | 4.5 | passa |
| crit: texto-2 / aviso | `#D2C7CC` | `#451B19` | 8.98 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#1F161A` | 2.75 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#1F161A` | 11.84 | 4.5 | passa |
| warn: texto-2 / aviso | `#D2C7CC` | `#3A250B` | 8.82 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#1F161A` | 3.14 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#1F161A` | 11.70 | 4.5 | passa |
| ok: texto-2 / aviso | `#D2C7CC` | `#0E2F22` | 8.82 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#1F161A` | 3.07 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#1F161A` | 10.80 | 4.5 | passa |
| info: texto-2 / aviso | `#D2C7CC` | `#182A45` | 8.78 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#1F161A` | 2.92 | — | info |

### azul-escuro (o escuro da noite desta cor)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#E4EBEE` | `#091114` | 15.81 | 4.5 | passa |
| texto-2 / fundo | `#C2CCD2` | `#091114` | 11.67 | 4.5 | passa |
| apoio / fundo | `#97A6AD` | `#091114` | 7.60 | 4.5 | passa |
| texto / cartao | `#E4EBEE` | `#101A1F` | 14.64 | 4.5 | passa |
| texto-2 / cartao | `#C2CCD2` | `#101A1F` | 10.81 | 4.5 | passa |
| apoio / cartao | `#97A6AD` | `#101A1F` | 7.04 | 4.5 | passa |
| texto / rebaixado | `#E4EBEE` | `#0B1418` | 15.45 | 4.5 | passa |
| texto-2 / rebaixado | `#C2CCD2` | `#0B1418` | 11.41 | 4.5 | passa |
| apoio / rebaixado | `#97A6AD` | `#0B1418` | 7.43 | 4.5 | passa |
| texto / elevado | `#E4EBEE` | `#172328` | 13.32 | 4.5 | passa |
| texto-2 / elevado | `#C2CCD2` | `#172328` | 9.84 | 4.5 | passa |
| apoio / elevado | `#97A6AD` | `#172328` | 6.40 | 4.5 | passa |
| texto / folha | `#E4EBEE` | `#1C282D` | 12.52 | 4.5 | passa |
| texto-2 / folha | `#C2CCD2` | `#1C282D` | 9.25 | 4.5 | passa |
| apoio / folha | `#97A6AD` | `#1C282D` | 6.02 | 4.5 | passa |
| título / fundo | `#E8F0F4` | `#091114` | 16.52 | 4.5 | passa |
| título / cartão | `#E8F0F4` | `#101A1F` | 15.30 | 4.5 | passa |
| marca (link) / cartão | `#82CDEA` | `#101A1F` | 9.98 | 4.5 | passa |
| marca (link) / fundo | `#82CDEA` | `#091114` | 10.77 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#82CDEA` | `#0F3745` | 7.18 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#04161E` | `#6FBAD7` | 8.50 | 4.5 | passa |
| sobre-marca / marca-hover | `#04161E` | `#82CDEA` | 10.42 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#E8F0F4` | `#0F3745` | 11.01 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#6D7F88` | `#101A1F` | 4.24 | 3 | passa |
| linha-forte / rebaixado | `#6D7F88` | `#0B1418` | 4.47 | 3 | passa |
| foco / cartão | `#7CD1F3` | `#101A1F` | 10.32 | 3 | passa |
| foco / fundo | `#7CD1F3` | `#091114` | 11.14 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#6FBAD7` | `#091114` | 8.79 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#101A1F` | 10.07 | 4.5 | passa |
| crit: texto-2 / aviso | `#C2CCD2` | `#451B19` | 9.03 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#101A1F` | 2.75 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#101A1F` | 11.83 | 4.5 | passa |
| warn: texto-2 / aviso | `#C2CCD2` | `#3A250B` | 8.87 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#101A1F` | 3.14 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#101A1F` | 11.68 | 4.5 | passa |
| ok: texto-2 / aviso | `#C2CCD2` | `#0E2F22` | 8.88 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#101A1F` | 3.06 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#101A1F` | 10.79 | 4.5 | passa |
| info: texto-2 / aviso | `#C2CCD2` | `#182A45` | 8.83 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#101A1F` | 2.92 | — | info |

### verde-escuro (o escuro da noite desta cor)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#E6EBE6` | `#0B110C` | 15.81 | 4.5 | passa |
| texto-2 / fundo | `#C5CDC6` | `#0B110C` | 11.75 | 4.5 | passa |
| apoio / fundo | `#9BA79C` | `#0B110C` | 7.64 | 4.5 | passa |
| texto / cartao | `#E6EBE6` | `#131B15` | 14.55 | 4.5 | passa |
| texto-2 / cartao | `#C5CDC6` | `#131B15` | 10.81 | 4.5 | passa |
| apoio / cartao | `#9BA79C` | `#131B15` | 7.03 | 4.5 | passa |
| texto / rebaixado | `#E6EBE6` | `#0E150F` | 15.35 | 4.5 | passa |
| texto-2 / rebaixado | `#C5CDC6` | `#0E150F` | 11.41 | 4.5 | passa |
| apoio / rebaixado | `#9BA79C` | `#0E150F` | 7.42 | 4.5 | passa |
| texto / elevado | `#E6EBE6` | `#1A231C` | 13.37 | 4.5 | passa |
| texto-2 / elevado | `#C5CDC6` | `#1A231C` | 9.93 | 4.5 | passa |
| apoio / elevado | `#9BA79C` | `#1A231C` | 6.46 | 4.5 | passa |
| texto / folha | `#E6EBE6` | `#202921` | 12.42 | 4.5 | passa |
| texto-2 / folha | `#C5CDC6` | `#202921` | 9.23 | 4.5 | passa |
| apoio / folha | `#9BA79C` | `#202921` | 6.00 | 4.5 | passa |
| título / fundo | `#EAF0EB` | `#0B110C` | 16.52 | 4.5 | passa |
| título / cartão | `#EAF0EB` | `#131B15` | 15.19 | 4.5 | passa |
| marca (link) / cartão | `#98D299` | `#131B15` | 10.05 | 4.5 | passa |
| marca (link) / fundo | `#98D299` | `#0B110C` | 10.92 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#98D299` | `#213821` | 7.27 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#09180C` | `#85BF86` | 8.53 | 4.5 | passa |
| sobre-marca / marca-hover | `#09180C` | `#98D299` | 10.47 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#EAF0EB` | `#213821` | 10.99 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#728074` | `#131B15` | 4.23 | 3 | passa |
| linha-forte / rebaixado | `#728074` | `#0E150F` | 4.46 | 3 | passa |
| foco / cartão | `#96D798` | `#131B15` | 10.43 | 3 | passa |
| foco / fundo | `#96D798` | `#0B110C` | 11.34 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#85BF86` | `#0B110C` | 8.91 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#131B15` | 10.02 | 4.5 | passa |
| crit: texto-2 / aviso | `#C5CDC6` | `#451B19` | 9.08 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#131B15` | 2.74 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#131B15` | 11.77 | 4.5 | passa |
| warn: texto-2 / aviso | `#C5CDC6` | `#3A250B` | 8.92 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#131B15` | 3.12 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#131B15` | 11.63 | 4.5 | passa |
| ok: texto-2 / aviso | `#C5CDC6` | `#0E2F22` | 8.92 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#131B15` | 3.05 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#131B15` | 10.74 | 4.5 | passa |
| info: texto-2 / aviso | `#C5CDC6` | `#182A45` | 8.88 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#131B15` | 2.91 | — | info |

### colorido-escuro (o escuro da noite desta cor)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#EAE8EF` | `#100E15` | 15.78 | 4.5 | passa |
| texto-2 / fundo | `#CBC9D3` | `#100E15` | 11.71 | 4.5 | passa |
| apoio / fundo | `#A4A1AF` | `#100E15` | 7.57 | 4.5 | passa |
| texto / cartao | `#EAE8EF` | `#191720` | 14.59 | 4.5 | passa |
| texto-2 / cartao | `#CBC9D3` | `#191720` | 10.83 | 4.5 | passa |
| apoio / cartao | `#A4A1AF` | `#191720` | 7.00 | 4.5 | passa |
| texto / rebaixado | `#EAE8EF` | `#131119` | 15.41 | 4.5 | passa |
| texto-2 / rebaixado | `#CBC9D3` | `#131119` | 11.44 | 4.5 | passa |
| apoio / rebaixado | `#A4A1AF` | `#131119` | 7.39 | 4.5 | passa |
| texto / elevado | `#EAE8EF` | `#211F29` | 13.37 | 4.5 | passa |
| texto-2 / elevado | `#CBC9D3` | `#211F29` | 9.93 | 4.5 | passa |
| apoio / elevado | `#A4A1AF` | `#211F29` | 6.42 | 4.5 | passa |
| texto / folha | `#EAE8EF` | `#26242E` | 12.58 | 4.5 | passa |
| texto-2 / folha | `#CBC9D3` | `#26242E` | 9.34 | 4.5 | passa |
| apoio / folha | `#A4A1AF` | `#26242E` | 6.04 | 4.5 | passa |
| título / fundo | `#EFEDF5` | `#100E15` | 16.52 | 4.5 | passa |
| título / cartão | `#EFEDF5` | `#191720` | 15.28 | 4.5 | passa |
| marca (link) / cartão | `#C0B0FE` | `#191720` | 9.19 | 4.5 | passa |
| marca (link) / fundo | `#C0B0FE` | `#100E15` | 9.93 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#C0B0FE` | `#322D49` | 6.77 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#151120` | `#AD9DEA` | 7.76 | 4.5 | passa |
| sobre-marca / marca-hover | `#151120` | `#C0B0FE` | 9.61 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#EFEDF5` | `#322D49` | 11.26 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#7C798A` | `#191720` | 4.19 | 3 | passa |
| linha-forte / rebaixado | `#7C798A` | `#131119` | 4.42 | 3 | passa |
| foco / cartão | `#C3B4FF` | `#191720` | 9.53 | 3 | passa |
| foco / fundo | `#C3B4FF` | `#100E15` | 10.31 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#AD9DEA` | `#100E15` | 8.02 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#191720` | 10.11 | 4.5 | passa |
| crit: texto-2 / aviso | `#CBC9D3` | `#451B19` | 9.01 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#191720` | 2.76 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#191720` | 11.87 | 4.5 | passa |
| warn: texto-2 / aviso | `#CBC9D3` | `#3A250B` | 8.86 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#191720` | 3.15 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#191720` | 11.73 | 4.5 | passa |
| ok: texto-2 / aviso | `#CBC9D3` | `#0E2F22` | 8.86 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#191720` | 3.07 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#191720` | 10.83 | 4.5 | passa |
| info: texto-2 / aviso | `#CBC9D3` | `#182A45` | 8.82 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#191720` | 2.93 | — | info |

### rs-escuro (o escuro da noite desta cor)

| par | frente | fundo | razão | mínimo | |
|---|---|---|---:|---:|---|
| texto / fundo | `#E6EBE6` | `#0C110C` | 15.79 | 4.5 | passa |
| texto-2 / fundo | `#C5CDC5` | `#0C110C` | 11.73 | 4.5 | passa |
| apoio / fundo | `#9CA79B` | `#0C110C` | 7.64 | 4.5 | passa |
| texto / cartao | `#E6EBE6` | `#141B14` | 14.53 | 4.5 | passa |
| texto-2 / cartao | `#C5CDC5` | `#141B14` | 10.79 | 4.5 | passa |
| apoio / cartao | `#9CA79B` | `#141B14` | 7.03 | 4.5 | passa |
| texto / rebaixado | `#E6EBE6` | `#0E150F` | 15.35 | 4.5 | passa |
| texto-2 / rebaixado | `#C5CDC5` | `#0E150F` | 11.40 | 4.5 | passa |
| apoio / rebaixado | `#9CA79B` | `#0E150F` | 7.43 | 4.5 | passa |
| texto / elevado | `#E6EBE6` | `#1B231B` | 13.35 | 4.5 | passa |
| texto-2 / elevado | `#C5CDC5` | `#1B231B` | 9.91 | 4.5 | passa |
| apoio / elevado | `#9CA79B` | `#1B231B` | 6.46 | 4.5 | passa |
| texto / folha | `#E6EBE6` | `#202820` | 12.55 | 4.5 | passa |
| texto-2 / folha | `#C5CDC5` | `#202820` | 9.32 | 4.5 | passa |
| apoio / folha | `#9CA79B` | `#202820` | 6.07 | 4.5 | passa |
| título / fundo | `#EAF0EA` | `#0C110C` | 16.48 | 4.5 | passa |
| título / cartão | `#EAF0EA` | `#141B14` | 15.17 | 4.5 | passa |
| marca (link) / cartão | `#86D391` | `#141B14` | 9.81 | 4.5 | passa |
| marca (link) / fundo | `#86D391` | `#0C110C` | 10.66 | 4.5 | passa |
| marca / marca-suave (botão sec) | `#86D391` | `#1F3923` | 7.04 | 4.5 | passa |
| sobre-marca / marca-forte (botão) | `#0B170B` | `#73C07F` | 8.39 | 4.5 | passa |
| sobre-marca / marca-hover | `#0B170B` | `#86D391` | 10.28 | 4.5 | passa |
| título / marca-suave (aba ativa) | `#EAF0EA` | `#1F3923` | 10.88 | 4.5 | passa |
| linha-forte (borda de campo) / cartão | `#738073` | `#141B14` | 4.23 | 3 | passa |
| linha-forte / rebaixado | `#738073` | `#0E150F` | 4.47 | 3 | passa |
| foco / cartão | `#83D890` | `#141B14` | 10.19 | 3 | passa |
| foco / fundo | `#83D890` | `#0C110C` | 11.07 | 3 | passa |
| marca-forte (aba ativa cheia) / fundo | `#73C07F` | `#0C110C` | 8.70 | 3 | passa |
| crit: texto / pílula | `#FFAFAC` | `#451B19` | 8.41 | 4.5 | passa |
| crit: texto / cartão | `#FFAFAC` | `#141B14` | 10.01 | 4.5 | passa |
| crit: texto-2 / aviso | `#C5CDC5` | `#451B19` | 9.07 | 4.5 | passa |
| crit: sobre-sólido / sólido | `#0E141D` | `#FDA19E` | 9.48 | 4.5 | passa |
| crit: borda do aviso / cartão | `#A03F3C` | `#141B14` | 2.73 | — | info |
| warn: texto / pílula | `#FACD78` | `#3A250B` | 9.71 | 4.5 | passa |
| warn: texto / cartão | `#FACD78` | `#141B14` | 11.76 | 4.5 | passa |
| warn: texto-2 / aviso | `#C5CDC5` | `#3A250B` | 8.91 | 4.5 | passa |
| warn: sobre-sólido / sólido | `#0E141D` | `#FAC463` | 11.56 | 4.5 | passa |
| warn: borda do aviso / cartão | `#8C5E1A` | `#141B14` | 3.12 | — | info |
| ok: texto / pílula | `#83E5BC` | `#0E2F22` | 9.60 | 4.5 | passa |
| ok: texto / cartão | `#83E5BC` | `#141B14` | 11.62 | 4.5 | passa |
| ok: texto-2 / aviso | `#C5CDC5` | `#0E2F22` | 8.92 | 4.5 | passa |
| ok: sobre-sólido / sólido | `#0E141D` | `#69D6AA` | 10.38 | 4.5 | passa |
| ok: borda do aviso / cartão | `#2A7257` | `#141B14` | 3.04 | — | info |
| info: texto / pílula | `#AACDFB` | `#182A45` | 8.82 | 4.5 | passa |
| info: texto / cartão | `#AACDFB` | `#141B14` | 10.73 | 4.5 | passa |
| info: texto-2 / aviso | `#C5CDC5` | `#182A45` | 8.87 | 4.5 | passa |
| info: sobre-sólido / sólido | `#0E141D` | `#97C1F7` | 9.93 | 4.5 | passa |
| info: borda do aviso / cartão | `#3963A1` | `#141B14` | 2.90 | — | info |

**Pares reprovados nos temas: 0.**

### Cargos (letra branca no círculo cheio)

| cargo | hoje | razão hoje | proposto (OKLCH) | hex | razão | anel vs cartão escuro |
|---|---|---:|---|---|---:|---:|
| coordenador | `#1D4ED8` | 6.70 | `oklch(42% 0.150 264)` | `#21459D` | 8.74  | 2.02 |
| lider_diurno | `#92400E` | 7.09 | `oklch(44% 0.075 50)` | `#73452B` | 8.03  | 2.20 |
| lider_noturno_geral | `#3730A3` | 9.93 | `oklch(39% 0.150 282)` | `#3D3291` | 10.18  | 1.73 |
| equipe_tecnica | `#6D28D9` | 7.10 | `oklch(47% 0.200 300)` | `#6F2FB7` | 7.59  | 2.32 |
| educador | `#047857` | 5.48 | `oklch(45% 0.080 182)` | `#006459` | 7.08  | 2.49 |
| enfermagem | `#0E7490` | 5.36 | `oklch(49% 0.090 222)` | `#026B85` | 6.10  | 2.89 |
| cozinha | `#9D174D` | 7.88 | `oklch(44% 0.150 355)` | `#8D2157` | 8.44  | 2.09 |
| portaria | `#4D5B0E` | 7.45 | `oklch(45% 0.090 120)` | `#4F5C1B` | 7.29  | 2.42 |
| gestor_geral | `#334155` | 10.35 | `oklch(38% 0.035 255)` | `#364355` | 10.04  | 1.76 |
| admin_tecnico | `#52525B` | 7.73 | `oklch(44% 0.012 285)` | `#525259` | 7.75  | 2.28 |

### Categorias do dia (borda de 5 px, mínimo 3 contra o cartão)

| categoria | hoje | razão hoje / branco | claro proposto | hex | razão | escuro proposto | hex | razão / cartão escuro |
|---|---|---:|---|---|---:|---|---|---:|
| saude | `#EC4899` | 3.53 | `oklch(60% 0.190 350)` | `#CD4290` | 4.40 | `oklch(72% 0.140 350)` | `#E57DB1` | 6.63 |
| medicamento | `#8B5CF6` | 4.23 | `oklch(56% 0.200 295)` | `#8151DB` | 5.08 | `oklch(70% 0.140 295)` | `#A58BEC` | 6.30 |
| educacao | `#3B82F6` | 3.68 | `oklch(56% 0.170 258)` | `#2A71D6` | 4.74 | `oklch(70% 0.120 258)` | `#6EA0E8` | 6.60 |
| lazer | `#10B981` | 2.54 **<3** | `oklch(58% 0.130 158)` | `#15915C` | 4.01 | `oklch(72% 0.120 160)` | `#57BC8A` | 7.53 |
| alimentacao | `#F59E0B` | 2.15 **<3** | `oklch(62% 0.139 65)` | `#BE7100` | 3.78 | `oklch(78% 0.130 75)` | `#E8AA4E` | 8.64 |
| saida | `#06B6D4` | 2.43 **<3** | `oklch(60% 0.106 215)` | `#0090A8` | 3.78 | `oklch(74% 0.100 215)` | `#54BBD2` | 7.91 |
| ocorrencia | `#EF4444` | 3.76 | `oklch(58% 0.200 27)` | `#D73431` | 4.75 | `oklch(70% 0.150 25)` | `#ED756E` | 6.19 |
| rotina | `#64748B` | 4.76 | `oklch(57% 0.030 255)` | `#6C7989` | 4.44 | `oklch(68% 0.025 255)` | `#8E99A8` | 6.11 |

### Azulejos do Colorido (desenho sobre o azulejo, mínimo 3 para ícone; medido contra 4,5)

| azulejo | fundo | tinta | razão |
|---|---|---|---:|
| framboesa | `oklch(94% 0.035 350)` `#FFE2EE` | `oklch(47% 0.150 350)` `#942D66` | 6.14 |
| azul | `oklch(94% 0.028 258)` `#E0ECFF` | `oklch(47% 0.160 262)` `#2454B3` | 5.88 |
| agua | `oklch(94% 0.040 200)` `#CDF4F6` | `oklch(48% 0.082 205)` `#006B74` | 5.33 |
| violeta | `oklch(94% 0.033 300)` `#EEE7FF` | `oklch(47% 0.200 300)` `#6F2FB7` | 6.33 |
| folha | `oklch(94% 0.050 140)` `#DAF4D4` | `oklch(47% 0.110 140)` `#36692A` | 5.57 |
| ceu | `oklch(94% 0.033 235)` `#D6EFFF` | `oklch(48% 0.100 235)` `#06658E` | 5.41 |

### As 48 cores da casa (barra e ponto: mínimo 3)

No claro, contra o fundo proposto e o branco: Limão 2.94, Pistache 2.93, Girassol 2.21, Milho 2.54, Mel 2.92, Laranja 2.84, Tangerina 2.94, Pêssego 2.86, Areia 2.99. Pior: 2.21.

No escuro, como estão hoje, contra o cartão escuro proposto: 11 de 48 abaixo de 3 (Uva 2.93, Violeta 2.94, Anil 2.76, Noite 2.13, Café 2.59, Chocolate 2.10, Ameixa 2.20, Vinho 2.19, Cereja 2.46, Grafite 2.87, Petróleo 2.62).

No escuro, clareadas com `oklch(from var(--cor) calc(l + 0.14) c h)`: todas passam; pior 3.81.

### O que existe hoje e não passa (para comparar)

| par | razão | mínimo |
|---|---:|---:|
| claro · borda de campo --line-2 #BDCBDC / campo --raised #F6F9FC | 1.56 | 3 |
| claro · borda de campo --line-2 #BDCBDC / cartão #FFFFFF | 1.65 | 3 |
| escuro · borda de campo --line-2 #3B4C5D / cartão #151E28 | 1.90 | 3 |
| escuro · letra #07121C / aba ativa e Acolhe+AI #7BC0EC (área grande, muito luminosa) | 9.52 | 4.5 |
| claro · --muted #566579 / --sunken #E3EAF3 | 4.90 | 4.5 |
| rs · azulejo vermelho #A6191F / #FCE3E1 | 6.19 | 4.5 |
| rs · azulejo amarelo #7A5B00 / #FFF1BF | 5.59 | 4.5 |

### Fora da gama sRGB (o croma pedido foi cortado; o hex e o OKLCH entregues já trazem o valor cortado)

- claro.marca-hover: oklch(0.395 0.105 247) fora do sRGB, croma reduzido para 0.104 no hex
- claro.foco: oklch(0.54 0.15 245) fora do sRGB, croma reduzido para 0.136 no hex
- claro.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- claro.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- claro.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- claro.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- claro.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- rosa.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- rosa.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- rosa.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- rosa.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- rosa.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- azul.texto: oklch(0.225 0.0455 230) fora do sRGB, croma reduzido para 0.045 no hex
- azul.titulo: oklch(0.38 0.085 232) fora do sRGB, croma reduzido para 0.078 no hex
- azul.marca: oklch(0.48 0.1 228) fora do sRGB, croma reduzido para 0.094 no hex
- azul.marca-forte: oklch(0.48 0.1 228) fora do sRGB, croma reduzido para 0.094 no hex
- azul.marca-hover: oklch(0.42 0.095 230) fora do sRGB, croma reduzido para 0.084 no hex
- azul.foco: oklch(0.56 0.12 228) fora do sRGB, croma reduzido para 0.109 no hex
- azul.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- azul.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- azul.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- azul.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- azul.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- verde.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- verde.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- verde.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- verde.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- verde.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- colorido.marca-suave: oklch(0.95 0.03 300) fora do sRGB, croma reduzido para 0.028 no hex
- colorido.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- colorido.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- colorido.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- colorido.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- colorido.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- rs.marca-hover: oklch(0.395 0.115 148) fora do sRGB, croma reduzido para 0.115 no hex
- rs.crit-fundo: oklch(0.965 0.022 20) fora do sRGB, croma reduzido para 0.017 no hex
- rs.warn-fundo: oklch(0.972 0.04 85) fora do sRGB, croma reduzido para 0.030 no hex
- rs.ok-texto: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- rs.ok-solido: oklch(0.475 0.1 165) fora do sRGB, croma reduzido para 0.100 no hex
- rs.info-fundo: oklch(0.963 0.02 255) fora do sRGB, croma reduzido para 0.018 no hex
- rosa-escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- azul-escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- verde-escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- colorido-escuro.foco: oklch(0.81 0.12 293) fora do sRGB, croma reduzido para 0.105 no hex
- colorido-escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- rs-escuro.crit-texto: oklch(0.83 0.095 22) fora do sRGB, croma reduzido para 0.094 no hex
- cargo.educador: oklch(0.45 0.085 182) fora do sRGB, croma reduzido para 0.081 no hex
- casa-clareada: oklch(0.724 0.178 28) fora do sRGB, croma reduzido para 0.171 no hex
- casa-clareada: oklch(0.77 0.174 346.6) fora do sRGB, croma reduzido para 0.169 no hex
- casa-clareada: oklch(0.812 0.152 58) fora do sRGB, croma reduzido para 0.128 no hex
- casa-clareada: oklch(0.806 0.16 48.4) fora do sRGB, croma reduzido para 0.121 no hex
- casa-clareada: oklch(0.811 0.134 42.4) fora do sRGB, croma reduzido para 0.113 no hex
- casa-clareada: oklch(0.792 0.141 28.9) fora do sRGB, croma reduzido para 0.120 no hex
- casa-clareada: oklch(0.788 0.162 30.2) fora do sRGB, croma reduzido para 0.123 no hex
- cat.alimentacao: oklch(0.62 0.14 65) fora do sRGB, croma reduzido para 0.139 no hex
- cat.saida: oklch(0.6 0.11 215) fora do sRGB, croma reduzido para 0.106 no hex
- azulejo do Colorido: oklch(0.94 0.04 350) fora do sRGB, croma reduzido para 0.036 no hex
- azulejo do Colorido: oklch(0.94 0.035 258) fora do sRGB, croma reduzido para 0.029 no hex
- azulejo do Colorido: oklch(0.48 0.09 205) fora do sRGB, croma reduzido para 0.082 no hex
- azulejo do Colorido: oklch(0.94 0.04 300) fora do sRGB, croma reduzido para 0.034 no hex
- azulejo do Colorido: oklch(0.94 0.035 235) fora do sRGB, croma reduzido para 0.034 no hex
