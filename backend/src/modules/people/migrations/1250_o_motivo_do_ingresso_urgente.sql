-- ============================================================
-- 1250 — O motivo do ingresso urgente passa a ter onde ficar
--
-- A tela de cadastro exige, quando a criança entra SEM CPF, que alguém
-- descreva por que o ingresso é urgente — com o mínimo de dez caracteres
-- (`Cadastro.tsx`), e o serviço recusa o cadastro sem ele
-- (`admission.service.ts`, "Sem CPF, descreva o motivo do ingresso urgente").
--
-- **E o texto não era gravado em lugar nenhum.** O `INSERT INTO
-- admission_record` da 0480 não tinha a coluna; o `p_acolhim` chegava ao banco
-- com o campo dentro, e o banco o ignorava em silêncio. O que sobrava da
-- urgência era `person.provisional_id` — um código gerado, `PROV-M4X7K2`, que
-- não diz nada a ninguém.
--
-- QUEM PERDE, E QUANDO. A criança que entra de madrugada, trazida pelo
-- Conselho Tutelar, sem documento nenhum. Seis meses depois a equipe técnica
-- abre o cadastro para montar o relatório e encontra "ID provisório" e uma
-- pendência de CPF — e a frase que a educadora escreveu às três da manhã,
-- explicando o que aconteceu, não está em lugar nenhum. É a informação mais
-- cara do sistema: ela só existe uma vez, e ninguém a reescreve depois.
--
-- A TRAVA VAI PARA O BANCO. Ela estava só no serviço, e serviço é um caminho
-- entre vários — a regra da casa é que nenhum caminho de escrita escape. Agora
-- a própria `app_admit_person_full` recusa ingresso sem CPF e sem motivo.
--
-- *Atenção de manutenção: `CREATE OR REPLACE FUNCTION` APAGA o `SET
-- search_path` que a migração 1200 fixou. Por isso ele está escrito de novo,
-- por extenso, na redefinição abaixo — é a lição da fase 102, e o
-- `arquivo-tem-saida.spec.ts` confere no catálogo.*
-- ============================================================

ALTER TABLE admission_record
  ADD COLUMN IF NOT EXISTS provisional_reason text;

COMMENT ON COLUMN admission_record.provisional_reason IS
  'Por que a criança entrou sem CPF — escrito por quem a recebeu, na hora. '
  'Exigido pela app_admit_person_full quando não há CPF.';

-- `admission_record` tem GRANT de TABELA desde a 0480, então a coluna nova
-- nasce legível e gravável pela aplicação. (Não é o caso de toda tabela do
-- sistema: `incident_attachment` é concedida coluna a coluna, e uma coluna
-- nova lá não herda nada — foi o que custou a fase 107 um 500 em produção de
-- ensaio.)

-- ------------------------------------------------------------
-- O comando de cadastro, com o motivo gravado e cobrado
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_admit_person_full(
  p_house    uuid,
  p_pessoa   jsonb,
  p_acolhim  jsonb,
  p_judicial jsonb
) RETURNS TABLE (person_id uuid, episode_id uuid, episode_number integer,
                 acima_do_limite boolean, capacidade integer, ocupadas integer) AS $$
DECLARE
  v_inst uuid; v_person uuid; v_ep uuid;
  v_cap integer; v_oc integer; v_acima boolean;
  v_cpf text := nullif(p_pessoa->>'cpf', '');
  v_motivo_cap text := nullif(btrim(coalesce(p_acolhim->>'capacityReason','')), '');
  v_motivo_prov text := nullif(btrim(coalesce(p_acolhim->>'provisionalReason','')), '');
