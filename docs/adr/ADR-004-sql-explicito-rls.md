# ADR-004 — SQL explícito + RLS como segunda camada de autorização

**Status:** aceita · **Data:** 2026-08-26

## Contexto
§4.4: "Autorizar no backend e no banco; esconder no frontend não basta". ORMs tendem a
esconder o SQL e dificultam raciocinar sobre políticas RLS, `SET LOCAL` e transações.

## Decisão
Migrações em SQL puro (`db/migrations/*.sql`, runner próprio idempotente) e acesso via
`pg` com SQL parametrizado. Toda consulta em nome de um usuário roda em
`DatabaseService.asUser(userId, fn)`: transação + `set_config('app.user_id', …, true)`.
Políticas RLS derivam escopo via funções `SECURITY DEFINER` (`app_house_in_scope` etc.).
O papel `rede_app` não é dono das tabelas, não tem DELETE e não altera `audit_event`.

## Consequências
+ IDOR/autorizações horizontais falham no banco mesmo se um serviço errar (testado).
+ Migrações legíveis e auditáveis pela instituição.
− Mais SQL escrito à mão; coberto por testes de aceite por papel.
