# O que falta da ideia original

Levantamento de 31/08/2026, feito por leitura cruzada entre as rotas que o
servidor serve e as chamadas que as telas fazem. Sobram **26 rotas que existem,
têm regra, têm RLS e auditoria — e não têm porta**.

*Atualizado no mesmo dia: saíram desta lista o **Arquivo das ATAS** (decisão 2,
no fim); a **saída, o acervo e o retorno**, com `GET /people/archive` como a
porta que faltava; a **abertura da chamada do turno**; e o **corpo da ATA com a
reabertura e a correção** — que era o silêncio maior de todos: `content` nunca
recebia nada, e fechava-se todo dia uma ATA vazia.*

*Saíram também, em 01/09/2026, os **episódios do turno**: `POST
/shifts/ata/:id/episodes` e `POST /shifts/episodes/:id/ack` existiam desde a
fase 5 e nunca tiveram porta. O que acontecia de madrugada ou virava texto
solto dentro de uma seção da ATA, ou não era registrado. Agora o relato é
imutável e a ciência de quem assume o turno nasce ao lado, com nome próprio —
e o servidor passou a **recusar episódio em ATA já fechada**, que ele aceitava
em silêncio (ver a nota de defeito na CONTINUIDADE).*

*E a **rotina versionada da casa** (`GET /routine`, `/routine/history`, `POST
/routine/versions`, `/versions/:id/items`), no mesmo dia: quatro rotas da fase 2
sem tela nenhuma. O dia da casa nascia de dados semeados, e "a que horas é a
janta aqui?" não tinha resposta dentro do sistema — tinha no quadro da cozinha.
Alterar abre versão nova com motivo escrito e copia os itens; a anterior
continua inteira, explicando o dia que nasceu dela.*

*Em 01/09/2026 entrou também, a pedido do Marcelo depois de usar o protótipo, a
**conferência de mesa** (§10): a educadora olha a mesa no almoço, vê que estão
todos comendo, e precisava de vinte toques para dizer isso. O ato agora é um só
e fica gravado COMO ato — quem, quando e quantos —, o que o separa da "marcação
em lote silenciosa" que a regra proíbe. E a lista de quem já foi conferido
recolhe, com contador, para a tela encolher enquanto a pessoa trabalha.*

*E o **dossiê do acolhido** com o **álbum de vivências**, em 01/09/2026, a
pedido do Marcelo: a lista exigida da casa em cinco categorias, o anexo com
prévia antes de enviar, o aceite de quem olhou — separado do anexo —, e o álbum
de aniversários, festas e conquistas que a criança leva quando sai.*

*E, ainda em 01/09/2026, a **substituição de atividade** e a **atividade
urgente**: cinco rotas da fase 3 sem tela. "Não vou conseguir levar o Bruno na
fono" era conversa de corredor ou grupo de mensagens. O pedido agora nasce de
quem VAI SAIR — qualquer pessoa do turno —, fica em aberto até o líder, a
técnica ou a coordenação decidir, e recusar exige motivo, que o sistema entrega
a quem pediu.*

*E a **correção do cadastro depois da admissão**: o sistema só sabia cadastrar,
e a saída de quem usa era recadastrar — o que cria uma segunda criança e parte o
histórico em dois. Agora corrigir nome, nome social e data de nascimento exige
motivo e deixa histórico LEGÍVEL por quem cuida, no próprio perfil; e a situação
judicial atualiza no episódio ativo, sem tocar no acolhimento anterior. Faltava
também mostrar a situação judicial na tela — o servidor devolvia o campo desde
a fase 0 e ninguém o desenhava.*

*E, fechando o grupo 1 dos medicamentos em 01/09/2026, a **suspensão do esquema**
e a **autorização nominal para administrar** (§11.1 e §11.3). Não havia rota que
LISTASSE prescrições: um rascunho salvo e não assinado ficava gravado e
invisível, e não existia de onde suspender. Ao construir a tela apareceram três
defeitos no que já estava escrito, e nenhum deles daria erro na cara de
ninguém — todos apareceriam como o sistema pedindo remédio a mais ou negando
quem estava autorizado:*

 - *suspender mudava o status da prescrição e **deixava as doses de hoje na
   grade**, com o botão "Confirmar" ao lado. `app_generate_doses` só gera para
   prescrição ativa, então no dia seguinte ficava limpo — e hoje alguém dava o
   remédio suspenso. Agora a dose que ainda não chegou a hora sai da grade
   dizendo por quê; a já confirmada fica como está; e a que passou da hora sem
   ninguém confirmar **continua pendente**, porque não foi suspensa: ficou sem
   resposta, e alguém ainda deve essa resposta;*
 - *o protocolo da casa e a autorização nominal conferiam o **cargo** e
   esqueciam a **casa**: a coordenação da Casa 03 podia definir quem dá remédio
   na Casa 04 e autorizar um educador de lá. Corrigido nas policies (migração
   0820) e com a frase de recusa na aplicação, nas duas camadas;*
 - *e `medication_authorization.valid_from` nascia com `DEFAULT current_date`,
   que é o dia do banco em UTC. Depois das 21h de Porto Alegre a autorização
   escrita hoje nascia datada de amanhã, e o sistema recusava a dose a noite
   inteira com a autorização visível na tela. Regra 9, no lugar mais caro.*

