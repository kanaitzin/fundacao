-- ============================================================
-- 1170 — A data que nascia em UTC
--
-- `current_date` devolve o dia do fuso da SESSÃO. O servidor roda em UTC, e
-- depois das 21h de Porto Alegre lá já é o dia seguinte — que é justamente
-- quando o sistema é usado. A 0630 criou `app_hoje()` para isso, e duas
-- colunas continuaram nascendo com a data errada:
--
--   * `house_statute.since` (1150, fase 95). Uma regra de convivência escrita
--     às 22h nascia valendo AMANHÃ: a tela dizia "ainda não está valendo" e a
--     folha que vai para a parede saía sem ela. Três horas por dia, todo dia;
--   * `work_schedule.valid_from` (0010). A escala criada à noite passava a
--     valer um dia depois do que quem a criou escolheu.
--
-- Achado na fase 99 por uma sabotagem que NÃO reprovou: o teste do estatuto
-- passou com o código errado à meia-noite, e reprovou com o código CERTO
-- quando o relógio foi para as 22h. O defeito não estava onde eu procurava —
-- estava no `DEFAULT` da tabela, um degrau abaixo.
--
-- A conferência que fica é `test/arquitetura.spec.ts`, e ela PERGUNTA AO
-- BANCO (`pg_attrdef`) em vez de ler o texto das migrações: `DEFAULT` antigo
-- corrigido por `ALTER` depois some da consulta ao catálogo, e não some do
-- `grep`.
-- ============================================================

ALTER TABLE house_statute ALTER COLUMN since SET DEFAULT app_hoje();
ALTER TABLE work_schedule ALTER COLUMN valid_from SET DEFAULT app_hoje();

COMMENT ON COLUMN house_statute.since IS
  'A partir de quando a regra vale. Nasce com app_hoje() — o dia da instituição, não o do servidor (1170).';
