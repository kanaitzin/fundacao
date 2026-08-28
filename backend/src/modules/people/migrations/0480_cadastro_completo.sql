-- ============================================================
-- Rede Acolher — Migração 048: cadastro completo do acolhido
--
-- O cadastro que existia era o mínimo para abrir a porta: nome, nascimento,
-- CPF e casa. O que a equipe técnica preenche de verdade tem três blocos, e
-- eles NÃO têm o mesmo público:
--
--  * identificação — nome, nascimento, documentos, naturalidade. Quem cuida
--    precisa disso;
--  * acolhimento — quando chegou, quem trouxe, de onde veio, quem é a
--    referência familiar autorizada. A casa inteira precisa disso;
--  * judicial — o MOTIVO do acolhimento, a guia, o processo, a vara. §13.1
--    põe rede/judicial em área restrita: equipe técnica, coordenação e Gestor
--    Geral. O educador que dá banho e leva à escola não precisa saber por que
--    aquela criança foi retirada de casa, e saber muda como se olha para ela.
--
-- Por isso são duas tabelas, e não um formulário só. A separação é do banco:
-- se um dia alguém acrescentar o motivo judicial numa tela de plantão, a
-- policy recusa a leitura em vez de confiar no cuidado de quem escreveu a tela.
-- ============================================================

-- ---------- Identificação complementar ----------
ALTER TABLE person
  ADD COLUMN IF NOT EXISTS gender      text,   -- como a pessoa se identifica
  ADD COLUMN IF NOT EXISTS race        text,   -- cor/raça AUTODECLARADA (IBGE)
  ADD COLUMN IF NOT EXISTS birthplace  text,   -- município/UF de nascimento
  ADD COLUMN IF NOT EXISTS nis         text,   -- NIS/CadÚnico, quando houver
  ADD COLUMN IF NOT EXISTS civil_registry text; -- certidão de nascimento (termo/livro/folha)

-- ---------- Bloco do acolhimento (por episódio) ----------
CREATE TABLE IF NOT EXISTS admission_record (
  episode_id       uuid PRIMARY KEY REFERENCES care_episode(id),
  person_id        uuid NOT NULL REFERENCES person(id),
  house_id         uuid NOT NULL REFERENCES house(id),
  admitted_on      date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  brought_by       text,        -- Conselho Tutelar, Brigada Militar, família, espontâneo…
  origin_city      text,
  previous_shelter text,
  siblings_note    text,        -- irmãos acolhidos, aqui ou em outra unidade
  family_reference text,        -- responsável autorizado e vínculo (contato em contatos autorizados)
  arrival_note     text,        -- como chegou: pertences, condições, o que foi observado
  -- Entrada acima do limite da casa: fato registrado, nunca escondido (§ capacidade)
  over_capacity    boolean NOT NULL DEFAULT false,
  capacity_reason  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES app_user(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES app_user(id),
  CHECK (NOT over_capacity OR coalesce(length(btrim(capacity_reason)), 0) >= 15)
);
CREATE INDEX IF NOT EXISTS idx_admission_person ON admission_record (person_id);

ALTER TABLE admission_record ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON admission_record TO rede_app;

DROP POLICY IF EXISTS adm_select ON admission_record;
CREATE POLICY adm_select ON admission_record FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id));

DROP POLICY IF EXISTS adm_update ON admission_record;
CREATE POLICY adm_update ON admission_record FOR UPDATE TO rede_app
  USING (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
         AND app_person_in_scope(person_id))
  WITH CHECK (app_person_in_scope(person_id));

-- ---------- Bloco judicial (área restrita) ----------
CREATE TABLE IF NOT EXISTS judicial_record (
  episode_id        uuid PRIMARY KEY REFERENCES care_episode(id),
  person_id         uuid NOT NULL REFERENCES person(id),
  -- Motivo do acolhimento: categoria fechada para relatório, texto para o caso.
  reason_category   text NOT NULL CHECK (reason_category IN (
                      'negligencia','abandono','violencia_fisica','violencia_psicologica',
                      'violencia_sexual','trabalho_infantil','situacao_de_rua',
                      'dependencia_quimica_do_responsavel','dependencia_quimica_propria',
                      'orfandade','ausencia_de_responsavel','entrega_voluntaria',
                      'ordem_judicial_outra','outro')),
  reason_detail     text,
  measure_type      text NOT NULL DEFAULT 'acolhimento_institucional' CHECK (measure_type IN (
                      'acolhimento_institucional','acolhimento_familiar','medida_protetiva_outra')),
  determining_body  text NOT NULL CHECK (determining_body IN (
                      'vara_da_infancia','conselho_tutelar','ministerio_publico',
                      'delegacia','outro')),
  court_name        text,        -- vara/comarca
  process_number    text,
  guide_number      text,        -- guia de acolhimento
  guide_date        date,
  determined_on     date,
  legal_status      text,        -- situação atual: audiência marcada, destituição em curso…
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES app_user(id),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES app_user(id)
);
CREATE INDEX IF NOT EXISTS idx_judicial_person ON judicial_record (person_id);

ALTER TABLE judicial_record ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON judicial_record TO rede_app;

-- Área restrita: cargo E escopo. Educador, líder, cozinha e enfermagem não leem.
DROP POLICY IF EXISTS jud_select ON judicial_record;
CREATE POLICY jud_select ON judicial_record FOR SELECT TO rede_app
  USING (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
         AND app_person_in_scope(person_id));

DROP POLICY IF EXISTS jud_update ON judicial_record;
CREATE POLICY jud_update ON judicial_record FOR UPDATE TO rede_app
  USING (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
         AND app_person_in_scope(person_id))
  WITH CHECK (app_person_in_scope(person_id));

-- Trilha de alteração: mudar a situação judicial é evento, não edição de campo.
CREATE OR REPLACE FUNCTION judicial_touch() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := app_current_user();
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_judicial_touch ON judicial_record;
CREATE TRIGGER trg_judicial_touch BEFORE UPDATE ON judicial_record
  FOR EACH ROW EXECUTE FUNCTION judicial_touch();

-- ============================================================
-- Comando de sistema: cadastro completo em uma transação
--
-- Mesma razão da migração 005 — a visibilidade nasce da permanência, então
-- pessoa, episódio, permanência, perfil, acolhimento e judicial precisam
-- nascer juntos. Recebe jsonb para que acrescentar um campo de formulário não
-- vire troca de assinatura de função.
-- ============================================================
DROP FUNCTION IF EXISTS app_admit_person_full(uuid, jsonb, jsonb, jsonb);
CREATE FUNCTION app_admit_person_full(
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
BEGIN
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'sem_permissao_para_admitir' USING ERRCODE = 'insufficient_privilege';
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
    over_capacity, capacity_reason, created_by, updated_by)
  VALUES (
    v_ep, v_person, p_house,
    coalesce(nullif(p_acolhim->>'admittedOn','')::date,
             (now() AT TIME ZONE 'America/Sao_Paulo')::date),
    nullif(p_acolhim->>'broughtBy',''), nullif(p_acolhim->>'originCity',''),
    nullif(p_acolhim->>'previousShelter',''), nullif(p_acolhim->>'siblingsNote',''),
    nullif(p_acolhim->>'familyReference',''), nullif(p_acolhim->>'arrivalNote',''),
    v_acima, v_motivo_cap, app_current_user(), app_current_user());

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
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_admit_person_full(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_admit_person_full(uuid, jsonb, jsonb, jsonb) TO rede_app;
