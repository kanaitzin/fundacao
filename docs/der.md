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

**`medication_protocol` existe porque a instituição ainda não decidiu** quem
administra em cada período (pendência 33.4.1). Em vez de inventar uma regra
invisível, a decisão virou configuração por casa, com data e autor.

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

## Inventário — 84 tabelas por partição

| Partição | Tabelas |
|---|---|
| identity (12) | institution, house, app_user, user_house_assignment, work_schedule, user_session, login_attempt, audit_event, institutional_device, staff_role_grant, house_capacity_change, user_invite |
| people (16) | person, care_episode, house_stay, profile_detail, health_condition, food_restriction, document, document_version, benefit_record, memory_record, transfer_request, transfer_message, admission_record, judicial_record, person_credential, person_correction |
| shifts (10) | shift, handover, handover_receipt, handover_note, ata, ata_addendum, ata_episode, ata_episode_ack, general_night_ata, general_night_house_entry |
| incidents (7) | incident, incident_person, incident_protected, incident_restraint, incident_synthesis, external_communication, incident_attachment |
| medications (7) | prescription, medication_schedule, medication_administration, medication_stock, medication_stock_movement, medication_protocol, medication_authorization |
| activities (6) | activity, activity_assignment, activity_acknowledgement, activity_execution, substitution_request, commitment |
| nursing (6) | health_encounter, health_evolution, nursing_triage, health_summary_issue, education_support, education_evolution |
| reports (5) | followup, followup_source, report_document, report_delivery, export_log |
| checks (4) | collective_check, check_result, check_result_amendment, check_bulk |
| notifications (3) | notification, escalation, escalation_level |
| archive (2) | archive_item, archive_attempt |
| routine (2) | routine_version, routine_item |
| statements (2) | witness_option, statement |
| sync (2) | offline_operation, sync_conflict |

Cada partição guarda as próprias migrações. Remover um módulo é remover a
pasta dele — e é por isso que a lista acima é por partição, e não por assunto.
