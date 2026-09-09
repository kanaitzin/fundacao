# DER — Modelo de dados

## Fundação (implementado — migração 001)

```mermaid
erDiagram
  INSTITUTION ||--o{ HOUSE : possui
  INSTITUTION ||--o{ APP_USER : emprega
  APP_USER ||--o{ USER_HOUSE_ASSIGNMENT : "vínculo (histórico)"
  HOUSE ||--o{ USER_HOUSE_ASSIGNMENT : recebe
  APP_USER ||--o{ USER_SESSION : "sessões revogáveis"
  APP_USER ||--o{ WORK_SCHEDULE : "escala semanal"
  APP_USER ||--o{ AUDIT_EVENT : "atos auditados"
  HOUSE ||--o{ AUDIT_EVENT : escopo

  APP_USER {
    uuid id PK
    text email UK "e-mail institucional"
    text password_hash "scrypt; nunca em logs"
    role_code role
    bool active "desligado = desativado"
  }
  USER_HOUSE_ASSIGNMENT {
    timestamptz valid_from
    timestamptz valid_to "null = vigente"
  }
  APP_USER_COR {
    text line_color "tom da paleta para a borda das linhas desta pessoa na ATA"
    text _ "NULL = tom automático por hash. Único por casa entre ativos,"
    text __ "conferido em app_definir_cor_da_linha (0990), não por constraint:"
    text ___ "a unicidade é POR CASA e a casa vive em user_house_assignment."
  }
  USER_SESSION {
    text token_hash UK "sha256(token+pepper)"
    timestamptz expires_at
    timestamptz last_reauth_at "ações sensíveis"
    timestamptz revoked_at
  }
  AUDIT_EVENT {
    text action
    jsonb detail "metadados; sem conteúdo sensível"
    timestamptz at "append-only (trigger)"
  }
```

## Fase 2 — Perfil do Acolhido (implementado — migrações 002–005)

```mermaid
erDiagram
  PERSON ||--o{ CARE_EPISODE : "episódios (retorno = novo episódio)"
  CARE_EPISODE ||--o{ HOUSE_STAY : "permanências"
  HOUSE ||--o{ HOUSE_STAY : abriga
  PERSON ||--|| PROFILE_DETAIL : "dados estruturais"
  PERSON ||--o{ HEALTH_CONDITION : "alergias e condições"
  PERSON ||--o{ FOOD_RESTRICTION : "restrições alimentares"
  PERSON ||--o{ DOCUMENT : "por categoria"
  DOCUMENT ||--o{ DOCUMENT_VERSION : versões
  PERSON ||--o{ BENEFIT_RECORD : "área restrita"
  PERSON ||--o{ MEMORY_RECORD : "memórias autorizadas"
  PERSON ||--o{ TRANSFER_REQUEST : transferências

  PERSON {
    text cpf UK "único por instituição; mascarado na exibição"
    text social_name "nome social nas telas operacionais"
    bool cpf_pending "ingresso urgente"
  }
  HOUSE_STAY {
    text status "ativa | encerrada — define a visibilidade"
    text end_reason "transferencia | saida | encerramento_episodio"
  }
  TRANSFER_REQUEST {
    text status "solicitada | aceita | devolvida | cancelada"
  }
```

**A permanência ativa é a chave do isolamento.** `app_person_in_scope()` deriva a
visibilidade dela: sem permanência ativa o perfil está no Acervo Histórico, visível
apenas a quem já respondeu por ele. Transferir é encerrar uma permanência e abrir
outra — nada é apagado, e o acesso a benefícios acompanha a casa atual.

## Modelo completo planejado (§23 do Prompt Master)

O ciclo de vida do acolhido separa **pessoa → episódio → permanência → registros**:

