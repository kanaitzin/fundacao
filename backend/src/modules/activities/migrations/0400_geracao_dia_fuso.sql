-- ============================================================
-- A rotina noturna que duplicava a cada recarga da tela
--
-- `app_generate_day` gravava o horário certo:
--     (p_date + ri.start_time) AT TIME ZONE 'America/Sao_Paulo'
-- mas verificava a duplicidade com:
--     a.scheduled_at::date = p_date
--
-- Esse cast usa o TimeZone da SESSÃO do Postgres — que no cluster é UTC, e
-- que o projeto nunca define. Para tudo que acontece antes das 21h de Porto
-- Alegre as duas datas coincidem, e o defeito ficava invisível. Depois disso,
-- não: "Sono — 22:00" do dia 03 vira `2026-09-04 01:00Z`, cujo `::date` em UTC
-- é 04. A guarda não encontrava a atividade existente e criava outra.
--
-- Efeito prático: cada recarga da tela no plantão noturno multiplicava os
-- itens da noite — dois "Jantar", dois "Banho", dois "Sono" —, cada um pedindo
-- ciência e registro em separado, e o contador `ja_existiam` devolvia zero.
-- Justo o turno com menos gente virava o mais barulhento.
--
-- `app_generate_doses` (0200) sempre fez a comparação certa, por igualdade de
-- timestamptz. A divergência entre os dois módulos era a prova do defeito.
-- ============================================================

CREATE OR REPLACE FUNCTION app_generate_day(p_house uuid, p_date date)
RETURNS TABLE (criadas integer, ja_existiam integer) AS $$
DECLARE v_criadas integer := 0; v_exist integer := 0; v_dow smallint;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_dow := extract(dow from p_date);

  SELECT count(*) INTO v_exist FROM activity
   WHERE house_id = p_house
     AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = p_date
     AND routine_item_id IS NOT NULL;

  WITH vigente AS (
    SELECT id FROM routine_version WHERE house_id = p_house AND valid_to IS NULL
  ), novos AS (
    INSERT INTO activity (house_id, person_id, routine_item_id, kind, title,
                          scheduled_at, ends_at, requires_ack, instructions,
                          state, created_by)
    SELECT ri.house_id,
           ri.person_id,
           ri.id,
           ri.kind::text,
           ri.title,
           (p_date + ri.start_time) AT TIME ZONE 'America/Sao_Paulo',
           CASE WHEN ri.end_time IS NOT NULL
                THEN (p_date + ri.end_time) AT TIME ZONE 'America/Sao_Paulo' END,
           ri.requires_ack,
           ri.instructions,
           CASE WHEN ri.requires_ack THEN 'aguardando_ciencia'::activity_state
                ELSE 'agendada'::activity_state END,
           app_current_user()
    FROM routine_item ri
    JOIN vigente v ON v.id = ri.version_id
    WHERE ri.house_id = p_house
      AND v_dow = ANY (ri.weekdays)
      -- Comparação no fuso da INSTITUIÇÃO, igual à da gravação logo acima.
      AND NOT EXISTS (
        SELECT 1 FROM activity a
        WHERE a.routine_item_id = ri.id
          AND (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = p_date)
      -- atividade individual só nasce se o acolhido está ativo na casa hoje
      AND (ri.person_id IS NULL OR EXISTS (
        SELECT 1 FROM house_stay s
        WHERE s.person_id = ri.person_id AND s.house_id = p_house AND s.status = 'ativa'))
    RETURNING 1
  )
  SELECT count(*) INTO v_criadas FROM novos;

  RETURN QUERY SELECT v_criadas, v_exist;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_generate_day(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_generate_day(uuid, date) TO rede_app;

-- Índice único que torna a duplicidade IMPOSSÍVEL, e não apenas improvável.
-- A guarda acima é a primeira linha; esta é a última. Itens avulsos
-- (routine_item_id NULL, como a atividade urgente) ficam de fora de propósito.
CREATE UNIQUE INDEX uq_activity_rotina_dia ON activity (
  routine_item_id, ((scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date))
  WHERE routine_item_id IS NOT NULL;
