# Frente: o visual, os menus e o plantão no celular (fases 315 e 316)

> **Esta nota não foi escrita pela conta que abriu a frente.** Ela mora no branch
> `claude/cargo-nulo-recusado`, porque o branch do visual ainda não tem a pasta `passagem/`.
> Quando os dois branches se juntarem, a nota passa a morar no do visual.

- **Branch:** `claude/acabamento-visual-fase-314`
- **Atualizado em:** 2026-11-13T12:40-03:00
- **Situação:** fechada a 318 (o cadastro do acolhido não trava no CPF), publicada no site em 13/11, com o sim do dono. Nada em andamento.
- **Fase:** 315 a 318, fechadas. A próxima livre é a 319.
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

- **Desde 13/11 a equipe do Pão está usando o protótipo publicado** (o dono: *o sistema não pode mais ficar offline*). Publicar continua sendo empurrar para o `claude/work-system-code-ready-0e3hh2`, e só com a suíte verde nas duas condições e o `ensaio:uso` sem reprovação: o que for ao ar é o que eles abrem.

- **A 317 foi assumida em 12/11, às 23h37, a partir do `a8933e4`**, pela conta que escreveu a 315 e a 316, a pedido do dono (*pode continuar e finalizar, lá acabou o limite*). O código está todo escrito; falta a medida (a suíte nas duas condições, o `ensaio:uso` e o do celular sobre o protótipo de agora, que gerado de novo sai igual) e as revisões da 1717 pelo `banco-de-dados` e pelo `auditor-seguranca-lgpd`, que estão rodando. Depois, o `MEDIDO-317` no `CLAUDE.md`, o commit que fecha e a publicação da 316 e da 317 no site, que o dono autorizou.

- Dois `ensaio:cabe` ao mesmo tempo se atrapalham: um saiu com erro e sem registro, e sozinho
  passou. Um de cada vez.
- Nesta máquina o PostgreSQL cai entre uma etapa e outra da sessão: suba-o no mesmo comando
  que roda a suíte.
