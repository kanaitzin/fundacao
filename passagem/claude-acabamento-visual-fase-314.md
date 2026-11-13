# Frente: o visual, os menus e o plantão no celular (fases 315 e 316)

> **Esta nota não foi escrita pela conta que abriu a frente.** Ela mora no branch
> `claude/cargo-nulo-recusado`, porque o branch do visual ainda não tem a pasta `passagem/`.
> Quando os dois branches se juntarem, a nota passa a morar no do visual.

- **Branch:** `claude/acabamento-visual-fase-314`
- **Atualizado em:** 2026-11-12T20:11-03:00
- **Situação:** fechada a 316, no commit `aec3b29`. Nada em andamento.
- **Fase:** 315 e 316, as duas fechadas. A próxima livre é a 317, reservada para o que está no branch `claude/cargo-nulo-recusado`.
- **Pedido do dono:** em 12/11, à conta do visual, o plantão *mais intuitivo no uso*; e a esta conta, no fim do dia, *continue a fase 316*, quando o limite de lá acabou.

## O que está sendo feito agora

Nada. A conta do visual escreveu a 316 inteira (o roteiro do turno no alto do Dia, a folha Mais
em grade, os Acolhidos com a lista primeiro, o título em toda tela, o atalho da ATA) e parou
antes da medida, com o marcador `MEDIDO-316` no `CLAUDE.md`. A outra conta assumiu o branch a
partir do `6d67a49`, mediu e fechou.

## Onde parou, e o próximo passo

1. **O protótipo online não foi atualizado com a 316.** Ele sai do branch
   `claude/work-system-code-ready-0e3hh2`, que está na 315 (`4220c3c`). Levar a 316 para lá
   publica: fazer só com o sim do dono.
2. Juntar o `claude/cargo-nulo-recusado` como fase 317: ver a nota dele.

## Arquivos desta frente

Nenhum reservado agora. Enquanto a 316 esteve aberta, eram os da tela (`App.tsx`,
`Acolhidos.tsx`, `Dia.tsx`, `Ata.tsx`, `Ocorrencias.tsx`, `OQueMudou.tsx`, `styles.css`), os
ensaios, o protótipo gerado e os documentos de fechamento.

## O que rodou e o que não rodou

Sobre o `6d67a49`, numa cópia congelada do protótipo (que, gerado de novo, saiu igual ao do
repositório): os dois `tsc`; a suíte inteira nas duas condições de relógio (1581 de 1581 nas
duas); o `ensaio:uso` (900 cobranças); o básico, o das folhas e o do roteiro (56 tarefas); o
do celular (388 telas); o de acessibilidade (1379 telas, sete temas); o `por-cima` (6200
telas, catorze aparelhos); e o `cabe` do educador e da coordenação da casa, a 390 e a 1366 px.
Nenhum achado, e nenhum código mudou depois do `6d67a49`.

**Não rodou:** o `ensaio:acolhe`, o `vazio`, o `aparelhos`, o `uso-celular`, o `largo`, o
`cabe` dos outros sete cargos, a letra Maior e a simulação contra o servidor.

## Para quem chegar

- Dois `ensaio:cabe` ao mesmo tempo se atrapalham: um saiu com erro e sem registro, e sozinho
  passou. Um de cada vez.
- Nesta máquina o PostgreSQL cai entre uma etapa e outra da sessão: suba-o no mesmo comando
  que roda a suíte.
