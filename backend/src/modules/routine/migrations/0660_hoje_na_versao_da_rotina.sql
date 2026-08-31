-- ---------------------------------------------------------------------------
-- Defeito 10 (rotina) — a versão da rotina fechava e abria no dia do servidor.
--
-- A rotina alterada às 21h30 encerrava a versão anterior com `valid_to` de
-- amanhã e abria a nova com `valid_from` de amanhã. Fica um dia com DUAS
-- versões vigentes no papel, e é a rotina que gera as atividades do dia
-- seguinte — o histórico passa a dizer que a casa seguiu uma grade que já
-- tinha sido substituída.
-- ---------------------------------------------------------------------------

ALTER TABLE routine_version ALTER COLUMN valid_from SET DEFAULT app_hoje();

CREATE OR REPLACE FUNCTION app_new_routine_version(p_house uuid, p_note text)
RETURNS TABLE (out_version_id uuid, out_number integer) AS $$
DECLARE v_num integer; v_id uuid; v_old uuid;
BEGIN
  IF NOT app_can_edit_profile() OR NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'sem_permissao_rotina' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT rv.id INTO v_old FROM routine_version rv WHERE rv.house_id = p_house AND rv.valid_to IS NULL;
  SELECT coalesce(max(rv.number),0) + 1 INTO v_num FROM routine_version rv WHERE rv.house_id = p_house;

  UPDATE routine_version rv SET valid_to = app_hoje()
   WHERE rv.house_id = p_house AND rv.valid_to IS NULL;

  INSERT INTO routine_version AS rv (house_id, number, note, created_by)
  VALUES (p_house, v_num, p_note, app_current_user()) RETURNING rv.id INTO v_id;

  -- Copia os itens da versão anterior: alterar a rotina não recomeça do zero.
  IF v_old IS NOT NULL THEN
    INSERT INTO routine_item (version_id, house_id, kind, title, start_time, end_time,
                              weekdays, collective, person_id, instructions, transport,
                              priority, requires_ack, created_by)
    SELECT v_id, ri.house_id, ri.kind, ri.title, ri.start_time, ri.end_time, ri.weekdays,
           ri.collective, ri.person_id, ri.instructions, ri.transport, ri.priority,
           ri.requires_ack, app_current_user()
    FROM routine_item ri WHERE ri.version_id = v_old;
  END IF;

  RETURN QUERY SELECT v_id, v_num;
END $$ LANGUAGE plpgsql SECURITY DEFINER;REVOKE ALL ON FUNCTION app_new_routine_version(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_new_routine_version(uuid, text) TO rede_app;
