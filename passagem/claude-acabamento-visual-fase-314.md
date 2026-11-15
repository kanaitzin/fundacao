# Frente: o visual, os menus e o plantão no celular (fases 315 e 316)

> **Esta nota não foi escrita pela conta que abriu a frente.** Ela mora no branch
> `claude/cargo-nulo-recusado`, porque o branch do visual ainda não tem a pasta `passagem/`.
> Quando os dois branches se juntarem, a nota passa a morar no do visual.

- **Branch:** `claude/acabamento-visual-fase-314`
- **Atualizado em:** 2026-11-15T13:43-03:00
- **Situação:** fase 324 (o funcionário do mês) escrita e em medição; publica-se no site quando a suíte nas duas condições e o `ensaio:uso` passarem. A 323 (o ranking) está no site desde 15/11.
- **Fase:** 324 em medição; 323 fechada. A próxima livre é a 326.
- **Pedido do dono:** em 12/11, à conta do visual, o plantão *mais intuitivo no uso*; e a esta conta, no fim do dia, *continue a fase 316*, quando o limite de lá acabou.

## O que está sendo feito agora

Nada. Depois da 321, em 14/11, rodaram as duas medidas que faltavam: a Casa 03 em trinta dias contra o servidor de verdade (sem achado) e o `ensaio:aparelhos` (oito aparelhos, sem achado, depois de consertar o próprio ensaio, que tirava anexo tocando com `force` atrás da barra do pé no tablet deitado).

## Onde parou, e o próximo passo

1. O que a equipe do Pão achar testando esta semana. A 320 está no site desde 14/11.

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

- **A conferência da 322 foi assumida em 2026-11-14 às 18:50**, a partir do `227a02d`, pela conta da 317, a pedido do dono (*continue e veja se está em conformidade com a outra conta*). Medido sobre o `227a02d`: a suíte inteira nas duas condições de relógio (1623 de 1623 nas duas). **O `ensaio:uso` achou um defeito da 322**: a portaria, que ganhou os Encontros, passou a abrir neles e não no portão (o primeiro da lista em ordem alfabética); consertado no `App.tsx` (os encontros nunca são a tela de entrada) e a cobrança do ensaio reescrita (a portaria agora tem duas telas na barra, como a cozinha). **A revisão da 1721, feita à mão nesta conta e provada como o papel da aplicação**, achou a conta desativada lendo, dando ciência e escrevendo adendo, e o aviso do próximo encontro consumido sem ninguém receber quando quem registrou saiu: fechados na **alignments/1723**, com dois casos novos na `o-encontro-de-alinhamento` que reprovam sem ela. Anotado, sem mexer: qualquer conta da casa chama a função do relógio e consome o aviso do dia, como nas outras rotinas do relógio. **Os subagentes `banco-de-dados` e `auditor-seguranca-lgpd` não foram chamados sobre a 1723.** **E o pedido do dono no meio da conferência** (a cozinha e a portaria apareciam para levar criança a atividade): activities/1724 e nursing/1725, com a suíte `quem-acompanha-a-crianca`, entram na 322. **Ficou para o dono decidir:** a Escala e o Trabalho da equipe continuam listando a cozinha e a portaria (a escala delas pode ser legítima).

- **Desde 13/11 a equipe do Pão está usando o protótipo publicado** (o dono: *o sistema não pode mais ficar offline*). Publicar continua sendo empurrar para o `claude/work-system-code-ready-0e3hh2`, e só com a suíte verde nas duas condições e o `ensaio:uso` sem reprovação: o que for ao ar é o que eles abrem.

- **A 317 foi assumida em 12/11, às 23h37, a partir do `a8933e4`**, pela conta que escreveu a 315 e a 316, a pedido do dono (*pode continuar e finalizar, lá acabou o limite*). O código está todo escrito; falta a medida (a suíte nas duas condições, o `ensaio:uso` e o do celular sobre o protótipo de agora, que gerado de novo sai igual) e as revisões da 1717 pelo `banco-de-dados` e pelo `auditor-seguranca-lgpd`, que estão rodando. Depois, o `MEDIDO-317` no `CLAUDE.md`, o commit que fecha e a publicação da 316 e da 317 no site, que o dono autorizou.

- Dois `ensaio:cabe` ao mesmo tempo se atrapalham: um saiu com erro e sem registro, e sozinho
  passou. Um de cada vez.
- Nesta máquina o PostgreSQL cai entre uma etapa e outra da sessão: suba-o no mesmo comando
  que roda a suíte.
