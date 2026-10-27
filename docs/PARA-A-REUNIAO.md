# PARA A REUNIÃO — o que falta, e o que eu preciso perguntar

> Gerado em 13/09/2026 na fase 104, revisto em 15/09 na fase 120, em 19/09 na
> fase 126, em **20/09**, quando quatro perguntas foram respondidas de uma vez
> (§4.5 e §5), e em **21/10**, depois da fase 232, com a pauta do §0.

---

## 0. A pauta de 21/10, para a conversa com o Marcelo

> Refeita em 21/10, depois da fase 232, conferindo cada item do resto deste documento, do §10,
> do §11 e do §12.0 contra o código. **O código do piloto está pronto.** O que separa o sistema
> da Casa 03 agora são as respostas abaixo, documentos de papel e pessoas. O resto deste
> arquivo é o histórico das perguntas; esta seção é a que se leva para a mesa.

### Se só der tempo para cinco

1. **Onde o sistema roda.** O servidor próprio do Pão está decidido (14/10). Falta saber
   que máquina é, quem da TI cuida dela, o endereço (por exemplo `rede.paodospobres.com.br`)
   e quem emite o certificado. Sem isso nenhum passo da instalação começa (§12.0, etapa 1).
2. **O e-mail institucional.** Qual é o provedor do `paodospobres.com.br`, qual endereço
   manda os convites, quem mexe no DNS, e se cada pessoa da Casa 03 tem e-mail próprio.
   Sem e-mail não há primeiro acesso nem *esqueci minha senha* (§12.8).
3. **Quem é o encarregado da LGPD (o DPO).** Seis assuntos estão esperando por ele (bloco C
   abaixo), e a regra da casa é que dado real só entra depois disso.
4. **A folha real de administração de medicamentos**, a de papel que a Casa 03 usa hoje. É o
   único módulo desenhado pelo documento e não pelo papel, e é onde o erro custa mais.
5. **As datas e as pessoas**: quem da Casa 03 faz o roteiro, quando começa o treino e quando
   começa o piloto de quatro semanas.

### A. Para ir ao ar: perguntas para o Gestor Geral e a TI

| # | Pergunta | Onde está |
|---|---|---|
| A1 | A máquina: sistema operacional, memória, disco, se fica ligada o tempo todo, e quem tem acesso a ela | §12.0, etapa 2 |
| A2 | O endereço na internet, o certificado (HTTPS) e se o servidor é alcançado de fora do prédio. **Sem HTTPS a câmera, o microfone e o aviso no celular não funcionam** | §12.9, §12.11 |
| A3 | Os **dois discos espelhados** (RAID 1) no servidor. Se não houver, é a compra mais importante | §12.4.1, §4.25 |
| A4 | **Onde fica a cópia fora do prédio** (outro prédio do Pão ou nuvem da Fundação), e quem roda o ensaio de restauração uma vez por mês | §12.4.1, §4.25 |
| A5 | O e-mail: provedor, remetente (uma conta ou apelido que não seja de ninguém), quem administra o DNS (SPF, DKIM, DMARC), e se a equipe abre e-mail no celular ou só no computador | §12.8 |
| A6 | A **conta do relógio**: uma conta de serviço, e não de pessoa, para o que o sistema gera sozinho (as doses do dia às 5h, os avisos). E quem recebe o aviso quando ele falha | §12.7 |
| A7 | Um **lugar à parte para o treino**, com o banco de demonstração das oito casas fictícias, separado do de produção | §12.0, etapa 3 |
| A8 | **A Acolhe+AI com a chave:** liga no piloto? Quem abre a conta na Anthropic, quem paga, e qual o limite de gasto por mês. Sem a chave ela funciona como guia, sem conversar | §12.12 |
| A9 | **O aviso no celular:** liga no piloto? Precisa de duas chaves geradas na instalação e da saída do servidor para os serviços de aviso do Google e da Apple | §12.11 |
| A10 | **O Drive:** para o piloto basta a pasta no servidor com a cópia de segurança, ou tem de ser o Google Drive compartilhado da Fundação? O critério *o documento chega ao Drive* do piloto depende disso | §9, §13.5 |

### B. Os documentos e os dados que preciso receber

**Os formulários de papel que a casa usa hoje** (fotografados ou digitalizados, **com os nomes
tapados ou em branco**: só o modelo, nunca o preenchido):

1. A folha de administração de medicamentos (a prioridade).
2. A rotina real da casa, a do dia e a da semana.
3. O formulário de ingresso e o modelo do PIA.
4. O modelo de passagem de plantão individual, se existir (a do sistema é uma proposta).
5. Os formulários de ocorrência e de contenção.
6. Um exemplo de escala 12x36, com os horários da técnica e da Enfermagem.
7. **Os protocolos da casa** para fuga, emergência de saúde, violência, pessoa no portão
   dizendo ser da família e telefonema da família. A Acolhe+AI responde a essas situações
   com frases que eu escrevi (§4.17 e §4.19), e elas têm de dizer o que o protocolo diz.

**Os nomes das casas** (para trocar os provisórios AI1 a AI4 e ARM1 a ARM4): o código, o nome,
o tipo (o protótipo já disse *Acolhimento Republicano Masculino*), o público (crianças,
adolescentes ou jovens), o endereço e o número de vagas de cada uma (§4.29).

**Os dados de partida da Casa 03**, só para a implantação e só depois do bloco C:

- a equipe, com nome, cargo e e-mail de cada pessoa;
- a escala 12x36 vigente;
- **quanto do histórico em papel entra** (só o que está valendo, ou os últimos meses também).
  O cadastro das vinte crianças é feito pela equipe técnica, na tela, dois por dia (§13.2), e
  não por planilha.

### C. Para o DPO: o que ele precisa ver antes de o dado real entrar

| # | O assunto | Onde está |
|---|---|---|
| C1 | Quem responde formalmente pela LGPD, **por quanto tempo se guarda cada coisa** e o que se apaga quando alguém pede | §11, item 10 |
| C2 | A **folha da portaria** com CPF e foto 3×4 de familiares impressos, que fica na guarita, e o CPF e o RG mascarados na tela da portaria | §11, item 12; §4.9 |
| C3 | A **Acolhe+AI**: o texto da conversa e os anexos vão à Anthropic (aprovado pela Fundação em 08/10; falta o registro) | §12.12 |
| C4 | O **ditado**: no Chrome, o áudio vai ao Google. A tela avisa no primeiro uso | §12.12 |
| C5 | **O sistema no celular pessoal**: o que se registra sem sinal fica guardado no aparelho sem cifra até o sinal voltar. Precisa de uma política de uso do celular pessoal, ou de aparelhos da casa | §9 |
| C6 | O **reconhecimento de rosto nas fotos não foi feito** (é dado biométrico de criança). Se a Fundação quiser, a conversa começa por ele | §4.22 |

### D. Para assinar, antes do piloto

- **Os critérios do §13.5** do documento: passagem assinada, ATA fechada no dia, dose
  confirmada na hora, o registro mais rápido que o WhatsApp, e a equipe preferindo o sistema
  ao papel no fim das quatro semanas. Falta a Fundação dizer que são esses.
- **Os relatórios obrigatórios** do piloto: quais a casa precisa tirar do sistema desde a
  primeira semana (§11, item 7).

### E. As pessoas