```mermaid
erDiagram
  PERSON ||--o{ CARE_EPISODE : "episódios (retorno = novo episódio)"
  CARE_EPISODE ||--o{ HOUSE_STAY : "permanências em casas"
  HOUSE_STAY ||--o{ TIMELINE_EVENT : registros
  PERSON ||--|| PROFILE : "Perfil do Acolhido"
  PROFILE ||--o{ HEALTH_CONDITION : condicoes
  PROFILE ||--o{ FOOD_RESTRICTION : restricoes
  PROFILE ||--o{ PRESCRIPTION : prescricoes
  PRESCRIPTION ||--o{ MEDICATION_SCHEDULE : grade
  MEDICATION_SCHEDULE ||--o{ MEDICATION_ADMINISTRATION : "doses (1 confirmação = 1 autor)"
  PROFILE ||--o{ HEALTH_EVOLUTION : "evoluções (triagem Enfermagem)"
  PROFILE ||--o{ DOCUMENT : "documentos versionados"
  PROFILE ||--o{ BENEFIT_RECORD : "benefícios (restrito)"
  PROFILE ||--o{ MEMORY_RECORD : "memórias autorizadas"
  HOUSE_STAY ||--o{ INCIDENT : ocorrencias
  INCIDENT ||--o{ INDEPENDENT_STATEMENT : "relatos imutáveis"
  SHIFT ||--o{ STAFF_PASSAGE : "passagens individuais"
  SHIFT ||--|| SHIFT_ATA : "1 ATA por casa/plantão"
  TRANSFER_REQUEST }o--|| HOUSE_STAY : "muda casa só após aceite"
```

Grupos restantes do §23 (notificações/escalonamento, Drive, offline/sync, eliminação
excepcional) entram nas fases 3–6; requisitos transversais de todo agregado:
`institution_id` sempre, `house_id` quando operacional, IDs UUID não previsíveis,
autoria imutável, versão otimista, estados explícitos, classificação de sensibilidade,
CPF único normalizado e protegido, busca sem vazar existência entre casas.

O dicionário de dados completo será gerado por fase, junto de cada migração.

---

## Registros que existem para não perder autoria (fases 8–10)

Três tabelas nasceram de auditoria, não de requisito. Todas seguem a mesma
ideia: quando algo pode ser corrigido, o valor anterior não morre.

```mermaid
erDiagram
  CHECK_RESULT ||--o{ CHECK_RESULT_AMENDMENT : "o que constava antes"
  ACTIVITY ||--o{ ACTIVITY_EXECUTION : "cada registro é uma linha"
  APP_USER ||--o{ USER_INVITE : "primeiro acesso por convite"

  CHECK_RESULT_AMENDMENT {
    text option_code "o valor ANTERIOR"
    uuid recorded_by "quem havia marcado"
    uuid replaced_by "quem corrigiu"
    timestamptz replaced_at
  }
  ACTIVITY_EXECUTION {
    uuid user_id "quem OPEROU o sistema"
    uuid performed_by "quem REALIZOU, se outra pessoa"
    text proxy_reason "obrigatório quando performed_by existe"
    text client_op_id UK "idempotência offline"
  }
  USER_INVITE {
    text token_hash UK "sha256(token+pepper); o token nunca é guardado"
    timestamptz expires_at "24h"
    timestamptz used_at "uso único"
    uuid created_by "quem convidou"
  }
```

**`life_milestone` é O TRABALHO SOCIAL, e não o turno** (migração 0900). O
Gestor Geral responde pelas oito casas e não vai abrir a grade de medicação de
nenhuma; o que ele precisa é do que o acolhimento produziu — passou de ano,
terminou o Médio, entrou no curso, assinou a primeira carteira.

**O risco desta tabela está escrito na migração, antes de ela existir:** contar
conquistas por casa é a distância de um `ORDER BY` de virar ranking de casas,
que é proibido (regra 3). E a proibição não é burocracia — a casa que recebe
adolescentes com medida protetiva recente e a casa-lar com quatro crianças
pequenas não estão na mesma corrida, e o placar faz a primeira parecer pior no
momento em que ela faz o trabalho mais difícil.

Por isso: `app_panorama_das_casas` ordena por `code`, nunca por contagem; não
há média, meta, percentual nem "casa destaque"; e **ausência de marco não é
dado** — a criança sem linha aqui não fracassou.

Três decisões da tabela:

* **o marco é da CRIANÇA**; `house_id` guarda onde ela estava quando aconteceu,
  gravado na hora, porque ela muda de casa e o marco não muda de lugar junto;
* **todo mundo da casa lê**, inclusive o educador. É a parte boa da história, e
  escondê-la de quem acorda a criança todo dia seria transformar em relatório o
  que devia ser motivo de a casa inteira saber. Escrever é da técnica, da
  coordenação e do Gestor Geral;
* **marco não se apaga** — gatilho `app_marco_nao_e_apagado`. Um diploma que
  sumiu do sistema é um diploma que a instituição deixou de reconhecer.

**`hospitalization` é A CRIANÇA NO HOSPITAL, e não fora do acolhimento**
(migração 0890). Pedido da coordenação em 03/09/2026.

O que ela decide:

* **não é saída.** A criança continua da casa, na contagem e na vaga —
  `house_stay` não é tocada. Ela só sai do sistema quando a técnica ou a
  coordenação a removerem, com motivo, e aí é saída, que manda para o acervo;
