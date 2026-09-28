# As oito casas vivem um ano juntas: o relatório da fase 177

Pedido de 28/09/2026: *"simule várias casas durante um ano, analise também como o
gestor vê tudo isso, assim como o educador líder e coordenador de todas as casas
(novo cargo do Marcelo)"*. O cargo novo é a Coordenação Geral, feita na fase 176.

## Como foi feito

```bash
SIM_CASAS=AI1,AI2,AI3,AI4,ARM1,ARM2,ARM3,ARM4 bash scripts/simulacao-da-casa.sh 365
```

É a simulação das fases 173 e 174, agora com as oito casas vivendo o mesmo ano, de
16/11/2026 a 15/11/2027. Cada casa tem a sua coordenação, técnica, Líder Diurno,
quatro educadores, portaria e cozinha, e as suas crianças. A AI3 e a AI4 vivem também
com as crianças da semente (a AI3 com vinte).

Há um relógio só, o do banco, e uma agenda que só o faz andar quando todas as casas
pediram a hora seguinte. Assim o relógio nunca volta: as oito casas abrem o plantão
às 07h juntas, dão o remédio das 20h juntas, e o relógio do dia roda uma vez às 05h
para as oito, como o cron da implantação.

A instituição vive junto:
- o **Líder Noturno Geral** abre, preenche e assina a ATA Geral Noturna toda manhã, às
  07h45, depois que as oito casas fecharam as ATAs noturnas;
- a **Coordenação Geral** foi cadastrada pelo gestor no primeiro dia, ampliou o limite
  da AI3 e da AI4 (que a semente deixa cheias), lê o dia das oito casas toda
  segunda-feira, e no dia 21 de cada mês abre a escala do mês seguinte, as ATAs
  abertas e os acompanhamentos de cada casa; em quatro casas foi ela que abriu a
  exceção da visita fora do combinado;
- o **gestor** abre o painel no primeiro dia de cada mês.

No fim, o que cada cargo da instituição vê foi medido pela API e aberto no navegador
contra o servidor de verdade (`frontend/ensaio-servidor.mjs`).

## O que bateu

**Nenhum achado.** Em nenhuma das oito casas, na instituição, na voz das mensagens,
nos documentos baixados, nem no navegador.

| No ano, somando as oito casas | |
|---|---|
| Refeições registradas | 81.563 |
| Chamadas confirmadas | 8.760 |
| Doses dadas no horário | 9.587, nenhuma sem resposta |
| Plantões e ATAs das casas | 5.840, nenhuma esquecida aberta |
| ATAs Gerais Noturnas assinadas | 364 de 364 noites, **nenhuma com pendência** |
| Linhas da ATA Geral com chamado à noite | 93 |
| Visitas | 2.392, todas batendo criança por criança |
| Crianças acolhidas | 72, com 8 transferências entre casas e 8 desligamentos |
| Internações, com diário e laudos | 24 |
| Documentos baixados e relidos na voz da equipe | 240 |

Cada casa conferiu a sua parte contra o que o sistema devolve: visitas por criança,
refeições, saldo do armário por remédio, doses no banco, plantões, relatórios do
período em metades de seis meses, ocupação de hoje e escala de fevereiro. Tudo bate
nas oito, inclusive na AI3, onde as vinte crianças da semente entram na chamada junto
com as da simulação.

## Como o gestor vê

O **painel das oito casas** abre em 135 ms. É um cartão por casa, na ordem do código:
ocupação e limite, entradas nos últimos trinta dias, transferências aguardando,
acompanhamentos abertos e arquivo com falha. O painel de números (*As oito casas, em
números*) mostra o que a Fundação fez no período e o gasto com remédio pelas notas
lançadas, e o *Casa a casa* compara uma medida de cada vez, sempre na ordem do código.

O **dia das unidades** traz 139 registros do último dia das oito casas em 140 ms. O
**período de cada casa**, seis meses na tela, entre 50 e 62 ms; em Word, 101 ms.

## Como a Coordenação Geral vê

Ela entra e o topo diz *Coordenação Geral*. Abre nas **Unidades**, com as oito casas,
e escolhe em qual entra. Dentro de uma casa vê exatamente o que a coordenação dela vê:
28 telas, as mesmas da coordenação de cada casa, sem nenhuma tela com erro. O dia de
cada casa abre em cerca de 110 ms, o arquivo das ATAs do mês em 14 ms e a lista das
crianças em 12 ms.

A leitura mais pesada do ano inteiro é a dela: **a equipe das oito casas, 89 pessoas,
em 582 ms**. Está dentro do que se aceita, e é a primeira a olhar se a Fundação crescer.

**Em um ano ela não recebeu nenhum aviso.** É o que foi decidido na fase 176: ela não
entra no escalonamento de casa nenhuma, porque nas oito seria uma enxurrada. Mas isso
também quer dizer que uma ocorrência grave numa casa não chega a ela pelo sino; ela
sabe pelo dia das unidades ou pela coordenação da casa. É uma pergunta para a Fundação
(PARA-A-REUNIAO §4.15).

## Como o Líder Noturno Geral vê

Assinou as 364 ATAs Gerais do ano. Nenhuma saiu com pendência, porque as oito casas
fecharam a ATA noturna antes das 07h45 todos os dias. Com o painel de filtros por casa
(Todas, AI1 a ARM4), o dia das oito abre em 265 ms. A última ATA Geral abre em 10 ms,
com as oito linhas e a situação da ATA de cada casa.

## Como o Líder Diurno vê

Cada Líder Diurno fechou as ATAs diurnas da semana e, às segundas, as do fim de
semana. No fim do ano, cada um tinha **uma** ATA aberta: a do próprio dia. Recebeu cerca
de 32 avisos no ano (na AI3, com as crianças da semente e os seus remédios, 92), que a
simulação nunca leu. Nenhuma pessoa passou de cem avisos no ano.

## O que um ano de oito casas pesa

O banco inteiro terminou com **170 MB**, dos quais 29,5 MB são a semente: **cerca de
140 MB por ano para as oito casas**, perto de 18 MB por casa. Os anexos não contam aqui,
porque a simulação anexa uma imagem mínima; na vida real a foto sai reduzida do
aparelho, perto de 500 KB (fase 175).

## O que a simulação precisou aprender

Nenhum defeito do sistema apareceu. Três coisas eram da própria simulação:
- **o supertest abria e fechava o servidor a cada pedido**: com oito casas em paralelo,
  uma fechava no meio do pedido da outra. O servidor agora escuta uma vez só;
- **a AI3 da semente já está no limite**: a Coordenação Geral amplia o limite com o
  motivo escrito, que é ato dela;
- **no dia da transferência**, a casa que recebe passou a listar na chamada uma criança
  que a simulação dela não conhecia.

E uma do ambiente: o contêiner da sessão é reciclado quando a sessão fica parada, e a
simulação morre junto. Rodada de ano inteiro se acompanha até o fim.

## O que não foi medido

- mais de uma pessoa usando a mesma casa ao mesmo tempo (cada casa faz um ato por vez);
- o painel e o dia das unidades com a Fundação maior que oito casas;
- a Coordenação Geral decidindo por uma casa inteira (fechar ATA, publicar escala):
  ela lê e abre exceção, e as decisões da casa seguiram com a coordenação de cada uma.