- Quem da Casa 03 faz o **roteiro** (56 tarefas, `docs/roteiro-marcelo.docx`), uma pessoa de
  cada cargo, com alguém que pede a tarefa e anota sem explicar.
- **Duas pessoas para o teste cronometrado**: quanto tempo leva registrar uma dose, uma
  ocorrência e uma passagem (é a condição de sucesso do piloto).
- **Um Android e um iPhone de verdade** para as cinco tarefas da §4.27 (ditado, câmera,
  documento, galeria, aviso), já no servidor com HTTPS.
- Quem da coordenação lê o **Guia do sistema** uma vez e diz o que ficou difícil (§4.31).

### F. As decisões de produto que continuam abertas

Nenhuma trava o piloto. Cada uma é uma linha de código, e o que está entre parênteses é o que
vale hoje.

**Da rotina da casa:**

1. A grade de medicação para a parede: serve como está? (sem diagnóstico, com o aviso na folha; §10, item 5)
2. O pente-fino semanal: em que dia da semana? (ainda não existe; §4, item 3)
3. Fralda, mamadeira e chupeta como marcadores por criança na chamada: a casa quer? (não existe; nunca por idade)
4. O prazo de triagem da Enfermagem: 24 horas está bom? (24 horas)
5. Travar o acesso fora do horário do plantão: liga? (desligado; ligar no piloto bloquearia trabalho legítimo; §11, item 2)
6. O diário da internação com campos fixos: quais campos e quais obrigatórios? (texto livre por tipo)
7. A lista de origens do remédio: compra, doação, farmácia pública, família, hospital e outro. Falta alguma? (§4.10)

**De quem faz o quê:**

8. O Gestor Geral muda o horário dos turnos da casa? (não, só coordenação, técnica e Líder Diurno; §4.9)
9. Quem cria a conta da portaria? (§4.9)
10. A Enfermagem corrige o cadastro da criança, ou só a saúde? (só a saúde; §4.5, pergunta 4)
11. O Gestor Geral decide a saída da criança? E a portaria vê para onde ela pode ir? (o gestor não decide; a portaria vê o que vale, sem o motivo; §4.20)
12. Quem define as chamadas da casa? (coordenação, técnica e Líder Diurno; §4.23)
13. O educador fica sabendo que houve atendimento técnico, sem o conteúdo? (não; §4.24)
14. O educador vê os compromissos da casa na agenda? (§3, pergunta 7)
15. A Acolhe+AI abre algum dos formulários que ficaram de fora (remédio, relato da própria pessoa, decisão sobre a criança, contenção)? (não; §1)

**Do perfil da criança:**

16. As ocorrências da criança no perfil, só para técnica e coordenação? (fora do perfil; §4.18)
17. As amizades na Vida na casa? (não existe; é registro sobre duas crianças; §4.21)
18. A foto de identificação continua sem botão de baixar? (sem baixar; §4.5, pergunta 3)
19. Uma segunda lista na portaria, de quem não entra, só com nome e foto? (não existe; com o DPO; §3, pergunta 6)
20. O estatuto da casa: existe assembleia das crianças? (o estatuto é escrito pela coordenação; §3, pergunta 8)

**Da tela, depois de a equipe usar:**

21. A portaria ganha o Guia do sistema? (sem o Guia; §4.31)
22. Se a tela ainda parecer cheia: o histórico recolhido, as ações num botão só, ou os avisos e ajustes juntos? (só a explicação recolhida; §4.30)
23. A resposta da Acolhe+AI aparecendo enquanto é escrita: é a próxima melhoria que eu faria (§4.28)
24. Quartos e camas no sistema: é útil no plantão? (não existe; §4.29)
25. Os anexos da mensagem: 15 MB por envio, o mesmo tipo para os anexos de uma ocorrência, o nome neutro na ATA? (como está; §4.32)

**Do que veio da comparação com o andamento de outra IA (22 e 23/10, §4.33):**

26. O protótipo com a leitura do papel embutida pesa 7,6 MB: fica assim, ou a leitura fica só no sistema instalado? (fica embutida; §4.33)
27. A planilha também nos outros relatórios (cozinha, remédios, visitas), com o DPO? (só no período da casa; §4.33)
28. A árvore da família entre gerações, com irmãos em outras casas e retornos? (não existe; com o DPO; §4.33)
29. A IA num computador do Pão (modelo local), em vez do Claude pela chave institucional? (**respondido em 23/10: só o computador do Pão, sem custo e sem limite por pessoa**; o código é a fase 239; falta a máquina com placa de vídeo; quando ela vier, o `instalar.sh` confere se responde e se tem o modelo (fase 247); §4.33)
30. Prazo de guarda das fotos e documentos, e o depósito e as finanças da casa no sistema? (nada se apaga; não existem; §4.33)

### O que já foi respondido e este documento ainda perguntava

Conferido em 21/10 contra o código: o prazo do convite (continua 24 horas, 08/10), a
Coordenação Geral receber os graves (fase 178), o PIA, a receita e a vacinação avisando antes
(fases 178 e 191), a barra no pé e o topo compacto no celular (fase 184) e o painel do Gestor
contando o conceito escolar (fase 137). Nada disso volta à mesa.

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

- **A Acolhe+AI** (fase 192, pedido de 08/10): a assistente em todas as telas,
  com a equipe virtual, que explica o sistema, leva às telas, lê os dados com o
  acesso de quem pergunta, lê anexos e propõe onde guardar, fala e ouve, e anota as
  sugestões de melhoria. Ela nunca grava sozinha: a pessoa confirma, e o registro
  sai no nome dela. **Depende da chave na instalação** (§12.12); sem ela, e no
  protótipo, funciona no modo guia. **Para o DPO:** o texto da conversa e os anexos
  vão à Anthropic, e o microfone do Chrome manda o áudio ao Google.
- **A Acolhe+AI preenchendo a tela** (fase 193, pedido de 08/10): com a licença da
  pessoa, uma vez por conversa, ela abre o formulário e escreve nos campos à vista, e
  quem salva é sempre a pessoa. Faz conta exata e monta tabela que baixa como planilha
  (notas, armário, remédios), e escreve como colega, sem travessão nem lista. E virou
  regra: **o que o sistema ganha, ela aprende na mesma fase**, e um teste cobra.
  **Para decidir:** ela abre hoje 36 formulários de criação (agenda, ocorrência, compra,
  pedido à cozinha, combinado, cadastro, alergia, diário da internação e outros). Ficaram
  de fora, por cautela, os de remédio (esquema, dose dada, medicação do hospital), os em
  que o texto tem de ser da própria pessoa (o meu relato, a ciência, a fala espontânea,
  registrar pelo colega), as decisões sobre a criança (saída, sair sozinho), a contenção,
  o cofre, os encerramentos, a correção de ATA fechada e a comunicação externa. Deixar
  algum deles com ela, ou manter assim?
- **A câmera do sistema** (fase 194, pedido de 10/10): todo lugar que recebe anexo tem
  Abrir a câmera e Digitalizar documento, com o visor ao vivo e o X e o certo de cada foto.
  O documento de várias páginas vira um PDF só, com a letra realçada. A Minha conta mostra
  se a câmera está permitida neste aparelho. E apareceu um defeito antigo, já consertado: o
  PDF escaneado do hospital não entrava desenhado no relatório da internação.
