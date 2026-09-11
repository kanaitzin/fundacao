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
> Última atualização: 11/09/2026 — as doze entregas de 09/09 no **§0.8**
> (as mais novas são a **folha da portaria** e **o que o plantão vê no
> perfil**), quinze tarefas novas nas seções dos cargos, a **§7 mudou de dono** (a
> cozinha não entra no sistema, e quem pede o lanche é quem está no turno), e a
> **§8** trocou uma pergunta que tinha deixado de existir pelas que ainda
> esperam resposta.

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

## §0.8 — O que mudou depois de 09/09 (a conversa longa, e é bastante coisa)

Doze coisas que o Marcelo pediu em 09/09 já estão no protótipo. **Quinze
tarefas novas** deste roteiro existem por causa delas, e estão marcadas nas seções dos
cargos. O que vale saber antes de aplicar:

- **A cozinha não entra no sistema** — decisão da Fundação. Não existe mais
  "entrar como Cozinha": a tela virou *Cozinha — pedidos e restrições*, em
  "Mais", de quem trabalha na casa. Ver a **§7**, que mudou de dono;
- **a linha do dia ganhou cor por categoria** (saúde, medicamento, educação,
  lazer, alimentação, saída, ocorrência, rotina), na borda esquerda — e o
  **estado** continua na pílula, do lado. São duas perguntas diferentes: "isto
  é o quê" e "isto ainda exige algo de mim";
- **cada pessoa da casa tem uma cor na ATA**, escolhida pela coordenação e que
  **não repete** — e sempre com o nome escrito ao lado, porque cor não
  sobrevive à impressão em preto e branco nem ao daltonismo;
- **o compromisso agora diz a que hora sair e para onde**, separado da hora de
  estar lá: entre as duas cabe o trânsito;
- **desmarcar uma data não cancela a série**, e o dia desmarcado continua na
  agenda, marcado;
- **ocorrência grave cobra relato de quem estava escalado**, com
  **"Não presenciei"** a um toque — e marcar isso *é* responder;
- **a criança pode estar em experiência familiar**: sai da chamada, da rotina e
  da grade, e **a vaga continua ocupada**. Há uma folha do que ela leva de
  remédio;
- **"sair sozinho" é um estado** com motivo, autor e prazo de revisão — nunca
  pontuação de comportamento;
- **o armário ganhou nota fiscal e receita digitalizada**, e o estoque baixo
  continua sendo sinalizado **por gente**, com nome;
- **o retorno da família aparece na passagem e na ATA do turno** — quem voltou,
  a que hora, quem recebeu, como ela chegou e **o que ela trouxe de casa**. A
  equipe seguinte lê sem abrir perfil nenhum, e quem continua fora aparece
  também, com a hora de voltar.

⚠️ **O roteiro ficou longo — cresceu cerca de um terço.** Não tente aplicar
tudo com a mesma pessoa numa sentada. As tarefas **novas** de cada cargo estão no fim da
seção dele — se o tempo acabar, pare onde acabar e marque onde parou. Onde a
pessoa para é o dado; onde ela cansa não é.

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

9. **Olhe o dia e me diga o que é cada coisa.** *(Não aponte a legenda.)*
   Observar: ela usa a **cor da borda** para separar saúde de lazer, ou lê
   título por título? Ela repara que a **pílula** ao lado diz outra coisa — se
   aquilo ainda exige algo dela? ⚠️ Se ela disser que a cor significa
   gravidade, ou "criança problemática", **anote a frase inteira**: é a
   pergunta mais importante desta tarefa. Cor comunica **o que é** e **em que
   estado está** — nunca julgamento sobre a criança.

10. **A Lara tem fonoaudiologia hoje às 15h. A que hora vocês precisam sair, e
    para onde vão?**
    Observar: ela acha **"Sair 14:00 · estar lá 15:00"**, ou lê só as 15h e se
    programa para sair na hora da consulta? Ela repara que o **endereço** vem
    escrito separado do nome do lugar? ⚠️ Pergunte: *"esse endereço serve para
    você pedir o ônibus ou o carro?"* — foi para isso que ele foi separado de
    "Clínica Fictícia — Centro".

