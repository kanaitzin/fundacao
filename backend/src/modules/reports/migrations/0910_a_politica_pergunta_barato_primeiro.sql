-- =========================================================================
-- A POLÍTICA QUE PERGUNTAVA CARO ANTES DE PERGUNTAR BARATO — 04/09/2026
--
-- `marco_select` era:
--
--     USING (app_person_in_scope(person_id)
--            OR app_current_role() IN ('gestor_geral','admin_tecnico'))
--
-- Está correta, e é lenta pelo motivo mais escorregadio que existe em SQL:
-- **o `OR` não garante a ordem de avaliação**. O Postgres pode perguntar
-- primeiro `app_person_in_scope(person_id)` — que é uma consulta por LINHA — e
-- só depois descobrir que o Gestor Geral alcançava tudo de qualquer jeito.
--
-- Com um ano das oito casas (1 920 marcos), a tela do trabalho social levava
-- ~400 ms, e o painel ~350 ms. O `LIMIT` da consulta não ajudava em nada: o
-- filtro da política roda ANTES de cortar.
--
-- `CASE` garante a ordem. A pergunta barata — qual é o papel de quem está
-- perguntando — vem primeiro, e para quem alcança tudo a cara nem é feita.
--
-- É a mesma correção que a `int_select` já tinha recebido na fase 53, por
-- outro motivo (visibilidade dentro do mesmo comando). Vale como padrão para
-- toda política deste sistema: **primeiro o papel, depois o escopo por linha**.
-- =========================================================================

DROP POLICY IF EXISTS marco_select ON life_milestone;

CREATE POLICY marco_select ON life_milestone FOR SELECT TO rede_app
  USING (
    CASE
      WHEN app_current_role() IN ('gestor_geral', 'admin_tecnico') THEN true
      ELSE app_person_in_scope(person_id)
    END);

/*
 * O mesmo cuidado na ESCRITA. Aqui o ganho é pequeno — insere-se uma linha
 * por vez —, mas deixar as duas com formas diferentes é o começo de alguém
 * "consertar" uma delas de volta.
 */
DROP POLICY IF EXISTS marco_insert ON life_milestone;

CREATE POLICY marco_insert ON life_milestone FOR INSERT TO rede_app
  WITH CHECK (
    app_current_role() IN ('equipe_tecnica', 'coordenador', 'gestor_geral')
    AND CASE
          WHEN app_current_role() = 'gestor_geral' THEN true
          ELSE app_person_in_scope(person_id)
        END);