- **O relatório pela voz** (fase 195, pedido de 10/10): todo campo de texto longo tem um
  microfone, e a Acolhe+AI organiza o que a pessoa falou num rascunho, que ela confere,
  completa falando, ilustra com foto e leva para a tela certa antes de salvar. E a Acolhe+AI
  foi pedida em cada tela de cada cargo, por texto e por voz: alcança todas, e desde a fase
  196 também dentro do perfil da criança (*quero registrar a alergia do Bruno*), do dossiê, da
  internação aberta e do acervo: os 36 formulários do sistema. **Para o DPO:**
  o ditado usa o reconhecimento do navegador; no Chrome, o áudio vai ao Google.
- **248 fases.** 159 suítes e 1412 testes, verdes em duas condições de relógio —
  antes e depois da virada do UTC, que em Porto Alegre é às 21h.
- **O aviso no celular** (fase 189, decidido em 06/10): quem liga na Minha conta
  recebe no celular todos os avisos do sino, mesmo com o sistema fechado. Na
  tela bloqueada aparece só *Rede Acolher: há um aviso para você na Casa 03*; o
  conteúdo, só entrando. Sair do sistema desliga naquele aparelho, por causa do
  tablet da casa. **Depende da implantação**: as chaves, o HTTPS e a saída para
  os serviços de push (§12.11 do documento). A primeira entrega num celular de
  verdade se confere lá, não daqui. Na fase 190 ele passou a tentar de novo o
  aviso que não saiu (servidor que caiu, serviço de push fora do ar).
- **Entrar e esqueci minha senha** (fase 188, pedido de 05/10): a tela de entrada
  abre vazia, com e-mail e senha juntos. Quem esqueceu pede um link que vai ao
  e-mail cadastrado, vale uma hora e serve uma vez; a tela responde igual para
  e-mail cadastrado ou não. As duas etapas (fase 187) saíram por completo, como
  pedido. **Depende do SMTP institucional (§12.8 do documento)**: sem ele, o
  e-mail não sai, e quem administra a conta continua redefinindo pela Equipe.
- **O que mudou desde o meu último plantão** (fase 186): o Dia abre com um cartão
  das ocorrências, da ATA anterior e dos remédios que começaram, foram suspensos
  ou mudaram desde o fim do plantão da pessoa (quem não está na escala vê as
  últimas 24 horas, e nunca mais de uma semana). Só o que o cargo já lê, sem o
  texto da ocorrência nem o motivo da suspensão. Ficaram de fora, como decidido,
  quem chegou ou saiu e os avisos; se a casa sentir falta, entram depois.
- **A saúde da implantação** (fase 185): o relógio das 5h, o aviso de meia hora,
  o backup, a restauração conferida, o e-mail e a fila do Drive numa tela só,
  para o Gestor Geral e a Coordenação Geral. Cada um aparece *em dia*, *atenção*
  ou *parado*, com o que fazer. A tela não avisa sozinha: mostra quando alguém
  abre. Se a Fundação quiser que o *parado* vire aviso no sino, é uma decisão.
- **O sistema foi aberto no celular, cargo por cargo** (fase 184): 300 telas a
  360 e 390 px, e o percurso inteiro de uso apertando os botões num celular.
  Abas de baixo com o nome cortado, botões encostados onde o dedo erra para o
  vizinho e abas internas que não cabiam foram consertados; hoje nenhuma tela
  tem achado. A barra das abas foi para o pé da tela e o topo virou uma linha
  (escolhas de 05/10, §4.16).
- **O pedido de 25/09 está fechado** (fase 166). Uma simulação de dois dias e
  do dia de hoje na Casa 03 conferiu os relatórios contra os fatos, e achou
  três coisas: **não havia como cadastrar alergia nem restrição alimentar**
  (agora há, no perfil, pela Enfermagem, técnica e coordenação), a regra dessas
  tabelas não conferia a casa da criança, e **a ATA em Word não trazia o que a
  equipe escreveu no turno** (agora traz, com nome e hora). O relatório final,
  com a matriz de tudo o que foi pedido e do que ficou para depois, está em
  `docs/historico/relatorio-final-da-auditoria-25-09.md`.
- **A internação tem relatório completo em Word** (fase 165): capa, os dias em
  ordem, e os anexos dentro do documento, inclusive as páginas dos PDFs do
  hospital. O anexo agora se tira pela câmera do celular, pela galeria ou pelo
  computador, com prévia antes de enviar. A escala do mês seguinte pode começar
  pela do mês anterior, como rascunho que só quem monta vê. E um registro antigo
  mostra o cargo que a pessoa tinha quando escreveu. A pergunta que tinha ficado
  (§10, item 12) foi respondida em 27/09: **a Enfermagem baixa o relatório da
  internação**, com finalidade e registro (fase 170).
- **Os documentos foram reescritos na voz da equipe** (fase 164, pedido de
  27/09). Toda folha, relatório e o **roteiro da Casa 03** saem agora em
  linguagem institucional de acolhimento, e há teste que cobra a regra. **O
  roteiro mudou de texto, não de tarefas:** a numeração é a mesma, e o Word
  (`docs/roteiro-marcelo.docx`) foi gerado de novo. Quem já imprimiu a versão
  anterior pode descartá-la.
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
- O **protótipo** é um arquivo só, abre sem internet, e percorre 157 telas nos
  cargos, em cada um dos oito temas (1256 ao todo, com as folhas da cor e da busca), sem violação de acessibilidade. O oitavo, desde 11/10, é o **Rio Grande do Sul**, com as cores da bandeira.
- O **roteiro do Marcelo** tem 56 tarefas, todas com porta conferida.
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
| 2 | O lembrete de prazo: vencendo **o quê**, e com quantos dias? | ✅ **O PIA foi respondido em 28/09** (30 dias antes, fase 178), e **a receita e a vacinação em 08/10** (10 e 15 dias antes, à Enfermagem e à técnica e coordenação, fase 191). **Ficaram sem aviso, por decisão:** a declaração de matrícula e o curso |
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

## 4.9 Duas coisas de 26/09 que o Marcelo precisa saber

- **Cada casa define o horário dos seus turnos** (fase 159), pela coordenação,
  pelo Líder Diurno ou pela equipe técnica; vale a partir do dia seguinte. **O
  Gestor Geral não foi incluído**, porque o pedido nomeou os três — se ele deve
  poder, é uma linha.
- **A portaria ganhou login mínimo** (fase 160, FEITA, decidido em 26/09): ela vê
  só quem pode visitar a casa dela e registra entrada e saída — não abre perfil,
  saúde, relato nem ATA. **Isto revê o pedido de 09/09**, em que a portaria
  ficava só com a folha em papel; a folha continua, para o dia sem sinal.
- **Fora do dia, do horário ou da validade combinados, a entrada é recusada.**
  A exceção é da coordenação, da técnica ou do líder, com motivo escrito, e fica
  na visita. A portaria não abre exceção.
- **As visitas de cada criança aparecem no perfil DELA, e só nele**, com os
  visitantes por nome e o número ao lado. A regra que era *"nenhuma contagem por
  criança"* passou a ser *"nenhuma comparação entre crianças"*. **O que o Marcelo
  precisa confirmar:** quem cria a conta da portaria hoje é a coordenação, a
  equipe técnica ou o Gestor Geral — e o **DPO** deve saber que o CPF e o RG do
  visitante aparecem mascarados para a portaria (do CPF, só os dígitos do meio; do RG, os três finais).

