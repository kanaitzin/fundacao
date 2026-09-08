# Roteiro de retorno — o protótipo, cargo a cargo

> Para o Marcelo levar à Casa 03. O protótipo foi entregue e aprovado em
> **28/08/2026**; desde então mudaram cinco telas e uma regra que ele viu
> funcionando de um jeito e agora funciona de outro (§0 abaixo).
>
> **Como usar:** uma pessoa por vez, no aparelho da casa, com o protótipo
> aberto. Quem aplica **não explica antes** — pede a tarefa e cala. O que
> interessa não é a opinião sobre a tela; é onde a pessoa para.
>
> **Uma observação sobre o arquivo:** ele funciona inteiro sem internet, mas as
> DUAS FONTES vêm da rede. Aberto offline, o texto aparece na fonte do próprio
> aparelho — inclusive a *Atkinson Hyperlegible*, escolhida por ser desenhada
> para leitura difícil, que é o caso de quem lê um alerta no corredor. Se o
> ensaio for sem internet, a letra não é a que a equipe vai ver no sistema
> real. Vale saber antes de anotar "achei feio".
>
> Última atualização: 04/09/2026 (internação, cadastro e trabalho social no §0.4).

---

## §0 — O que mudou depois de 28/08 (ler antes de aplicar)

**Uma coisa que ele aprovou e não está mais lá.** A tela de estoque mostrava
"Abaixo do mínimo" calculado sozinho, comparando a quantidade com um mínimo
por item. O sistema de verdade recusa isso de propósito: **estoque baixo é
sinalizado à mão, com o nome de quem sinalizou**, porque só a equipe sabe o
que é pouco em cada caso — dois frascos de um xarope eventual sobram, e dois
de um contínuo acabam na quinta-feira. O protótipo estava mostrando um
julgamento automático que o aplicativo nunca faria.

**Quatro coisas novas para olhar:**

- o armário tem **duas ações** agora: "Chegou remédio" soma, "Conferi o
  armário" substitui e pede motivo;
- a triagem de enfermagem ganhou **devolver pedindo complemento**, além de
  assinar;
- a ATA aparece **por turno** (diurna e noturna), cada uma com as suas
  assinaturas — antes era uma só, sem dizer de qual;
- há uma tela nova em "Mais": **"O que cada setor enxerga"**, para responder
  "o educador vê isso?" sem entrar com a conta de ninguém.

---

## §0.1 — O que mudou depois de 31/08

Sete coisas novas entraram, e **cinco delas são portas que não existiam para
regras que o sistema já cumpria por baixo**. Vale saber disso ao aplicar: não
são funções inventadas agora, são telas para o que o servidor já fazia — e é
por isso que valem uma pergunta cada.

- **No Dia, um quarto filtro: "Por criança".** Uma linha por acolhido, em
  ordem alfabética, com o alerta essencial primeiro. Responde "e a Alice, como
  está?" sem rolar o dia inteiro. *A lista não é ordenada por pendências de
  propósito — se fosse, as mesmas crianças ficariam no topo todo dia.*
- **No perfil, "Atualizar escola, cuidados e equipe".** Antes o perfil mostrava
  esses campos e ninguém conseguia escrever neles. Cada alteração guarda o
  texto anterior, com nome e horário, à vista no próprio perfil.
- **Na Saúde, "Quem pode dar remédio" virou decidível.** A tarja "Sem
  definição" existia e não havia botão. Agora a coordenação define por turno,
  com motivo escrito, e cada decisão fica registrada com o que valia antes.
- **Em "Mais", o Painel das unidades.** Ocupação, entradas e saídas, o que
  espera decisão, e o quadro de cada mês. É também onde o **limite da casa**
  se altera — com motivo, e sem apagar o limite anterior.
- **Em "Mais", a Sincronização.** O que este aparelho enviou, e os conflitos
  que esperam a frase da equipe. As duas versões aparecem inteiras, e nenhuma
  vem destacada: o sistema não escolhe.
- **Em Equipe, a aba Aparelhos.** O cadastro dos aparelhos institucionais da
  casa — o que decide, offline, quem pode confirmar medicamento. O código
  aparece **uma vez só**.
- **Nos relatórios, o passo que faltava.** O relatório nasce rascunho e agora
  tem "Enviar para aprovação"; antes ele ficava rascunho para sempre, com o
  botão de aprovar invisível.

