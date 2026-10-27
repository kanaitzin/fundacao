-- =============================================================================
-- 1666 — QUEM TEM O RELATO PEDIDO É AVISADO.
--
-- Achado na varredura dos caminhos sem fim (fase 250). A 1000 criou a cobrança
-- porque "nada pedia o relato a ninguém, e quem não estivesse olhando a
-- ocorrência simplesmente não escrevia". A cobrança nasceu, mas só aparecia
-- para quem abrisse a tela de Ocorrências: o educador cobrado não recebia
-- aviso nenhum, e a falta continuava aparecendo dias depois.
--
-- A função passa a devolver quem foi cobrado AGORA (só os novos: reabrir a
-- ocorrência não repete o aviso), e o serviço avisa cada um pelo aviso direto.
-- O aviso não leva o fato, só diz que o relato foi pedido e onde escrever.
--
-- O retorno muda, então a função é derrubada e recriada.
-- =============================================================================

DROP FUNCTION IF EXISTS app_cobrar_relatos(uuid, text, text, uuid, text, timestamptz);

CREATE FUNCTION app_cobrar_relatos(
  p_house uuid, p_context text, p_entity text, p_entity_id uuid,
  p_prompt text, p_quando timestamptz DEFAULT now())
RETURNS TABLE (cobrados integer, origem text, pessoas uuid[]) AS $$
DECLARE
  v_dia date := (p_quando AT TIME ZONE app_fuso())::date;
  v_origem text;
  v_n integer := 0;
  v_pessoas uuid[];
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A escala do dia, se houver. Os dois turnos: o episódio das 6h50 pega o
  -- noturno que ainda está lá e o diurno que acabou de chegar.
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM shift_assignment s
     WHERE s.house_id = p_house AND s.on_date = v_dia AND s.revoked_at IS NULL
  ) THEN 'escala' ELSE 'vinculo' END INTO v_origem;

  WITH candidatos AS (
    SELECT DISTINCT s.user_id
      FROM shift_assignment s
     WHERE v_origem = 'escala'
       AND s.house_id = p_house AND s.on_date = v_dia AND s.revoked_at IS NULL
    UNION
    /*
     * Sem escala montada, cai no vínculo — e a coluna `origem` DIZ isso. Sem
     * essa distinção, a lista de "quem falta" pareceria a mesma coisa nos dois
     * casos, e ela não é: uma sabe quem estava na casa, a outra chuta.
     */
    SELECT a.user_id
      FROM user_house_assignment a
      JOIN app_user u ON u.id = a.user_id
     WHERE v_origem = 'vinculo'
       AND a.house_id = p_house AND a.valid_to IS NULL AND u.active
       AND u.role IN ('educador','lider_diurno','lider_noturno_geral')
  ), novas AS (
    INSERT INTO statement_request
      (house_id, context, entity, entity_id, user_id, prompt, origem, opened_by)
    SELECT p_house, p_context, p_entity, p_entity_id, c.user_id,
           btrim(p_prompt), v_origem, app_current_user()
      FROM candidatos c
     WHERE c.user_id IS NOT NULL
    -- Reabrir a mesma ocorrência não duplica a cobrança de quem já respondeu.
    ON CONFLICT (entity, entity_id, user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT count(*)::integer, coalesce(array_agg(user_id), '{}') INTO v_n, v_pessoas FROM novas;

  RETURN QUERY SELECT v_n, v_origem, v_pessoas;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_cobrar_relatos(uuid, text, text, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cobrar_relatos(uuid, text, text, uuid, text, timestamptz) TO rede_app;
