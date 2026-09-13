# PARA A REUNIÃO — o que falta, e o que eu preciso perguntar

> Gerado em 13/09/2026, na fase 103. Reúne num lugar só o que está espalhado
> pelo `REDE-ACOLHER.md` (§9, §10, §10.5, §11, §12) — para a conversa não
> precisar caçar. **Cada item diz onde está a versão completa.**
>
> Nada aqui é problema de código. O sistema está construído e verificado; o que
> falta é decisão de gente, e é por isso que este documento existe.

---

## 1. Onde o sistema está, em cinco linhas

- **103 fases.** 70 suítes e 677 testes, verdes em duas condições de relógio
  (de dia, e às 23h com o servidor já no dia seguinte).
- O sistema **sobe compilado num banco virgem**, o backup restaura e o cofre
  abre com a chave certa — e reprova com a errada.
- O **protótipo** é um arquivo só, abre sem internet, e percorre 123 telas nos
  sete cargos sem violação de acessibilidade.
- O **roteiro do Marcelo** tem 49 tarefas, todas com porta conferida.
- **A fila de pedidos de 09/09 acabou:** os catorze estão entregues.

**O que ninguém ainda fez:** aplicar o roteiro com a equipe. Nenhuma das
entregas das últimas semanas foi vista por quem vai usar.

---

## 2. As três perguntas que mais destravam

Se a reunião só der tempo para três, que sejam estas.

**1. O que o Gestor Geral precisa ver de cada casa?** *(roteiro §8, pergunta 9)*

Ele pediu uma forma prática de saber "como está o andamento da vida das
crianças" em cada casa, sem entrar criança por criança, e foi explícito: **nada
de competição**. Não construí, porque adivinhar isso já deu errado uma vez — a
tela do trabalho social, com os marcos de vida, nasceu de *outro* pedido, de
04/09, e não responde a esta pergunta.

*O que eu preciso:* que parâmetros dizem isso a ele. Escola e frequência? Saúde
em acompanhamento? Convivência familiar? O que está parado esperando alguém?
**Nas palavras dele**, mesmo que desorganizadas.

**2. A escala 12x36 vigente da Casa 03.** *(§11, item 1)*

A tela existe desde 08/09; falta o conteúdo — quem trabalha quando. Sem isso o
sistema não sabe quando o plantão termina, e **o aviso de meia hora antes do
fim do plantão não pode existir**, que foi pedido dele.

**3. Quem responde pela LGPD, e o que se apaga.** *(§11, item 10)*

Trava o piloto inteiro, porque decide o que pode entrar de dado real.

---

## 3. As perguntas do roteiro (§8) — nascem de aplicar com a equipe

Estas têm de ser respondidas **depois** de a equipe usar o protótipo, não antes.

| # | Pergunta |
|---|---|
| 1 | Como a casa quer receber os relatórios obrigatórios |
| 2 | O convite de primeiro acesso para 40 pessoas, sem senha por mensagem |
| 3 | "Se houve alteração" na volta da família **não virou** sim/não — ele pode discordar |
| 4 | O que a equipe pediu a mais durante a aplicação |
| 5 | O lembrete de prazo e o pente-fino semanal (ver §4 abaixo) |
| 6 | A folha da portaria **não lista quem não entra**. A casa quer uma segunda lista, só com nome e foto, sem motivo? Decisão dele **com o DPO** |
| 7 | A agenda de consulta não entrou no que a coordenação liga e desliga: o educador em plantão deve ver os compromissos da casa dele? Se sim, vale para as **oito**, decidido uma vez |
| 8 | O estatuto é escrito só pela coordenação, e **as crianças não têm onde discordar**. Existe assembleia? Se não existe, o sistema não deve fingir que houve participação |
| 9 | A visão de cima do Gestor Geral (é a pergunta 1 da §2 acima) |

---

## 4. Travados esperando a casa — não é código *(§10.5)*

| # | O que falta saber | O que trava |
|---|---|---|
| 1 | A escala 12x36 vigente | O aviso de meia hora antes do fim do plantão |
| 2 | O lembrete de prazo: vencendo **o quê**, e com quantos dias? | Atividade, documento, PIA, receita? A antecedência muda o desenho |
| 3 | O pente-fino semanal: **em que dia**? | Ele o quer semanal; falta o dia |

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
| **6** | ⚠️ **O que o Gestor Geral vê ANTES de abrir um relato restrito.** Só a contagem, como nos documentos, ou também data e autor? **Enquanto não houver resposta, a tela não será construída** — inventar isso é decidir quanto da narrativa de uma criança vaza antes da justificativa |
| 7 | De onde a técnica escolhe as fontes de um acompanhamento — linha do tempo, ocorrências, ou evoluções de saúde? Cada opção é uma tela diferente |
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

## 9. O que eu faria a seguir, se a reunião não mudar nada

1. **Aplicar o roteiro com a equipe** — é o único item que não posso fazer
   sozinho e o que mais muda o sistema.
2. Levar a folha da portaria ao **DPO**.
3. Resolver o **SMTP**, sem o qual não há primeiro acesso.
4. Pedir a **folha real de medicamentos**, que é o módulo mais arriscado.

Enquanto isso, sigo achando defeitos por varredura — as últimas fases acharam
seis reais —, mas o retorno está caindo, e nada disso muda a vida da Casa 03.