11. **Houve um erro de medicamento na casa no seu turno. O sistema quer o seu
    relato.**
    Observar: ela acha **"Falta o seu relato"**, no alto das Ocorrências, antes
    da lista? Ela repara que a pergunta **não conta o que aconteceu**? Se ela
    não presenciou, ela acha **"Não presenciei"** — e entende que marcar isso
    **é responder**, e não escapar? ⚠️ Pergunte depois: *"e se você não tivesse
    visto nada, você preferiria que ninguém te perguntasse?"* A resposta é o
    dado desta tarefa.

12. **O Felipe acabou de chegar da casa da mãe, com uma mochila. Registre a
    chegada.**
    Observar: ela acha o Felipe em **"Com a família"**, no alto da lista da
    casa, e o botão **Chegou**? No campo de como ele chegou, ela escreve o
    **fato** ("chegou falando alto e foi direto para o quarto") ou uma
    **avaliação** ("chegou alterado")? ⚠️ Se escrever avaliação, **anote a frase
    inteira** — é a mesma conversa do §8.14 do documento, e é o motivo de
    "houve alteração?" não ter virado um sim/não. Ela usa o campo **"Trouxe
    algo de casa?"** para a mochila, ou mistura tudo num texto só? Ela lê o
    aviso, logo abaixo, sobre **avisar a Enfermagem** se vier remédio?

13. **A Helena passou o fim de semana com a madrinha e voltou no seu turno.
    Onde você lê o que aconteceu?**
    Observar: ela procura o perfil da criança, ou acha na **passagem**? Depois
    de achar, ela repara que o bloco diz **quem recebeu**, **como a criança
    chegou** e **o que ela trouxe de casa**? ⚠️ Pergunte: *"se viesse um
    remédio na mochila, o que você faria?"* — o aviso sobre avisar a
    Enfermagem está na folha da CHEGADA, e não neste bloco. A resposta diz se
    ele precisa estar aqui também. *(Para quem aplica: a Helena voltou no turno
    **diurno**. Aplicando à noite, é o cartão do plantão diurno que tem o
    retorno dela. Se a pessoa fez a tarefa 12 antes, o Felipe aparece no bloco
    também.)*

14. **Pergunte depois:** "teve alguma hora em que você achou que ia dar
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

10. **A psicóloga desmarcou o acompanhamento desta quarta. O da semana que vem
    continua valendo.**
    Observar: ela acha **"Desmarcar este dia"** na agenda, ou procura cancelar
    o compromisso inteiro? Depois de desmarcar, ela repara que **o dia continua
    aparecendo**, marcado como desmarcado? ⚠️ Pergunte: *"por que você acha que
    ele não sumiu?"* — se sumisse, no mês seguinte a ausência viraria
    esquecimento, e é isso que se quer conferir com ela.

11. **A Alice vai passar o fim de semana com a mãe. Registre.**
    Observar: ela procura uma tela de "saídas", ou entende que a saída nasce
    **no contato** do perfil — "Vai passar dias com…"? Ela repara que o botão
    **não aparece** no contato com aproximação restrita? Depois de registrar,
    ela vê a Alice em **"Com a família"** no alto da lista da casa, com a hora
    de voltar? ⚠️ Pergunte: *"e a vaga dela na casa, continua ocupada?"*

12. **Este adolescente pode ir sozinho ao curso?**
    Observar: ela acha a autorização no perfil? Ela entende que é um
    **estado** — sai sozinho, sai acompanhado, não sai sozinho — com motivo,
    autor e prazo de revisão? ⚠️ **Se ela pedir pontos, nota ou algum número
    para medir confiança, anote a frase e diga que não existe** — é a regra 3.
    E pergunte o que ela usaria no lugar; a resposta dela vale mais que a
    minha.

13. **A Rosângela, mãe da Alice, trouxe o CPF. Deixe-a pronta para a folha da
    portaria.**
    Observar: ela procura uma tela de "portaria", ou entende que a marca nasce
    **no contato** do perfil, como a saída? Ela lê a diferença entre **estar no
    cadastro** e estar **autorizado a visitar**? Ela repara que o tio, com
    aproximação restrita, **não tem o botão**? ⚠️ Pergunte: *"se o tio chegar à
    guarita, o que a portaria sabe?"* — a folha não lista quem NÃO entra, de
    propósito; a resposta dela é a pergunta 6 da §8.

14. **Pergunte depois:** "o que faltou neste documento para você levar a uma
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

