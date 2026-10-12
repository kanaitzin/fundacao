# Oito casas, vinte pessoas em cada, seis meses, com a Acolhe+AI: o relatório da fase 205

Pedido de 12/10/2026: *"continue os testes usando os 2 ao mesmo tempo e vendo se ele
anota e guarda tudo certinho, dessa vez simule as 8 casas com 20 funcionários em
vários setores em cada usando o sistema e o acolhe, quero ver se tudo funciona, temos
que ver o que falta pro sistema estar pronto de verdade, simule um teste de 6 meses,
vendo os bancos de dados e se todos os relatórios estão ok, teste tudo, cada menu,
cada detalhe e veja o que temos que melhorar"*.

## Como foi feito

```bash
SIM_CASAS=AI1,AI2,AI3,AI4,ARM1,ARM2,ARM3,ARM4 SIM_EQUIPE=20 bash scripts/simulacao-da-casa.sh 182
```

É a simulação das fases 173, 174 e 177 com duas coisas novas.

**A equipe de vinte** (`SIM_EQUIPE=20`). Em cada casa, além da coordenação, há duas
técnicas, dois líderes diurnos, onze educadores, duas pessoas na portaria e duas na
cozinha: vinte contas por casa, cento e sessenta nas oito, mais a Enfermagem, o Líder
Noturno Geral, a Coordenação Geral e o gestor. Os onze educadores fazem rodízio,
dois no dia e dois na noite, sem ninguém em dois turnos seguidos. Os líderes alternam
os dias da semana, as técnicas alternam os meses, e a portaria e a cozinha alternam os
dias. A escala de cada mês é publicada com os quatro do turno e o líder do dia. No
dia 44, uma educadora pede desligamento: a coordenação desativa a conta e cadastra a
substituta, que herda os dias.

**A Acolhe+AI no dia.** O segundo educador de cada turno escreve a sua linha da ATA
pela Acolhe+AI: dá a licença (o servidor anota na auditoria), a Acolhe+AI escreve o
rascunho na linha do turno, e quem aperta Registrar linha é a pessoa. Todo domingo
alguém da casa deixa uma sugestão pela Acolhe+AI, e a coordenação lê as da casa. No
fim, o banco é conferido: cada linha que a Acolhe+AI ajudou a escrever tem de estar lá
com o nome de quem a registrou, de um educador, na casa certa, e no Word da ATA.

E no navegador, contra o servidor de verdade, além de abrir todas as telas de cada
conta, o ensaio passou a abrir **cada aba de dentro de cada tela** (Estoque, Compras,
Esquemas, Pedidos, Restrições, Arquivo, ATA Geral...), e uma educadora faz o caminho
inteiro da Acolhe+AI: conta o que aconteceu, o rascunho vai para a linha da ATA, ela
registra, deixa uma sugestão, e o banco é lido de volta.

## O que bateu

**Na API, nenhum achado do sistema em seis meses.** Os oito achados da rodada são do
roteiro, e não do sistema: no dia 44 a educadora desligada às 09h ainda estava na turma
que o roteiro tinha lido de manhã, tentou escrever às 18h35, e o sistema recusou a
entrada, como devia. O roteiro foi corrigido.

O que cada casa viveu e o sistema devolveu igual, conferido um a um:

| | Cada casa | As oito |
|---|---|---|
| Doses dadas no horário | 511 (a AI3, com as vinte da semente, 1.109) | 4.686 |
| Refeições marcadas na chamada | 3.251 (AI3 14.171, AI4 3.797) | 37.474 |
| Chamadas confirmadas | 546 | 4.368 |
| Visitas pela portaria | 134 | 1.072 |
| Plantões abertos | 364 | 2.912 |
| Linhas da ATA | 727 | 5.816 |
| **Linhas da ATA escritas pela Acolhe+AI** | **363, todas com o nome de quem registrou** | **2.904** |
| **Licenças dadas à Acolhe+AI, na auditoria** | **363** | **2.904** |
| **Sugestões pela Acolhe+AI que a coordenação lê** | **26, todas com autor e cargo, nenhuma de outra casa** | **208** |
| Acolhimentos, desligamentos, transferências | 8, 1, 1 | 64, 8, 8 |
| Internações, com diário e anexos no relatório | 1 | 8 |
| Documentos baixados e lidos na voz da equipe | 25 | 200 |