## 4.10 O armário e a nota fiscal (fase 161, decidido em 26/09)

- **O saldo do armário pode ficar negativo**, com o aviso *"conferir o
  armário"*: a dose nunca é bloqueada, e o número passa a contar a verdade.
- **A nota fiscal não dá entrada no armário** — ela presta contas; a entrada
  continua sendo lançada por quem guarda a caixa.
- **Nota repetida é recusada** (mesmo CNPJ e número, na mesma casa).
- *O que o Marcelo pode querer rever:* hoje a lista de origens do remédio é
  compra, doação, farmácia pública, família, hospital e outro.

## 4.11 A cozinha (fase 162, decidido em 26/09)

- **"Selecionar todos" grava um pedido por criança**, juntos: se uma das
  marcadas não está na casa, nada é gravado e a tela diz por quê.
- **O pedido se edita** por quem pediu, pela coordenação, pela técnica e pelo
  líder, **até o dia do pedido**; depois, só cancelar. O antes fica guardado.
- **As refeições da casa** aparecem por refeição, nunca por criança.
- *Defeito corrigido que ele pode ter visto:* o relatório do período deixava de
  fora as chamadas do ÚLTIMO dia escolhido.

## 4.12 A tela (fase 163, pedido de 27/09)

- **Três temas**: claro, escuro e **alto contraste**, no botão redondo do alto
  (o de meia-lua). Vale no sistema de verdade, e cada aparelho lembra o seu.
- **A Portaria em cartões**, com a foto 3×4 de cada visitante à vista. A foto é
  anexada pela **técnica e pela coordenação**, ali mesmo no portão; a portaria
  só vê.
- **A coluna do monitor** com botões novos, e o "Período da casa" com desenho
  de calendário.

## 4.13 Noventa dias de uma casa (fase 173, decidido em 28/09)

A ARM1 foi simulada do primeiro acesso da coordenação até fevereiro de 2027,
com todos os setores, e cada relatório foi conferido contra o que aconteceu. O
que ela mostrou e a Fundação decidiu:

- **A ATA diurna do fim de semana** ficava aberta para sempre, porque quem a
  fecha não trabalha no sábado e no domingo. **Na segunda, o Líder Diurno vê
  no alto da ATA as que ficaram abertas e as fecha.**
- **A dose atrasada é avisada uma vez.** Continua aguardando confirmação na
  grade e na passagem, mas o aviso não se repete todo dia.
- **As visitas no perfil da criança começam no acolhimento**, e não mais em
  1º de janeiro.
- **A criança que chega de noite** é registrada pelo educador ou pelo líder do
  plantão com o nome, a idade aproximada e quem trouxe. Ela entra na chamada e
  na ATA na hora, e a técnica é avisada para completar de manhã (a data de
  nascimento nasce estimada e se corrige com motivo).

**Duas coisas para o Marcelo saber:**
- Na chegada de noite, se a criança **já esteve na Fundação**, o plantão não
  tem como saber, e ela entra como cadastro novo. De manhã, a técnica confere:
  se era um retorno, o caminho é o Acervo histórico, e o cadastro provisório
  fica para ser encerrado com o motivo. Juntar dois cadastros não existe.
- **O educador e os líderes passaram a ler na tela a lista das restrições
  alimentares** (o que evitar e o que servir no lugar, nunca o motivo), que
  eles já imprimiam na folha da cozinha. A Enfermagem continua fora dessa lista.

## 4.14 Um ano de casa, e as ATAs em sequência (fase 174, pedido de 28/09)

- **As ATAs do dia em sequência.** No Arquivo das ATAs, o filtro **Os dois
  turnos / Só diurno / Só noturno** vale para todos que folheiam o arquivo. A
  **coordenação, a equipe técnica e os líderes** têm também o botão **Ler o dia
  em sequência** (e ler a semana): as ATAs aparecem uma embaixo da outra, como
  saem no Word, a diurna e depois a noturna. A linha restrita continua fora;
  sai a contagem.
- **Um ano inteiro da ARM1**, simulado e conferido. Os relatórios batem com o
  que aconteceu, e nenhum levou mais que um quinto de segundo. O banco cresce
  cerca de 22 MB por casa por ano: oito casas, perto de 175 MB por ano.
- ~~**Reduzir o tamanho das fotos.**~~ ✅ **Respondido em 28/09: reduz** (fase
  175). A foto grande sai reduzida no próprio aparelho antes de enviar: até 2000
  pixels no lado maior, em JPEG de boa qualidade, perto de 500 KB. A prévia diz
  de quanto era. PDF e imagem que já é pequena vão como vieram.

## 4.15 A Coordenação Geral (fase 176, decidido em 28/09)

- **O cargo novo do Marcelo existe.** A Coordenação Geral faz tudo o que a
  coordenação de uma casa faz, nas oito: equipe, escala, ATA, visitas,
  acompanhamentos. O Gestor Geral continua olhando, pelo painel e pelos
  relatórios. **Quem marca é o Gestor Geral**, na tela da Equipe (*Tornar
  Coordenação Geral*, ou a caixa *Coordena as oito casas* no cadastro).
- **Para a conta do Marcelo virar Coordenação Geral**, o Gestor Geral aperta
  o botão na conta dele. O vínculo com a casa em que estava fecha com a data, e
  o histórico continua.
- **O que ela NÃO recebe, de propósito:** os avisos de escalonamento de cada
  casa (nas oito seria uma enxurrada), e ela não entra na escala nem na
  passagem de plantão de casa nenhuma. Se a Fundação quiser que algum aviso
  chegue a ela (por exemplo, ocorrência grave em qualquer casa), é uma decisão
  a tomar.
- **Nos documentos**, a assinatura dela sai como *Coordenação*, igual à da
  coordenação de uma casa.
- **Um ano das oito casas, simulado** (fase 177): tudo bateu, e nenhuma tela deu
  erro para o gestor, os líderes ou a Coordenação Geral. **Em um ano ela não
  recebeu nenhum aviso.** Pergunta: algum aviso deve chegar a ela? Por exemplo,
  ocorrência grave em qualquer casa, internação, ou ATA Geral assinada com
  pendência. Sem resposta, fica como está: ela sabe pelo dia das unidades e pela
  coordenação de cada casa.
  ✅ **Respondido em 28/09: só os graves.** Ocorrência grave, internação e ATA
  Geral assinada com pendência, de qualquer das oito casas (fase 178).

## 4.16 O celular (fase 184, pedido de 05/10)

O sistema foi aberto num celular de 360 e de 390 px, nos oito cargos, tela por
tela, e o percurso de uso foi feito apertando os botões como num celular. O que
era defeito foi consertado. Ficaram duas perguntas de desenho, que mudam a cara
de todas as telas e por isso são da Fundação:

1. **A barra das abas (Dia, Chamada, Acolhidos, Passagem, Mais) fica no alto e
   some quando a pessoa desce a tela.** O Dia tem cerca de oito telas de altura
   no celular; para trocar de aba é preciso voltar ao topo. Pergunta: a barra
   passa para o **pé da tela, sempre à vista**, onde o polegar alcança (como nos
   aplicativos de banco), ou fica no alto como hoje?
