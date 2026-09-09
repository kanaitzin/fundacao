# ADR-002 — Sessões opacas no banco, em vez de JWT

**Status:** aceita · **Data:** 2026-08-26

## Contexto
§4.5 exige revogação de sessão (aparelho perdido, desligamento, incidente). JWT
stateless não revoga sem lista de bloqueio — que reintroduz o estado que o JWT evitaria.

## Decisão
Token opaco de 256 bits; somente `sha256(token+pepper)` vai ao banco. Validação por
request com `UPDATE ... RETURNING` (atualiza `last_used_at`). Revogação individual
(logout) e em massa (`revokeAll`). `last_reauth_at` registra confirmação de senha para
ações altamente sensíveis. Revogação offline vale na primeira reconexão (§17.6).

## Consequências
+ Revogação imediata; sessões enumeráveis por usuário; auditoria natural.
− Uma consulta por request (irrelevante nesta escala; cache seria otimização futura).
