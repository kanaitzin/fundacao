-- ============================================================================
-- A AUDITORIA PASSA A SER LIDA — e por isso precisa de índice.
--
-- Ela era escrita por todo serviço e não tinha rota que a lesse (§9, item 1).
-- Os dois índices que existem desde a 0010 servem a quem NÃO vai perguntar:
-- `idx_audit_actor` (actor_id, at) é a busca por pessoa, que a fase 112
-- recusou construir; `idx_audit_house` (house_id, at) é a casa inteira, que é
-- larga demais para responder "quem abriu o dossiê da Alice".
--
-- As duas perguntas que a tela faz entram pela ENTIDADE:
--
--   * o que foi feito sobre uma criança — `entity_id`, e o `personId` que os
--     serviços escrevem no detalhe;
--   * quem abriu ou exportou este registro — `entity` + `entity_id`.
--
-- Sem estes índices, cada consulta varre a tabela que mais cresce do sistema.
-- E o comentário da 0920 vale aqui inteiro: **uma tela de auditoria que demora
-- é uma tela que não se consulta** — e auditoria que ninguém consulta é a
-- mesma coisa que auditoria que ninguém pode consultar, que era o defeito.
--
-- O índice do `personId` é PARCIAL: só as linhas que têm a chave no detalhe.
-- São a minoria, e um índice sobre uma expressão que quase sempre é nula custa
-- escrita em toda gravação do sistema para servir a poucas leituras.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_entidade
  ON audit_event (entity, entity_id, at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_entity_id
  ON audit_event (entity_id, at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_detalhe_pessoa
  ON audit_event ((detail->>'personId'), at DESC)
  WHERE detail ? 'personId';