2. **O topo ocupa cerca de um terço da tela do celular** antes da primeira
   linha do dia: os botões (busca, cor, painel, avisos, senha), o Sair, o cargo,
   o nome, a casa e o e-mail. No Gestor Geral os botões já não cabem numa linha.
   Pergunta: no celular, o topo fica **compacto** (uma linha com a marca, a
   busca, os avisos e o círculo da pessoa; o resto vai para a folha que abre ao
   tocar no círculo), ou fica como está?

✅ **Respondido em 05/10: as duas como recomendado.** A barra vai para o pé, sempre
à vista, e o topo fica compacto; no monitor nada muda (fase 184).

## 4.17 A Acolhe+AI como colega de plantão (fase 201, pedido de 11/10)

Fiz o papel de um funcionário de cada setor e conversei com a Acolhe+AI do
protótipo como se fala no plantão. Dos 59 pedidos, uns 20 eram bem atendidos, e
os piores eram os mais sérios: *"o Kauã fugiu"* e *"a Lara tá com febre, o que eu
faço"* recebiam *"não achei essa tela"*. Consertado: a urgência vem antes da tela,
e o que fere as regras da Fundação (comparar crianças, rotular, WhatsApp,
apagar, confirmar a dose de outra pessoa) recebe um não com o porquê.

**Uma frase para a Fundação conferir**, porque é dita no pior momento do turno:

- Fuga: *"Primeiro a criança: avise agora o líder do plantão e siga o protocolo
  da casa para saída não autorizada. O registro nunca atrasa a proteção."*
- Emergência de saúde: *"Se é emergência, ligue agora para o SAMU, no 192, chame
  o líder do plantão e fique com a criança."*
- Violência: *"Primeiro a proteção: afaste a criança do risco e avise agora o
  líder do plantão e a coordenação. Se ela contar alguma coisa, acolha sem
  perguntar detalhes e escreva com as palavras dela."*
- Febre ou tombo: *"Não oriento sobre remédio nem diagnóstico: isso é da
  Enfermagem. Avise a Enfermagem ou o líder do plantão."*

Pergunta: **o protocolo da casa diz a mesma coisa?** Se a Casa 03 tem outro
primeiro passo (o telefone da Enfermagem de sobreaviso, a coordenação antes do
líder, o Conselho Tutelar na fuga), as frases mudam para dizer o da casa.

## 4.18 O perfil do acolhido (fase 202, pedido de 11/10)

A revisão do perfil achou a alergia da criança seis telas abaixo do nome (já
consertado: alergia, cuidados e remédio de hoje voltaram para o alto) e os
compromissos dela fora do perfil (já entram, com os próximos trinta dias).

Uma pergunta ficou, porque é sobre o que a casa inteira lê:

- **As ocorrências em que a criança está não aparecem no perfil dela.** A lista de
  Ocorrências mostra só *1 acolhido(s)*, sem nome, e quem está envolvido aparece
  só ao abrir o detalhe. A técnica que prepara uma audiência precisa procurar uma
  por uma. Pergunta: o perfil passa a mostrar, **só para a equipe técnica e a
  coordenação**, a lista das ocorrências da criança (tipo, data e situação, sem o
  texto), ou continua sem, como hoje?

## 4.19 Seis meses das oito casas com vinte pessoas, e a Acolhe+AI gravando (fase 205, pedido de 12/10)

As oito casas viveram seis meses juntas com vinte pessoas cada (duas técnicas, dois
líderes, onze educadores, duas na portaria, duas na cozinha e a coordenação), usando
o sistema e a Acolhe+AI. Tudo o que elas contaram bate com o banco e com os
relatórios: 4.686 doses, 37 mil refeições, 1.072 visitas, 5.816 linhas da ATA. Das
linhas, **2.904 foram escritas pela Acolhe+AI e registradas pela pessoa**, e o banco tem
todas com o nome de quem registrou. **38 contas e 1.142 telas abertas no navegador
contra o servidor de verdade, sem achado.** Duas telas da instituição passavam de um
segundo e foram consertadas (a equipe das oito e o dia das unidades, hoje entre 190 e
300 ms). O relatório inteiro está em `docs/historico/oito-casas-seis-meses-vinte-pessoas-12-10.md`.

**Mais frases da Acolhe+AI para a Fundação conferir**, como as da §4.17. Elas nasceram
fazendo o papel de cada setor outra vez, em pedidos que recebiam *"não achei essa tela"*:

- Alguém no portão dizendo ser da família: *"Não abra o portão nem entregue a
  criança. Só entra quem está na lista de quem pode visitar aquela criança, com
  documento conferido, e ninguém sai com ela sem a saída registrada pela equipe
  técnica. Chame agora o líder do plantão ou a coordenação."*
- Visitante sem documento: *"A entrada só se registra com o documento conferido. Não
  deixe entrar: chame a coordenação, a técnica ou o líder do plantão."*
- Criança chorando sem parar, pesadelo: *"Primeiro ela: fique perto, com calma e sem
  pressa, num canto mais tranquilo, e ofereça água ou colo se ela aceitar. Não precisa
  resolver agora nem perguntar o porquê."*
- A família ao telefone: *"Antes de passar o telefone, confira no perfil da criança se
  esse contato é permitido. Na dúvida, não passe e avise o líder do plantão."*
- A família que quer levar a criança no fim de semana: *"Passar dias com a família é
  convivência familiar, e quem decide é a equipe técnica."*
- O colega que não veio: *"Avise o líder do plantão e a coordenação, que resolvem a
  substituição. O sistema não conta faltas de ninguém."*

Pergunta: **é isso que a casa faz?** Se o protocolo da Casa 03 diz outra coisa (por
exemplo, a portaria chamar primeiro a coordenação de sobreaviso), a frase muda.

## 4.20 Quem decide a saída da criança, e o que a portaria vê (fase 207, pedido de 12/10)

O pedido de 12/10 mudou uma regra de 09/09. **Antes**, só a equipe técnica e a
coordenação (e o Gestor Geral) decidiam se a criança pode sair sozinha. **Agora**
decidem o educador, o líder, a equipe técnica e a coordenação, sempre com o motivo, e
quem perde a autorização tem o prazo escrito. O Gestor Geral saiu da lista, porque o
pedido não o nomeia. A portaria vê, na aba **Saídas das crianças**, o que vale para cada
criança, quem decidiu e desde quando, e para onde ela pode ir; **o motivo não aparece
para a portaria**. Quem ainda não tem decisão da equipe só sai com acompanhante.

Perguntas, só para confirmar: **o Gestor Geral fica mesmo de fora?** E **o "pode ir a"
(escola, curso) deve aparecer para a portaria**, ou só o que vale?

## 4.21 O perfil em abas (fase 208, pedido de 12/10)

O perfil da criança virou oito abas coloridas, com o que protege a criança sempre no
alto. Duas coisas para a Fundação olhar: **as amizades**, que o pedido cita na Vida na
casa, não têm lugar no sistema (escrever quem é amigo de quem é registro sobre duas
crianças, e pede cuidado); e **as ocorrências da criança** continuam fora do perfil,
esperando a resposta da §4.18.

## 4.22 As fotos: quem aparece, sem reconhecer rosto (fase 209, pedido de 12/10)

O pedido foi a IA reconhecer cada criança nas fotos e levar a foto à pasta dela. **Não
fiz, e não é por dificuldade:** reconhecimento facial é dado biométrico de criança, a LGPD
pede base legal, relatório de impacto e o DPO, e o erro de reconhecimento poria a foto de
uma criança na pasta de outra. Fiz a mesma coisa pela mão de quem guardou a foto: marcar
quem aparece. Se a Fundação quiser mesmo o reconhecimento, a conversa começa pelo DPO.