---

## §0.2 — O que mudou depois de 01/09

Uma coisa só, e é a maior desde que o protótipo foi entregue: **o sistema
agora funciona sem internet.** O que a pessoa registrar sem sinal fica
guardado no aparelho, com a hora em que aconteceu, e sobe sozinho quando a
conexão voltar. Nada é apagado do aparelho antes de o servidor confirmar que
recebeu.

Para poder ser experimentado, o protótipo ganhou um botão **📶 / 🚫** no alto
da tela, ao lado do "Ver como". Ele simula a queda do sinal. **Não existe no
sistema de verdade** — está ali como o "Ver como" está.

Duas coisas ficaram de fora de propósito, e vale saber antes que alguém
pergunte:

- **confirmar remédio sem sinal não funciona** — e desde 08/09 isso vale para
  qualquer aparelho, inclusive o da casa (ver §0.5). O sistema recusa na hora e
  explica, em vez de guardar e devolver rejeitado horas depois;
- o resto do turno — chamada, atividade, exceção, passagem — funciona.

---

## §0.3 — Duas coisas do arquivo, para não tropeçar na hora

**A chamada da manhã já está confirmada no protótipo.** O café das 07h30
aparece como "20 de 20 · Confirmada", de propósito: a demonstração precisa
mostrar como fica uma chamada fechada. Mas a tarefa 1 pede *"confirme a
presença da chamada da manhã"*, e a educadora vai chegar numa chamada já
feita — e provavelmente vai achar que errou alguma coisa.

**Peça a chamada do ALMOÇO**, que está aberta (3 de 20). A do jantar também
está, e é a mais vazia se você quiser vê-la marcar muitos de uma vez.

**A devolução da evolução mora dentro de "Revisar".** Na tarefa 4 da
Enfermagem, "Devolver pedindo complemento" só aparece depois de a pessoa abrir
a evolução na fila da triagem. Isso é de propósito — devolver sem ler não
deveria ser possível —, mas se ela procurar o botão na lista e não achar, é
esse o motivo, e o que interessa anotar é **quanto tempo ela levou até abrir
uma**.

---

## §0.4 — O que mudou depois de 03/09 (é bastante coisa)

Quatro construções novas, todas nascidas do que tu e o Marcelo contaram.

**A criança internada sai da linha do dia.** Quando a técnica ou a coordenação
registra a internação, o acolhido some da chamada e da grade de medicação da
casa — e **continua ocupando a vaga**. Volta sozinho na alta. Há um diário do
período no hospital, com anexo, e a medicação dada lá entra no sistema com a
marca de que **quem administrou foi o hospital**. O educador social comum não
lê a internação, mas vê **"no hospital"** na lista de acolhidos: ele precisa
saber por que a cadeira está vazia.

**O cadastro tem o que a lista da casa tinha.** Filiação, RG, cartão SUS, foto
de identificação no alto do perfil, e os contatos com o vínculo — genitora,
madrinha, tia, vínculo comunitário —, que o educador lê e a técnica escreve. A
chave de acesso ao processo ficou no cofre, e não no cadastro.

**O Gestor Geral tem uma segunda leitura das oito casas.** Uma chave **🌱** no
alto da tela troca a operação pelo *trabalho social*: quantas crianças, quantas
entraram e saíram, e o que aconteceu de bom — passou de ano, curso
profissionalizante, faculdade, primeiro emprego. Dá para abrir a trajetória de
uma criança e gerar relatório em Word.

**A senha do cofre, no protótipo, é `senha-dev-123`** — e agora está escrita na
própria tela. Antes não estava, e era impossível adivinhar.

---

## §0.5 — O que mudou em 08/09 (a medicação, e é a maior mudança de regra)

O Marcelo respondeu a pergunta que estava aberta desde agosto — **quem dá o
remédio** — e a resposta virou código no mesmo dia.

**O educador de plantão dá o remédio, e o sistema deixa.** Até aqui valia o
padrão mais protetivo que dava para escrever sem saber: só a Enfermagem, e
educador apenas se a coordenação tivesse escrito um protocolo E autorizado
aquela pessoa pelo nome. Sabendo que **a Enfermagem atende das 9h às 17h**,
essa regra recusaria toda dose noturna mandando acionar quem já foi embora.