*E o **registro protegido depois da abertura** (§13.2), que fecha o grupo 1: a
folha de abrir ocorrência já recebia fala espontânea e sinais observados, mas o
caso mais comum é a criança falar DEPOIS — três dias depois, às 23h, na hora de
dormir, para quem estava perto e não para quem abriu a ocorrência. Sem porta,
sobravam dois caminhos e os dois são piores: escrever no campo "fato", que o
plantão inteiro lê, ou não registrar. Três recusas nasceram com a porta: vazio
não se registra (o lugar é único por ocorrência e um registro em branco tomaria
a vaga de quem tem o que dizer); ocorrência fechada não recebe, porque a cópia
documental já foi arquivada; e a recusa do "já existe" **não conta o que já está
lá**, senão a mensagem de erro vira a porta dos fundos para o conteúdo que a
política protege.*

*E o **histórico de saúde do acolhido** (§7.3) com as **emissões do Resumo**
(§7.4): três rotas da fase 4 sem tela nenhuma. O sistema guardava cada consulta,
cada evolução assinada por quem acompanhou e cada dose administrada, e a
pergunta mais comum da casa — "quando é o retorno dele?" — se respondia
perguntando a um colega. É assim que um retorno se perde. A folha mostra a linha
única em quatro listas, conta o que está esperando alguém, e marca o **retorno
cuja data já passou**: sem essa marca, uma data antiga se lê como história e não
como pendência. As emissões vêm junto porque respondem à mesma pergunta — um
Resumo gerado e nunca retirado não chegou a lugar nenhum, e continua na lista até
alguém dizer que levou.*

*E os **benefícios e dados bancários** (§6.10): três rotas com RLS,
reautenticação e log por visualização, sem tela — enquanto a planilha "DADOS
BANCÁRIOS - AI 03" seguia aberta numa pasta compartilhada. Entraram na mesma
tela do Cofre, atrás da mesma senha, porque é a mesma área e a mesma regra. Ao
construir apareceu um buraco maior: a **migração 055 acrescentou as colunas que
a planilha real usa** — número do benefício, operação da conta, nome da agência
e a PENDÊNCIA BANCÁRIA, que é o motivo de a planilha existir — **e o serviço
nunca as leu nem as gravou**. O sistema tinha as colunas e continuava sem
responder "o que falta resolver no banco desta criança?". Agora a pendência vem
primeiro na lista e exige uma linha dizendo QUAL é; senha em campo de texto é
recusada com uma frase; e o histórico de acessos — que o cofre tinha e os
benefícios não — mostra quem abriu, quando, para quê, **e quem tentou e foi
recusado** (migração 0830).*

*E os **alinhamentos de equipe** (§9.4, partição nova `alignments`, migração
0840), a pedido do Marcelo: reuniões e combinados escritos num lugar só. Escreve
a equipe técnica e a coordenação; LÊ todo mundo com alcance na casa — e por isso
os combinados têm porta própria no menu, e não só a aba dentro de
Acompanhamentos: quem mais precisa do combinado é o educador da noite, que não
alcança Acompanhamentos. O texto de um combinado é imutável (o banco recusa);
o que muda é a situação, com motivo escrito e histórico próprio; e o encerrado
não some da lista, porque "mas ficou combinado que..." é uma discussão que só o
registro encerra.*

*E uma correção ao próprio levantamento: eu havia escrito que faltava "anexar
documento ao arquivo". `POST /archive` não recebe arquivo — ele enfileira a
CÓPIA DOCUMENTAL de algo que já existe no sistema. O que faltava era pior e
mais silencioso: **nada enfileirava**. A fila do arquivo estava permanentemente
vazia, a reconciliação respondia "nada pendente" e o protótipo avisava, ao
fechar a ATA, que a cópia tinha entrado na fila. Não tinha. O laço foi fechado —
ver §8.9 da CONTINUIDADE.*

*E, em 01/09/2026, **duas rotas que este próprio levantamento não tinha visto** —
encontradas ao conferir, uma a uma, as rotas servidas contra as chamadas das
telas. As duas eram do mesmo tipo: a tela MOSTRAVA o campo e ninguém, em cargo
nenhum, conseguia escrever nele.*

 - *`PATCH /people/:id` — os dados descritivos do perfil (§6.4): cuidados
   essenciais, escola, equipe de referência e observações. Existia desde a fase
   2, com regra de cargo e RLS. A criança trocava de escola em março e a saída
   de quem usa era o papel. Ao abrir a porta veio o antes-e-depois (migração
   0850): "cuidados essenciais" é o bloco que se lê antes de dar banho e antes
   de servir o prato, e sobrescrevê-lo apagava uma instrução de proteção sem
   rastro — a auditoria guarda o NOME do campo e nunca o conteúdo (§20);*
 - *`POST /medications/protocol` — quem pode dar remédio em cada turno (§11.3).
   A Saúde desenhava a tarja **"Sem definição"** em cada período e não havia
   botão que definisse: a pendência institucional 33.4.1 seguia em aberto sem
   que existisse por onde respondê-la. A autorização NOMINAL tinha formulário;
   a regra que fica por cima dela, não. Com a porta, o motivo passou a ser
   obrigatório e cada decisão guarda o que valia antes (migração 0860) — e um
   período não pode ficar sem ninguém, porque a dose venceria todo dia sem que
   existisse quem a confirmasse.*