* **ela sai da linha do dia.** `app_esta_internado(pessoa, dia)` é chamada pela
  chamada e pela grade de medicação. Cobrar da educadora de plantão a
  confirmação do café de uma criança que está no hospital é pedir que ela minta
  ou que ignore o alerta — e o que se ignora todo dia deixa de ser alerta;
* **o dia da alta é dia de casa.** Quem recebe alta às dez da manhã almoça
  aqui. O contrário, no dia da entrada, é assumido: a criança internada às três
  da tarde sai da lista do dia inteiro, e o que já foi registrado de manhã não
  some;
* **a dose que estava prevista não é apagada nem marcada como não
  administrada.** Ela sai da tela e fica no banco, sem juízo: o sistema não
  conclui o que não viu.

`hospitalization_medication` é a medicação dada NO HOSPITAL, em tabela
separada da grade da casa — e a separação é a regra inteira. A grade tem
receita assinada, horário previsto e o nome de quem da casa administrou; dose
de hospital não tem nada disso. Registrá-la lá faria a casa aparecer
administrando o que não administrou. Aqui há `recorded_by` (quem escreveu) e
**não há** `administered_by`, porque não seria verdade.

`hospitalization_companion` é uma LISTA com período, e não um campo na
internação: a criança fica três semanas e quem vai ao hospital muda a cada
plantão. Um campo único guardaria só o último, e "quem estava com ela no dia
12?" ficaria sem resposta.

**`person_contact` são OS TELEFONES DE QUEM APARECE** (migração 0880). Vieram
da lista que a equipe técnica mantinha à mão: por criança, os contatos da
genitora, do padrinho, da tia e do vínculo comunitário, todos na mesma célula
de um documento de texto.

Três coisas que a tabela decide:

* **o vínculo é rótulo, não hierarquia.** Em várias dessas histórias quem
  aparece é a madrinha, e não a genitora;
* **o educador LÊ** (decisão da coordenação, 03/09/2026): quem está com a
  criança precisa saber quem é a pessoa que apareceu no portão. Escrever
  continua sendo da técnica e da coordenação;
* **contato não se apaga, encerra-se com motivo** — gatilho
  `app_contato_nao_e_apagado`. O telefone que deixou de valer é informação:
  alguém tentou por ele e não conseguiu. E há a marca `restricted`, para o
  contato com aproximação suspensa, que exige motivo escrito — quem descobre
  isso às 23h descobre tarde.

**`person_correction` é o HISTÓRICO DA CORREÇÃO DE CADASTRO** (§6.2, migração
0810). Nome escrito errado às 23h, data de nascimento trocada porque a certidão
veio depois: sem uma porta para corrigir, a saída de quem usa é recadastrar — e
aí existem duas crianças e o histórico parte em dois. Corrigir sem histórico
seria pior: um nome que muda em silêncio faz toda passagem assinada e toda ATA
fechada passarem a falar de alguém que, nos papéis de antes, tinha outro nome.
A tabela guarda o que estava, o que passou a estar, quem, quando e por quê, uma
linha por campo, e não aceita UPDATE nem DELETE. Ela é tabela e não
`audit_event` de propósito: a auditoria é área restrita e responde "quem mexeu
no sistema"; esta responde a uma pergunta do CASO — "por que o nome dela mudou
em março?" — e é lida por quem cuida, na tela do perfil.

**`profile_detail_change` é a irmã dela para o que é DESCRIÇÃO** (§6.4, migração
0850): cuidados essenciais, escola, equipe de referência e observações. A rota
que altera esses campos existia desde a fase 2 e nunca teve tela — o perfil
mostrava tudo isso e ninguém conseguia escrever. Ao abrir a porta, o
antes-e-depois veio junto, porque "cuidados essenciais" é o bloco que se lê
antes de dar banho e antes de servir o prato: reescrevê-lo por cima do que a
Enfermagem orientou apagaria uma instrução de proteção sem rastro, já que a
auditoria guarda o NOME do campo e nunca o conteúdo (§20). A diferença para
`person_correction` é o motivo escrito: corrigir o nome exige um, atualizar a
série escolar não — em fevereiro a série muda mesmo, e cobrar justificativa ali
ensina a equipe a escrever "atualização" mil vezes até que ninguém mais leia o
campo. O que se cobra aqui é o rastro.