E também: o saldo de cada remédio no armário, as visitas de cada criança no perfil
dela, as refeições e as chamadas nos dois relatórios do período, as ATAs que ficaram
abertas (nenhuma esquecida), o aviso de dose atrasada (uma vez, em dois níveis), a
ocupação de cada casa, o relatório da internação com o diário. **Em cada casa, a linha
da Acolhe+AI está no Word da ATA com o nome da educadora.**

**O banco em seis meses, oito casas:** 123,6 MB, com a semente. A maior tabela é a
auditoria (80 mil linhas, 41 MB), depois a chamada (37 mil, 9 MB) e os avisos (9 mil,
5 MB). Doze mil sessões e doze mil entradas.

## O que a rodada achou e foi consertado

- **A lista da Equipe da Coordenação Geral levava quase um segundo** (913 ms; 582 ms
  na fase 177, com nove pessoas por casa). Duas perguntas eram feitas pessoa por
  pessoa: o último acesso, lendo as sessões uma a uma, e se quem pergunta administra o
  cargo daquela pessoa, relendo o próprio cargo em cada linha. A migração 1649 lê a
  lista dos cargos uma vez e põe um índice por pessoa e data nas sessões: **668 ms
  para 168 ms**, com o resultado idêntico, conferido linha a linha para a Coordenação
  Geral, o gestor, a coordenação de uma casa, duas técnicas e uma educadora.
- **O dia das unidades levava mais de um segundo** para o Líder Noturno Geral (1.161
  ms), porque as oito casas eram lidas uma depois da outra. Agora são lidas de quatro
  em quatro, com no máximo quatro das dez conexões do banco.

## O que o navegador viu

NAVEGADOR_205

## O que falta para o sistema estar pronto de verdade

Do código, a rodada não deixou nada aberto. O que separa o sistema de rodar na casa é
o que está no §11 e no §12 do documento, e nada disso se faz daqui:

1. **Onde roda, o endereço e o certificado (HTTPS)** (§12.1, §12.9). Sem HTTPS, a
   câmera pelo sistema e o aviso no celular não ligam.
2. **O SMTP institucional** (§12.8). Sem ele não sai convite nem o esqueci minha
   senha, e são cento e sessenta pessoas para convidar. O convite vale 24 horas.
3. **A conta e as duas linhas do cron do relógio** (§12.7): as rotinas das 05h e o
   aviso de meia hora antes do fim do plantão.
4. **Backup e restauração provados na máquina de verdade** (§12.4, §12.5).
5. **A chave da Acolhe+AI** (`ANTHROPIC_API_KEY`, §12.12) e o registro da decisão com
   o DPO. Sem a chave, ela trabalha no modo guia, que é o que esta rodada mediu. Com
   a chave, o roteiro do §12.12 tem de ser repetido com o modelo de verdade.
6. **As chaves do aviso no celular** (§12.11), e a primeira entrega num celular de
   verdade.
7. **Os nomes e códigos reais das oito unidades** (§11 item 3): AI1 a ARM4 são
   provisórios.
8. **Os dados de partida e a LGPD** (§11 itens 9 e 10): equipe, crianças, quanto do
   papel entra; quem responde pela LGPD, quanto tempo se guarda cada coisa.
9. **A folha de remédio de papel da casa** (§11, os formulários que faltam): é o único
   módulo ainda desenhado pelo documento, e não pelo papel que a casa usa.
10. **O roteiro aplicado com a equipe da Casa 03** e duas pessoas de verdade usando
    (a ideia 10 de 30/09): nenhuma simulação substitui isso.

## Para a Fundação olhar

- **O que a Acolhe+AI grava é sempre da pessoa.** Ela escreve o rascunho na tela; quem
  aperta o botão é quem trabalha, e a linha leva o nome dela. As 2.904 linhas conferidas
  provam isso no banco.
- **A auditoria é o que mais cresce** (41 MB em seis meses nas oito casas, por volta de
  80 MB por ano). Não é problema de espaço, mas é o primeiro número a acompanhar no
  painel da implantação.
