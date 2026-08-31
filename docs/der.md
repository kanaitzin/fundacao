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

> **Nota de cobertura.** Este DER documenta a fundação, a fase 2 e as tabelas
> acima. As fases 3 a 7 (rotina, atividades, chamadas, medicamentos,
> enfermagem, plantão, ocorrências, acompanhamentos, arquivo) estão descritas
> nas migrações de cada módulo, que são a fonte com comentários, mas ainda não
> foram trazidas para cá. É a maior lacuna da documentação hoje.