**`check_bulk` é a CONFERÊNCIA DE MESA** (§10, migração 0780). A regra escrita
é "sem marcação em lote SILENCIOSA", e a do banco é "nada que preencha o que
não foi olhado" — nenhuma proíbe registrar de uma vez o que foi olhado de uma
vez, desde que fique gravado que foi assim. Cada linha de `check_result` que
nasce de uma conferência de mesa aponta para ela por `bulk_id`; corrigir a
linha zera esse vínculo, porque alguém passou a olhar aquela criança. A tabela
não aceita UPDATE nem DELETE: o ato aconteceu. A chamada final do turno não a
aceita — ela existe para alguém contar as crianças uma a uma antes de dormir.

**`check_result_amendment` é preenchida por gatilho, não pelo serviço**
(`tg_check_result_amend`). Qualquer caminho que atualize a marcação da chamada
passa por ele — rota, correção manual, fila offline. Reenvio com o mesmo valor
não gera linha: histórico poluído é histórico que ninguém lê.

**`activity_execution` ganhou autoria dupla.** `user_id` continua significando
quem operou o sistema — não mudou de sentido, e nenhuma consulta antiga passou
a mentir. `performed_by` e `proxy_reason` andam juntos, garantidos por
`CHECK`: nome sem motivo seria assinatura em branco.

**`user_invite` não guarda o token.** Só o hash, como a sessão. Quem tiver o
banco na mão não entra no lugar de ninguém. Índice único parcial garante **um
convite ativo por pessoa**: emitir de novo cancela o anterior, porque dois
convites válidos são duas portas.

### Funções de tempo (fase 8)

`app_hoje()` e `app_fuso()` (migração 0630) são o gêmeo SQL de
`kernel/common/tempo.ts`. **`current_date` está proibido em migração nova:** em
servidor UTC ele vira o dia seguinte a partir das 21h de Porto Alegre, e foi
isso que fez dose de prescrição criada no plantão da noite não ser gerada.

---

# Fases 3 a 7 — o resto do banco (31/08/2026)

> Até aqui o DER cobria a fundação e a fase 2, e as outras 60 tabelas viviam só
> nas migrações. A lacuna não era de forma: quem chega no projeto precisa saber
> **por que** cada tabela existe, e essa resposta estava espalhada.
>
> A lista abaixo é conferida por teste (`documentacao.spec.ts`): toda tabela
> criada por uma migração precisa aparecer neste arquivo. Documentação que a
> máquina não cobra envelhece na primeira pressa.

## Fase 3 — a rotina, o dia e o que se combina

```mermaid
erDiagram
  HOUSE ||--o{ ROUTINE_VERSION : "rotina versionada"
  ROUTINE_VERSION ||--o{ ROUTINE_ITEM : "itens do dia"
  ROUTINE_ITEM ||--o{ ACTIVITY : "gera o dia"
  ACTIVITY ||--o{ ACTIVITY_ASSIGNMENT : "quem foi designado"
  ACTIVITY ||--o{ ACTIVITY_ACKNOWLEDGEMENT : "ciência de quem vai fazer"
  ACTIVITY ||--o{ ACTIVITY_EXECUTION : "cada registro é uma linha"
  ACTIVITY ||--o{ SUBSTITUTION_REQUEST : "quem sai pede substituição"
  HOUSE ||--o{ COMMITMENT : "agenda: consulta, visita, escola"

  ROUTINE_VERSION {
    int number "versão vigente por data, nunca sobrescrita"
    date valid_from
    date valid_to "null = vigente"
  }
  ACTIVITY {
    text kind
    text state "estado explícito; nunca deduzido do horário"
    bool requires_ack "designado não é o mesmo que avisado"
    bool urgent
    text urgent_reason "urgência sem motivo escrito vira rotina"
  }
  SUBSTITUTION_REQUEST {
    text status "pedida | autorizada | recusada"
    text decision_note "recusar também é decisão, e precisa de motivo"
    uuid substitute_id
    timestamptz acknowledged_at
  }
```

**A rotina é versionada, e a versão é por data.** Mudar o horário do jantar não
reescreve o mês passado: entra uma versão nova, com `valid_from`. Item só entra
em versão vigente da própria casa — foi um dos 12 defeitos.

**A atividade guarda o ESTADO, não o horário.** "Passou das 19h" não é
conclusão; quem conclui é gente. Por isso `state` é explícito e a execução é
uma linha por registro, com `performed_by` e `proxy_reason` quando o líder
registra pelo colega (§10).

## Fase 3 — chamada, linha do tempo, avisos e offline