7. **Chegou uma caixa de remédio com nota fiscal. Registre a compra — e
   descubra o que ainda está sem o papel digitalizado.**
   Observar: ela acha a aba **"Compras"**, ou procura na de "Estoque"? Ela
   entende que a nota é do **gasto**, e que a validade é assunto do armário —
   que já a tem? Ela repara no aviso de **quantas linhas estão sem o papel**?
   ⚠️ Pergunte: *"quem, na sua casa, junta isso no fim do mês?"* — é o que
   trava a prestação de contas, e a resposta diz se a porta está no cargo
   certo.

8. **O que a equipe sinalizou como estoque baixo?**
   Observar: ela acha os itens sinalizados? ⚠️ **Se ela procurar um "mínimo"
   calculado, anote a frase.** O sistema recusa isso de propósito: quem
   sinaliza é gente, com o nome ao lado, porque dois frascos de um xarope
   eventual sobram e dois de um contínuo acabam na quinta. Pergunte se ela
   concorda — ou se prefere o cálculo automático, e por quê.

9. **Pergunte depois:** "em que momento do seu dia você abriria isto?"

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

16. **Escolha a cor da linha de uma das educadoras na ATA — e depois tente dar
    a mesma cor a outra.**
    Observar: ela acha o botão da cor na lista da equipe (ele traz o **nome do
    tom escrito**, "automática" enquanto ninguém escolheu)? Ao tentar repetir,
    ela entende a recusa — que **diz de quem a cor já é**, e não só "já em
    uso"? ⚠️ Pergunte duas coisas: *"faz sentido a coordenação escolher, em vez
    de cada um escolher a sua?"* (se cada um escolhesse, o primeiro a entrar
    levaria o azul e a distinção viraria ordem de chegada) e *"você usaria a
    cor para achar quem escreveu, ou o nome ao lado já basta?"*

17. **Gere a folha da portaria para a guarita.**
    Observar: ela acha **Portaria** em "Mais"? Antes de gerar, ela lê quem está
    **sem ninguém autorizado**, sem foto ou sem CPF — e faz alguma coisa com
    isso, ou passa direto? Na folha, ela confere que **não há motivo de
    restrição nem observação** de ninguém? ⚠️ Pergunte: *"com que frequência
    esta folha precisa ser trocada na guarita, e quem recolhe a velha?"* — a
    folha diz que vale até ser substituída, e isso só funciona se alguém
    recolher a anterior.

18. **A escola pediu que o contato passe só pela equipe técnica. Tire a escola
    da vista do plantão — e depois devolva.**
    Observar: ela acha **"O que o plantão vê"** em "Mais"? Ela entende que isso
    vale só para o **educador em plantão**, e só nesta casa? Ao desligar, ela
    escreve um motivo de verdade, sabendo que **o educador vai ler esse
    motivo**? ⚠️ Pergunte duas coisas: *"em que situação real você desligaria
    algum destes?"* — se ela não tiver nenhuma, isto é um botão que ninguém vai
    usar, e vale saber — e *"o que você esperava poder desligar e não está na
    lista?"*. A lista é fechada de propósito; o que ela pedir a mais é a
    pergunta 7 da §8.

19. **Pergunte depois:** "o que desta lista você já faz hoje em outro lugar?
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

## 7. A cozinha — aplicada com **o educador**, e não com a cozinha

⚠️ **Esta seção mudou de dono.** A Fundação decidiu em 09/09 que a cozinha
**não entra no sistema**: ela recebe as folhas em papel. Então não existe mais
"entrar como Cozinha" — o cargo saiu do seletor "Ver como", e a tela virou
**"Cozinha — pedidos e restrições"**, dentro de **"Mais"**, de quem trabalha na
casa. *Aplique estas duas tarefas com um educador ou um líder — quem percebe
que falta lanche para a saída de sábado é quem está no turno.*

1. **Falta lanche para a saída ao parque de sábado. Peça à cozinha.**
   Observar: ela procura a cozinha na barra de baixo, ou em "Mais"? Depois de
   achar, ela entende que **a folha vai em papel** e que o sistema não manda
   nada para ninguém? No formulário: ela repara que **"Para quê" é
   obrigatório** — e escreve o motivo, ou tenta salvar sem? Ela usa
   **"Casa toda"** para a saída do grupo, ou nomeia vinte crianças?
   ⚠️ Se ela perguntar por um botão de **WhatsApp**, anote a frase e diga que
   não existe. É a decisão de 28/08, e a conversa dela sobre isso é o dado.

