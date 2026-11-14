# Frente: o visual, os menus e o plantão no celular (fases 315 e 316)

> **Esta nota não foi escrita pela conta que abriu a frente.** Ela mora no branch
> `claude/cargo-nulo-recusado`, porque o branch do visual ainda não tem a pasta `passagem/`.
> Quando os dois branches se juntarem, a nota passa a morar no do visual.

- **Branch:** `claude/acabamento-visual-fase-314`
- **Atualizado em:** 2026-11-14T01:00-03:00
- **Situação:** fechada a 320 (a Chamada e O Dia da Casa revistos, e o adendo da chamada confirmada, checks/1719 e 1720), esperando o sim do dono para ir ao site (o site está na 319).
- **Fase:** 315 a 320, fechadas. A próxima livre é a 321.
- **Pedido do dono:** em 12/11, à conta do visual, o plantão *mais intuitivo no uso*; e a esta conta, no fim do dia, *continue a fase 316*, quando o limite de lá acabou.

## O que está sendo feito agora

Nada. A 320 fechou com a suíte verde nas duas condições (1607 de 1607), o `ensaio:uso` (918) e o do celular (388).

## Onde parou, e o próximo passo

1. Publicar a 320 no site (`claude/work-system-code-ready-0e3hh2`) só com o sim do dono.
2. O que a equipe do Pão achar testando esta semana.

## Arquivos desta frente

Nenhum reservado agora.

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

- **Desde 13/11 a equipe do Pão está usando o protótipo publicado** (o dono: *o sistema não pode mais ficar offline*). Publicar continua sendo empurrar para o `claude/work-system-code-ready-0e3hh2`, e só com a suíte verde nas duas condições e o `ensaio:uso` sem reprovação: o que for ao ar é o que eles abrem.

- **A 317 foi assumida em 12/11, às 23h37, a partir do `a8933e4`**, pela conta que escreveu a 315 e a 316, a pedido do dono (*pode continuar e finalizar, lá acabou o limite*). O código está todo escrito; falta a medida (a suíte nas duas condições, o `ensaio:uso` e o do celular sobre o protótipo de agora, que gerado de novo sai igual) e as revisões da 1717 pelo `banco-de-dados` e pelo `auditor-seguranca-lgpd`, que estão rodando. Depois, o `MEDIDO-317` no `CLAUDE.md`, o commit que fecha e a publicação da 316 e da 317 no site, que o dono autorizou.

- Dois `ensaio:cabe` ao mesmo tempo se atrapalham: um saiu com erro e sem registro, e sozinho
  passou. Um de cada vez.
- Nesta máquina o PostgreSQL cai entre uma etapa e outra da sessão: suba-o no mesmo comando
  que roda a suíte.
