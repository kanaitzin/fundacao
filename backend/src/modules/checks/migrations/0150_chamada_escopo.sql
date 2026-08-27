-- ============================================================
-- Módulo `checks` — Migração 0150: a chamada só alcança quem está na casa
--
-- Furo encontrado pelo teste de aceite do cenário #10: a política de escrita
-- exigia autoria própria e chamada existente, mas NÃO verificava se o acolhido
-- pertencia à casa da chamada. Era possível registrar resultado para alguém de
-- outra unidade — inclusive para quem acabara de ser transferido.
--
-- Isso contraria o isolamento entre casas (§4.4, §5.13): a conferência é da
-- casa, e só alcança quem tem permanência ativa nela.
-- ============================================================

DROP POLICY IF EXISTS cr_insert ON check_result;
CREATE POLICY cr_insert ON check_result FOR INSERT TO rede_app
  WITH CHECK (
    recorded_by = app_current_user()                      -- quem marca assina
    AND EXISTS (
      SELECT 1
      FROM collective_check k
      JOIN house_stay s ON s.house_id = k.house_id
                       AND s.person_id = check_result.person_id
                       AND s.status = 'ativa'
      WHERE k.id = check_result.check_id
        AND k.status = 'aberta'                            -- chamada confirmada não recebe nova marcação
    ));

DROP POLICY IF EXISTS cr_update ON check_result;
CREATE POLICY cr_update ON check_result FOR UPDATE TO rede_app
  USING (EXISTS (
    SELECT 1 FROM collective_check k
    WHERE k.id = check_result.check_id AND k.status = 'aberta'
      AND app_house_in_scope(k.house_id)))
  WITH CHECK (recorded_by = app_current_user());
