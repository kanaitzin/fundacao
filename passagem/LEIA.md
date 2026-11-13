# A passagem de turno entre as contas

O projeto é tocado por mais de uma conta do Claude, a pedido do dono (12/11). Cada conta
trabalha no seu branch, e o limite de uma acaba sem aviso, no meio de uma frase. Esta
pasta é o caderno de plantão das sessões: quem chega lê o que a outra deixou, e sabe o que
continuar e o que não tocar, sem o dono reexplicar nada.

É a mesma regra da casa: ninguém entra no turno sem ler a passagem, e ninguém sai sem
escrever a sua.

## Como funciona

**Uma nota por frente de trabalho, e a frente é o branch.** O arquivo se chama
`passagem/<nome-do-branch>.md`, com a barra do nome trocada por hífen
(`claude/cargo-nulo-recusado` vira `claude-cargo-nulo-recusado.md`). Cada sessão escreve
só a nota da frente em que está. Como cada uma escreve um arquivo diferente, juntar os
branches nunca dá conflito aqui.

**A nota mora no branch da frente, e o script lê todos os branches.** Quem está em outro
branch não vê a nota no disco. Por isso:

```bash
bash scripts/passagem.sh
```

Ele busca os branches, lê a nota de dentro de cada um e mostra a versão mais nova de cada
frente, e no fim a ponta de cada branch com a data. Não troca de branch, não grava nada.
O `.claude/hooks/session-start.sh` já o roda no começo da sessão na web.

## Ao chegar

1. Rode `bash scripts/passagem.sh` (ou leia o que o começo da sessão mostrou).
2. Veja a **situação** de cada frente e a lista **Arquivos desta frente**. O que está na
   lista de outra frente em andamento, você não toca.
3. Compare a data da nota com a ponta do branch, no fim da saída. **Ponta mais nova que a
   nota quer dizer que o limite acabou antes de a sessão escrever**: leia os últimos
   commits daquele branch (`git log origin/<branch> -5`) antes de confiar na nota.
4. Diga ao dono, em duas linhas, o que cada frente está fazendo e o que você propõe fazer.

## Ao trabalhar

- **Atualize a sua nota a cada commit, no mesmo commit.** Não no fim: o fim não avisa.
  O carimbo sai de `bash scripts/passagem.sh --carimbo`.
- Antes de abrir um arquivo que não estava na sua lista, confira que nenhuma outra frente
  em andamento o declarou, e acrescente à sua.
- **Os arquivos que todas as fases mexem têm um dono por vez**, e ele está escrito na nota:
  o `CLAUDE.md` (*O que fazer agora*), o §2 do `docs/REDE-ACOLHER.md`, as Novidades do
  `guia-do-sistema.ts`, o `prototipo/rede-acolher-prototipo.html` (é gerado, e dois lados
  gerando dão conflito no arquivo inteiro) e os números que o `numeros-da-documentacao`
  confere. Frente que não é a dona deixa o fechamento escrito na nota, para a dona fazer.
- **O número da fase** também: a nota diz qual fase a frente ocupa. Frente nova pega o
  número seguinte ao maior que aparecer nas notas e no §2.

## Ao continuar a frente de outra conta

Quando o limite de lá acabou e o dono pede para seguir daqui:

1. `git fetch origin <branch>` e trabalhe **no mesmo branch** (não abra outro por cima).
2. Na nota daquela frente, troque a situação para *em andamento* e escreva, na primeira
   linha de *Para quem chegar*, que a frente foi assumida, quando e a partir de qual commit.
3. Confira o que a nota diz que rodou. O que não está escrito como rodado, não rodou.

Quando a conta de lá voltar, ela lê a mesma nota e sabe que a frente andou.

## Ao fechar a frente

Situação *fechada*, com o commit que fechou e o que ficou para a Fundação decidir. A nota
fica: é o registro de quem fez o quê. Quando o branch for junto ao tronco e a frente não
tiver mais nada aberto, a nota vai para `docs/historico/`.

## O que a nota não leva

O repositório é público. Nada de e-mail ou nome de quem é dono das contas, nada de senha,
chave ou link de sessão, e nenhum dado real de criança, família ou funcionário: as mesmas
regras do §5 do documento. As contas se chamam pelo que fazem (*a frente do visual*, *a
frente do banco*), nunca por quem paga.

## O modelo da nota

```markdown
# Frente: <o que esta frente faz, em uma linha>

- **Branch:** `claude/…`
- **Atualizado em:** 2026-11-12T09:20-03:00
- **Situação:** em andamento | parada no meio | esperando o dono | fechada
- **Fase:** 000 (ou *sem fase*)
- **Pedido do dono:** o que foi pedido, nas palavras dele, com a data

## O que está sendo feito agora
Uma ou duas frases.

## Onde parou, e o próximo passo
O passo seguinte, com o comando exato quando houver. Quem chega começa por aqui.

## Arquivos desta frente
A lista do que esta frente está mexendo. A outra frente não toca neles.

## O que rodou e o que não rodou
Com os números, e dizendo de qual commit. O que não está aqui, não rodou.

## Para quem chegar
O que a outra conta precisa saber: o que ficou para ela fazer, o que foi achado e não
consertado, o que espera resposta do dono.
```
