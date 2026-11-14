# Frente: o visual, os menus e o plantão no celular (fases 315 e 316)

> **Esta nota não foi escrita pela conta que abriu a frente.** Ela mora no branch
> `claude/cargo-nulo-recusado`, porque o branch do visual ainda não tem a pasta `passagem/`.
> Quando os dois branches se juntarem, a nota passa a morar no do visual.

- **Branch:** `claude/acabamento-visual-fase-314`
- **Atualizado em:** 2026-11-13T23:00-03:00
- **Situação:** em andamento a 320 (a Chamada e O Dia da Casa revistos, a pedido de 13/11): feitos o que falta nas folhas da Chamada e do Dia, o Fechar da folha de decidir a substituição, o café e o almoço do protótipo sem as crianças do acervo, a linha da chamada no Dia lida das chamadas, e o Abrir chamada do Dia abrindo a chamada certa. Falta: o adendo da chamada confirmada (decidido pelo dono em 13/11: fazer), a sonda de novo, os ensaios e o fechamento. A 319 está no site.
- **Fase:** 315 a 319, fechadas. A 320 está aberta aqui.
- **Pedido do dono:** em 12/11, à conta do visual, o plantão *mais intuitivo no uso*; e a esta conta, no fim do dia, *continue a fase 316*, quando o limite de lá acabou.

## O que está sendo feito agora

A 320, a Chamada e O Dia da Casa revistos (pedido de 13/11, *revise agora a chamada e o dia da casa*), com a
mesma sonda da 319 adaptada (`scratchpad/dia/sonda.mjs`, que se perde com a sessão: ela toca cada botão até dois
níveis, preenche cada folha e anota botão apagado sem frase, folha sem Fechar e botão que não faz nada).

## Onde parou, e o próximo passo

1. O adendo da chamada confirmada: a técnica e a coordenação acrescentam a correção de uma criança, o registro da
   hora fica, a correção fica ao lado com nome e motivo (migração nova em `checks`, com o `banco-de-dados`).
2. A sonda de novo nos cargos que registram, a suíte nas duas condições, o `ensaio:uso` e o do celular, e o fechamento.

## Arquivos desta frente

`Chamada.tsx`, `Dia.tsx`, `Saude.tsx` (só a folha da dose), `mock-casa.ts`, `chamada-a-abrir.ts`, o módulo `checks`
do servidor, o `ensaio-uso.mjs`, o protótipo gerado e os documentos de fechamento.

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