```mermaid
erDiagram
  HOUSE ||--o{ COLLECTIVE_CHECK : "chamadas do dia"
  COLLECTIVE_CHECK ||--o{ CHECK_RESULT : "um resultado por acolhido"
  CHECK_RESULT ||--o{ CHECK_RESULT_AMENDMENT : "o valor anterior nunca some"
  APP_USER ||--o{ NOTIFICATION : "caixa de entrada"
  NOTIFICATION }o--|| ESCALATION : "o que subiu de nível"
  ESCALATION_LEVEL ||--o{ ESCALATION : "contrato genérico do kernel"
  APP_USER ||--o{ OFFLINE_OPERATION : "fila do aparelho"
  OFFLINE_OPERATION ||--o{ SYNC_CONFLICT : "quando dois registraram"

  COLLECTIVE_CHECK {
    text status
    int expected "quantos deveriam ser conferidos"
  }
  CHECK_RESULT {
    text option_code
    uuid recorded_by "quem OLHOU a criança — nunca por outro"
    timestamptz happened_at "hora real"
    timestamptz recorded_at "hora do registro; offline separa as duas"
  }
  NOTIFICATION {
    text safe_title "o que aparece na tela de bloqueio"
    text title "o título de dentro do app"
    text group_key "agrupa para não inundar o educador"
  }
  OFFLINE_OPERATION {
    text client_op_id UK "idempotência: reenvio não duplica"
    text status "na_fila | aplicada | conflito"
    bool institutional_device
  }
```

**`safe_title` existe porque a notificação aparece na tela de bloqueio.** O
aparelho da casa fica em cima da mesa; o nome de uma criança e o motivo não
podem ser lidos por quem passa.

**`client_op_id` é a chave da fila offline.** O aparelho fica sem sinal, a
educadora registra, o registro sobe depois — e subir duas vezes não pode criar
dois. Conflito não se resolve sozinho: vira linha em `sync_conflict`, para
alguém decidir.

## Fase 4 — medicamentos e enfermagem

```mermaid
erDiagram
  PERSON ||--o{ PRESCRIPTION : "prescrições"
  PRESCRIPTION ||--o{ MEDICATION_SCHEDULE : "horários"
  PRESCRIPTION ||--o{ MEDICATION_ADMINISTRATION : "uma dose = uma linha"
  HOUSE ||--o{ MEDICATION_STOCK : "armário da casa"
  MEDICATION_STOCK ||--o{ MEDICATION_STOCK_MOVEMENT : "entrada e ajuste"
  HOUSE ||--o{ MEDICATION_PROTOCOL : "quem administra em cada período"
  HOUSE ||--o{ MEDICATION_AUTHORIZATION : "educador autorizado, com prazo"
  PERSON ||--o{ HEALTH_ENCOUNTER : "consultas, exames, internações"
  PERSON ||--o{ HEALTH_EVOLUTION : "evolução escrita por quem acompanhou"
  HEALTH_EVOLUTION ||--o{ NURSING_TRIAGE : "a Enfermagem tria e assina"
  PERSON ||--o{ HEALTH_SUMMARY_ISSUE : "cada emissão, com finalidade"

  MEDICATION_ADMINISTRATION {
    text state "aguardando_confirmacao é ausência de registro, não recusa"
    uuid administered_by "só quem administrou confirma"
    bool institutional_device "offline, só o aparelho da casa"
    text note "obrigatória em atraso, recusa, ausência e incidente"
  }
  MEDICATION_STOCK {
    numeric quantity
    bool low_flag "sinalizado À MÃO: só a equipe sabe o que é pouco"
    uuid low_flagged_by
  }
  MEDICATION_STOCK_MOVEMENT {
    text kind "entrada = o que chegou | ajuste = a diferença da contagem"
    numeric quantity "na contagem, a diferença assinada — nunca o total"
  }
  HEALTH_SUMMARY_ISSUE {
    text purpose "finalidade obrigatória, registrada antes de o conteúdo sair"
  }
```

**A dose não tem estado "não administrada" automático.** Passou da hora e
ninguém confirmou? Continua `aguardando_confirmacao`, e o sistema ESCALONA. A
diferença entre "não temos registro" e "não foi dado" é a diferença entre
apurar e acusar.

**`medication_protocol` existia porque a instituição ainda não tinha decidido**
quem administra em cada período (pendência 33.4.1). Em vez de inventar uma
regra invisível, a decisão virou configuração por casa, com data e autor.

