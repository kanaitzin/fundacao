-- ============================================================
-- 0790 — QUEM VENCEU É QUEM AVISA (§8.5)
--
-- Defeito encontrado em 01/09/2026, às 00h38 de Porto Alegre, pela regra de
-- rodar a suíte depois das 21h.
--
-- `app_mark_unconfirmed` marca TODA atividade vencida da casa, sem limite de
-- data — está certo: uma atividade das 21h continua vencida às 2h. Mas o
-- serviço, logo depois, procurava quem avisar assim:
--
--     WHERE state = 'sem_confirmacao'
--       AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = app_hoje()
--
-- Depois da meia-noite, a atividade das 21h pertence a ONTEM. Ela era marcada
-- como "sem confirmação" e NINGUÉM era avisado. Toda noite, em silêncio, e
-- justamente no turno em que há uma pessoa sozinha com vinte crianças.
--
-- A correção é deixar de perguntar "quais são as de hoje?" e passar a usar as
-- que ESTA CHAMADA acabou de marcar. É a resposta certa em qualquer hora do
-- dia, e não depende de o relógio concordar com a data.
-- ============================================================

CREATE OR REPLACE FUNCTION app_mark_unconfirmed_ids(p_house uuid, p_minutes integer DEFAULT 60)
RETURNS TABLE (id uuid) AS $$
BEGIN
  IF p_house IS NULL THEN
    RAISE EXCEPTION 'casa_obrigatoria';
  END IF;
  -- A checagem de escopo é a PRIMEIRA coisa, como manda a regra 8: SECURITY
  -- DEFINER desliga o RLS, e sem isto qualquer conta autenticada marcaria as
  -- atividades de outra casa passando o uuid dela.
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    UPDATE activity SET state = 'sem_confirmacao', updated_at = now()
     WHERE house_id = p_house
       AND state IN ('agendada','aguardando_ciencia','ciente')
       AND scheduled_at < now() - (p_minutes || ' minutes')::interval
    RETURNING activity.id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_mark_unconfirmed_ids(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_mark_unconfirmed_ids(uuid, integer) TO rede_app;