**A tela "Quem pode dar remédio" saiu**, e no lugar dela ficou a **exceção por
medicamento**: na aba Esquemas, a Enfermagem ou a coordenação marca "só a
Enfermagem dá" no medicamento que exigir isso — injetável, controlado —, com o
motivo escrito. O educador que tentar confirmar essa dose lê o motivo.
*No protótipo há um exemplo marcado: a insulina da Rayssa.*

**Cadastrar o esquema deixou de ser só da Enfermagem:** a coordenação e a
equipe técnica também cadastram, porque a criança volta da consulta com a
receita às 20h.

**A passagem passou a mostrar as doses do turno.** No fim do plantão, quem
assina vê o que foi confirmado e o que ficou sem resposta — e, se ficou, o
sistema pede uma linha dizendo o que houve. **Ela não confirma dose nenhuma**:
confirmar continua sendo um a um, de quem deu. E a cobrança é de quem assina
primeiro, não de cada pessoa do turno.

**Sem internet, remédio não se confirma mais em aparelho nenhum** — nem no da
casa. Como o sistema vai rodar no celular de cada um, com o e-mail
institucional, deixou de existir o aparelho único que impedia a mesma dose de
ser confirmada em dois lugares. A recusa aparece na hora, com a explicação; o
resto do turno continua funcionando offline.

## §0.7 — A ATA que a próxima equipe lê

Três mudanças, e a primeira é a que o Marcelo descreveu com o exemplo da Maria
que não dormiu bem:

- **o ⏮ Turno anterior** entrou ao lado dos turnos de hoje, na aba ATA. Toda a
  equipe da casa abre — o educador inclusive, que antes só lia a passagem;
- **cada linha escrita tem dono**: nome, cargo e horário, com uma **cor por
  autor** na borda e na etiqueta. A cor é apoio; o nome está sempre escrito,
  porque cor não sobrevive à impressão em preto e branco nem ao daltonismo;
- **a linha restrita** à coordenação, à equipe técnica e aos líderes. Quem não a
  alcança vê **quantas existem**, e não o que dizem — a decisão de mostrar a
  contagem segue o que o sistema já faz com documentos restritos, e é
  reversível numa linha se a Fundação preferir que ela suma por completo.

---

## §0.6 — A escala de plantão (nova, e é o que o Marcelo pediu)

Há uma aba nova em "Mais": **A escala de plantão**. Ela monta por **dia e
turno**, com hora quando o plantão não é o inteiro, e tem um botão de
**repetir a cada N dias** — "a cada 2 dias" é o desenho de uma 12x36.

Três coisas que ela faz e que valem observar na aplicação:

- **o turno sem ninguém aparece escrito** ("— ninguém escalado —"), e o alto da
  tela conta quantos são no período. Dia vazio se lê como "ainda não montei";
- **nada se apaga.** Tirar alguém é *Retirar*, e a linha fica riscada com o nome
  de quem retirou. Se o plantão **já passou**, o sistema pede o motivo por
  escrito — é a escala que responde quem estava na casa naquela noite;
- **a folha para a parede** sai em Word, um quadro por semana.

E uma que ela **não** faz de propósito: nenhum total de plantões por pessoa.
Somar plantão por nome é medir gente, e o sistema não faz isso em lugar nenhum.

**A escala também mudou a ATA:** a partir de agora, quem o sistema cobra por
assinar a passagem é **quem estava escalado naquele turno** — e não mais todo
mundo que trabalha na casa. Onde não houver escala montada, ele avisa que caiu
no vínculo da casa, em vez de fingir que sabe.

---

## Como registrar cada resposta

Para cada tarefa, anote só três coisas:

| | |
|---|---|
| **Achou?** | sim / com ajuda / não |
| **Quanto tempo** | até 10s / até 30s / desistiu |
| **O que ela disse** | a frase dela, não a interpretação |

A frase dela é o dado mais valioso. "Isso aqui é a passagem?" vale mais que
"achei confuso".

---

## 1. Educador social

A pessoa que mais registra e a que menos tem tempo. Se alguma coisa aqui
demora, demora vinte vezes por turno.

1. **Confirme a presença da chamada do almoço.**
   *(A do café já está confirmada no protótipo — ver §0.3.)*
   Observar: ela procura na barra de baixo ou em "Mais"? Ela entende que
   confirma **um por um**, ou procura um "marcar todos"? Ela repara em
   "Conferi a mesa", que marca de uma vez quem falta?

