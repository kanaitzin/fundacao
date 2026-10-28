-- =============================================================================
-- 1667 — ONDE MORA A CIÊNCIA DO SUBSTITUTO.
--
-- Achado na varredura das colunas que marcam um fim (fase 252): nada no sistema
-- escreve nem lê `substitution_request.acknowledged_at`. A 0110 a criou com o
-- comentário "ciência do substituto", e a ciência nunca morou aqui: quem assume
-- toma ciência da ATIVIDADE (`activity_acknowledgement`, a mesma ciência de toda
-- atividade), e é ela que tira a atividade de "aguardando ciência".
--
-- A coluna não é apagada (DROP COLUMN é migração destrutiva). Fica o comentário
-- dizendo a verdade, para ninguém ler um vazio aqui como "o substituto não tomou
-- ciência". Não é declarada MORTA porque a guarda das mortas confere pelo nome,
-- e `acknowledged_at` é também a ciência do aviso (`notification`), que é usada.
-- =============================================================================

COMMENT ON COLUMN substitution_request.acknowledged_at IS
  'SEM USO desde a 0110: a ciência de quem assume mora em activity_acknowledgement, '
  'na atividade, e é ela que tira a atividade de aguardando ciência. Nada escreve '
  'nem lê esta coluna; vazio aqui não diz que o substituto deixou de tomar ciência.';