E o espaço: oito casas em dez anos dão uns 22 GB de fotos (§12.2 do documento). Cabe em
disco comum; o que precisa de atenção é o backup, que leva as fotos junto.

## 4.23 As chamadas da casa (fase 211, pedido de 12/10)

Cada casa monta as suas chamadas uma vez (nome, horário, quantas pessoas e a cor, numa
paleta de 48), e a equipe abre cada uma com um toque. **Quem define, escolhi eu:** a
coordenação, a equipe técnica e o Líder Diurno, as mesmas pessoas que definem o horário
dos turnos. Se a Fundação quiser que o educador também mude, ou só a coordenação, é uma
linha. E a cor diz só qual é a chamada: se ela foi feita quem diz é a etiqueta de sempre.

## 4.24 Os arquivos no perfil: Judiciário, saúde e atendimentos (fases 215 a 218, pedido de 14/10)

Os familiares agora se corrigem (215), a área restrita do Judiciário guarda os documentos
(216), o laudo e a receita ficam junto da alergia, da restrição e do remédio (217), e a
equipe técnica registra o atendimento com o desenho ou a folha da atividade (218). Três
escolhas foram minhas e cada uma é uma linha:

- **Quem lê o atendimento da equipe técnica:** a equipe técnica, a coordenação e a
  gestão. O plantão e a Enfermagem não leem. Se a Fundação quiser que o educador saiba
  ao menos que houve atendimento naquele dia, sem o conteúdo, dá para acrescentar.
- **Quem registra:** a equipe técnica e a coordenação. O atendimento não se edita
  depois; o que ficou errado se completa com outro registro, e os dois ficam.
- **O laudo da alergia é lido por quem abre a pasta da saúde**, o educador também,
  como os outros documentos de saúde. Quem anexa é a Enfermagem, a técnica e a
  coordenação.

## 4.25 Nada se perde, no servidor do Pão (fases 219 e 220)

**Respondido em 14/10:** nada pode se perder, e o sistema vai para o servidor próprio do Pão
quando estiver pronto. O kit está feito e provado (§12.4.1): o arquivo contínuo do banco (no
máximo um minuto entre o disco principal e o segundo), a base semanal, a cópia das fotos de
cinco em cinco minutos, e o ensaio que apaga o banco e o traz de volta até o minuto. Falta,
para quem cuidar do servidor:

- **Dois discos espelhados no servidor** (RAID 1). É o que faz um disco queimado não levar
  nada, nem o último minuto. Se o servidor ainda não tem, é a compra mais importante.
- **Onde fica a cópia fora do prédio.** Um incêndio ou um roubo leva o servidor e os dois
  discos juntos. Outro prédio do Pão ou a nuvem da Fundação, sempre cifrada e sem a chave do
  cofre junto.
- **Quem roda o ensaio uma vez por mês** (`npm run ensaio:ponto-no-tempo`), e olha a saúde da
  implantação, que agora mostra o arquivo contínuo, a base e a cópia.

## 4.26 O perfil como ferramenta de trabalho (fase 221, pedido de 14/10)

O perfil abre na **Geral**, com os dados da criança e a família; o dia de hoje saiu do
perfil e fica no Dia e na ATA; o **Dia a dia** consulta o que a casa registrou em cada dia;
os **Atendimentos** são o relatório da equipe técnica, o mais recente em cima; e cada aba
traz os números da criança. Cinco escolhas foram minhas, e cada uma é uma linha:

- **A alergia e a restrição alimentar continuam no alto, em todas as abas.** É o que
  machuca no mesmo dia se for esquecido (a lição da fase 202). Os cuidados essenciais
  foram para a Geral.
- **O remédio de hoje saiu do perfil.** Quem dá a dose usa a Saúde e o Dia, como antes; no
  perfil, a aba Saúde mostra os números dos últimos trinta dias.
- **A aba Atendimentos não aparece para o plantão e a Enfermagem**, porque eles não leem o
  atendimento técnico (pergunta 4.24). Se a Fundação decidir que o educador sabe que houve
  atendimento, a aba volta para ele só com a data e a área.
- **O PIA aparece na Geral para a equipe técnica, a coordenação e a gestão**, que é quem
  lê o PIA no dossiê.
- **O que se escreveu sobre a criança nas ocorrências** (os relatos, com a contagem do
  que é restrito) foi para o Dia a dia, junto do que a casa registrou.

## 4.27 O teste num celular de verdade (fase 222)

O `ensaio:aparelhos` simula oito aparelhos e achou quatro defeitos, já consertados. O que
ele não prova se confere com **um Android com Chrome e um iPhone com Safari**, no servidor
do Pão com HTTPS (sem HTTPS a câmera e o microfone não ligam). Cinco tarefas, dez minutos
por aparelho:

1. **Ditar um registro na ATA**, três frases com pausa entre elas. Observar: o texto sai
   inteiro, sem repetir? No iPhone, o microfone apita a cada frase?
2. **Pedir à Acolhe+AI pela voz** *abre a chamada*. Observar: ela entende com o barulho da
   casa?
3. **Digitalizar um papel de três páginas** pelo anexo, com o celular em pé. Observar: a
   folha sai inteira, sem cortar o alto e o pé? O PDF abre no computador?
4. **Anexar uma foto da galeria**. No iPhone, observar se a foto entra com a prévia (o
   iPhone costuma converter a HEIC; se não converter, ela entra sem prévia).
5. **Ligar o aviso no celular** na Minha conta, e pedir a alguém que abra uma ocorrência.

E uma escolha a confirmar: **a foto HEIC entra como veio**, sem prévia no Chrome. Converter
no aparelho pede uma biblioteca a mais no protótipo, e o iPhone quase sempre já converte.

## 4.28 A Acolhe+AI mais firme (fase 223, pedido de 16/10)

A fase consertou a conversa que quebraria com a chave ligada (as instruções mudavam no meio
dela) e deu à Acolhe+AI a hora, o turno e o primeiro nome de quem fala. Ficam quatro
escolhas, nenhuma urgente:

1. **Ler as respostas em voz alta** já existe, na caixa *Ler as respostas em voz alta* do
   painel, e começa desligado. Ligar por padrão ajuda quem está com as mãos ocupadas, e fala
   em voz alta, no meio da casa, o que a assistente respondeu sobre uma criança. Eu deixaria
   desligado.
2. **A conversa some ao recarregar a página.** Guardar no aparelho deixaria texto sobre as
   crianças no navegador do tablet da casa, que é de todos: é decisão do DPO. Eu deixaria
   como está.
3. **A resposta aparecer enquanto é escrita** (em vez de *Pensando…* até o fim). É a próxima
   melhoria que eu faria, e não muda nada do que vai à Anthropic.
4. **A primeira conferência com a chave** (§12.12 do documento) ganhou uma pergunta: *"a dose
   das 20h já passou?"*, feita depois das 20h, para ver se ela usa a hora certa.

## 4.29 As oito casas, seis meses de história e o caminho até o ar (fases 225 a 227, pedido de 19/10)

O protótipo agora tem as oito casas, cada uma com a sua equipe de dezoito pessoas, as suas
crianças e famílias, e seis meses de história em todas as telas. O caminho do protótipo ao
ar está escrito em ordem no §12.0 do documento. Ficam cinco escolhas:

