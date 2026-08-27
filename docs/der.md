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