**A pendência foi respondida em 08/09/2026** (migração 0930): a Enfermagem
atende das 9h às 17h, e fora desse horário quem administra é o educador de
plantão, conforme a bula do acolhido. As duas tabelas do protocolo — e a da
autorização nominal — **deixaram de decidir, não de existir**: elas guardam o
que a casa decidiu enquanto ninguém sabia o horário da Enfermagem, e apagá-las
esconderia por que a casa operava daquele jeito (regra 6).

**`prescription_restriction_change` é o que ficou no lugar delas.** A regra
passou a ser aberta por padrão e a EXCEÇÃO é por medicamento — "este aqui só a
Enfermagem dá" —, marcada no próprio esquema (`prescription.nurse_only`), com
motivo obrigatório e o antes-e-depois nesta tabela, que não aceita UPDATE nem
DELETE. A exceção é por medicamento, e não por turno ou por pessoa, porque
injetável continua sendo injetável às 22h — e porque a autorização nominal
fazia a proteção depender de a coordenação lembrar de cadastrar cada educador
novo, com a dose da noite recusada quando ela esquecia.

**`medication_protocol_change` guarda cada decisão dessas** (migração 0860). A
rota que escreve o protocolo também nunca teve tela: a Saúde desenhava a tarja
"Sem definição" em cada período e não havia botão que definisse. Ao abrir a
porta, duas coisas mudaram de peso — a nota deixou de ser opcional, porque uma
decisão da instituição sem a linha que a explica não se revê; e o
`ON CONFLICT DO UPDATE` deixou de sobrescrever em silêncio, porque trocar
"educador autorizado pode dar remédio no turno noturno" de sim para não é a
decisão mais pesada que uma coordenação toma aqui. `NULL` nos campos "antes"
significa que não havia definição e valia o padrão protetivo — diferente de
`false`, que é uma decisão tomada de negar. Lê quem alcança a casa, e não só
quem decide: a educadora que vai (ou não vai) dar o remédio tem o direito de
saber quando isso mudou e sob qual decisão.

## Fase 5 — plantão, passagem, ATA e relatos

```mermaid
erDiagram
  HOUSE ||--o{ SHIFT : "plantões do dia"
  SHIFT ||--o{ HANDOVER : "passagem individual, assinada"
  SHIFT ||--o{ HANDOVER_RECEIPT : "quem recebeu o turno"
  SHIFT ||--o{ HANDOVER_NOTE : "complemento tardio, com hora real"
  SHIFT ||--|| ATA : "uma ATA por plantão"
  ATA ||--o{ ATA_ADDENDUM : "correção é adendo, nunca reescrita"
  ATA ||--o{ ATA_EPISODE : "episódios do turno"
  ATA_EPISODE ||--o{ ATA_EPISODE_ACK : "ciência de quem precisa saber"
  INSTITUTION ||--|| GENERAL_NIGHT_ATA : "ATA Geral Noturna"
  GENERAL_NIGHT_ATA ||--o{ GENERAL_NIGHT_HOUSE_ENTRY : "as oito casas, sempre"
  WITNESS_OPTION ||--o{ STATEMENT : "como a pessoa soube"

  HANDOVER {
    timestamptz signed_at "assinatura individual; ninguém assina por outro"
    timestamptz happened_at "hora real do turno"
    bool late "complemento depois do fechamento aparece marcado"
    text medication_note "o que houve com as doses sem resposta — não confirma nenhuma"
  }
  ATA {
    text status "aberta | fechada"
    int missing_signatures "fecha COM PENDÊNCIA — o sistema não assina por ninguém"
    text pendencies "a frase escrita É o registro"
    int version
  }
  GENERAL_NIGHT_HOUSE_ENTRY {
    bool had_contact "casa sem chamado também entra: ausência é registro"
    bool house_ata_confirmed
  }
  STATEMENT {
    text witness "presencial | ouviu de | encontrou depois"
    bool restricted "narrativa pessoal não circula pelo plantão"
    uuid supplements_id "complementa outro relato, sem apagá-lo"
  }
```

**Relatos que se contradizem continuam os dois.** `statement` não tem
atualização: quem quiser corrigir escreve outro, apontando para o primeiro em
`supplements_id`. Num caso de proteção, a versão de cada um é o dado.

**`handover.medication_note` (migração 0940)** é a resposta ao pedido do
Marcelo — "no fim da passagem alguém tem que dizer que deu o remédio" — na
única forma que não fere o §11.2. A passagem LÊ as doses do turno
(`app_doses_do_turno`) e exige a frase quando alguma ficou sem resposta; ela
não confirma dose nenhuma, porque a confirmação é individual, de quem
administrou. A cobrança é de quem assina PRIMEIRO: quatro pessoas no mesmo
turno responderiam quatro vezes sobre as mesmas doses, e a quarta escreveria
qualquer coisa para conseguir ir embora.

