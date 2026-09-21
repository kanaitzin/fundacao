-- =============================================================================
-- 1400 — QUEM LEVOU A CRIANÇA NA CONSULTA PASSA A CABER NA EVOLUÇÃO.
--
-- A `health_evolution.companion_name` nasceu na 0530, com o comentário *"quem
-- acompanhou, como no papel"*, e **nunca recebeu uma escrita nem uma leitura**.
-- Era uma das pontas dormentes que o §9 listava.
--
-- O QUE A COLUNA RESOLVE, e por que `accompanied_by` não resolve.
--
-- O `accompanied_by` é `uuid REFERENCES app_user`, e a política da 0210 exige
-- `accompanied_by = app_current_user()`: ele é, por construção, **quem enviou a
-- evolução**. Isso está certo para a assinatura — quem relata responde pelo que
-- escreveu —, mas responde a OUTRA pergunta.
--
-- Quem levou a criança na consulta muitas vezes **não é usuário do sistema**: é
-- o motorista da Fundação, é a tia autorizada, é o educador de outra casa que
-- estava com o carro. O papel que a Fundação usava tinha uma linha para isso, e
-- ela não tinha para onde ir: a equipe escrevia "fui com a Cláudia" no meio das
-- observações, onde ninguém procura seis meses depois, quando a pergunta é
-- *"quem estava com ele quando o médico falou isso?"*.
--
-- Não é campo de escolher pessoa do sistema, de propósito: transformar o
-- motorista num usuário para caber num `uuid` seria criar conta para quem não
-- usa o sistema — e conta que existe é conta que alguém empresta.
--
-- A COLUNA FICA OPCIONAL, e é o normal ela estar vazia: quando quem acompanhou
-- é quem escreveu, a evolução já diz isso pelo `accompanied_by`. Ela se
-- preenche quando **foi outra pessoa** — e a tela pergunta exatamente assim,
-- porque perguntar sempre o nome de quem acompanhou faria a Enfermagem digitar o
-- próprio nome vinte vezes por semana.
--
-- A assinatura muda, então a função é DERRUBADA e recriada: acrescentar
-- parâmetro num `CREATE OR REPLACE` cria uma SEGUNDA função com o mesmo nome, e
-- aí a chamada passa a depender de qual delas o Postgres escolhe.
-- =============================================================================

DROP FUNCTION IF EXISTS app_submit_evolution(
  uuid,uuid,text,timestamptz,text,text,text,text,text,text,text,text,text,text,
  text,text,text,date,text,text,text,boolean,text);

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
  p_companion_name text DEFAULT NULL
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

  INSERT INTO health_evolution (person_id, house_id, encounter_id, kind, happened_at, place,
    specialty, service_professional, reason, state_departure, state_during, state_return,
    procedures, exams_requested, exams_results, prescription_note, guidance, restrictions,
    return_deadline, referrals, transport_notes, observations,
    accompanied_by, companion_name, offline, synced_at, client_op_id)
  VALUES (p_person, p_house, v_enc, p_kind::encounter_kind, p_happened, p_place,
    p_specialty, p_professional, p_reason, p_state_departure, p_state_during, p_state_return,
    p_procedures, p_exams_req, p_exams_res, p_prescription, p_guidance, p_restrictions,
    p_return_on, p_referrals, p_transport, p_observations,
    app_current_user(), nullif(btrim(coalesce(p_companion_name, '')), ''),
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
  text,text,text,date,text,text,text,boolean,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_submit_evolution(
  uuid,uuid,text,timestamptz,text,text,text,text,text,text,text,text,text,text,
  text,text,text,date,text,text,text,boolean,text,text) TO rede_app;

COMMENT ON COLUMN health_evolution.companion_name IS
  'Quem LEVOU a criança, quando não foi quem escreveu a evolução — o motorista, '
  'a tia autorizada, o educador de outra casa (1400). Fica vazia quando quem '
  'acompanhou é o autor, que o accompanied_by já nomeia. Nunca é conta de '
  'usuário: quem não usa o sistema não precisa de login para ter ido à consulta.';
