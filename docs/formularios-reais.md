# Os formulários reais da Fundação — o que mudou no sistema

Leitura dos documentos entregues pelo Marcelo em 28/08/2026:

| Documento | O que é hoje |
|---|---|
| LIVRO ATA – AI 03 | Google Forms, preenchido por turno pelo educador responsável |
| ATA – LÍDERES NOTURNO | Google Forms, preenchido pelo Líder Noturno, cobre as oito casas |
| Modelo de Evolução de Saúde | documento Word, preenchido a cada atendimento externo |
| Prontuário Individual de Evolução – Educação | documento Word, por acolhido, com evolução manuscrita |
| Audiência Concentrada 25/03/2026 | documento Word, um bloco por acolhido |
| Dados bancários – AI 03 | planilha Word compartilhada, atualizada pela coordenação |

**Nenhum dado real desses documentos entrou no sistema, nas fixtures ou nesta
documentação.** Foram lidos como referência de campo e fluxo (§3.3). Os nomes
que aparecem no protótipo e nos testes são fictícios.

---

## 1. O que os formulários ensinaram, e já está no código

### LIVRO ATA – AI 03 → seções da ATA da casa

A transcrição da Fase 5 estava próxima. Faltavam duas coisas que a casa
registra e o sistema não perguntava:

* **acolhido em experiência familiar** — é diferente de visita domiciliar: a
  criança está fora da casa por um período, e a casa continua responsável.
  Virou seção própria;
* **organização da casa por ambiente** — cozinha, banheiros, quartos, lavagem
  e secagem, sala de estudos, gavetas e armários, marcados como organizado ou
  desorganizado. Virou `checklist_ambientes` com os seis ambientes do papel.

Uma escolha deliberada na transcrição: o registro é do **ambiente**, nunca de
quem arrumou ou deixou de arrumar. O formulário atual também não pede isso, e
manter assim evita que a ATA vire ficha de comportamento (§3.3).

### ATA – LÍDERES NOTURNO → grade das oito casas

No sistema, a ATA Geral Noturna era uma lista de contatos e visitas. No
formulário real ela é uma **grade**: para cada casa, sempre as mesmas
perguntas. A forma mudou o uso — a grade mostra a noite inteira numa tela, e
**o que ficou em branco fica evidente**.

Campos agora existentes, direto do formulário: situação do plantão (completo /
férias-folga / afastamento-saúde), precisou de apoio, apoiou outra casa,
intervalos dos educadores, intercorrência de saúde (+ descrição), presença do
líder na casa, contato com a casa (+ meio), a casa acionou o líder (+ motivo e
ação), evasão (+ fato e ação), outros fatos relevantes.

Uma diferença em relação ao papel: **"sim" sem descrição não é registro.** No
formulário atual dá para marcar "houve intercorrência de saúde" e deixar o
campo de descrição vazio. Aqui o banco recusa: quem lê de manhã precisa do
fato, não do "sim".

### Modelo de Evolução de Saúde → campos que faltavam

Acrescentados exatamente como no papel: **acompanhante em texto** (quem leva à
consulta às vezes é motorista ou familiar autorizado, e exigir usuário
cadastrado obrigava a mentir no campo), **comportamento ao chegar e ao sair**
com as quatro opções do modelo, **ocorrências no trajeto** e **data da
reconsulta**.

O rodapé com duas assinaturas — Enfermeira e Coordenador da Casa — virou duas
confirmações datadas, cada uma com seu dono. Ninguém assina pelo outro, e
assinar duas vezes não acontece: assinatura não é botão de salvar.

### Prontuário Individual de Evolução – Educação → módulo novo

O sistema guardava escola, série e turno. O prontuário real acompanha o que a
educadora de referência da Educação usa: **sala de recursos** (com motivo e
professor), **equipe multiprofissional** (fono, pedagoga, psicopedagoga, com
local e profissional) e **aprendizagem profissional** (modalidade, curso,
início e conclusão, turno, unidade de formação, local de trabalho). Mais a
**evolução educacional** em texto, datada e com autor — que o educador também
escreve, porque quem acompanha a tarefa de casa é ele.

### Audiência Concentrada → quatro blocos, não onze

O Prompt Master pedia onze seções. O documento que a Fundação levou à
audiência de março tem **quatro** por criança: Acompanhamento, Saúde, Educação
e Profissionalização, Contexto Sociofamiliar. É mais curto porque foi escrito
por quem redige de verdade, na véspera, para vinte crianças.

O padrão passou a ser o real; as outras sete seções ficam **opcionais**,
oferecidas quando o caso pede. Onze títulos obrigatórios criariam campos
vazios que, num documento judicial, são lidos como ausência de trabalho.

E os quatro blocos são os mesmos eixos do acompanhamento mensal — o que
permite montar a audiência a partir do que já foi escrito no mês, com fonte,
autor e data.

### Planilha de dados bancários → campos novos

Acrescentados: número do benefício, operação da conta, nome da agência,
**pendência bancária sim/não** (a coluna que é o motivo de a planilha existir)
e observação de situação.

---

## 2. O que o sistema deliberadamente NÃO vai copiar

### 2.1 Senhas de gov.br, INSS e CTPS — resolvido: cofre no sistema

