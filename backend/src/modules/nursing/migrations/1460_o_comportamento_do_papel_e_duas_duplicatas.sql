-- =============================================================================
-- 1460 — O COMPORTAMENTO DO PAPEL PASSA A SER GRAVADO, E DUAS DUPLICATAS SÃO
-- DECLARADAS MORTAS.
--
-- Isto sai de uma VARREDURA MEDIDA, e não de leitura: o `varredura-de-pontas.mjs`
-- conferiu 539 nomes de coluna contra as funções do banco, as políticas de RLS,
-- as visões e o TypeScript inteiro, e devolveu cinco candidatos. Conferidos um a
-- um, eles eram três coisas diferentes — e é por isso que a varredura diz
-- *candidato* e não veredito.
--
-- ---------------------------------------------------------------------------
-- 1. O QUE FALTAVA LIGAR: o comportamento na chegada e na saída.
--
-- A 0530 as criou a partir do **modelo de Evolução de Saúde real da Fundação**,
-- com as quatro opções do papel, e escreveu por que elas existem: *"Não é
-- avaliação de personalidade: é o estado observado em dois momentos, e a
-- comparação entre eles é o que a Enfermagem lê."* Ficaram sem escrita e sem
-- leitura desde 07/09.
--
-- **Elas NÃO são duplicata dos `state_*`**, e essa era a pergunta que decidia o
-- que fazer: `state_departure`, `state_during` e `state_return` são TEXTO LIVRE,
-- e são usados. Estes são a marcação FECHADA de quatro opções, que existe para
-- ser comparada entre dois momentos — a coisa que o texto livre não deixa fazer.
--
-- **E ELAS NÃO SÃO CONTADAS EM LUGAR NENHUM, de propósito.** Quatro opções
-- fechadas sobre como a criança estava são exatamente o material de que se faz
-- pontuação de comportamento, e o §6 proíbe. Elas ficam na evolução daquela
-- consulta, lidas por quem cuida; **não entram no painel, não somam, não viram
-- média e não ordenam ninguém.** Se um dia alguém quiser contá-las, é decisão da
-- Fundação e não minha — e esta linha está aqui para que a conversa comece do
-- lugar certo.
--
-- ---------------------------------------------------------------------------
-- 2. AS DUAS DUPLICATAS, e como elas nasceram.
--
-- `trip_incidents` (0530) é **a mesma coisa** que `transport_notes` (0210), que
-- é usada: *"intercorrências do deslocamento"*. O papel tinha a linha
-- "ocorrências no trajeto", e a coluna foi criada sem se conferir que ela já
-- existia com outro nome.
--
-- `reconsult_on` (0530) é a mesma coisa que `return_deadline` (0210), que é
-- usada. A 0530 justificou-se assim: *"o sistema tinha «prazo de retorno»; o
-- papel marca a data"* — e a premissa estava errada, porque o `return_deadline`
-- **já era `date`**. Não havia prazo em dias para trocar por data.
--
-- **Não se apaga:** `DROP COLUMN` é migração destrutiva. Elas viram MORTAS
-- declaradas, e o guarda do `arquivo-tem-saida.spec.ts` passa a cobrar que
-- nenhuma função, política, visão ou linha de TypeScript volte a lê-las sem
-- alguém tirar este comentário — que é o contrário do que aconteceu com a
-- `work_schedule`, que passou meses com um comentário errado porque ninguém
-- tinha como cobrar a frase.
-- =============================================================================

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
  p_behavior_after text DEFAULT NULL
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
  text,text,text,date,text,text,text,boolean,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_submit_evolution(
  uuid,uuid,text,timestamptz,text,text,text,text,text,text,text,text,text,text,
  text,text,text,date,text,text,text,boolean,text,text,text,text) TO rede_app;

COMMENT ON COLUMN health_evolution.behavior_before IS
  'Como a criança estava AO CHEGAR ao atendimento, nas quatro opções do modelo de '
  'papel da Fundação (1460). Não é avaliação de personalidade: é estado observado '
  'num momento, e existe para ser comparado com o da saída. NÃO É CONTADO em '
  'painel nenhum, de propósito — contar isto seria pontuação de comportamento (§6).';
COMMENT ON COLUMN health_evolution.behavior_after IS
  'Como a criança estava AO SAIR do atendimento, nas mesmas quatro opções (1460). '
  'A comparação com o da chegada é o que a Enfermagem lê. NÃO É CONTADO em painel '
  'nenhum, de propósito.';

COMMENT ON COLUMN health_evolution.trip_incidents IS
  'MORTA desde a 1460 — medida pela varredura de pontas: é a MESMA COISA que '
  'transport_notes (0210, "intercorrências do deslocamento"), que é a usada. A '
  'coluna nasceu na 0530 porque o modelo de papel tinha a linha "ocorrências no '
  'trajeto" e não se conferiu que ela já existia com outro nome. Não foi apagada '
  'porque DROP COLUMN é migração destrutiva; está conferida por teste.';
COMMENT ON COLUMN health_evolution.reconsult_on IS
  'MORTA desde a 1460 — é a MESMA COISA que return_deadline (0210), que é a usada. '
  'A 0530 a criou dizendo que "o sistema tinha prazo de retorno e o papel marca a '
  'data", e a premissa estava errada: return_deadline já era date. Não foi apagada '
  'porque DROP COLUMN é migração destrutiva; está conferida por teste.';
