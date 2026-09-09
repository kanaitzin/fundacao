# Design System — Rede Acolher

Fonte da verdade visual: `prototipo/rede-acolher-prototipo.html` (tokens completos) e
`frontend/src/styles.css` (mesmos tokens no sistema real).

## Princípio de cor

**Cor comunica estado operacional e categoria de atividade — nunca julgamento, ranking
ou pontuação sobre a pessoa** (§3.3). Um chip vermelho significa "exige ação agora",
jamais "criança problemática". Nenhuma cor é aplicada a pessoas, só a estados.

Nada depende apenas de cor: todo estado traz rótulo textual (WCAG 2.2 AA, §22).

## Marca

Extraída do logo oficial da Fundação O Pão dos Pobres:

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--navy` | `#003262` | `#0A1B2C` | cabeçalho institucional |
| `--brand` / `--brand-solid` | `#005993` | `#7BC0EC` | ação primária, links, destaque |
| `--brand-soft` | `#E2EFF9` | `#152C41` | fundo de ação secundária |

## Paleta viva (estados)

Cada matiz tem dois valores: **vivo** (tinta de fundo, borda, ponto da linha do tempo) e
**sólido** (texto sobre tinta e preenchimento de chip selecionado, com contraste AA).
No tema escuro os papéis se invertem: o sólido fica claro e o texto sobre ele, escuro
(`--on-solid`).

| Classe | Matiz | Significado |
|---|---|---|
| `.c-ok` | esmeralda | concluído, em dia, assinado |
| `.c-warn` | âmbar | pendente, agendado, aguardando |
| `.c-crit` | vermelho | exige ação agora, atraso, recusa, incidente |
| `.c-info` | azul | em andamento, informativo |
| `.c-med` | violeta | medicamento e conteúdo restrito |
| `.c-move` | ciano | deslocamento, saída, ausência externa |
| `.c-other` | rosa | "outro" com nota |
| `.c-mute` | ardósia | rotina, não aplicável, sem demanda |
| `.c-brand` | azul institucional | identidade, contagens neutras |

## Contraste — conferido, não estimado

Desde 02/09/2026 há um conferidor: `npm run ensaio:acessibilidade` roda o
axe-core (WCAG 2.1 A e AA) nas **107 telas** que os oito cargos alcançam. Três
coisas que ele ensinou, e que valem como regra daqui em diante:

1. **`opacity` desbota o texto junto com a decoração.** Quatro listas usavam
   opacidade entre .55 e .62 para recuar o que já aconteceu — a dose
   administrada, a atividade concluída, a criança que saiu. A conta é
   multiplicativa: a linha de apoio, já cinza por ser apoio, caía para 2,3:1.
   **O que já foi resolvido recua pelo FUNDO e pelo peso**, nunca pela tinta:
   `background: var(--sunken)` e `font-weight: 600`.
2. **Toda tinta precisa passar nos TRÊS fundos claros** — `--surface`,
   `--ground` e `--sunken` —, e não só no branco. `--muted` estava em 5,44:1
   no branco e 4,49:1 sobre a superfície rebaixada: a mesma cor aprovada num
   lugar e reprovada no outro, por dois centésimos.
3. **A diferença entre 4,46 e 4,5 não se enxerga num monitor com luz.**
   Enxerga-se no corredor, às onze da noite. O âmbar da pílula "em atenção"
   estava nesse limiar — a tinta mais fraca da tela reservada justamente para
   o aviso. `--amber-solid` foi de `#B45309` para `#92400E`.

Aplicação: `<span class="pill c-warn">Aguardando</span>`,
`<button class="opt c-crit">Recusou</button>`, `<div class="notice c-info">…</div>`,
`<div class="tile c-ok">…</div>`.

## Tipografia

- **Plus Jakarta Sans** (600–800): títulos, rótulos, números, chips — voz institucional.
- **Atkinson Hyperlegible** (400/700): texto corrido — desenhada para legibilidade,
  coerente com a meta de acessibilidade do sistema.

## Componentes

`.appbar` (cabeçalho navy com logo, papel e contexto do plantão) · `.card` · `.tile`
(indicador com faixa colorida) · `.pill` (estado) · `.opt` (opção viva selecionável) ·
`.notice` (aviso com barra lateral) · `.tl-*` (linha do tempo com cor por tipo) ·
`.kidcard` (avatar com iniciais) · `.seg` · `.tabbar` · `.sheet`.

## Temas

Três estados: claro, escuro e "sistema". Tokens definidos em `:root`, redefinidos em
`@media (prefers-color-scheme: dark)` com guarda `:root:not([data-theme="light"])` e
novamente em `:root[data-theme="dark"]`. Nenhuma cor tem definição única dentro de
media query.
