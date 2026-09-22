# PARA A REUNIÃO — o que falta, e o que eu preciso perguntar

> Gerado em 13/09/2026 na fase 104, revisto em 15/09 na fase 120, em 19/09 na
> fase 126 e em **20/09**, quando quatro perguntas foram respondidas de uma vez
> (§4.5 e §5).

---

## 1. Onde o sistema está, em cinco linhas

> **19/09, fase 126 — o que mudou desde a última revisão deste documento.**
> Nenhuma decisão nova, nenhuma funcionalidade nova: as fases 105 a 125 voltaram
> de outra conversa como pacote sem histórico, e foram aceitas **rodando**. A
> suíte inteira reprovava, e cada suíte sozinha passava — três causas, todas em
> dado de teste. Duas **se cancelavam** (uma deixava uma criança a mais na Casa
> 03, a outra tirava o Theo do seed), e a terceira era o defeito de fuso de
> sempre num lugar novo: o seed das prescrições usava a data do SERVIDOR, e
> depois das 21h em Porto Alegre semeava o dia seguinte — o dia de hoje nascia
> sem dose nenhuma. **Nada no sistema; tudo no dado de partida.**

- **146 fases.** 94 suítes e 915 testes, verdes em duas condições de relógio —
  antes e depois da virada do UTC, que em Porto Alegre é às 21h.
- **A chamada fecha.** O único item de código que faltava ao piloto — a chamada
  que travava quando uma criança estava internada ou em casa com a família —
  saiu na fase 127, com suíte própria que guarda o defeito.
- **O perfil da criança passou a dizer o que se escreveu sobre ela** (fase 128),
  com o restrito aparecendo como CONTAGEM para quem não o alcança. Era a
  resposta de 20/09, e ela destravou uma ponta que estava fechada de propósito
  desde a varredura de 15/09.
- **A escala não se deduz mais** (fase 129). Sem escala lançada, o sistema deixou
  de nomear quem devia estar — e a tela diz em vermelho que ninguém a lançou.
  Assinar continua aberto a quem esteve. **E a fase 131 achou o mesmo
  defeito num segundo lugar:** a tela de marcar compromisso dizia *"(fora da
  escala deste horário)"* em todo nome, para sempre, porque lia a escala semanal
  que nenhuma casa nunca preencheu. Agora o aviso distingue quem está de quem
  não está.
- O sistema **sobe compilado num banco virgem**, o backup restaura e o cofre
  abre com a chave certa — e reprova com a errada.
- O **protótipo** é um arquivo só, abre sem internet, e percorre 132 telas nos
  sete cargos sem violação de acessibilidade.
- O **roteiro do Marcelo** tem 49 tarefas, todas com porta conferida.
- **A fila de pedidos de 09/09 acabou:** os catorze estão entregues.

**O que ninguém ainda fez:** aplicar o roteiro com a equipe. Nenhuma das
entregas das últimas semanas foi vista por quem vai usar.

---

## 2. As três perguntas que mais destravavam — ✅ RESPONDIDAS EM 15/09

*Ficam aqui com as palavras dele, e não em paráfrase: é assim que a decisão não
se perde na próxima reunião.*

**1. O que o Gestor Geral precisa ver de cada casa.** *(aberta desde 09/09)*

**Duas visões.** A inicial é *"quantitativa, com métricas […] só gráficos,
dashboards, bem como aquele de pizza, bem bonitinho, colorido, profissional"* —
para ele **gerar relatórios de impacto** do Pão dos Pobres na vida das
crianças. As métricas que ele nomeou: crianças que passaram de ano, crianças
com boas notas, quais casas têm bom acompanhamento e bom desenvolvimento
educacional, crianças por casa, reuniões por casa, pessoas na escala,
internações, medicamentos saindo, **preço total das notas fiscais**, alimentos
e lanches por semana e por mês.

A segunda é o **acesso total**, casa por casa — rotina, ATAs, perfis,
educadores, coordenadores. E o motivo dele importa: *"caso algum coordenador
saia, o gestor tem que ter acesso completo para montar uma nova equipe. Ou se
ele quiser fazer uma casa nove."*

