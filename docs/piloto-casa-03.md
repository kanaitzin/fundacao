# Fase 7 — Piloto da Casa 03

O piloto não é "ligar o sistema na casa". É descobrir, com uma casa só e com
o papel ainda funcionando ao lado, o que o sistema errou — e ter tempo de
corrigir antes que oito casas dependam dele.

Este documento é o plano. Ele muda conforme a Fundação responder o que ainda
está em aberto.

---

## 1. O que já está pronto para o piloto

**Ensaio geral automatizado** (`test/piloto.e2e.spec.ts`): percorre um dia
inteiro na Casa 03, com os papéis se revezando, e prova o roteiro do §33.3 —
vinte perfis fictícios, rotina, restrições, medicamentos variados, agenda,
passagem individual, ATA com pendência, ocorrência, transferência com aceite,
offline com horário real preservado e falha do Drive com retentativa.

Ele roda a cada alteração. Se algo dessa lista quebrar, quebra na nossa mão e
não na frente da equipe.

**Ambiente de demonstração**: banco recriado do zero a cada execução, com
seeds fictícios (instituição, oito casas, equipe, vinte acolhidos,
medicamentos dos quatro tipos, restrições e estoque baixo de propósito).

> O ensaio já encontrou uma lacuna real: o ambiente não tinha **nenhum
> medicamento**, e o §33.3 pede "medicamentos variados". A demonstração
> mostraria a parte fácil e deixaria de fora o módulo onde o erro custa mais
> caro. Corrigido com o seed da Fase 4.

---

## 2. Preparação — antes de qualquer acesso da equipe

| # | O que | Quem | Pré-condição |
|---|---|---|---|
| 1 | Confirmar códigos e nomes reais das oito unidades | Gestor Geral | os códigos AI1–AI4/ARM1–ARM4 ainda são preliminares |
| 2 | Cadastrar a equipe real da Casa 03 por setor | Coordenação | e-mails institucionais individuais criados |
| 3 | Registrar a escala 12×36 vigente | Coordenação | falta o documento do §33.3 |
| 4 | Conferir o limite de vagas da casa | Coordenação | 20 é o padrão; alterar exige motivo registrado |
| 5 | Registrar o aparelho institucional | Gestor Geral | é um só, e fica com a técnica/coordenação |
| 6 | Definir a chave do cofre de acessos (`CREDENTIAL_KEY`) | TI | fora do código, no ambiente |
| 7 | Conta institucional aprovada para o Drive | TI + Gestor Geral | pasta compartilhada criada, com as áreas separadas |

**Nada de dado real entra antes do item 6.** O cofre de acessos sem chave
própria é um cofre com a fechadura do fabricante.

---

## 3. Migração dos vinte perfis

A migração é feita **pela equipe técnica, pelo sistema**, não por importação
de planilha. A razão é operacional, não técnica: o cadastro completo tem
campos que a planilha atual não tem (motivo judicial estruturado, guia,
referência familiar autorizada, cuidados essenciais), e preenchê-los uma vez,
lendo o prontuário, é o que transforma a migração em revisão de dados.

Vinte cadastros, dois por dia, é uma semana e meia — e é a semana em que a
equipe aprende o sistema com as crianças que ela conhece.

Ordem sugerida por acolhido:

1. cadastro completo (identificação, acolhimento, judicial);
2. saúde: alergias, condições, restrições alimentares;
3. prescrições vigentes, conferidas com a Enfermagem;
4. escola e prontuário de educação;
5. benefícios e acessos, pela coordenação, com reautenticação;
6. compromissos fixos na agenda (fono, terapia, curso, visita).

Ao final de cada dia: conferir na tela "os 20" se o que foi cadastrado bate
com o que a equipe sabe de cor. Divergência encontrada aqui é barata.

---

## 4. Treinamento — três encontros curtos

Não existe treinamento de sistema para quem trabalha em plantão de 12 horas.
Existe **treinamento de tarefa**: a pessoa faz o que ela já faz, na tela.

**Encontro 1 — educadores (1h, no início do plantão)**
Linha do tempo do dia, confirmar atividade, registrar exceção com
justificativa, chamada, passagem individual no fim do turno. Cada um faz a
própria passagem no ambiente de demonstração, com os perfis fictícios.

**Encontro 2 — Líder Diurno, técnica e coordenação (1h30)**
Agenda (marcar com data, hora, repetição e responsável), ATA e fechamento com
pendência, ocorrência, acompanhamentos, aprovações, transferência.
Coordenação também: equipe, limite da casa, benefícios e cofre de acessos.

**Encontro 3 — Enfermagem (1h)**
Prescrição, agenda de doses, confirmação, evolução de saúde com as duas
assinaturas, triagem, Resumo de Saúde.

Material: o próprio sistema, com dados fictícios. Nada de apostila — o que
não se aprende fazendo, não se lembra às 3h da manhã.

---

