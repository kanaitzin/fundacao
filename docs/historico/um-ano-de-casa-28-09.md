# Um ano inteiro de casa: o relatório da fase 174

Pedido de 28/09/2026: *"faça um teste de um ano inteiro, vendo se os bancos
conseguem armazenar e se os relatórios dão conta"*.

## Como foi feito

`bash scripts/simulacao-da-casa.sh 365` é a mesma simulação da fase 173, agora
com o ano inteiro, de 16/11/2026 a 15/11/2027. O relógio anda junto no banco e
no servidor, e o relógio do dia roda às 05h.

O que se repete ao longo do ano:
- a escala de cada mês, repetida pelo rascunho no dia 20;
- a compra do remédio a cada 28 dias;
- os acompanhamentos no dia 14 de cada mês;
- o lanche do passeio no dia 10 de cada mês;
- as visitas de todo fim de semana;
- as três refeições, as doses e os dois plantões de todos os dias.

O que acontece uma vez, espalhado pelo ano:
- três internações com o diário do hospital e os PDFs;
- três idas à família;
- uma ocorrência a cada 45 dias;
- duas visitas fora do combinado;
- uma transferência, um desligamento e um reacolhimento;
- uma troca de educador;
- três crianças novas: uma que chegou de noite e duas cadastradas pela técnica.

## O que bateu

Tudo o que a casa contou é o que o sistema devolve:

| Conferido | O ano |
|---|---|
| Visitas, criança por criança, no perfil de cada uma | 299, todas batendo |
| Refeições registradas | 6329 |
| Chamadas confirmadas, somando os relatórios do período | 1095 |
| Doses dadas no horário | 1055, e nenhuma sem resposta no relatório |
| Plantões e ATAs | 730, nenhuma ATA esquecida aberta |
| Saldo do armário, por remédio | bate |
| Acompanhamentos | 140, todos aprovados |
| Diário das três internações no relatório em Word | bate |

O relatório do período vai até seis meses, e a recusa diz por quê. O ano sai
em três relatórios, e a soma deles bate com o ano.

## Os relatórios dão conta

Os tempos foram medidos no último dia, com o ano inteiro por trás, como a
pessoa abre cada tela:

| Leitura ou relatório | Tempo |
|---|---|
| O dia da casa | 171 ms |
| A portaria do dia | 157 ms |
| O período da casa, seis meses, em Word | 167 ms |
| As visitas de uma criança no ano, em Word | 139 ms |
| As compras do ano, em Word | 124 ms |
| As visitas da criança desde o acolhimento | 74 ms |
| O período da casa, seis meses, na tela | 58 ms |
| A trajetória da criança, em Word | 53 ms |
| As refeições do ano | 49 ms |
| O armário do ano, em Word | 38 ms |
| O perfil de uma criança | 36 ms |
| A ATA anterior | 35 ms |
| A linha do tempo | 36 ms |
| As métricas do remédio no ano | 19 ms |
| O arquivo das ATAs de um mês | 16 ms |
| A grade do remédio | 16 ms |
| A auditoria da criança | 15 ms |
| O painel da Enfermagem, a lista da casa, o armário, o painel da gestão | até 14 ms |

Nenhuma passou de 174 ms. O ensaio de carga da fase 167 já tinha medido dois
anos de oito casas escritos direto no banco, e continua sendo a medida de
volume grande. Esta é a medida de uso de verdade.

## O banco consegue armazenar

| | |
|---|---|
| O banco só com a semente fictícia | 29,5 MB |
| Depois de um ano da ARM1 | 51 MB |
| **O que um ano de uma casa acrescenta** | **cerca de 22 MB** |
| A maior tabela | a auditoria: 23 mil linhas, 11 MB |
| Depois dela | a chamada (6 mil linhas, 1,6 MB), as atividades, as doses, os avisos |

Oito casas somariam **perto de 175 MB por ano**, e dez anos ficariam em torno
de 2 GB. Para o PostgreSQL é pouco. Nenhuma tabela cresce sem controle: o aviso
de dose atrasada, que antes crescia com o quadrado do tempo, é avisado uma vez
desde a fase 173. As sessões e as tentativas de entrada crescem cerca de 2 mil
linhas por ano por casa, menos de 1 MB, e ficam como registro.

## O que cresce de verdade: os anexos

Os arquivos não moram no banco. Moram em disco (`ARQUIVOS_DIR`) e, na
implantação, no Drive (§16). A simulação anexa arquivos mínimos, então os
números acima não dizem nada sobre eles.

A foto tirada pela câmera é guardada **do tamanho em que foi tirada**, sem
reduzir: de 2 a 5 MB num celular de hoje, até o limite de 15 MB por arquivo.
Uma estimativa para oito casas:
- cerca de 30 crianças passando por casa no ano;
- 8 documentos e fotos por criança;
- 3 MB por arquivo.

Isso dá perto de **6 GB por ano só no dossiê**, fora as fotos de memória, as
notas fiscais e os PDFs do hospital.

**A proposta**, para a Fundação decidir: reduzir a foto no próprio aparelho
antes de enviar, por exemplo para 2000 pixels no lado maior e JPEG de boa
qualidade. Uma certidão continua legível, e cada foto cai para algo perto de
500 KB. PDF e documento digitalizado ficam como estão.

## O que NÃO foi medido

- **Várias casas vivendo ao mesmo tempo.** Só a ARM1 viveu; a AI3 da semente
  ficou parada. O que é da instituição (a ATA Geral, o painel do gestor, o
  relógio das oito casas) continua medido pelo ensaio de carga, que escreve no
  banco em vez de passar pelas rotas.
- **O tamanho real dos anexos**, pelo motivo acima.
- **A cópia de segurança e a restauração** de um banco de um ano. É parte da
  implantação (§12), e não se mede daqui.
