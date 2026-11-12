# Frente: o visual do perfil e dos menus (fase 315)

> **Esta nota não foi escrita por quem faz a frente.** Foi montada em 12/11 pela frente do
> banco, a partir dos três commits do branch e do que o dono contou, para a pasta não nascer
> vazia. A conta do visual corrige o que estiver errado na primeira vez que abrir, e a partir
> daí a nota é dela.

- **Branch:** `claude/acabamento-visual-fase-314`
- **Atualizado em:** 2026-11-12T09:22-03:00
- **Situação:** parada no meio (o limite da conta acabou em 12/11, depois do commit `cf6ea5b`)
- **Fase:** 315, em andamento. Os três commits levam `[skip ci]`.
- **Pedido do dono:** ajustar o visual do perfil e dos menus, acertando as posições (dito pelo dono em 12/11, de memória; o pedido inteiro está na conversa da outra conta).

## O que está sendo feito agora

Pelos commits de 12/11: a coluna curta do monitor com as telas irmãs numa entrada só, os
atalhos de cada pessoa e a barreira de erro (`cbb9d17`); o Dia com os cartões curtos no alto,
a ficha ao lado da foto no monitor e as fotos num lugar só (`79488d9`); a busca do topo
achando também a tela, a casa de trabalho trocando com o cargo no protótipo, e as cobranças
da coluna curta e da barreira (`cf6ea5b`).

## Onde parou, e o próximo passo

Não se sabe daqui o que ainda faltava do pedido. O que se vê é que a fase não foi fechada:
o §2, as Novidades e o *O que fazer agora* não falam da 315, e o `numeros-da-documentacao`
reprova no branch.

## Arquivos desta frente

Os que os três commits mexeram, e que a outra frente não toca: `frontend/src/App.tsx`,
`portas.ts`, `barreira-de-erro.tsx`, `main.tsx`, `avatar.tsx`, `styles.css`,
`mock-casa.ts`, `screens/Acolhidos.tsx`, `screens/Dia.tsx`, `screens/OQueMudou.tsx`,
`frontend/ensaio-uso.mjs`, `ensaio-acessibilidade.mjs`, `ensaio-cabe-e-volta.mjs`,
`ensaio-por-cima.mjs`, `backend/test/as-portas-e-os-icones.spec.ts` e o
`prototipo/rede-acolher-prototipo.html`.

**E esta frente é a dona dos arquivos de fechamento** enquanto a 315 estiver aberta: o
*O que fazer agora* do `CLAUDE.md`, o §2 do `docs/REDE-ACOLHER.md`, as Novidades, o
protótipo gerado e os números.

## O que rodou e o que não rodou

Medido pela frente do banco sobre o `cf6ea5b`: os dois `tsc` sem erro, e a suíte inteira
nas duas condições de relógio com reprovação só no `numeros-da-documentacao`. Nenhum ensaio
de navegador foi rodado daqui. O que a própria frente rodou não está escrito em lugar nenhum.

## Para quem chegar

- A frente do banco deixou a fase 316 pronta para juntar: veja
  `passagem/claude-cargo-nulo-recusado.md`, *Onde parou*.
- Ao retomar, a primeira coisa é reescrever esta nota com o que só esta conta sabe: o que
  falta do pedido e o que já rodou.