**Decisão da Fundação (Leonardo, 28/08/2026):** as senhas ficam no sistema,
visíveis à **coordenação de cada casa**. O argumento é o certo: a coordenação
tem a guarda das crianças e precisa desses acessos para resolver benefício,
matrícula e documento. Se o sistema não guardar, isso não deixa de existir —
continua numa planilha compartilhada, sem cifra, sem controle de quem abriu.

Então o cofre existe, e existe com o que a planilha não tinha:

* **cifrado** (AES-256-GCM) antes de chegar ao banco, com a chave no ambiente
  do serviço e não no banco. Um dump ou um backup extraviado devolvem bytes
  sem uso;
* **o papel da aplicação não lê a coluna do segredo** — privilégio por coluna.
  Nem a coordenação, consultando a tabela direto, enxerga a senha: ver exige o
  comando que registra antes de devolver. É o que impede a senha de vazar num
  relatório escrito com pressa;
* **cada abertura pede finalidade** e vira evento com nome e hora. A pergunta
  "quem viu a senha do fulano em março?" passou a ter resposta;
* **a lista mostra uma dica** — primeira letra, tamanho, última letra — que
  resolve a maior parte das conferências sem abrir nada, e cada abertura
  evitada é uma exposição a menos;
* **só a coordenação da casa atual.** Educador, técnica, enfermagem e a
  coordenação de outra casa não abrem nem enxergam que existe. Depois de uma
  transferência aceita, o acesso muda de casa junto com a criança;
* **o Gestor Geral entra pela exceção**, com motivo institucional escrito
  (mínimo 20 caracteres), e a exceção fica marcada como exceção. Sem essa
  porta, a licença de uma coordenadora deixaria a instituição sem acesso ao
  benefício de uma criança — que seria pior;
* **trocar a senha não apaga o histórico** de quem já a viu;
* credencial **nunca** entra em relatório, exportação, linha do tempo,
  notificação, busca ou cópia para o Drive.

Duas coisas que continuam valendo, independentemente do sistema:

1. **trocar as senhas que já circularam.** Uma senha que esteve num documento
   compartilhado precisa ser considerada conhecida — guardá-la cifrada agora
   não desfaz o que já circulou;
2. **evitar contas permanentemente logadas no aparelho institucional.** O
   cofre protege a senha; uma sessão aberta no aparelho dispensa a senha.

### 2.2 Conteúdo do cofre físico — fica de fora

**Decisão da Fundação (28/08/2026):** o cofre físico não entra no sistema. O
registro do que há dentro dele continua onde está hoje. O sistema de
acolhimento não é livro-caixa, e um inventário de valores aqui dentro
convidaria a discussões de responsabilidade que ele não tem como arbitrar.

### 2.3 WhatsApp — fica de fora, e essa é a questão

**Decisão da Fundação (28/08/2026):** tudo no sistema. E o diagnóstico do
Leonardo é o que importa: *eles usam o WhatsApp como forma de comunicação
porque ainda não têm um sistema.* Não é preferência por aplicativo — é
ausência de alternativa.

O que isso exige da nossa parte, e vale mais do que qualquer proibição: o
registro no sistema precisa ser **mais rápido do que digitar a mesma coisa no
aplicativo**. Se for mais lento, o WhatsApp volta, e volta sem que ninguém
avise. É por isso que a passagem, a ATA e a linha do tempo foram desenhadas
com campos curtos, opções prontas e escrita offline: a concorrência real do
sistema, no meio da noite, é uma conversa que já está aberta no celular.

O sistema registra **que** houve contato e por qual meio (telefone
institucional, presencial ou pelo próprio sistema); o conteúdo do que foi
tratado fica aqui.

### 2.4 Linguagem que rotula

O documento de Audiência Concentrada contém, sobre adolescentes,
caracterizações como "comportamentos manipulativos". Não é crítica a quem
escreveu — é o vocabulário disponível na hora, para vinte crianças, na véspera.

Mas um documento judicial acompanha a pessoa por anos, e um rótulo escrito uma
vez costuma ser lido como diagnóstico depois. O sistema não censura texto — não
deve. O que ele faz é **pedir fato e contexto** na ajuda de cada campo, e
manter fonte, autor e data de cada trecho, para que uma frase escrita numa
segunda-feira difícil não vire característica permanente de uma criança.

Sugestão para o treinamento do piloto: uma conversa curta com a equipe técnica
sobre descrever comportamento observado em vez de atribuir traço. "Alterou o
relato em três ocasiões nesta semana" e "é manipuladora" descrevem coisas
diferentes — a primeira pode mudar, a segunda gruda.

---

## 3. Ainda pendente do §33.3

Recebidos: livro ATA, ATA de líderes noturnos, modelo de evolução de saúde,
prontuário de educação, audiência concentrada, dados bancários.

Faltam: **agenda/rotina real** (diária e semanal), **folha real de
administração de medicamentos**, **formulário de ingresso/PIA**, **modelo de
passagem individual**, **formulários de ocorrência e contenção** e **exemplo
de escala 12×36** com horários da técnica e da Enfermagem.

A folha de medicação é a mais importante das que faltam: é onde o erro custa
mais caro, e é o único módulo que ainda está desenhado a partir do documento e
não do papel que a casa usa.
