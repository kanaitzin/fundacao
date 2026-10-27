-- =============================================================================
-- 1665 — O RETORNO MARCADO TEM COMO TERMINAR.
--
-- Achado na varredura dos caminhos sem fim (fase 249). O atendimento com
-- retorno marcado nascia `retorno_pendente` (0210) e nada no sistema o mudava
-- depois: quando a criança voltava ao médico, a evolução nova criava OUTRO
-- atendimento, e o de antes seguia pendente para sempre. Passada a data, a
-- Saúde, a folha de saúde em Word e o painel da Enfermagem diziam *retorno com
-- data vencida, a reagendar* sobre um retorno que já tinha acontecido.
--
-- Agora quem registra a consulta diz, se for o caso, de qual retorno ela é. O
-- atendimento de antes fica `concluido`, com a data marcada guardada como
-- estava, e aponta para o atendimento que o cumpriu (`return_done_in`). Nada se
-- apaga: a pendência fecha porque há um registro que a fecha.
--
-- A assinatura muda, então a função é DERRUBADA e recriada (a lição da 1400).
-- =============================================================================

ALTER TABLE health_encounter
  ADD COLUMN return_done_in uuid REFERENCES health_encounter(id);
CREATE INDEX idx_enc_return_done_in ON health_encounter (return_done_in);
COMMENT ON COLUMN health_encounter.return_done_in IS
  'O atendimento que cumpriu o retorno marcado neste (1665). Escrito só pela '
  'app_submit_evolution, quando quem registra a consulta diz de qual retorno ela é; '
  'o return_on fica como estava, e o histórico diz Retorno feito.';

DROP FUNCTION IF EXISTS app_submit_evolution(
  uuid,uuid,text,timestamptz,text,text,text,text,text,text,text,text,text,text,
  text,text,text,date,text,text,text,boolean,text,text,text,text);

CREATE FUNCTION app_submit_evolution(
  p_person uuid, p_house uuid, p_kind text, p_happened timestamptz,
  p_place text, p_specialty text, p_professional text, p_reason text,
  p_state_departure text, p_state_during text, p_state_return text,
  p_procedures text, p_exams_req text, p_exams_res text, p_prescription text,
  p_guidance text, p_restrictions text, p_return_on date, p_referrals text,
  p_transport text, p_observations text, p_offline boolean, p_client_op text,
  -- No FIM da lista, e não no meio: parâmetro inserido no meio reordena os
  -- posicionais de quem chama, e o erro disso é silencioso — dois textos trocam
  -- de lugar e a evolução sai com o local no campo do motivo.
  p_companion_name text DEFAULT NULL,
  -- As quatro opções do papel, na chegada e na saída (1460). No FIM da lista,
  -- pela mesma razão da 1400: parâmetro no meio reordena os posicionais de quem
  -- chama, e o erro disso é silencioso.
  p_behavior_before text DEFAULT NULL,
  p_behavior_after text DEFAULT NULL,
  -- O retorno que esta consulta cumpre (1665). No FIM da lista, pela mesma razão.
  p_return_of uuid DEFAULT NULL
) RETURNS TABLE (out_evolution_id uuid, out_encounter_id uuid) AS $$
DECLARE v_evo uuid; v_enc uuid;
BEGIN
  IF NOT app_person_in_scope(p_person) THEN
    RAISE EXCEPTION 'acolhido_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO health_encounter (person_id, house_id, kind, happened_at, place, specialty,
                                professional, reason, status, return_on, created_by)
  VALUES (p_person, p_house, p_kind::encounter_kind, p_happened, p_place, p_specialty,
          p_professional, p_reason,
          CASE WHEN p_return_on IS NOT NULL THEN 'retorno_pendente' ELSE 'concluido' END,
          p_return_on, app_current_user())
  RETURNING id INTO v_enc;

  /* O RETORNO QUE ESTA CONSULTA CUMPRE (1665). Função com SECURITY DEFINER: a
     política não confere nada aqui, então a conferência é escrita. O atendimento
     de antes tem de ser da MESMA criança e ainda estar esperando o retorno. */
  IF p_return_of IS NOT NULL THEN
    UPDATE health_encounter SET status = 'concluido', return_done_in = v_enc
     WHERE id = p_return_of AND person_id = p_person AND status = 'retorno_pendente';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'retorno_nao_pendente' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO health_evolution (person_id, house_id, encounter_id, kind, happened_at, place,
    specialty, service_professional, reason, state_departure, state_during, state_return,
    procedures, exams_requested, exams_results, prescription_note, guidance, restrictions,
    return_deadline, referrals, transport_notes, observations,
    accompanied_by, companion_name, behavior_before, behavior_after,
    offline, synced_at, client_op_id)
  VALUES (p_person, p_house, v_enc, p_kind::encounter_kind, p_happened, p_place,
    p_specialty, p_professional, p_reason, p_state_departure, p_state_during, p_state_return,
    p_procedures, p_exams_req, p_exams_res, p_prescription, p_guidance, p_restrictions,
    p_return_on, p_referrals, p_transport, p_observations,
    app_current_user(), nullif(btrim(coalesce(p_companion_name, '')), ''),
    nullif(btrim(coalesce(p_behavior_before, '')), ''),
    nullif(btrim(coalesce(p_behavior_after, '')), ''),
    coalesce(p_offline,false),
    CASE WHEN p_offline THEN now() END, p_client_op)
  RETURNING id INTO v_evo;

  RETURN QUERY SELECT v_evo, v_enc;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  -- Por extenso, como a 1350 e a 1370: `CREATE OR REPLACE` apaga um `SET` posto
  -- antes, e há teste que cobra isto pelo catálogo.
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_submit_evolution(
  uuid,uuid,text,timestamptz,text,text,text,text,text,text,text,text,text,text,
  text,text,text,date,text,text,text,boolean,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_submit_evolution(
  uuid,uuid,text,timestamptz,text,text,text,text,text,text,text,text,text,text,
  text,text,text,date,text,text,text,boolean,text,text,text,text,uuid) TO rede_app;