1. **Os nomes e o tipo de cada casa.** Usei os da semente do sistema (Abrigo Institucional
   1 a 4 e Casa-Lar ARM1 a ARM4, vinte vagas em cada). O próprio protótipo dizia, no painel,
   "Acolhimento Republicano Masculino" com quinze vagas. Qual é o certo? E as casas ARM
   recebem crianças, adolescentes ou jovens adultos? Hoje as oito têm crianças de todas as
   idades.
2. **As outras sete casas nascem da Casa 03**, com outras pessoas e outra história, mas com as
   mesmas situações de partida (a criança com alergia, a com insulina). Se quiser que cada
   casa tenha o seu perfil próprio, é dizer como é cada uma.
3. **Quartos e camas.** O espaço da casa no sistema é endereço, vagas, turnos, chamadas e
   rotina. Saber quem dorme em que quarto é uma tela nova; ela entra se for útil no plantão.
4. **O servidor de treino.** O banco de demonstração (oito casas, seis meses) está pronto para
   a equipe treinar no sistema de verdade antes do dado real. Precisa de um lugar à parte do
   de produção, e de quem o instale (§12.0, etapa 3).
5. **A primeira decisão da lista do §12.0**: onde o sistema roda, o endereço e o certificado.
   Sem ela, nenhum passo da máquina começa.

## 4.30 O sistema menos poluído (fase 230, pedido de 19/10)

Abri todas as telas de todos os cargos, no celular e no computador, e medi: um terço do texto
era explicação de como a tela funciona. Das quatro saídas, a escolhida em 19/10 foi a primeira,
e ela está feita: a explicação fica recolhida, com a primeira frase à vista e o botão **Como
funciona** para ler o resto. Nenhuma ferramenta saiu. O alerta, o recado de que algo foi
registrado, o aviso com número e a frase que diz que o número não avalia a criança continuam à
vista. Ficam três saídas, se a equipe ainda achar a tela cheia depois de usar:

1. **O histórico recolhido.** As listas longas (visitas, combinados, acompanhamentos aprovados,
   linhas da ATA de dias passados) abririam com as cinco mais recentes e um *Ver todas*.
2. **As ações num botão só.** Nos cartões com quatro ou cinco botões (a Escala é a tela com
   mais, 165 no celular), as ações menos usadas iriam para um botão *Mais ações* em cada cartão.
   Ganha espaço, mas a ação passa a pedir dois toques.
3. **Os avisos e os ajustes juntos.** Os avisos azuis de uma tela virariam uma linha só, e os
   ajustes da casa (horário dos turnos, chamadas, rotina) iriam para uma aba própria de
   coordenação, longe da tela do turno.

**O que vale perguntar à equipe da Casa 03 no roteiro:** a explicação recolhida ajudou, ou
alguém deixou de achar o que precisava?

## 4.31 O Guia do sistema (fase 231, pedido de 19/10)

O Guia é o primeiro item do menu: cada tela explicada, com o botão que abre a tela, o que cada
cargo faz nela e o que a Acolhe+AI faz junto, as abas do perfil da criança e as novidades de
cada atualização. Daqui em diante, toda atualização põe a linha dela nas Novidades. Ficam duas
perguntas:

1. **A portaria fica sem o Guia.** Ela tem uma tela só, sem barra de menu, e o Guia seria a
   segunda porta dela. Se for útil para quem fica no portão, ele entra com um botão dentro da
   própria Portaria.
2. **O texto do Guia é para a equipe ler.** Vale a coordenação da Casa 03 ler uma vez com o
   roteiro na mão e dizer o que ficou difícil de entender.

## 4.32 Até 10 anexos por mensagem (fase 233, pedido de 22/10)

Decidido em 22/10 onde valem os dez: a linha da ATA, o diário da internação, a ocorrência, o
atendimento técnico e a conversa com a Acolhe+AI. Os outros lugares continuam com um arquivo cada,
porque cada um é um documento só. A câmera tira fotos em sequência, como no WhatsApp, e cada anexo
aparece em miniatura, com Ver e Tirar, antes de enviar. Quatro escolhas foram minhas, e cada uma
é uma linha:

1. **Quinze megabytes por mensagem, somando tudo.** É o que cabe num envio pelo celular. Dez fotos
   (perto de meio megabyte cada, depois de reduzidas) ou três documentos digitalizados cabem; um
   PDF grande do hospital vai numa mensagem própria.
2. **Na ocorrência, os anexos de uma vez têm o mesmo tipo e a mesma justificativa**, e o nome de
   exibição sai numerado (*Atendimento no posto (1 de 3)*). Tipos diferentes vão em envios
   diferentes, como antes.
3. **Na linha da ATA, o nome do arquivo não vem do aparelho**: cada um vira *foto-1.jpg* ou
   *documento-2.pdf*, porque a ATA é lida pela casa inteira e o nome do celular pode trazer CPF ou
   diagnóstico. A linha restrita esconde os anexos dela, e eles não vão ao Word da ATA.
4. **No Word da ATA, as fotos são reproduzidas no fim e o PDF fica citado** (*documento, disponível
   no registro eletrônico*). No relatório da internação, os PDFs continuam desenhados página por
   página, como antes.

E o que a mesma rodada consertou e o Marcelo pode ter visto: **o Exportar dos benefícios, no Cofre,
registrava a finalidade e não entregava arquivo**. Agora entrega o documento em Word.

## 4.33 O que veio da comparação com o andamento de outra IA (fases 234 a 236, 22 e 23/10)

A Fundação trouxe em 22/10 o andamento de um sistema parecido feito em outra IA, e pediu: *"pegue
tudo que melhore nosso sistema"*. A conferência item por item está em
`docs/historico/comparacao-com-o-andamento-de-outra-ia-22-10.md`. Entrou o que não depende de
regra da Fundação:

- **234, o texto do papel:** na prévia de um documento do dossiê e no Ver de cada anexo, *Ler o texto
  do papel* lê a foto ou o PDF no próprio aparelho, sem mandar a imagem para fora. A pessoa confere
  com o papel e corrige; a técnica, a coordenação, a Enfermagem e a gestão guardam o texto conferido,
  e a busca do dossiê passa a achar o papel pelo que está escrito nele.
- **235, o cadastro pelo papel:** na folha Corrigir o cadastro, o texto conferido da certidão, do RG
  ou do cartão SUS sugere o nome, a data, o RG, o CNS e a filiação, com o trecho de onde saiu. A
  pessoa marca o que quer e corrige com o motivo de sempre.
- **236, gráficos e planilha:** o relatório do período da casa sai em Word com dois gráficos (as
  doses deste período e do anterior; os registros da casa) e também como planilha do Excel, pelo
  mesmo registro com finalidade.
- E o que a Acolhe+AI aprendeu: o que está dentro do anexo que a pessoa manda é papel, e não ordem.

Ficou para a Fundação, e cada um é uma linha:

1. **O peso do protótipo.** Com a leitura do papel embutida, o arquivo único passou de 1,8 MB para
   7,6 MB. Abre do mesmo jeito, com dois cliques e sem internet. A outra saída é deixar a leitura só
   no sistema instalado, onde ela desce no primeiro toque.