2. **Registre a sua passagem do turno.**
   Observar: ela escreve nos campos certos? Entende que assina só a dela?

3. **Uma criança recusou o remédio das 16h. Registre.**
   Observar: ela acha "Recusada pelo acolhido"? Percebe que o campo de
   observação virou obrigatório — e escreve o fato, ou escreve um juízo?
   **Esta é a pergunta mais importante do roteiro para este cargo.**

4. **Você precisa saber o que aconteceu no turno da noite.**
   Observar: ela procura a ATA, a passagem ou o "Dia"? Ela acha o **⏮ Turno
   anterior**, ao lado dos turnos de hoje? Depois de abrir, ela repara que
   **cada linha tem o nome de quem escreveu** — e diz se isso muda alguma coisa
   para ela? ⚠️ Se aparecer a frase *"há 1 observação restrita à coordenação, à
   equipe técnica e aos líderes"*, **pergunte o que ela acha disso**: saber que
   existe algo que ela não lê é melhor ou pior do que não saber? A resposta
   decide se essa contagem fica.

5. **Você vai passar o turno e quer saber como cada criança está agora.**
   Observar: ela acha o filtro **"Por criança"** no Dia, ou procura abrir o
   perfil de cada uma? Depois de achar, ela entende que a lista está em ordem
   alfabética e não por gravidade?

6. **A Alice foi internada ontem. Descubra o que aconteceu com ela.**
   Observar: ela repara no **"no hospital"** na lista de acolhidos? Ela procura
   a internação no menu — e o que faz quando não acha a porta? *(Não achar é o
   esperado: o educador comum não lê a internação. O que interessa é se ele
   sabe a quem perguntar, e se a marca na lista bastou.)*

7. **Sem internet.** *Toque no 📶 do alto da tela para simular a queda — e não
   avise o que vai acontecer.* Peça: **"marque a chamada da janta."**
   Observar: ela repara que a marcação ficou guardada? Ela entende, sem que
   ninguém explique, que aquilo vai subir depois — ou acha que perdeu? Ela
   procura o selo 📤 no alto? **Depois de marcar três ou quatro, pergunte:
   "onde está isso agora?"** A resposta dela é o dado desta tarefa.
   *Religue o sinal e mostre a fila esvaziando sozinha só DEPOIS de ela
   responder.*

8. **Pergunte depois:** "teve alguma hora em que você achou que ia dar
   errado?"

---

## 2. Líder Diurno

Conduz o turno e fecha a ATA. Duas funções novas nasceram da rotina que o
Marcelo descreveu, e ninguém da equipe as viu ainda.

1. **Um educador realizou a atividade e não conseguiu registrar — o aparelho
   da casa ficou sem sinal e ele não usa o próprio celular. Registre por ele.**
   Observar: **ela encontra "Registrar pelo colega"?** Entende que os DOIS
   nomes ficam? Escreve o motivo sem reclamar de ter que escrever?
   *(Se ela não achar sozinha, este é o achado mais caro do dia — a função
   existe para justamente esta situação, e ela é a pessoa que vive isso.)*

2. **Descubra quem está em cada atividade agora.**
   Observar: **ela encontra o Painel do Plantão sem ajuda?** Ele mora em
   "Mais", e não nas cinco abas.

3. **A Joana saiu antes do fim do turno e não assinou a passagem. Feche a
   ATA.**
   Observar: ela entende que **fecha com pendência** e que o sistema não
   assina por ninguém? Ela escreve a pendência ou tenta contornar?

4. **Uma atividade precisa passar para outra pessoa.**
   Observar: ela distingue **delegar** (ela passa adiante) de **substituição**
   (quem vai sair pede)? Esta distinção foi decisão de produto — vale saber se
   sobrevive ao primeiro contato.

5. **Pergunte depois:** "o que você faria com o caderno de plantão depois de
   usar isto por uma semana?"

---

## 3. Equipe técnica

O caso, não o turno. **Ganhou a aba Saúde em 31/08** — vale ver se ela espera
isso.

1. **Escreva o acompanhamento mensal de uma criança.**
   Observar: ela entende que os eixos são **obrigatórios**, e que "não
   observado" se escreve em vez de deixar em branco?

2. **Você terminou. O que acontece agora?**
   Observar: ela sabe que **não aprova o próprio texto**? Acha isso certo ou
   burocrático?

