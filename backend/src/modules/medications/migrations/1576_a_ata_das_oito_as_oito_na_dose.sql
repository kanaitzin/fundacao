-- A REGRA NOVA DA ATA NAS FUNÇÕES DA DOSE (fase 157).
--
-- Até aqui estas funções tinham a janela 07h–19h escrita à mão. A regra
-- decidida pela Fundação em 25/09 — diurna 08:00–20:00, noturna 20:01–07:59,
-- da data em que começou — mora em `app_janela_do_turno` e `app_periodo_da_hora`
-- (identity/1573), e é a elas que estas funções passam a perguntar. Só a
-- expressão da janela mudou; o resto de cada função é a versão vigente, copiada.

CREATE OR REPLACE FUNCTION app_confirm_dose(
  p_admin_id uuid, p_state text, p_note text, p_happened_at timestamptz,
  p_offline boolean, p_device text, p_institutional boolean, p_client_op text
) RETURNS TABLE (out_id uuid, out_state text) AS $$
DECLARE
  v_adm medication_administration%ROWTYPE;
  v_period text; v_pode boolean; v_motivo text;
  v_nurse_only boolean; v_nurse_reason text; v_med text; v_nominal boolean;
BEGIN
  SELECT * INTO v_adm FROM medication_administration WHERE id = p_admin_id FOR UPDATE;
  IF v_adm.id IS NULL THEN
    RAISE EXCEPTION 'dose_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_adm.administered_by IS NOT NULL THEN
    RAISE EXCEPTION 'dose_ja_confirmada' USING ERRCODE = 'unique_violation';
  END IF;

  -- O turno da dose pela regra de 25/09 (1573), e no fuso da instituição.
  v_period := app_periodo_da_hora((v_adm.scheduled_at AT TIME ZONE app_fuso())::time);

  SELECT c.pode, c.motivo INTO v_pode, v_motivo
    FROM app_can_administer(v_adm.house_id, v_period) c;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'protocolo: %', v_motivo USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.nurse_only, p.nurse_only_reason, p.medication
    INTO v_nurse_only, v_nurse_reason, v_med
    FROM prescription p WHERE p.id = v_adm.prescription_id;

  IF coalesce(v_nurse_only, false) AND app_current_role() <> 'enfermagem' THEN
    RAISE EXCEPTION 'protocolo: % está marcado como exclusivo da Enfermagem: %. Acione a Enfermagem e registre a dose com ela.',
      v_med, coalesce(v_nurse_reason, 'sem motivo registrado')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF coalesce(p_offline, false) THEN
    RAISE EXCEPTION 'dose_sem_sinal' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE medication_administration
     SET state = p_state::administration_state,
         administered_by = app_current_user(),
         administered_at = coalesce(p_happened_at, now()),
         recorded_at = now(),
         offline = false,
         device = p_device,
         institutional_device = coalesce(p_institutional, false),
         note = p_note,
         client_op_id = coalesce(p_client_op, client_op_id)
   WHERE id = p_admin_id;

  /*
   * BAIXA DE ESTOQUE: UMA linha, nunca duas — o estoque nominal do acolhido
   * tem precedência sobre o comum da casa, porque é dele que a dose saiu.
   *
   * Este trecho vem da 0380 e por pouco não se perdeu aqui: reescrever a
   * função inteira para mudar duas regras deixou de fora a parte em que
   * ninguém estava pensando. Quem pegou foi `regressao-estado.e2e`, que conta
   * o estoque depois de confirmar — e é por isso que a suíte roda antes de
   * qualquer entrega. Vale como aviso para a próxima reescrita: CREATE OR
   * REPLACE substitui o corpo todo, inclusive o que não estava em discussão.
   */
  IF p_state LIKE 'administrado%' THEN
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
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_confirm_dose(uuid,text,text,timestamptz,boolean,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_confirm_dose(uuid,text,text,timestamptz,boolean,text,boolean,text) TO rede_app;

-- A dose "se necessário" (1390) tinha a mesma janela escrita à mão. Ela não
-- estava na primeira varredura, que olhou uma lista de arquivos; quem a achou foi
-- a pergunta ao CATÁLOGO, em `a-ata-das-oito-as-oito.e2e.spec.ts`.
CREATE OR REPLACE FUNCTION app_registrar_quando_necessario(
  p_prescription uuid, p_motivo text, p_quando timestamptz, p_nota text)
RETURNS TABLE (out_id uuid) AS $$
DECLARE
  v_pr prescription%ROWTYPE;
  v_quando timestamptz; v_period text; v_pode boolean; v_motivo_recusa text;
  v_id uuid;
BEGIN
  SELECT * INTO v_pr FROM prescription WHERE id = p_prescription;
  IF v_pr.id IS NULL THEN
    RAISE EXCEPTION 'prescricao_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(v_pr.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_pr.kind <> 'quando_necessario' THEN
    RAISE EXCEPTION 'nao_e_quando_necessario' USING ERRCODE = 'check_violation';
  END IF;
  /*
   * A orientação tem de estar VÁLIDA — assinada e vigente. Registrar dose
   * "quando necessário" de uma prescrição suspensa é registrar que se deu um
   * remédio que a Enfermagem havia mandado parar.
   */
  IF v_pr.status <> 'ativa' OR v_pr.signed_by IS NULL THEN
    RAISE EXCEPTION 'prescricao_sem_orientacao_valida' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'motivo_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  v_quando := coalesce(p_quando, now());
  /* Nunca no futuro: dose que "será dada" não é dose dada. */
  IF v_quando > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'quando_no_futuro' USING ERRCODE = 'check_violation';
  END IF;

  -- O período é o do MOMENTO em que foi dada, e é ele que o protocolo da casa
  -- confere — a mesma conta da `app_confirm_dose`.
  v_period := app_periodo_da_hora((v_quando AT TIME ZONE app_fuso())::time);

  SELECT c.pode, c.motivo INTO v_pode, v_motivo_recusa
    FROM app_can_administer(v_pr.house_id, v_period) c;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'protocolo: %', v_motivo_recusa USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A exceção por medicamento (0930) vale aqui igual: injetável às 22h continua
  -- injetável, e "quando necessário" não é atalho para contorná-la.
  IF coalesce(v_pr.nurse_only, false) AND app_current_role() <> 'enfermagem' THEN
    RAISE EXCEPTION 'protocolo: % está marcado como exclusivo da Enfermagem: %. Acione a Enfermagem e registre a dose com ela.',
      v_pr.medication, coalesce(v_pr.nurse_only_reason, 'sem motivo registrado')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO medication_administration
    (prescription_id, person_id, house_id, scheduled_at, state,
     administered_by, administered_at, recorded_at, note, prn_reason)
  VALUES (v_pr.id, v_pr.person_id, v_pr.house_id, v_quando,
          'administrado_no_horario', app_current_user(), v_quando, now(),
          nullif(btrim(coalesce(p_nota, '')), ''), btrim(p_motivo))
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_registrar_quando_necessario(uuid, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_quando_necessario(uuid, text, timestamptz, text) TO rede_app;
