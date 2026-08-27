-- ============================================================
-- Plantão: quem assina, quem corrige, e a noite que atravessa a meia-noite
--
-- Três defeitos, todos encontrados por auditoria de estado.
--
-- 1. TODA ATA FECHAVA "COM PENDÊNCIA", NOMEANDO QUEM ESTAVA DE FOLGA.
--    `app_missing_handovers` listava TODOS os educadores vinculados à casa,
--    sem olhar o turno nem a escala (`work_schedule` existe desde a fundação e
--    nunca era lida). Numa casa com 6 educadores, 3 por turno, o plantão
--    diurno terminava com 3 assinaturas e 3 "faltantes" — os da noite. Isso
--    acontecia em TODO plantão, então o sinal "fechada com pendência" — a peça
--    central do §12.4 — perdia qualquer valor, e o sistema imprimia o nome de
--    profissionais que não estavam de serviço numa lista de faltas.
--
--    Decisão tomada com padrão protetivo (reversível, ver
--    docs/pendencias-institucionais.md): quando existe escala cadastrada para
--    a casa, ela manda. Quando NÃO existe, o sistema não inventa — cai no
--    comportamento antigo e DECLARA que caiu, para que a pendência seja lida
--    como "escala não cadastrada" e não como "fulano não assinou".
--
-- 2. `app_amend_ata` ERA O ÚNICO COMANDO DE ATA SEM CHECAGEM DE CASA.
--    Sendo SECURITY DEFINER, o RLS também não se aplicava: de posse de um id,
--    a equipe técnica da Casa 03 reescrevia a ATA da Casa 04 e assinava o
--    adendo em nome dela. Uma linha ausente furava o §4.4.
--
-- 3. ATA REABERTA PODIA SER REESCRITA POR QUALQUER UM DA CASA, SEM ADENDO.
--    A política de UPDATE só exigia escopo e status. Entre a reabertura (que
--    grava o "antes") e a correção (que grava o "depois"), um educador podia
--    reescrever o conteúdo por PATCH: nenhum adendo, nenhum par antes/depois,
--    e o "antes" da correção seguinte já era o texto adulterado.
-- ============================================================

-- ---------- 1. Quem devia assinar ----------
-- A assinatura de retorno ganhou a coluna `fonte` (escala ou vínculo da casa),
-- e o Postgres não troca o tipo de retorno de uma função existente.
DROP FUNCTION IF EXISTS app_missing_handovers(uuid);

CREATE OR REPLACE FUNCTION app_missing_handovers(p_shift uuid)
RETURNS TABLE (user_id uuid, full_name text, role text, fonte text) AS $$
  WITH s AS (SELECT * FROM shift WHERE id = p_shift),
  -- Há escala cadastrada para esta casa e este dia da semana?
  tem_escala AS (
    SELECT EXISTS (
      SELECT 1 FROM work_schedule w, s
      WHERE w.house_id = s.house_id
        AND w.weekday = extract(dow from s.on_date)::smallint
        AND (w.valid_to IS NULL OR w.valid_to >= s.on_date)
        AND w.valid_from <= s.on_date) AS sim
  ),
  escalados AS (
    SELECT DISTINCT w.user_id
    FROM work_schedule w, s
    WHERE w.house_id = s.house_id
      AND w.weekday = extract(dow from s.on_date)::smallint
      AND (w.valid_to IS NULL OR w.valid_to >= s.on_date)
      AND w.valid_from <= s.on_date
      -- Turno pelo horário de início: noturno é o que começa às 19h ou depois,
      -- ou o que cruza a meia-noite (end_time < start_time).
      AND (CASE WHEN w.start_time >= TIME '19:00' OR w.end_time < w.start_time
                THEN 'noturno' ELSE 'diurno' END) = s.period
  )
  SELECT u.id, u.full_name, u.role::text,
         CASE WHEN (SELECT sim FROM tem_escala) THEN 'escala' ELSE 'vinculo_da_casa' END
  FROM s
  JOIN user_house_assignment a ON a.house_id = s.house_id AND a.valid_to IS NULL
  JOIN app_user u ON u.id = a.user_id AND u.active
  WHERE u.role IN ('educador','lider_diurno')
    AND ((SELECT sim FROM tem_escala) IS FALSE OR u.id IN (SELECT user_id FROM escalados))
    AND NOT EXISTS (SELECT 1 FROM handover h WHERE h.shift_id = p_shift AND h.user_id = u.id)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_missing_handovers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_missing_handovers(uuid) TO rede_app;

