-- =============================================================================
-- 0960 — QUEM DEVIA ASSINAR VEM DA ESCALA DA CASA (§12.1, §12.4)
--
-- A 0420 corrigiu o defeito em que TODA ATA fechava "com pendência" nomeando
-- quem estava de folga: `app_missing_handovers` listava todos os educadores
-- vinculados à casa. A correção passou a ler `work_schedule` — a escala
-- SEMANAL — e a DECLARAR a fonte, para a pendência ser lida como "escala não
-- cadastrada" e não como "fulano não assinou".
--
-- O buraco que sobrou: a Fundação trabalha em 12x36, e uma 12x36 não cabe numa
-- semana (o ciclo é de 48 horas e anda pelo calendário). Na prática, nenhuma
-- casa tinha `work_schedule` cadastrada, e o sistema caía no vínculo da casa em
-- todo plantão — que é o comportamento antigo, agora declarado.
--
-- Com a escala POR DATA (migração 0950), a pergunta tem resposta exata: quem
-- estava escalado para AQUELE dia e AQUELE turno. A ordem passa a ser:
--
--   1. escala por data (`shift_assignment`) — a que a coordenação montou;
--   2. escala semanal (`work_schedule`) — para quem tem horário fixo;
--   3. vínculo da casa — o padrão antigo, declarado como tal.
--
-- A `fonte` continua saindo na resposta, porque ela muda o que a tela diz:
-- "faltou assinar" quando há escala, "escala não cadastrada" quando não há.
-- =============================================================================

DROP FUNCTION IF EXISTS app_missing_handovers(uuid);

CREATE OR REPLACE FUNCTION app_missing_handovers(p_shift uuid)
RETURNS TABLE (user_id uuid, full_name text, role text, fonte text) AS $$
  WITH s AS (SELECT * FROM shift WHERE id = p_shift),
  -- 1) A escala por data desta casa, neste dia, neste turno.
  por_data AS (
    SELECT a.user_id
      FROM shift_assignment a, s
     WHERE a.house_id = s.house_id
       AND a.on_date = s.on_date
       AND a.period = s.period
       AND a.revoked_at IS NULL
  ),
  -- 2) A semanal, para quem tem horário fixo.
  tem_semanal AS (
    SELECT EXISTS (
      SELECT 1 FROM work_schedule w, s
      WHERE w.house_id = s.house_id
        AND w.weekday = extract(dow from s.on_date)::smallint
        AND (w.valid_to IS NULL OR w.valid_to >= s.on_date)
        AND w.valid_from <= s.on_date) AS sim
  ),
  semanal AS (
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
  ),
  fonte AS (
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM por_data) THEN 'escala_do_dia'
      WHEN (SELECT sim FROM tem_semanal)   THEN 'escala_semanal'
      ELSE 'vinculo_da_casa' END AS f
  ),
  -- O vínculo da casa deixou de ser o FILTRO e virou uma das três fontes.
  -- Quem cobre um turno vindo de outra casa está na escala do dia e não no
  -- vínculo desta — e é justamente dele que a ATA precisa da assinatura.
  vinculados AS (
    SELECT a.user_id FROM user_house_assignment a, s
     WHERE a.house_id = s.house_id AND a.valid_to IS NULL
  )
  SELECT u.id, u.full_name, u.role::text, (SELECT f FROM fonte)
  FROM app_user u
  WHERE u.active
    AND u.role IN ('educador','lider_diurno')
    AND CASE (SELECT f FROM fonte)
          WHEN 'escala_do_dia'   THEN u.id IN (SELECT user_id FROM por_data)
          WHEN 'escala_semanal'  THEN u.id IN (SELECT user_id FROM semanal)
          ELSE u.id IN (SELECT user_id FROM vinculados)
        END
    AND NOT EXISTS (SELECT 1 FROM handover h WHERE h.shift_id = p_shift AND h.user_id = u.id)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_missing_handovers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_missing_handovers(uuid) TO rede_app;