3. **A coordenação pediu uma correção num acompanhamento já aprovado.**
   Observar: ela encontra "Corrigir (nova versão)"? Entende que a anterior
   continua legível?
   ⚠️ **Devolver para correção não existe no sistema** — é uma das duas
   decisões abertas. **Pergunte diretamente:** "quando você recebe um texto
   para aprovar e ele está incompleto, o que você faz hoje, no papel?"

4. **Gere o relatório de desenvolvimento de uma criança.**
   Observar: ela percebe que o sistema **já escreveu a parte factual** e que a
   avaliação é dela? Ela confia no que está escrito, ou vai conferir?

5. **A Alice mudou de escola em março, e o cuidado essencial dela precisa de
   uma linha nova.**
   Observar: ela acha **"Atualizar escola, cuidados e equipe"** no perfil, ou
   procura "corrigir o cadastro"? Ela entende a diferença — corrigir o nome
   pede motivo, atualizar a escola não? Depois de salvar, ela repara que o
   texto anterior ficou registrado logo acima?

6. **A Alice foi internada. Registre, e depois escreva o relato da visita de
   hoje.**
   Observar: ela acha a internação em "Mais"? Entende que a criança **continua
   da casa** e que a vaga segue ocupada? Ao escrever no diário, ela repara que
   o relato diário **não é obrigatório** — e o que ela acha disso? ⚠️ **Se ela
   perguntar quem vai ser cobrado pelo relato, anote a frase**: foi decisão da
   coordenação não cobrar, e é a hora de saber se isso se sustenta na casa.

7. **A Rayssa passou de ano. Registre no perfil dela.**
   Observar: ela acha "Registrar conquista" no perfil? Ela escreve a história —
   escola, série, o que foi feito — ou escreve só "passou"? *(O sistema recusa
   frase curta, e a reação dela a essa recusa é o dado.)*

8. **Atualize os contatos da Rayssa: a madrinha mudou de telefone.**
   Observar: ela acha "Quem aparece por…"? Entende que **encerra** o contato
   antigo com motivo, em vez de apagar? Ela repara na marca de **aproximação
   restrita**, e o que diz sobre ela?

9. **Pergunte depois:** "o que faltou neste documento para você levar a uma
   audiência?"

---

## 4. Enfermagem

Alcança as oito casas. É o cargo com mais mudança desde 28/08.

1. **Chegaram 10 frascos de amoxicilina. O armário tinha 30. Registre.**
   Observar: **ela escolhe "Chegou remédio"?** Ela repara que o número final é
   40? *(Antes de 31/08 este era o defeito: ficava 10.)*

2. **Você conferiu a gaveta e contou 26 comprimidos, e o sistema diz 30.**
   Observar: ela acha "Conferi o armário"? **O motivo obrigatório incomoda?**
   Se incomodar, é sinal de alerta — o motivo é o que impede sumiço em
   silêncio, e vale explicar depois, nunca antes.

3. **Um item está acabando e não vai durar a semana.**
   Observar: ela procura um "mínimo" automático? **Ela entende que quem
   sinaliza é ela?** Esta é a mudança que ela mais vai notar.

4. **Uma evolução chegou incompleta: falta o horário da próxima dose.**
   Observar: ela encontra **"Devolver pedindo complemento"**? Antes só dava
   para assinar.

5. **Você está revendo o painel de ontem e quer saber que receita vence esta
   semana.**
   Observar: ela repara no aviso de que o alerta é contado a partir de hoje?
   *(Foi a segunda decisão de 31/08.)*

6. **Pergunte depois:** "em que momento do seu dia você abriria isto?"

---

## 5. Coordenação

Responde pela casa. É quem vai usar as telas de decisão.

1. **Descubra o que o educador enxerga do perfil de uma criança.**
   Observar: **ela encontra "O que cada setor enxerga"?** É a tela nova, feita
   para esta pergunta. Se ela pedir a conta de alguém para conferir, anote —
   é exatamente o hábito que a tela veio substituir.

2. **Guarde o acesso do gov.br de uma criança.**
   Observar: ela entende que **o cofre pede a senha de novo**? Reclama? Ela
   percebe que o cofre é **de uma criança por vez**, e não uma lista da casa?

3. **Você precisa abrir a senha do INSS para atualizar um cadastro.**
   Observar: ela escreve a finalidade sem resistência? Entende que **fica
   registrado com o nome dela**?