*Ele também respondeu à minha objeção, por escrito:* **não é competição.**
*"Ele precisa ter os dados reais. Qual é a casa que está dando mais resultado?
Tem um motivo? […] é uma forma de ele poder melhorar o acompanhamento das
outras casas para as outras crianças que não atingiram o tamanho dos
resultados."*

~~⚠️ **Uma das métricas não tem dado:** *"quantas crianças tiveram boas
notas"*.~~ ✅ **RESPONDIDA EM 20/09: um conceito geral por período**, por
bimestre, com espaço para o porquê — e não boletim com notas por disciplina, que
ninguém digitaria por 20 crianças em oito casas. Ver a pergunta 2 do §4.5. *A
aprovação de ano, essa sim, já era contável — é um marco de vida.*

**2. A escala 12x36.** *(travava o aviso de fim de plantão desde 08/09)*

Ele descreveu como quer: lançada com semanas ou meses de antecedência pela
equipe técnica, coordenação ou educador líder; **cada pessoa com a sua cor**;
quando alguém falta, tiram da escala e ela sai na hora; substituir ou deixar a
menos. E a frase que decide o desenho: **"a gente não vai deduzir a escala."**

**Quase tudo já existe.** Medido antes de construir: lançamento por data e
turno, repetição de padrão, até um ano à frente, retirada que some na hora,
nada apagado, folha para a parede. Três dos quatro ajustes saíram na fase 123.
✅ **O quarto foi respondido em 20/09: a dedução sai.** Ele reafirmou com a
rotina real pela frente — *"não cabe a nós deduzir"* —, e o desenho que sai
disso está na pergunta 1 do §4.5: escala vazia que diz em vermelho que ninguém
lançou, e a passagem assinada por quem está ali.

**3. LGPD.** *(travava o piloto inteiro)*

*"Como o sistema é interno para o Pão dos Pobres, a gente pode deixar os dados
bem tranquilos para o pessoal poder ler. Porque tanto os educadores, equipe
técnica, educador líder, coordenador ou gestor, eles estão ali para proteger as
crianças e têm a guarda delas."* **Fotos das crianças liberadas para a equipe**
— no acolhimento e no perfil.

O círculo estreito fica com o que ele nomeou: **judicial, acompanhamento
socioeducativo, internação, questões comportamentais de agressividade e
ocorrência grave** — educador líder, coordenação, equipe técnica e gestão.

⚠️ **Isto destrava o dado real, e não fecha a LGPD.** Continua sem resposta:
**quem responde formalmente**, **por quanto tempo se guarda cada coisa** e **o
que se apaga** quando alguém pede. Sem isso o sistema funciona; o que não
funciona é a resposta a um pedido de titular — e ela chega com nome e prazo.

---

## 3. As perguntas do roteiro (§8) — nascem de aplicar com a equipe

Estas têm de ser respondidas **depois** de a equipe usar o protótipo, não antes.

