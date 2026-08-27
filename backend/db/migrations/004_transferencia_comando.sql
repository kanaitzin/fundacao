-- ============================================================
-- Rede Acolher — Migração 004: transferência como comando de sistema
--
-- Problema encontrado no teste de aceite (cenário #6):
-- efetivar uma transferência exige encerrar a permanência na casa de ORIGEM,
-- mas quem aceita é a casa de DESTINO — que legitimamente não tem (e não deve
-- ter) escrita sobre registros da origem. Dar essa permissão ao destino
-- abriria um buraco no isolamento entre casas.
--
-- Solução: a transição é um COMANDO DE SISTEMA (§25 — "transferência usa
-- comandos específicos, não atualização genérica"), executado com privilégio
-- e com a autorização verificada DENTRO da função. O usuário nunca ganha
-- escrita ampla sobre a outra casa.
-- ============================================================

CREATE OR REPLACE FUNCTION app_accept_transfer(p_transfer uuid)
RETURNS TABLE (person_id uuid, from_house uuid, to_house uuid, episode_id uuid) AS $$
DECLARE
  t transfer_request%ROWTYPE;
BEGIN
  SELECT * INTO t FROM transfer_request WHERE id = p_transfer AND status = 'solicitada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transferencia_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Autorização explícita: só equipe técnica/coordenação/gestor do DESTINO decide.
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(t.to_house_id) THEN
    RAISE EXCEPTION 'sem_permissao_no_destino' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Transição atômica: encerra na origem, abre no destino, decide a solicitação.
  -- O histórico não é apagado — a permanência antiga permanece como 'encerrada'.
  UPDATE house_stay SET status = 'encerrada', ended_at = now(), end_reason = 'transferencia'
   WHERE house_stay.person_id = t.person_id AND status = 'ativa';

  INSERT INTO house_stay (episode_id, person_id, house_id, created_by)
  VALUES (t.episode_id, t.person_id, t.to_house_id, app_current_user());

  UPDATE transfer_request SET status = 'aceita', decided_by = app_current_user(), decided_at = now()
   WHERE id = p_transfer;

  RETURN QUERY SELECT t.person_id, t.from_house_id, t.to_house_id, t.episode_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_accept_transfer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_accept_transfer(uuid) TO rede_app;

-- ---------- Endurecimento: permanência só na própria casa ----------
-- A inserção genérica de permanência passa a exigir que a casa esteja no
-- escopo de quem escreve. A transferência continua funcionando porque usa o
-- comando de sistema acima, que valida a autorização por conta própria.
DROP POLICY IF EXISTS stay_insert ON house_stay;
CREATE POLICY stay_insert ON house_stay FOR INSERT TO rede_app
  WITH CHECK (app_can_edit_profile() AND app_house_in_scope(house_id));

-- Encerrar permanência exige a casa no escopo (a origem encerra a própria).
DROP POLICY IF EXISTS stay_update ON house_stay;
CREATE POLICY stay_update ON house_stay FOR UPDATE TO rede_app
  USING (app_can_edit_profile() AND app_house_in_scope(house_id))
  WITH CHECK (app_can_edit_profile());
