-- ---------------------------------------------------------------------------
-- Defeito 10 (medicamentos) — "hoje" do servidor virava dose perdida.
--
-- Depois das 21h de Porto Alegre o servidor em UTC já está no dia seguinte:
--
--   * prescrição criada no plantão da noite nascia com `starts_on` = amanhã.
--     `app_generate_doses` filtra por `starts_on <= p_date`, então a dose
--     daquela noite não era gerada. Ninguém tinha o que confirmar, e o
--     registro que faltava só aparecia como buraco no dia seguinte;
--   * autorização com `valid_to = hoje` já constava vencida às 21h, e o
--     educador autorizado ouvia "você não consta como educador autorizado"
--     no meio do plantão — a hora em que menos se tem tempo de investigar.
--
-- Troca para `app_hoje()` (identity/0630). Nenhuma linha gravada é alterada.
-- ---------------------------------------------------------------------------

ALTER TABLE prescription             ALTER COLUMN starts_on  SET DEFAULT app_hoje();
ALTER TABLE medication_authorization ALTER COLUMN valid_from SET DEFAULT app_hoje();

CREATE OR REPLACE FUNCTION app_can_administer(p_house uuid, p_period text)
RETURNS TABLE (pode boolean, motivo text) AS $$
DECLARE v_role role_code; v_prot medication_protocol%ROWTYPE;
BEGIN
  v_role := app_current_role();

  IF v_role = 'enfermagem' THEN
    RETURN QUERY SELECT true, NULL::text; RETURN;
  END IF;

  IF v_role NOT IN ('educador','lider_diurno') THEN
    RETURN QUERY SELECT false, 'Somente a Enfermagem e educadores autorizados pelo protocolo confirmam doses.'::text;
    RETURN;
  END IF;

  SELECT * INTO v_prot FROM medication_protocol
   WHERE house_id = p_house AND period IN (p_period, 'integral')
   ORDER BY CASE WHEN period = p_period THEN 0 ELSE 1 END LIMIT 1;

  IF v_prot.id IS NULL OR NOT v_prot.allows_authorized_educator THEN
    RETURN QUERY SELECT false,
      'O protocolo desta casa não autoriza educadores a confirmar doses neste período. Acione a Enfermagem.'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM medication_authorization a
    WHERE a.user_id = app_current_user() AND a.house_id = p_house
      AND a.valid_from <= app_hoje() AND (a.valid_to IS NULL OR a.valid_to >= app_hoje())) THEN
    RETURN QUERY SELECT false,
      'Você não consta como educador autorizado no protocolo vigente desta casa.'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;REVOKE ALL ON FUNCTION app_can_administer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_can_administer(uuid, text) TO rede_app;