| # | Pergunta |
|---|---|
| ~~1~~ | ✅ **Relatórios obrigatórios.** *"Acompanhamento semanal […] tipo uma ata geral de toda semana, manhã e noite."* Conteúdo: ocorrências, desorganização, aumento de medicamentos, quem não está comendo, desenvolvimento, e as observações dos educadores *"ponderadas para trazer coisas boas e negativas"*. **Período livre** — de um dia a seis meses |
| ~~2~~ | ✅ **Convite de primeiro acesso.** *"Pode botar ilimitado."* **Já é assim:** não há limite de número em lugar nenhum, a senha inicial é trocada no primeiro acesso, e o convite vai por e-mail ou como link. *Continua de pé só o prazo de 24h do convite — ver §6, item 13* |
| ~~3~~ | ✅ **A volta da família.** *"Esses dados são extremamente sensíveis e têm que ser armazenados."* E o que muda o desenho: **o acompanhamento fica ABERTO** para ser preenchido depois — *"porque a criança pode não querer falar na hora"* — e fica registrado no perfil |
| ~~4~~ | ✅ **O que a equipe pediu a mais.** Várias fotos da criança no perfil; documentos digitalizados para ver **e baixar**; a Enfermagem anexando bula e receita direto no perfil. **Medido, e feito:** uma vivência passou a ter quantas fotos tiver (fase 124), o dossiê ganhou o botão de baixar por rota que registra (fase 124), e a receita e a bula chegam ao perfil da criança (fase 125). A nota fiscal **não** entra: é compra da casa, e não tem pessoa |
| 5 | O lembrete de prazo e o pente-fino semanal (ver §4 abaixo) |
| 6 | A folha da portaria **não lista quem não entra**. A casa quer uma segunda lista, só com nome e foto, sem motivo? Decisão dele **com o DPO** |
| 7 | A agenda de consulta não entrou no que a coordenação liga e desliga: o educador em plantão deve ver os compromissos da casa dele? Se sim, vale para as **oito**, decidido uma vez |
| 8 | O estatuto é escrito só pela coordenação, e **as crianças não têm onde discordar**. Existe assembleia? Se não existe, o sistema não deve fingir que houve participação |
| ~~9~~ | ✅ **A visão de cima do Gestor Geral** — respondida em 15/09, ver §2 acima |

---

## 4. Travados esperando a casa — não é código *(§10.5)*

| # | O que falta saber | O que trava |
|---|---|---|
| ~~1~~ | ✅ **Respondida em 15/09.** Ele descreveu o funcionamento; quase tudo já existe. O que falta são quatro ajustes pequenos e **uma decisão** — ver a pergunta 1 do §5 |
| 2 | O lembrete de prazo: vencendo **o quê**, e com quantos dias? | Atividade, documento, PIA, receita? A antecedência muda o desenho |
| 3 | O pente-fino semanal: **em que dia**? | Ele o quer semanal; falta o dia |

---

## 4.5 As QUATRO perguntas novas que as respostas de 15/09 abriram

*São curtas, e cada uma muda uma linha de código. Todas nasceram de eu medir o
que já existe antes de construir o que ele pediu.*

**1. ~~Tirar a dedução da escala deixa o dia sem ninguém.~~** ✅ **RESPONDIDA
EM 20/09 — a dedução sai.**

Ele reafirmou, com a rotina real pela frente: *"na vida real as escalas já são
montadas com antecedência, apenas irão cadastrar aqui, caso alguém não possa vir
eles podem cancelar a pessoa da escala daquele plantão, podendo se quiser também
incluir outro funcionário a qualquer momento, tudo fica em registro, mas **não
cabe a nós deduzir**."*

Eu levantei a consequência — sem dedução e sem escala lançada, ninguém é
apontado para assinar a passagem — e ele decidiu de novo pelo mesmo caminho. O
desenho que sai disso está no §10 do `REDE-ACOLHER.md`: a escala do dia sem
lançamento fica **vazia e diz em vermelho que ninguém lançou**, e a passagem
passa a ser assinada por **quem está ali**, com o registro guardando que não
havia escala. *O sistema deixa de afirmar um nome que não foi escalado, e não
deixa a educadora das 23h sem poder assinar.*

**2. "Quantas crianças tiveram boas notas" não tem onde sair.** ⚠️

Não existe campo de nota, boletim ou conceito. O que existe é a **série** (`4º
ano`) e a evolução educacional em **texto livre** — que não se conta. A
**aprovação de ano**, essa sim, já é contável hoje.

✅ **RESPONDIDA EM 20/09: um conceito geral por período.** Por bimestre, um
conceito por criança, com espaço para o porquê. **Não** boletim com as notas por
disciplina — são 20 crianças, quatro vezes por ano, em oito casas, e a métrica
que ninguém consegue digitar não existe. **Não** aprovado/reprovado por
disciplina, que só fala uma vez por ano, tarde para a casa agir.