**`shift_assignment` é a escala POR DATA** (migração 0950), e nasceu porque a
`work_schedule` — semanal, desde a fundação — não descreve uma 12x36: o ciclo é
de 48 horas e anda pelo calendário, então "toda terça a Joana" é falso na terça
seguinte. As duas convivem: a semanal continua certa para quem tem horário fixo
(a Enfermagem das 9h às 17h), e a 0960 diz a ordem em que `app_missing_handovers`
as consulta — escala do dia, escala semanal, vínculo da casa —, declarando a
fonte na resposta.

Nada se apaga: tirar alguém de um plantão é revogar, com autor e horário, e o
banco recusa DELETE **inclusive do dono** — a pergunta que a tabela existe para
responder é "quem estava na casa naquela noite?". Retirar plantão de data já
passada exige motivo escrito. E não há contagem por pessoa em lugar nenhum:
somar plantões por nome é medição de gente com outro nome (§3.3).

**`ata_note` é a linha da ATA com dono** (migração 0970). O corpo do livro
(`ata.content`) descreve o TURNO e é escrito a várias mãos; a linha descreve um
fato e tem autor, horário e imutabilidade — "a Maria não dormiu bem e fez xixi à
noite" é o exemplo que a Fundação deu ao pedir. Corrigir é escrever outra linha.

`restricted` fecha a linha para a coordenação, a equipe técnica e os líderes —
**no banco**, e não na tela: se ficasse na cor, a primeira tela nova mostraria
tudo (a lição da 0760). Quem não a alcança recebe a CONTAGEM por
`app_ata_restritas`, que é SECURITY DEFINER justamente porque precisa ver o que
a pessoa não vê — sumir por completo criaria a impressão de que não existe
(precedente do §13.7).

`app_ata_anterior` é a porta que faltava para "todos leem a ATA do turno
anterior": o último plantão que COMEÇOU antes deste, e não "ontem" — que erraria
toda manhã, quando o anterior é a noite que acabou de passar.

## Fase 5 — ocorrências e proteção

```mermaid
erDiagram
  HOUSE ||--o{ INCIDENT : "ocorrências da casa"
  INCIDENT ||--o{ INCIDENT_PERSON : "acolhidos envolvidos"
  INCIDENT ||--|| INCIDENT_PROTECTED : "fala espontânea — acesso próprio"
  INCIDENT ||--|| INCIDENT_RESTRAINT : "contenção, com campos próprios"
  INCIDENT ||--o{ INCIDENT_SYNTHESIS : "síntese técnica, registro NOVO"
  INCIDENT ||--o{ INCIDENT_ATTACHMENT : "anexos, com justificativa"
  INCIDENT ||--o{ EXTERNAL_COMMUNICATION : "entrega registrada — nunca envio"

  INCIDENT {
    text status "aberta | em_acompanhamento | encerrada_operacional | aguardando_revisao_tecnica | fechada | reaberta"
    text access_level "equipe | restrito — nasce da categoria"
    bool requires_technical_review "categoria que não fecha sem análise"
  }
  INCIDENT_PROTECTED {
    text spontaneous_speech "transcrição; não é devolvida a quem não alcança"
    text observed_signs
  }
  EXTERNAL_COMMUNICATION {
    text organ "judiciário, conselho tutelar, MP, saúde, escola"
    text status "o sistema REGISTRA que alguém entregou; não envia nada"
  }
```

**Não existe rota de envio, e isso é a garantia.** `external_communication`
guarda que uma pessoa entregou um documento a um órgão — quem entregou, por
qual canal, quando. Procurar por um `POST` que despache é a forma mais rápida
de conferir o §13.6.

**A ordem dos estados é a regra:** a revisão técnica vem DEPOIS do
encerramento operacional, e caso de saúde, medicamento, contenção ou violência
não fecha sem síntese. O banco recusa, não só a tela.

## Fase 6 — acompanhamentos, relatórios e arquivo