2. **A planilha nos outros relatórios.** Hoje só no período da casa, que é de números da casa. Nos
   relatórios por criança, a planilha circula fácil e fica fora do registro de quem abriu: é conversa
   com o DPO antes.
3. **A árvore da família entre gerações**, com irmãos acolhidos em outras casas e quem voltou. Liga
   crianças de casas diferentes, e quem vê o quê é decisão da Fundação e do DPO.
4. **A IA num computador do Pão.** A outra IA trabalha com um modelo aberto instalado num computador
   da instituição. A Fundação aprovou o Claude em 08/10; o modelo local pede um computador com placa
   de vídeo e responde pior em português. Fica como opção, não como troca.
5. **O prazo de guarda e o que mais o sistema guarda.** Hoje nada se apaga. Prazo de guarda das
   fotos e documentos, o depósito de materiais e as finanças da casa pedem regra da Fundação antes.

## 4.34 O remédio pela Enfermagem e o que cada setor vê (fases 245 e 246, 25/10)

Decidido em 25/10 pela pessoa da Fundação que acompanha a sessão, e já é código:

- **Só a Enfermagem ativa o esquema de medicamento** (245). De noite, a coordenação ou a
  técnica cadastram o rascunho com a foto da receita, e a Enfermagem é avisada; a dose
  daquela noite a educadora dá conforme a receita e escreve na ATA. Troca a decisão de
  08/09 só na ativação; o Gestor Geral saiu do cadastro.
- **O Gestor Geral lê a casa e não registra** na ATA, no Dia, na internação, na Cozinha,
  nos combinados, na rotina e na escala (246). Ele continua escrevendo a regra das oito
  casas e baixando os papéis.
- **A técnica e a coordenação ficam como estão**: foi proposto e recusado tirar da técnica
  o Painel das unidades, a fila do arquivo, as contas da equipe e o armário, e da
  coordenação a Sincronização, o Arquivo documental e a página dos setores.
- **Os Combinados da equipe moram numa tela só** (a aba Alinhamentos saiu dos
  Acompanhamentos).

**Para o Marcelo conferir:** se o Gestor Geral precisa, em algum caso, cobrir uma casa sem
coordenação (montar a escala ou fechar a ATA). Hoje ele não consegue; quem cobre é a
Coordenação Geral, que é coordenadora e alcança as oito. A medição inteira está em
`docs/historico/o-que-cada-setor-ve-25-10.md`.

## 4.35 O dia a dia mais leve (fase 248, 27/10)

Fiz o papel de cada cargo num plantão, no celular, às 23h e às 14h, e consertei o que não
pedia decisão (está no §2 do documento, linha 248). O que mexe no jeito de a tela se
organizar fica aqui, para a Fundação escolher, com o que a medição mostrou:

1. **A Portaria em ordem de chegada.** A tela do portão é a única da portaria e tem 18
   telas de rolagem no celular, com uns quarenta cartões, um por visitante autorizado, quase
   todos fora do dia combinado. A proposta: no alto, **quem pode vir hoje**; abaixo, os
   demais por criança, recolhidos, com o nome da criança e quantos são, abrindo com um toque.
   A busca continua achando todos. Nada some; muda a ordem e o que abre de começo. (Hoje: a
   lista inteira, por criança, aberta.)
2. **A chamada da vez.** Às 23h, a tela das chamadas mostra as cinco do dia na ordem do
   horário, com a Ceia das 21h sem abrir e o almoço ainda aberto. A proposta: marcar a
   chamada da vez (a próxima pelo horário que ainda não foi confirmada) com a palavra
   *agora*, na pílula de estado. (Hoje: a lista sem destaque.)
3. **Os Acompanhamentos e o Trabalho social**, que passam de 19 telas de rolagem para a
   coordenação, a técnica e o gestor: é a saída 1 da §4.30 (o histórico recolhido, com as
   cinco mais recentes e um *Ver todas*), que ficou para depois de a equipe usar.

**O que vale perguntar à equipe da Casa 03 no roteiro:** na Portaria, quanto tempo leva
achar o visitante que chegou, e se a busca no alto basta.

## 5. As decisões que são do Marcelo *(§10 — responda pelo número)*

Nenhuma é problema de código. **Sobra uma só, a 5** (a grade para a parede), que é escolha da casa.

| # | Decisão |
|---|---|
| ~~1~~ | ✅ **RESPONDIDA EM 30/09: quem aprova devolve, com motivo** (fase 181). O texto volta a rascunho para quem redigiu, e a versão devolvida fica guardada e legível |
| ~~2~~ | ✅ **RESPONDIDA EM 30/09: só a linha da casa** (fase 181). A folha inteira fica com o Líder Noturno Geral, o gestor e a Coordenação Geral; de dia, cada casa lê a linha dela pelo Arquivo |
| ~~3~~ | ✅ **RESPONDIDA EM 30/09: só as atividades coletivas** (fase 181), como ato declarado com o nome de quem marcou. Remédio, saúde, urgência e o que espera ciência continuam um por um |
| ~~4~~ | ✅ **RESPONDIDA EM 28/09: últimos 30 dias** (fase 178) |
| 5 | A grade de medicação para colar na parede saiu sem diagnóstico. A casa quer diferente? |
| ~~6~~ | ✅ **RESPONDIDA EM 20/09: só a contagem** — *"existem 2 relatos em área restrita"*, o mesmo precedente dos documentos. **Destrava duas telas:** a leitura excepcional, e a listagem de relatos por criança |
| ~~7~~ | ✅ **RESPONDIDA EM 20/09: as três numa lista só**, com filtro por tipo — é a única que não obriga a técnica a adivinhar em qual aba está o que ela lembra |
| ~~8~~ | ✅ **RESPONDIDA EM 28/09: descrever o fato** — *Dada às 20h40, prevista para as 20h00*, sem a palavra atraso (fase 178) |
| ~~9~~ | ✅ **RESPONDIDA EM 28/09: por criança, 30 dias antes** (fase 178). A data é a validade do último PIA anexado ao dossiê |
| ~~11~~ | ✅ **CONFIRMADA EM 30/09: a Enfermagem continua vendo a internação** |

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
| ~~6~~ | Horário oficial do Líder Noturno Geral | ✅ **Respondida em 25/09**: ATA diurna 08:00–20:00, noturna 20:01–07:59 (fase 157) |
| 7 | Relatórios obrigatórios no piloto | Seleção com o Marcelo |
| ~~8~~ | Permissões de fotos em memórias | ✅ **Respondida em 15/09**: a equipe da casa vê as fotos, e o envio não espera confirmação |
| 9 | **Os dados de partida** | Equipe, acolhidos já na casa, e quanto do histórico em papel entra |
| 10 | **LGPD** | Quem responde, por quanto tempo se guarda, o que se apaga |
| 11 | Critérios de aceite do piloto | A proposta está no §13; falta assinar |
| 12 | **A folha da portaria com CPF e foto impressos** | Decisão dele de 09/09, já construída. **O DPO precisa ver antes do piloto** |
| ~~13~~ | ~~**O prazo do convite de primeiro acesso**~~ | ✅ **Respondida em 08/10: continua 24 horas.** Quem não abrir o e-mail no dia recebe convite novo |

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
   lugar. O quarto — *"a gente não vai deduzir a escala"* — ✅ **foi respondido
   em 20/09: a dedução saiu** (fase 129), e a passagem é assinada por quem está
   ali (§4.5).
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