Isso não é lista de bugs. É o mapa do que já está construído por baixo e ainda
não tem por onde ser usado. Serve para decidir com o Marcelo o que entra antes
do piloto e o que espera.

O critério de leitura é sempre o mesmo: *a educadora de plantão, às 23h, com uma
criança chorando do lado, consegue fazer isso?* O que ela não consegue fazer sem
tela está no grupo 1.

---

## 1. Falta tela, e falta para o piloto

O trabalho existe na casa hoje. Sem tela, ou vira papel, ou vira WhatsApp — e
WhatsApp é proibido (§2).

**O grupo 1 está vazio.** Tudo o que a educadora de plantão precisa fazer às 23h
tem porta. O que sobra abaixo é de coordenação, de gestão e de máquina.

## 2. Falta tela, mas dá para esperar

Coisas de coordenação e de gestão, não de plantão. Nenhuma delas trava a casa.

- **Relatórios consolidados** — `GET /reports/panel`, `/reports/house-monthly`,
  `POST /reports/:id/submit`, `GET /reports/:id/delivery`, e as fontes do
  acompanhamento (`POST /followups/:id/sources`).
- **Capacidade da casa** — `POST /houses/:id/capacity`,
  `GET /houses/:id/capacity-history`.
- **Painel da casa na linha do tempo** — `GET /timeline/house-panel`.
- **Leitura excepcional de relato** — `POST /statements/:id/exceptional-read`
  (§26.2 #29): abrir um relato fora do alcance, declarando a finalidade. A regra
  está pronta; falta a tela que obriga a escrever o porquê.
- **Dispositivos confiáveis** — `GET/POST /devices`, `POST /devices/:id/revoke`.
- **Fila offline** — `POST /sync/push`, `GET /sync/status`, `/sync/conflicts`,
  `POST /sync/conflicts/:id/resolve`. O PWA já instala; o modo offline de
  verdade é fase própria.

## 3. Não precisa de tela

São rotas de máquina: tarefa agendada, verificação interna, chamada de serviço.

`POST /medications/generate-doses`, `POST /medications/escalate-overdue`,
`GET /medications/alert-offsets`, `POST /activities/generate-day`,
`POST /activities/agenda/generate`, `POST /activities/mark-unconfirmed`,
`GET /activities`, `GET /health`, `POST /people` (a admissão usa
`/people/admission`), `GET /transfers/pending` (a tela usa `inbox`/`outbox`),
`GET /statements` (os relatos chegam junto com o detalhe da ocorrência),
`GET /people/:id/admission` (a ficha da admissão entra no perfil),
`PATCH /shifts/general-ata/:id/house/:houseId`.

---

## As decisões que não são minhas

Ficam para a conversa com o Marcelo. Nenhuma delas foi decidida por mim, e
nenhuma delas é problema de código:

1. **Devolver um acompanhamento para correção não existe no servidor.** A tela
   tinha um botão que prometia isso; foi removido em vez de inventar a regra. A
   pergunta é se a equipe técnica deve poder devolver, e o que acontece com a
   versão que já estava lá.
2. ~~**A ATA Geral Noturna não se acha por data.**~~ **Resolvido em 31/08/2026**
   pelo Arquivo das ATAS: a coordenação, a equipe técnica e os dois líderes
   consultam qualquer data e recebem, da ATA Geral Noturna, **a linha daquela
   casa** — o que o Líder Noturno Geral registrou sobre ela. A folha completa
   das oito casas continua com quem a escreve e com o Gestor Geral.
   *Fica uma pergunta menor para o Marcelo: o mesmo recorte deve valer para a
   ATA Geral do DIA CORRENTE, que hoje a coordenação abre inteira? Não mudei
   sozinho o que já estava aprovado.*
3. ~~**Rascunho de prescrição não tem listagem.**~~ **Resolvido em
   01/09/2026:** `GET /medications/prescriptions` lista os esquemas da casa, e o
   rascunho aparece PRIMEIRO, porque é o que está esperando alguém. Deixar como
   rascunho passou a ser uma escolha, e não um sumiço.

4. **"Concluí tudo até agora" na linha do dia.** Facilitador pedido, mas a linha
   do dia contém doses de medicamento, onde "não existe marcação em lote" é
   absoluto. A versão segura ficaria limitada a atividades coletivas que não
   sejam medicação, como ato declarado — e isso é decisão da instituição.

5. **O Arquivo das ATAS abre no mês de calendário**, e por isso fica quase vazio
   todo dia 1º. Um quarto recorte, "últimos 30 dias", resolveria.