4. **Outra casa pediu uma transferência, e não há vaga no perfil etário.**
   Observar: ela encontra "Recusar com motivo"? Entende que o motivo **aparece
   na outra casa**?

5. **Uma ocorrência de erro de medicamento precisa ser fechada.**
   Observar: ela entende a ordem — **primeiro a etapa operacional, depois a
   análise** — e que caso de medicamento **não fecha sem síntese**?

6. **A insulina da Rayssa só pode ser aplicada pela Enfermagem. Faça o
   sistema saber disso.**
   Observar: ela acha a marcação na Saúde, aba **Esquemas**? Ela entende que a
   marca é do **medicamento**, e não do turno nem da pessoa? Ela reclama de ter
   que escrever o motivo — e o que escreve?
   ⚠️ Depois, **pergunte**: "existe algum outro remédio da casa que só a
   Enfermagem pode dar?" A lista que ela disser é o que precisa ser marcado
   antes do piloto. Se ela disser "nenhum", isso também é resposta — e é a
   melhor delas, porque quer dizer que o educador de plantão dá conta de tudo,
   que é como a casa já funciona hoje.

7. **Monte a escala da semana que vem: você no diurno, alternando a cada dois
   dias, até o fim do mês.**
   Observar: ela acha a aba **A escala de plantão** em "Mais"? Ela usa o
   **repetir a cada 2 dias**, ou preenche dia a dia? *(Se preencher um a um, é o
   dado mais importante desta tarefa: a repetição existe justamente para a
   escala não voltar para o papel.)* Depois, pergunte o que ela faria com o
   **turno que ficou sem ninguém** — a tela avisa, e a pergunta é se o aviso
   chega antes de virar problema.
   ⚠️ Peça também para **retirar alguém de um plantão da semana passada**. Ela
   entende por que o sistema pede o motivo? Acha justo?

8. **Tire a folha da escala para pregar na parede.**
   Observar: ela procura imprimir da tela ou baixar o Word? O quadro por semana
   é como ela desenharia? Ela sente falta de alguma coluna?

9. **A casa passou a operar com 22 vagas depois da reforma. Registre isso.**
   Observar: ela procura em "Mais" → **Painel das unidades**? Entende que o
   limite pede motivo, e que a mudança anterior não some?

10. **O tablet da sala sumiu. Faça o que precisa ser feito.**
   Observar: ela chega em Equipe → **Aparelhos**? Ela revoga, ou tenta
   apagar? Ao registrar um aparelho novo, ela **anota o código na hora** —
   ou fecha a folha e depois procura onde vê-lo de novo?
   ⚠️ Se ela fechar sem anotar, **não pergunte nada e observe o que ela faz**.
   É o teste mais honesto desta tela.

11. **Um registro de dose feito sem sinal colidiu com outro. Resolva.**
   Observar: ela acha "Mais" → **Sincronização**? Ao ver as duas versões, ela
   procura um botão para escolher uma — ou entende que o que se pede é a frase
   dela? *O sistema não escolhe de propósito; queremos saber se isso se lê
   como cuidado ou como sistema incompleto.*

12. **Aprove o relatório mensal que a técnica escreveu.**
    Observar: se ele estiver como rascunho, ela entende que alguém precisa
    **enviar para aprovação** primeiro? A frase "este relatório ainda não
    vale" chega até ela?

13. **Uma criança da casa foi internada e você precisa designar quem vai
    acompanhar as visitas desta semana.**
    Observar: ela acha "Designar quem acompanha"? Entende que quem for
    designado passa a **ver aquela internação e só ela**? Ela pergunta o que
    acontece com quem estava antes?

14. **Tire o relatório do trabalho desta casa, para levar à reunião de rede.**
    Observar: ela acha o botão no Painel das unidades? Ao ver a folha, ela
    procura comparar com as outras casas — e o que diz quando lê que o
    documento não compara? ⚠️ **Esta é a pergunta mais delicada do roteiro
    para este cargo.** Se ela quiser a comparação, anote a frase inteira: a
    recusa de fazer ranking de casas é decisão de projeto, e vale saber quanto
    ela custa a quem responde por uma casa.

15. **Pergunte depois:** "o que desta lista você já faz hoje em outro lugar?
    Onde?"

---

## 5.1. Gestor Geral — a leitura das oito casas

*Se o gestor estiver presente. São cinco minutos, e é a única parte do roteiro
que não é sobre o turno.*