-- ---------- 2. Correção da ATA: escopo de casa ----------
CREATE OR REPLACE FUNCTION app_amend_ata(p_ata uuid, p_reason text, p_content jsonb)
RETURNS TABLE (out_version integer, out_status text) AS $$
DECLARE v_me uuid; v_role role_code; v_ata ata%ROWTYPE; v_status text;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  IF v_role NOT IN ('equipe_tecnica','coordenador') THEN RAISE EXCEPTION 'cargo_nao_corrige_ata'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 15 THEN RAISE EXCEPTION 'motivo_insuficiente'; END IF;

  SELECT * INTO v_ata FROM ata WHERE id = p_ata FOR UPDATE;
  IF v_ata.id IS NULL THEN RAISE EXCEPTION 'ata_inexistente'; END IF;
  -- A linha que faltava.
  IF NOT app_house_in_scope(v_ata.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF v_ata.status <> 'reaberta' THEN RAISE EXCEPTION 'ata_nao_reaberta'; END IF;

  v_status := CASE WHEN v_ata.missing_signatures > 0 THEN 'fechada_com_pendencia' ELSE 'fechada' END;

  INSERT INTO ata_addendum (ata_id, kind, reason, before_state, after_state, author_id)
  VALUES (p_ata, 'correcao', btrim(p_reason),
          jsonb_build_object('conteudo', v_ata.content),
          jsonb_build_object('conteudo', p_content), v_me);

  UPDATE ata SET content = p_content, status = v_status, closed_by = v_me, closed_at = now()
   WHERE id = p_ata;
  UPDATE shift SET status = CASE WHEN v_ata.missing_signatures > 0
                                 THEN 'fechado_com_pendencia' ELSE 'fechado' END
   WHERE id = v_ata.shift_id;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose)
  VALUES (v_ata.house_id, v_me, 'ata.amend', 'ata', p_ata, btrim(p_reason));

  RETURN QUERY SELECT v_ata.version, v_status;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_amend_ata(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_amend_ata(uuid, text, jsonb) TO rede_app;

-- ---------- 3. Quem edita a ATA, e quando ----------
-- Rascunho: a equipe do plantão preenche. Reaberta: só quem reabriu pode
-- mexer — e mesmo assim o caminho previsto é `app_amend_ata`, que grava o
-- antes e o depois.
DROP POLICY IF EXISTS ata_update ON ata;
CREATE POLICY ata_update ON ata FOR UPDATE TO rede_app
  USING (
    app_house_in_scope(house_id)
    AND (
      (status = 'rascunho' AND app_current_role() IN
        ('educador','lider_diurno','lider_noturno_geral','equipe_tecnica','coordenador'))
      OR (status = 'reaberta' AND app_current_role() IN ('equipe_tecnica','coordenador'))
    ))
  WITH CHECK (app_house_in_scope(house_id));

-- ---------- 4. Fechar a ATA duas vezes ----------
-- Dois líderes clicando junto passavam os dois pela guarda `ata_ja_fechada`:
-- o segundo sobrescrevia quem fechou, e saíam dois escalonamentos.
CREATE OR REPLACE FUNCTION app_close_ata(p_ata uuid, p_pendencies text)
RETURNS TABLE (out_status text, out_missing integer) AS $$
DECLARE v_me uuid; v_role role_code; v_ata ata%ROWTYPE; v_missing integer; v_status text;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_ata FROM ata WHERE id = p_ata FOR UPDATE;
  IF v_ata.id IS NULL THEN RAISE EXCEPTION 'ata_inexistente'; END IF;
  IF NOT app_house_in_scope(v_ata.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF v_ata.status IN ('fechada','fechada_com_pendencia') THEN RAISE EXCEPTION 'ata_ja_fechada'; END IF;

  IF v_ata.period = 'diurno' THEN
    IF v_role NOT IN ('lider_diurno','equipe_tecnica','coordenador') THEN
      RAISE EXCEPTION 'cargo_nao_fecha_ata:diurno';
    END IF;
  ELSE
    IF v_role NOT IN ('lider_noturno_geral','equipe_tecnica','coordenador') THEN
      RAISE EXCEPTION 'cargo_nao_fecha_ata:noturno';
    END IF;
  END IF;

  SELECT count(*)::int INTO v_missing FROM app_missing_handovers(v_ata.shift_id);
  v_status := CASE WHEN v_missing > 0 THEN 'fechada_com_pendencia' ELSE 'fechada' END;

  UPDATE ata SET status = v_status, closed_by = v_me, closed_at = now(),
                 missing_signatures = v_missing,
                 pendencies = coalesce(p_pendencies, pendencies)
   WHERE id = p_ata;
  UPDATE shift SET status = CASE WHEN v_missing > 0 THEN 'fechado_com_pendencia' ELSE 'fechado' END,
                   closed_by = v_me, closed_at = now()
   WHERE id = v_ata.shift_id;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_ata.house_id, v_me, 'ata.close', 'ata', p_ata,
          jsonb_build_object('status', v_status, 'assinaturas_faltantes', v_missing));

  RETURN QUERY SELECT v_status, v_missing;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_close_ata(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_close_ata(uuid, text) TO rede_app;

-- Mesma trava na reabertura: duas reaberturas simultâneas gravavam dois
-- adendos e avançavam a versão uma vez só.
CREATE OR REPLACE FUNCTION app_reopen_ata(p_ata uuid, p_reason text)
RETURNS TABLE (out_version integer) AS $$
DECLARE v_me uuid; v_role role_code; v_ata ata%ROWTYPE;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  IF v_role NOT IN ('equipe_tecnica','coordenador') THEN
    RAISE EXCEPTION 'cargo_nao_reabre_ata';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 15 THEN RAISE EXCEPTION 'motivo_insuficiente'; END IF;

  SELECT * INTO v_ata FROM ata WHERE id = p_ata FOR UPDATE;
  IF v_ata.id IS NULL THEN RAISE EXCEPTION 'ata_inexistente'; END IF;
  IF NOT app_house_in_scope(v_ata.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF v_ata.status NOT IN ('fechada','fechada_com_pendencia') THEN RAISE EXCEPTION 'ata_nao_esta_fechada'; END IF;

  INSERT INTO ata_addendum (ata_id, kind, reason, before_state, after_state, author_id)
  VALUES (p_ata, 'reabertura', btrim(p_reason),
          jsonb_build_object('status', v_ata.status, 'versao', v_ata.version, 'conteudo', v_ata.content),
          NULL, v_me);

  UPDATE ata SET status = 'reaberta', version = v_ata.version + 1 WHERE id = p_ata;
  UPDATE shift SET status = 'reaberto' WHERE id = v_ata.shift_id;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose, detail)
  VALUES (v_ata.house_id, v_me, 'ata.reopen', 'ata', p_ata, btrim(p_reason),
          jsonb_build_object('versao_anterior', v_ata.version));

  RETURN QUERY SELECT v_ata.version + 1;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_reopen_ata(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_reopen_ata(uuid, text) TO rede_app;