```mermaid
erDiagram
  PERSON ||--o{ FOLLOWUP : "acompanhamento por eixos"
  FOLLOWUP ||--o{ FOLLOWUP_SOURCE : "de onde veio cada dado"
  PERSON ||--o{ REPORT_DOCUMENT : "relatórios que saem da casa"
  REPORT_DOCUMENT ||--o{ REPORT_DELIVERY : "entrega registrada"
  APP_USER ||--o{ EXPORT_LOG : "toda exportação deixa rastro"
  ARCHIVE_ITEM ||--o{ ARCHIVE_ATTEMPT : "cada tentativa de envio"
  PERSON ||--o{ EDUCATION_SUPPORT : "apoios e formação"
  PERSON ||--o{ EDUCATION_EVOLUTION : "evolução educacional"

  FOLLOWUP {
    text status "rascunho | em_aprovacao | aprovado"
    uuid written_by "quem redigiu"
    uuid approved_by "não pode ser a mesma pessoa"
    uuid supersedes_id "corrigir cria versão nova; a anterior fica"
  }
  REPORT_DOCUMENT {
    text purpose "finalidade da emissão"
    text checksum "o que saiu é o que foi aprovado"
    int version
  }
  ARCHIVE_ITEM {
    text caminho "sem nome, CPF ou diagnóstico (§3.3)"
    text filename "ata_2026-08-27_9f2c1a44_V1.pdf"
    text status "aguardando | enviando | salvo | verificado | falhou"
    bool area_restrita "outra raiz, outra permissão"
  }
```

**`checksum` responde a uma pergunta de audiência:** o documento que chegou ao
Juízo é o que a coordenação aprovou? Sem ele, "acho que sim".

**O arquivo verifica, não confia.** `salvo` é promessa da rede; `verificado` é
conferência do que chegou. A retentativa é idempotente — mesmo caminho e mesma
versão substituem o mesmo objeto, e um adendo é outra versão, com outro nome.

**`education_support` e `education_evolution` nasceram do relatório de
desenvolvimento** (fase 15): a criança não é só o que deu problema. Sala de
recursos, curso, aprendizagem e a evolução escrita pela equipe entram no
documento que segue para a audiência e para a escola.

## Inventário — 99 tabelas por partição

| Partição | Tabelas |
|---|---|
| identity (13) | institution, house, app_user, user_house_assignment, work_schedule, shift_assignment, user_session, login_attempt, audit_event, institutional_device, staff_role_grant, house_capacity_change, user_invite |
| people (18) | person, care_episode, house_stay, profile_detail, health_condition, food_restriction, document, document_version, benefit_record, memory_record, transfer_request, transfer_message, admission_record, judicial_record, person_credential, person_correction, profile_detail_change, person_contact |
| shifts (11) | shift, handover, handover_receipt, handover_note, ata, ata_note, ata_addendum, ata_episode, ata_episode_ack, general_night_ata, general_night_house_entry |
| incidents (7) | incident, incident_person, incident_protected, incident_restraint, incident_synthesis, external_communication, incident_attachment |
| medications (9) | prescription, medication_schedule, medication_administration, medication_stock, medication_stock_movement, medication_protocol, medication_authorization, medication_protocol_change, prescription_restriction_change |
| activities (7) | activity, activity_assignment, activity_acknowledgement, activity_execution, substitution_request, commitment, commitment_exception |
| nursing (10) | health_encounter, health_evolution, nursing_triage, health_summary_issue, education_support, education_evolution, hospitalization, hospitalization_note, hospitalization_medication, hospitalization_companion |
| reports (6) | followup, followup_source, report_document, report_delivery, export_log, life_milestone |
| checks (4) | collective_check, check_result, check_result_amendment, check_bulk |
| notifications (3) | notification, escalation, escalation_level |
| archive (2) | archive_item, archive_attempt |
| alignments (3) | team_meeting, team_agreement, agreement_change |
| routine (2) | routine_version, routine_item |
| statements (2) | witness_option, statement |
| sync (2) | offline_operation, sync_conflict |

Cada partição guarda as próprias migrações. Remover um módulo é remover a
pasta dele — e é por isso que a lista acima é por partição, e não por assunto.

### `commitment_exception`
Uma ocorrência desmarcada de um compromisso que continua valendo. Por DATA, com
motivo e autor. Não apaga nada: a agenda continua mostrando o dia, marcado.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `commitment_id` | uuid | o compromisso que continua vigente |
| `house_id` | uuid | |
| `on_date` | date | o dia desmarcado |
| `reason` | text | mínimo 5 caracteres — quem abrir a agenda depois precisa saber |
| `created_at` / `created_by` | | |
| `undone_at` / `undone_by` | | desfazer não apaga a linha: encerra-a |

Índice único parcial por `(commitment_id, on_date) WHERE undone_at IS NULL`:
uma exceção vigente por data, e o histórico das anteriores fica.