*O que isso desenha:* o conceito é contável, então a caixa *"crianças com bom
acompanhamento educacional"* do painel do Gestor passa a ter de onde sair. E ele
é curto de digitar, o que é a condição de existir. **O conceito não vira número
colado no nome da criança** — é estado do acompanhamento num período, com o
motivo escrito ao lado, pela mesma razão que a pontuação de comportamento foi
recusada (§7 do `REDE-ACOLHER.md`).

*Ainda meu, e vou perguntar quando construir:* quem digita — o educador, que
acompanha a tarefa de casa, ou a equipe técnica?

**3. A foto de identificação não baixa — decisão minha, a confirmar.**

Ele pediu documentos para *"visualizar a hora que quiserem e baixar"*, e eu vou
pôr o baixar no dossiê. Mas a **foto do rosto da criança** eu deixei sem baixar
de propósito, e está escrito na tela: *"a foto não é botão de download"*. Ela é
vista no perfil por quem cuida; baixar cria uma cópia que sai do sistema e
ninguém mais acompanha.

*Desfaz-se numa linha, se ele quiser.*

**4. A Enfermagem "gerenciar os dados" da criança — até onde?**

Hoje ela escreve **saúde**: condições, restrição alimentar, evolução, e pode
anexar no dossiê. Ela **não** edita cadastro, escola nem cuidados essenciais.

*O que eu preciso saber:* ele quis dizer só a parte de saúde — que já é assim
— ou a enfermeira deve poder corrigir cadastro também?

---

## 5. As decisões que são do Marcelo *(§10 — responda pelo número)*

Nenhuma é problema de código. Duas têm consequência maior e estão marcadas.

| # | Decisão |
|---|---|
| 1 | Devolver um acompanhamento para correção não existe. A técnica deve poder? E o que acontece com a versão que já estava lá? |
| 2 | O recorte por casa vale para a ATA Geral do **dia corrente**? E: de dia, quem precisa ler a ATA Geral da noite? |
| 3 | "Concluí tudo até agora" na linha do dia — a versão segura exclui medicação |
| 4 | O Arquivo das ATAS abre no mês de calendário e fica vazio todo dia 1º. Criar "últimos 30 dias"? |
| 5 | A grade de medicação para colar na parede saiu sem diagnóstico. A casa quer diferente? |
| ~~6~~ | ✅ **RESPONDIDA EM 20/09: só a contagem** — *"existem 2 relatos em área restrita"*, o mesmo precedente dos documentos. **Destrava duas telas:** a leitura excepcional, e a listagem de relatos por criança |
| ~~7~~ | ✅ **RESPONDIDA EM 20/09: as três numa lista só**, com filtro por tipo — é a única que não obriga a técnica a adivinhar em qual aba está o que ela lembra |
| 8 | "Administrado com atraso" é informação útil, ou cobrança injusta com quem estava com uma criança no colo? |
| **9** | ⚠️ **O PIA.** Nas vinte crianças, as duas datas são iguais (18/06 e 18/09), o que sugere controle por data única na planilha e não por criança. São mesmo iguais? O sistema deve avisar por criança, 30 dias antes? |
| 11 | **A Enfermagem vê a internação — decisão MINHA, a confirmar.** A resposta de 03/09 não a listou; incluí porque internação é primeiro um fato de saúde. Desfaz-se numa linha |

*(O item 10, das fontes do protótipo, foi resolvido medindo — não precisa de
reunião.)*

---

## 6. O que depende da Fundação *(§11)*