## 5. Operação em paralelo — quatro semanas

O papel continua. Não como plano B envergonhado: como **fonte de verdade**
até a última semana. Quem preenche os dois é a mesma pessoa, e é por isso que
o paralelo precisa ser curto.

| Semana | O que roda no sistema | O que fica no papel |
|---|---|---|
| 1 | linha do tempo, chamada, atividades | tudo o que já é papel hoje |
| 2 | + passagem individual e ATA | ATA em papel, para comparar |
| 3 | + medicação, ocorrência, agenda | folha de medicação em papel |
| 4 | tudo | papel só para conferência do dia |

**Ritual diário do paralelo (10 minutos, no fim do turno diurno):** a
coordenação compara a ATA do sistema com a do papel e anota as diferenças. A
diferença é o dado mais valioso do piloto inteiro — cada uma é o sistema
pedindo algo que a casa não faz, ou deixando de perguntar algo que a casa faz.

---

## 6. O que decide se o piloto deu certo

Nenhum destes critérios é sobre "o sistema funcionou". Todos são sobre a casa.

| Critério | Como se mede | Meta |
|---|---|---|
| A passagem individual chega ao próximo turno | passagens assinadas / educadores no plantão | ≥ 90% na semana 4 |
| A ATA fecha no dia | ATAs fechadas no próprio dia | ≥ 90% |
| A medicação é confirmada na hora | doses confirmadas em até 30 min do horário | ≥ 95% |
| O registro é mais rápido que o WhatsApp | tempo medido, com cronômetro, em 5 passagens | ≤ 3 min por passagem |
| A equipe encontra o que procura | 5 tarefas cronometradas, sem ajuda | 4 de 5 sem travar |
| Nada se perde na falta de internet | operações offline aplicadas na reconexão | 100% |
| O documento chega ao Drive | itens verificados / itens fechados | ≥ 98% |

E um critério que não é número: **ao fim das quatro semanas, a equipe prefere
o sistema ao papel.** Se não preferir, o piloto não terminou — mesmo que todos
os números acima estejam verdes.

---

## 7. Riscos do piloto, e o que fazer com cada um

**A equipe volta para o WhatsApp.** É o risco mais provável, e não se resolve
com proibição: se registrar aqui for mais lento, o aplicativo ganha. Medir o
tempo (critério 4) é o que transforma isso em problema visível na semana 1, e
não em fracasso silencioso na semana 4.

**A medicação offline com um aparelho só.** A Fundação tem UM aparelho
institucional, e ele não fica com quem faz o plantão. Na prática, a confirmação
offline de medicamento não existe para o educador — ele confirma online. Isso
está registrado em `pendencias-institucionais.md` com três saídas possíveis; o
piloto é onde se descobre se dói.

**O paralelo cansa.** Preencher duas vezes é desgastante e gera resistência
que parece rejeição ao sistema. Por isso quatro semanas, com escopo crescente,
e não "até estabilizar".

**Cadastro incompleto vira débito.** O que entrar sem motivo judicial, sem
referência familiar ou sem cuidado essencial fica invisível — e reaparece na
primeira audiência. Conferência ao fim de cada dia de migração.

**A escala não está no sistema.** Sem `work_schedule`, as pendências de
passagem caem no vínculo da casa e o aviso de "fora da escala" na agenda não
funciona. É o item 3 da preparação, e é pré-requisito, não enfeite.

---

## 8. Expansão — depois, e só depois

Uma casa por vez, com duas semanas de intervalo, na ordem que a Fundação
escolher. Cada casa nova repete os itens 2 a 4 da preparação (equipe, escala,
limite) e faz **uma semana** de paralelo, não quatro: o que se aprende no
piloto é justamente o que encurta o resto.

A Casa 03 continua sendo a referência: mudança que der certo lá vale para as
outras; mudança pedida por uma casa só é conversa antes de virar código.

---

## 9. O que ainda falta da Fundação

Do §33.3, recebidos: livro ATA, ATA dos líderes noturnos, modelo de evolução
de saúde, prontuário de educação, audiência concentrada, dados bancários.

Faltam:

1. **folha real de administração de medicamentos** — a mais importante. É o
   único módulo ainda desenhado a partir do documento e não do papel que a
   casa usa, e é onde o erro custa mais caro;
2. **agenda/rotina real** (diária e semanal), para a rotina do sistema nascer
   igual à da casa;
3. **formulário de ingresso/PIA**;
4. **modelo de passagem individual** — hoje a nossa é uma proposta: três campos
   (o que foi feito, o que fica pendente, o que o próximo turno precisa saber),
   assinatura individual e **complemento** para o que a pessoa lembra depois,
   ao lado da passagem e nunca por cima dela. É o desenho a conferir com o
   papel quando ele chegar;
5. **formulários de ocorrência e contenção**;
6. **exemplo de escala 12×36**, com os horários da técnica e da Enfermagem.