1. **Veja as oito casas pelo trabalho social.**
   Observar: ele acha a chave **🌱** no alto da tela, ao lado do tema? Ou
   procura no menu? *(As duas portas existem; qual ele usa primeiro é o dado.)*

2. **Descubra o que aconteceu de bom no ano.**
   Observar: o que ele olha primeiro — o total, os tipos de conquista, ou a
   lista casa a casa? Ele procura ordenar por resultado?
   ⚠️ **Se ele pedir para ordenar as casas por conquistas, não conceda, e
   anote a frase.** A ordem é a do cadastro de propósito: comparar casas seria
   um ranking com outro nome, e a casa que recebe adolescentes com medida
   recente não está na mesma corrida da casa-lar com quatro crianças pequenas.
   A pergunta que vale fazer é: *"o que você faria com esse número?"*

3. **Abra a trajetória de uma criança.**
   Observar: ele espera ver saúde e ocorrências ali? A tela traz só as
   conquistas e as casas por onde ela passou — e diz por escrito que o resto
   fica nas telas do caso.

4. **Pergunte depois:** "que número desta tela você levaria para uma reunião
   fora da Fundação, e para quem?"

---

## 6. Líder Noturno Geral

1. **Abra a ATA Geral da noite e registre que a Casa 05 chamou às 02h10.**
   Observar: ela entende que **casa sem chamado também entra**?

2. **Duas casas ainda não confirmaram a ATA noturna. Assine a Geral.**
   Observar: ela fecha com pendência dizendo quais?

3. ⚠️ **Pergunte diretamente:** "de dia, quem precisa ler a ATA Geral da noite
   anterior? A coordenação? A técnica?"
   *(Hoje só quem abre chega nela. É a outra decisão em aberto, e a resposta
   dele decide o que construir.)*

---

## 7. Cozinha

Uma tela só, de propósito.

1. **Descubra o que não pode ser servido hoje.**
   Observar: ela acha? Ela sente falta de alguma coisa?
   ⚠️ Se ela pedir o motivo da restrição, **anote a frase e não conceda** — a
   lista traz a restrição, não a razão dela, e isso é decisão de proteção. Mas
   a pergunta dela é informação: talvez falte a orientação de substituição.

---

## 8. Quatro perguntas para o Marcelo, no fim

1. **A escala 12×36 vigente** — sem ela o aviso de "fora da escala" ao marcar
   compromisso não funciona (§2 do plano do piloto).

2. **Os códigos e nomes reais das oito unidades.** Os atuais (AI1–AI4,
   ARM1–ARM4) são preliminares e aparecem em tela, em relatório e em nome de
   arquivo no Drive.

3. **O código do aparelho da casa — onde ele é digitado.** A coordenação
   registra o aparelho e recebe um código que aparece uma vez (§11.7). Para a
   confirmação de remédio funcionar sem sinal, esse código precisa estar
   guardado NAQUELE aparelho — e não existe tela que o peça, porque a decisão
   é da Fundação: **quem digita, e quando?** Na hora em que o aparelho é
   entregue à casa? Na primeira entrada de alguém nele?
   E a segunda metade da pergunta, que é operacional: **a casa tem um aparelho
   só.** Quando ele não está com quem faz o plantão, confirmar remédio offline
   deixa de existir na prática para o educador. Isso é a realidade da
   instituição, não defeito do sistema — mas precisa ser dito em voz alta e
   decidido: fica assim, a Fundação designa mais aparelhos, ou a confirmação
   passa a valer no aparelho pessoal com outra proteção?

4. **O SMTP institucional** — provedor, endereço remetente, o endereço onde o
   sistema vai rodar, e quem mexe no DNS do domínio (SPF/DKIM). Sem isso o
   convite de primeiro acesso não sai, e **sem convite não há primeiro acesso
   para 40 pessoas** sem cair na distribuição de senha por mensagem.

---

## O que NÃO perguntar

- **Não pergunte se a pessoa "gostou".** Ela vai dizer que sim, porque você
  construiu, e a resposta não serve para nada.
- **Não explique a tela antes.** Explicação some quando você sai da casa; a
  tela fica.
- **Não peça sugestão de layout.** Peça a tarefa. Onde ela parar é o layout
  falando.
- **Não anote "achou fácil".** Anote o que ela fez e o tempo que levou.