| # | O que | Situação |
|---|---|---|
| 1 | A escala 12x36 vigente | Tela pronta, falta o conteúdo |
| 2 | Janela de acesso por plantão (T-10/T+10) | **Não implementada** — ligá-la é decidir que alguém fica sem abrir o sistema fora do horário |
| 3 | Códigos e nomes reais das oito unidades | AI1–AI4 / ARM1–ARM4 são preliminares e aparecem em tela e em nome de arquivo |
| 4 | **O SMTP institucional** | Sem ele não há convite, e sem convite não há primeiro acesso para 40 pessoas sem senha por mensagem |
| 5 | Prazo de triagem da Enfermagem | Já é parâmetro |
| 6 | Horário oficial do Líder Noturno Geral | 7h como hipótese, no `.env` |
| 7 | Relatórios obrigatórios no piloto | Seleção com o Marcelo |
| 8 | Permissões de fotos em memórias | Upload desabilitado até confirmação |
| 9 | **Os dados de partida** | Equipe, acolhidos já na casa, e quanto do histórico em papel entra |
| 10 | **LGPD** | Quem responde, por quanto tempo se guarda, o que se apaga |
| 11 | Critérios de aceite do piloto | A proposta está no §13; falta assinar |
| 12 | **A folha da portaria com CPF e foto impressos** | Decisão dele de 09/09, já construída. **O DPO precisa ver antes do piloto** |
| 13 | **O prazo do convite de primeiro acesso** | 24 horas. Com quarenta pessoas convidadas na implantação, pode ser curto — quem não abrir o e-mail no dia precisa de convite novo. Alongar é uma linha |

### Os seis formulários de papel que faltam

1. **A folha real de administração de medicamentos** — a mais importante: é o
   único módulo desenhado a partir do documento e não do papel que a casa usa,
   e é onde o erro custa mais caro.
2. A agenda / rotina real, diária e semanal.
3. O formulário de ingresso / PIA.
4. O modelo de passagem individual — a nossa é uma **proposta**.
5. Os formulários de ocorrência e contenção.
6. Um exemplo de escala 12x36, com os horários da técnica e da Enfermagem.

### E três decisões novas, da fase 103 *(§12.7)*

O **relógio** — o que gera as doses do dia a partir das prescrições, as
atividades da rotina e os avisos — passou a existir. Antes dele, o dia
amanheceria vazio no piloto. Para ligá-lo:

| # | Pergunta | Por que importa |
|---|---|---|
| 1 | **Qual conta é a do relógio** | Tudo o que ele gerar fica na auditoria com esse nome. **Não deve ser a conta de uma pessoa:** quem ler seis meses depois precisa distinguir "o sistema gerou" de "a enfermeira gerou" |
| 2 | **Que horas** | A proposta é 05h. A virada do dia é o pior horário: equipe da noite trabalhando, backup rodando, ninguém acordado para ver um erro |
| 3 | **Quem olha quando falha** | Sem alguém para ler, o dia incompleto só aparece quando a casa disser que "o remédio sumiu da tela" |

---

## 7. O que eu recusei, e o que ofereci no lugar *(§10.5)*

Vale reler antes da reunião, porque pode voltar à mesa.

- **WhatsApp** para mandar o pedido de lanche. O documento é baixado e levado
  pelo canal que a instituição decidir — um botão de WhatsApp desfaz, no
  primeiro clique, a decisão de 28/08 de tirar a operação de lá.
- **Pontuação de comportamento.** O raciocínio dele é bom, e o número é que não
  serve: daqui a seis meses "40" continua na tela e o motivo não continua. No
  lugar, o combinado com motivo, autor e prazo de revisão.
- **Soma de pedidos por educador.** O "qual deles" existe — cada pedido tem
  nome. O que não fiz foi somar por pessoa, que num painel de oito casas vira
  comparação entre equipes.

---

## 8. As decisões que tomei sozinho — todas reversíveis

Estão no código com o motivo escrito. **Se a casa discordar, muda.**

| O quê | O que decidi | Onde |
|---|---|---|
| Portaria | Só entra na folha quem a técnica ou a coordenação **marcar**; estar no cadastro não basta | §8.9.2 |
| Portaria | A folha **não diz quem não entra** — numa guarita, "proibido de ver a criança" já conta uma história | §8.9.2 |
| Campos do plantão | Lista **fechada** de quatro campos; padrão ligado; desligar exige motivo, e o educador **vê que foi desligado** | §8.2.1 |
| Pauta da reunião | Recusar **e adiar** exigem resposta escrita; quem propôs é avisado | §8.2.2 |
| Estatuto | Dois alcances (casa e instituição); público por regra; **não guarda quem descumpriu** | §8.2.3 |
| Aniversários | Avisos a 7, 3 e 0 dias; **o sistema não pergunta se houve festa** | §8.2.4 |
| Relógio | Não é rota HTTP; uma casa que falha não derruba as outras; ele **não decide nada** | §12.7 |