2. **Descubra o que não pode ser servido hoje.**
   Observar: ela acha a aba **"Restrições"**, ao lado de "Pedidos"? Ela sente
   falta de alguma coisa?
   ⚠️ Se ela pedir o motivo da restrição, **anote a frase e não conceda** — a
   lista traz a restrição, não a razão dela, e isso é decisão de proteção. Mas
   a pergunta dela é informação: talvez falte a orientação de substituição.

3. **Pergunte depois:** "quem, na sua casa, pediria isso — você, o líder, ou a
   coordenação?" *A resposta diz se a porta está no cargo certo.*

---

## 8. Sete perguntas para o Marcelo, no fim

1. **A escala 12×36 vigente** — sem ela o aviso de "fora da escala" ao marcar
   compromisso não funciona (§2 do plano do piloto).

2. **Os códigos e nomes reais das oito unidades.** Os atuais (AI1–AI4,
   ARM1–ARM4) são preliminares e aparecem em tela, em relatório e em nome de
   arquivo no Drive.

3. **"Se houve alteração" não virou um sim/não — de propósito, e ele pode
   discordar.** Ele pediu, para a volta da família, "se houve alteração e se
   trouxe algo de casa". O que ela **trouxe** virou campo próprio: é o que
   alguém tem de FAZER algo a respeito. A **alteração** ficou no campo de como
   a criança chegou, pedindo o fato observado. Um "alteração: sim" atravessa
   seis meses e um relatório judicial muito depois de o detalhe ao lado ter
   sido esquecido, e "alterada" gruda na criança de um jeito que "chegou sem
   falar e foi direto para o quarto" não gruda. **A pergunta:** com a tarefa
   1.12 aplicada, a casa ainda quer o sim/não? Se quiser, é uma linha — mas
   que seja escolha consciente.
   *(Esta pergunta substitui a do código do aparelho da casa, que deixou de
   existir em 08/09: o sistema roda no celular de cada pessoa, e dose não se
   confirma sem sinal em aparelho nenhum.)*

4. **O SMTP institucional** — provedor, endereço remetente, o endereço onde o
   sistema vai rodar, e quem mexe no DNS do domínio (SPF/DKIM). Sem isso o
   convite de primeiro acesso não sai, e **sem convite não há primeiro acesso
   para 40 pessoas** sem cair na distribuição de senha por mensagem.

5. **Os dois pedidos de 09/09 que esperam uma resposta, e não código.** O
   **lembrete de prazo**: vencendo o quê — atividade, documento, PIA, receita —
   e com quantos dias de antecedência? E o **pente-fino semanal**: em que dia
   da semana?

---

6. **A folha da portaria diz quem ENTRA — e não diz quem não entra.** Quem tem
   aproximação restrita não aparece nela de jeito nenhum, nem como "proibido":
   numa guarita, "proibido de ver a criança" já conta uma história que não é
   da portaria, e a folha fica na mão de quem passa. O custo é real: se o pai
   com aproximação suspensa chegar, a portaria só sabe que ele **não está na
   folha**, e liga para a casa. **A pergunta:** a casa quer uma segunda lista,
   separada, de quem NÃO entra — só nome e foto, sem motivo? Se quiser, é
   decisão dele junto com o DPO, pela mesma razão do CPF impresso.

---

7. **A "agenda de consulta" não entrou no botão do que o plantão vê — e a
   decisão é dele.** Ele pediu para a coordenação poder ligar e desligar
   "telefone de responsável, escola, médico, contatos, agenda de consulta".
   Quatro viraram botão. A agenda de consulta não: hoje o educador **não a vê**,
   e ela não mora no perfil — mora nos compromissos, com regra própria de quem
   enxerga o quê. Ligá-la ali seria alargar o **alcance do cargo**, que é
   exatamente o que foi recusado em 27/08 por derrubar o isolamento entre as
   oito casas. **A pergunta:** o educador em plantão deve passar a ver os
   compromissos das crianças da casa dele? Se sim, isso vale para **todas** as
   casas, decidido uma vez — e não casa a casa.

---

## O que NÃO perguntar

- **Não pergunte se a pessoa "gostou".** Ela vai dizer que sim, porque você
  construiu, e a resposta não serve para nada.
- **Não explique a tela antes.** Explicação some quando você sai da casa; a
  tela fica.
- **Não peça sugestão de layout.** Peça a tarefa. Onde ela parar é o layout
  falando.
- **Não anote "achou fácil".** Anote o que ela fez e o tempo que levou.
