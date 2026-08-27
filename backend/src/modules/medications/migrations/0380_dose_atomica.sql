-- ============================================================
-- A dose volta a ser um ato indivisível
--
-- Três defeitos no mesmo comando, encontrados numa auditoria de concorrência:
--
-- 1. SEM TRAVA DE LINHA. O `SELECT ... INTO v_adm` não usava `FOR UPDATE`. Em
--    READ COMMITTED, duas transações liam `administered_by = NULL`, as duas
--    passavam pela guarda "dose_ja_confirmada", e a segunda reavaliava o WHERE
--    do UPDATE e SOBRESCREVIA a primeira.
--
--    Cenário real: às 19h a educadora administra e confirma "administrado no
--    horário". No mesmo segundo o colega, que não viu, marca "recusado". O
--    registro final diz recusado, por ele — e o ato dela some, porque a
--    administração é UPDATE, não append. Num sistema em que "uma dose = uma
--    confirmação de quem administrou" é a regra central (§11.2), este era o
--    único ato sensível apoiado num SELECT sem trava, enquanto passagem,
--    chamada e ciência já tinham índice único.
--
-- 2. UMA DOSE BAIXAVA DOIS ESTOQUES. `medication_stock` tem UNIQUE
--    (house_id, medication, person_id): o estoque comum da casa e o nominal da
--    criança são DUAS linhas, e o UPDATE atingia as duas. Depois de vinte
--    doses, o estoque comum aparecia com vinte a menos sem ninguém ter tocado
--    nele — e o alerta de estoque baixo passava a mentir nas duas direções.
--
-- 3. 18:59:01 A 18:59:59 NÃO ERAM DE NENHUM PERÍODO. `BETWEEN '07:00' AND
--    '18:59'` deixa esse minuto de fora do diurno; a dose caía no protocolo
--    noturno por 59 segundos.
-- ============================================================

CREATE OR REPLACE FUNCTION app_confirm_dose(
  p_admin_id uuid, p_state text, p_note text, p_happened_at timestamptz,
  p_offline boolean, p_device text, p_institutional boolean, p_client_op text
) RETURNS TABLE (out_id uuid, out_state text) AS $$
DECLARE
  v_adm medication_administration%ROWTYPE;
  v_period text; v_pode boolean; v_motivo text; v_med text; v_nominal boolean;
BEGIN
  -- FOR UPDATE: a segunda transação espera aqui e, ao prosseguir, enxerga a
  -- confirmação da primeira — e para na guarda logo abaixo.
  SELECT * INTO v_adm FROM medication_administration WHERE id = p_admin_id FOR UPDATE;
  IF v_adm.id IS NULL THEN
    RAISE EXCEPTION 'dose_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_adm.administered_by IS NOT NULL THEN
    RAISE EXCEPTION 'dose_ja_confirmada' USING ERRCODE = 'unique_violation';
  END IF;

  -- Período pelo horário previsto, no fuso da instituição. `< '19:00'` em vez
  -- de `BETWEEN ... '18:59'`: sem buraco no último minuto da tarde.
  v_period := CASE
    WHEN (v_adm.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::time
         >= TIME '07:00'
     AND (v_adm.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::time
         <  TIME '19:00' THEN 'diurno' ELSE 'noturno' END;

  SELECT c.pode, c.motivo INTO v_pode, v_motivo FROM app_can_administer(v_adm.house_id, v_period) c;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'protocolo: %', v_motivo USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Offline, só o aparelho institucional designado confirma (§11.7).
  IF p_offline AND NOT coalesce(p_institutional, false) THEN
    RAISE EXCEPTION 'aparelho_nao_institucional' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE medication_administration
     SET state = p_state::administration_state,
         administered_by = app_current_user(),
         administered_at = coalesce(p_happened_at, now()),
         recorded_at = now(),
         synced_at = CASE WHEN p_offline THEN now() END,
         offline = coalesce(p_offline, false),
         device = p_device,
         institutional_device = coalesce(p_institutional, false),
         note = p_note,
         client_op_id = p_client_op
   WHERE id = p_admin_id;

  -- Baixa de estoque: UMA linha, nunca duas. O estoque nominal do acolhido tem
  -- precedência sobre o comum da casa — é dele que a dose saiu.
  IF p_state LIKE 'administrado%' THEN
    SELECT pr.medication INTO v_med FROM prescription pr WHERE pr.id = v_adm.prescription_id;

    SELECT EXISTS (
      SELECT 1 FROM medication_stock st
      WHERE st.house_id = v_adm.house_id AND st.medication = v_med
        AND st.person_id = v_adm.person_id) INTO v_nominal;

    UPDATE medication_stock st SET quantity = greatest(quantity - 1, 0), updated_at = now()
     WHERE st.house_id = v_adm.house_id AND st.medication = v_med
       AND (CASE WHEN v_nominal THEN st.person_id = v_adm.person_id
                 ELSE st.person_id IS NULL END);
  END IF;

  RETURN QUERY SELECT p_admin_id, p_state;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_confirm_dose(uuid,text,text,timestamptz,boolean,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_confirm_dose(uuid,text,text,timestamptz,boolean,text,boolean,text) TO rede_app;