---

## 9. O que eu faria a seguir — reescrito depois de 15/09

1. ~~**O painel de métricas do Gestor Geral** (fase 120)~~ ✅ **feito** — é a
   pergunta 1, e ele descreveu com detalhe suficiente para construir. Quase
   todo o dado existia; só "boas notas" não tinha onde sair, e essa pergunta
   foi para o §4.5.
2. ~~**O relatório de período livre** (fase 121)~~ ✅ **feito** — *"uma ata geral
   de toda semana"*, de um dia a seis meses, com a parte boa vindo primeiro e
   *"quem não está comendo o quê"* sem contar nada. O texto de acesso restrito
   sai só como contagem: esta folha circula, e a tela da ocorrência registra
   cada abertura.
3. ~~**O relato da volta da família** (fase 122)~~ ✅ **feito — e ele corrigiu o
   desenho.** Eu ia construir uma pendência com prazo de sete dias; ele voltou:
   *"acho mais fácil não dar um prazo, mas deixar em aberto para ser registrado
   quando de fato tivermos uma informação […] dessa forma não haverá uma pressão
   para arrancar a informação da criança. Mas isso pode ser registrado quantas
   vezes for necessário, por qualquer educador, tudo ficando no perfil do
   jovem."* A correção é melhor: uma pendência com prazo vira cobrança sobre o
   educador, e o educador só tem uma forma de baixá-la — perguntar de novo para
   a criança. Ficou sem prazo, sem estado, sem cobrança e sem limite de quantos.
4. ~~Os **quatro ajustes da escala**~~ ✅ **três feitos (fase 123)** — entram a
   equipe técnica e o Líder Diurno em quem monta, a cor de cada pessoa chega à
   escala, e substituir virou um gesto só, com quem entrou sabendo de quem é o
   lugar. O quarto — *"a gente não vai deduzir a escala"* — espera resposta:
   sem dedução e sem escala lançada, a passagem de plantão fica sem ninguém
   para assinar no primeiro dia de uso (§4.5).
5. ~~Os **três ajustes dos anexos**~~ ✅ **dois feitos (fase 124)** — uma
   vivência passou a ter quantas fotos tiver, com prévia de todas antes de
   confirmar e a autorização por foto; e o documento do dossiê ganhou o botão
   de baixar, por rota própria que registra a saída.
6. ~~A **receita, a bula e o anexo do diário** chegando ao dossiê~~ ✅ **fase
   125** — cada uma vivia presa à tela que a criou, e o dossiê só lê `document`.
   Agora o espelho aponta para o **mesmo arquivo guardado**, chega conferido por
   quem anexou, e não se repete se a fila offline for reenviada. **Uma correção
   ao que eu escrevi aqui:** a **nota fiscal** do medicamento não entra.
   `medication_purchase` tem casa e **não tem pessoa** — a nota é uma compra da
   CASA, e pô-la no prontuário de uma criança seria inventar um vínculo que o
   dado não tem. **São duas vezes, não três**, e um teste guarda a diferença. A
   regra que ele tirou dali — *"todos os outros lugares onde a gente preenche […]
   têm que ir individual para cada um no seu registro"* — vale para o resto do
   sistema, e é por ela que existe uma função só para espelhar.
7. **Aplicar o roteiro com a equipe.** Continua sendo o único item que eu não
   posso fazer sozinho, e o que mais muda o sistema.
8. Levar a folha da portaria ao **DPO**, e fechar a outra metade da LGPD.
9. Resolver o **SMTP**, sem o qual não há primeiro acesso.
10. Pedir a **folha real de medicamentos** — o módulo mais arriscado, e o único
   desenhado a partir do documento em vez do papel que a casa usa.