BEGIN
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'sem_permissao_para_admitir' USING ERRCODE = 'insufficient_privilege';
  END IF;

  /*
   * SEM CPF, COM MOTIVO — a trava que estava só no serviço.
   *
   * Dez caracteres é o mesmo mínimo que a tela pede. Não é uma medida de
   * qualidade: é o que separa uma frase de um ponto digitado para passar.
   */
  IF v_cpf IS NULL AND coalesce(length(v_motivo_prov), 0) < 10 THEN
    RAISE EXCEPTION 'ingresso_sem_cpf_sem_motivo' USING ERRCODE = 'check_violation';
  END IF;

  SELECT institution_id INTO v_inst FROM app_user WHERE id = app_current_user();

  IF v_cpf IS NOT NULL AND EXISTS (
       SELECT 1 FROM person WHERE institution_id = v_inst AND cpf = v_cpf) THEN
    RAISE EXCEPTION 'cpf_ja_cadastrado' USING ERRCODE = 'unique_violation';
  END IF;

  -- Limite da casa: trava a porta só o suficiente para exigir uma decisão.
  SELECT h.capacity INTO v_cap FROM house h WHERE h.id = p_house FOR UPDATE;
  SELECT count(*) INTO v_oc FROM house_stay s WHERE s.house_id = p_house AND s.status = 'ativa';
  v_acima := (v_oc + 1) > v_cap;
  IF v_acima AND coalesce(length(v_motivo_cap), 0) < 15 THEN
    RAISE EXCEPTION 'casa_no_limite' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO person (institution_id, cpf, cpf_pending, provisional_id,
                      full_name, social_name, birth_date,
                      gender, race, birthplace, nis, civil_registry, created_by)
  VALUES (v_inst, v_cpf, v_cpf IS NULL, nullif(p_pessoa->>'provisionalId',''),
          p_pessoa->>'fullName', nullif(p_pessoa->>'socialName',''),
          (p_pessoa->>'birthDate')::date,
          nullif(p_pessoa->>'gender',''), nullif(p_pessoa->>'race',''),
          nullif(p_pessoa->>'birthplace',''), nullif(p_pessoa->>'nis',''),
          nullif(p_pessoa->>'civilRegistry',''), app_current_user())
  RETURNING id INTO v_person;

  INSERT INTO care_episode (person_id, institution_id, number, created_by)
  VALUES (v_person, v_inst, 1, app_current_user())
  RETURNING id INTO v_ep;

  INSERT INTO house_stay (episode_id, person_id, house_id, created_by)
  VALUES (v_ep, v_person, p_house, app_current_user());

  INSERT INTO profile_detail (person_id, essential_care, school_name, school_grade,
                              school_shift, reference_team, updated_by)
  VALUES (v_person, nullif(p_pessoa->>'essentialCare',''), nullif(p_pessoa->>'schoolName',''),
          nullif(p_pessoa->>'schoolGrade',''), nullif(p_pessoa->>'schoolShift',''),
          nullif(p_pessoa->>'referenceTeam',''), app_current_user());

  INSERT INTO admission_record (
    episode_id, person_id, house_id, admitted_on, brought_by, origin_city,
    previous_shelter, siblings_note, family_reference, arrival_note,
    over_capacity, capacity_reason, provisional_reason, created_by, updated_by)
  VALUES (
    v_ep, v_person, p_house,
    coalesce(nullif(p_acolhim->>'admittedOn','')::date,
             (now() AT TIME ZONE 'America/Sao_Paulo')::date),
    nullif(p_acolhim->>'broughtBy',''), nullif(p_acolhim->>'originCity',''),
    nullif(p_acolhim->>'previousShelter',''), nullif(p_acolhim->>'siblingsNote',''),
    nullif(p_acolhim->>'familyReference',''), nullif(p_acolhim->>'arrivalNote',''),
    v_acima, v_motivo_cap, v_motivo_prov, app_current_user(), app_current_user());

  INSERT INTO judicial_record (
    episode_id, person_id, reason_category, reason_detail, measure_type,
    determining_body, court_name, process_number, guide_number, guide_date,
    determined_on, legal_status, notes, created_by, updated_by)
  VALUES (
    v_ep, v_person, p_judicial->>'reasonCategory', nullif(p_judicial->>'reasonDetail',''),
    coalesce(nullif(p_judicial->>'measureType',''), 'acolhimento_institucional'),
    p_judicial->>'determiningBody', nullif(p_judicial->>'courtName',''),
    nullif(p_judicial->>'processNumber',''), nullif(p_judicial->>'guideNumber',''),
    nullif(p_judicial->>'guideDate','')::date, nullif(p_judicial->>'determinedOn','')::date,
    nullif(p_judicial->>'legalStatus',''), nullif(p_judicial->>'notes',''),
    app_current_user(), app_current_user());

  RETURN QUERY SELECT v_person, v_ep, 1, v_acima, v_cap, v_oc + 1;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_admit_person_full(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_admit_person_full(uuid, jsonb, jsonb, jsonb) TO rede_app;

-- ============================================================
-- E O CAMINHO CURTO TAMBÉM — `app_admit_person`
--
-- O cadastro tem DUAS portas: a completa (`app_admit_person_full`, da tela de
-- cadastro) e a curta (`app_admit_person`, da migração 005), que é a do
-- ingresso urgente de madrugada — justamente aquele em que não há CPF.
--
-- A curta era a pior das duas: ela **não criava `admission_record` nenhum**.
-- O serviço exigia o motivo do ingresso urgente, a função recebia seis
-- parâmetros e nenhum era ele, e a criança ficava com `provisional_id` e mais
-- nada. Quem entrou pela porta da urgência era exatamente quem ficava sem
-- ficha de entrada.
--
-- Agora ela cria a ficha mínima: o dia, a casa, e a frase de quem recebeu.
-- Os outros campos ficam vazios e a equipe técnica os completa depois — que é
-- o que ela já faz no papel, e é diferente de não haver onde escrever.
--
-- A função troca de assinatura (seis para sete parâmetros), então a antiga é
-- DERRUBADA: deixar as duas conviveria com um chamador chamando a errada em
-- silêncio. Há um chamador só, `people.service.ts`.
-- ============================================================

DROP FUNCTION IF EXISTS app_admit_person(uuid, text, text, date, text, text);

CREATE FUNCTION app_admit_person(
  p_house         uuid,
  p_full_name     text,
  p_social_name   text,
  p_birth_date    date,
  p_cpf           text,          -- null em ingresso urgente
  p_provisional   text,          -- id provisório quando falta CPF
  p_motivo        text           -- POR QUE entrou sem CPF, escrito na hora
) RETURNS TABLE (person_id uuid, episode_id uuid, episode_number integer) AS $$
DECLARE
  v_inst   uuid;
  v_person uuid;
  v_ep     uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'sem_permissao_para_admitir' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A mesma trava da porta completa, pelo mesmo motivo: nenhum caminho de
  -- escrita escapa da regra, e esta é a porta por onde a urgência entra.
  IF p_cpf IS NULL AND coalesce(length(v_motivo), 0) < 10 THEN
    RAISE EXCEPTION 'ingresso_sem_cpf_sem_motivo' USING ERRCODE = 'check_violation';
  END IF;

  SELECT institution_id INTO v_inst FROM app_user WHERE id = app_current_user();

  IF p_cpf IS NOT NULL AND EXISTS (
       SELECT 1 FROM person WHERE institution_id = v_inst AND cpf = p_cpf) THEN
    RAISE EXCEPTION 'cpf_ja_cadastrado' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO person (institution_id, cpf, cpf_pending, provisional_id,
                      full_name, social_name, birth_date, created_by)
  VALUES (v_inst, p_cpf, p_cpf IS NULL, p_provisional,
          p_full_name, nullif(p_social_name, ''), p_birth_date, app_current_user())
  RETURNING id INTO v_person;

  INSERT INTO care_episode (person_id, institution_id, number, created_by)
  VALUES (v_person, v_inst, 1, app_current_user())
  RETURNING id INTO v_ep;

  INSERT INTO house_stay (episode_id, person_id, house_id, created_by)
  VALUES (v_ep, v_person, p_house, app_current_user());

  INSERT INTO profile_detail (person_id, updated_by) VALUES (v_person, app_current_user());

  -- A ficha mínima. `admitted_on` tem DEFAULT no fuso da instituição.
  INSERT INTO admission_record (episode_id, person_id, house_id,
                                provisional_reason, created_by, updated_by)
  VALUES (v_ep, v_person, p_house, v_motivo, app_current_user(), app_current_user());

  RETURN QUERY SELECT v_person, v_ep, 1;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_admit_person(uuid, text, text, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_admit_person(uuid, text, text, date, text, text, text) TO rede_app;
