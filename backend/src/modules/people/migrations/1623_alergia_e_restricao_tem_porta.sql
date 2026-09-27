-- ============================================================
-- A ALERGIA E A RESTRIÇÃO ALIMENTAR GANHAM PORTA (fase 166).
--
-- A simulação do ciclo completo pediu "uma criança possui restrição
-- alimentar", e não havia como cadastrar uma. `health_condition` (alergias,
-- intolerâncias, condições) e `food_restriction` existem desde a 0020, são
-- lidas pelo perfil, pela chamada do almoço, pela folha da cozinha e pelo
-- resumo de saúde que vai ao hospital, e NINGUÉM as escrevia além da semente
-- de dados. Uma alergia nova na vida da criança não tinha onde entrar.
--
-- E as políticas de escrita conferiam só o cargo (`app_can_edit_health`), e
-- não a casa da criança: com a porta aberta, a coordenação de uma casa
-- gravaria alergia em criança de outra (a lição da 156, cargo não é casa).
--
-- Nada se apaga: encerrar é marcar, com quem, quando e por quê.
-- ============================================================

ALTER TABLE health_condition
  ADD COLUMN ended_at   timestamptz,
  ADD COLUMN ended_by   uuid REFERENCES app_user(id),
  ADD COLUMN end_reason text;

ALTER TABLE food_restriction
  ADD COLUMN ended_at   timestamptz,
  ADD COLUMN ended_by   uuid REFERENCES app_user(id),
  ADD COLUMN end_reason text;

DROP POLICY IF EXISTS hc_insert ON health_condition;
CREATE POLICY hc_insert ON health_condition FOR INSERT TO rede_app
  WITH CHECK (app_can_edit_health() AND app_person_in_scope(person_id));
DROP POLICY IF EXISTS hc_update ON health_condition;
CREATE POLICY hc_update ON health_condition FOR UPDATE TO rede_app
  USING (app_person_in_scope(person_id) AND app_can_edit_health())
  WITH CHECK (app_person_in_scope(person_id) AND app_can_edit_health());

DROP POLICY IF EXISTS fr_insert ON food_restriction;
CREATE POLICY fr_insert ON food_restriction FOR INSERT TO rede_app
  WITH CHECK (app_can_edit_health() AND app_person_in_scope(person_id));
DROP POLICY IF EXISTS fr_update ON food_restriction;
CREATE POLICY fr_update ON food_restriction FOR UPDATE TO rede_app
  USING (app_person_in_scope(person_id) AND app_can_edit_health())
  WITH CHECK (app_person_in_scope(person_id) AND app_can_edit_health());
