-- ============================================================
-- Rede Acolher — Migração 005: admissão como comando de sistema
--
-- Problema encontrado no teste de aceite (ingresso urgente sem CPF):
-- a visibilidade de uma pessoa deriva da PERMANÊNCIA ativa numa casa. No
-- instante do INSERT a permanência ainda não existe, então a própria pessoa
-- que acabou de cadastrar não enxerga a linha — e `INSERT ... RETURNING`
-- falha na policy de SELECT.
--
-- Enfraquecer a policy para contornar isso abriria o isolamento. A admissão,
-- como a transferência, é uma TRANSIÇÃO DE ESTADO atômica (pessoa + episódio
-- + permanência + perfil), não uma escrita solta: vira comando de sistema com
-- autorização verificada dentro da função (§25).
-- ============================================================

CREATE OR REPLACE FUNCTION app_admit_person(
  p_house         uuid,
  p_full_name     text,
  p_social_name   text,
  p_birth_date    date,
  p_cpf           text,          -- null em ingresso urgente
  p_provisional   text           -- id provisório quando falta CPF
) RETURNS TABLE (person_id uuid, episode_id uuid, episode_number integer) AS $$
DECLARE
  v_inst   uuid;
  v_person uuid;
  v_ep     uuid;
BEGIN
  -- Autorização explícita: quem cadastra é equipe técnica/coordenação/gestor,
  -- e a casa precisa estar no seu escopo.
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'sem_permissao_para_admitir' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT institution_id INTO v_inst FROM app_user WHERE id = app_current_user();

  -- Unicidade do CPF é do banco (índice), mas a mensagem precisa ser tratável.
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

  RETURN QUERY SELECT v_person, v_ep, 1;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_admit_person(uuid, text, text, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_admit_person(uuid, text, text, date, text, text) TO rede_app;

-- Retorno (novo episódio para quem está no Acervo) — mesma razão: a permanência
-- nasce junto com o episódio, e a autorização é verificada aqui.
CREATE OR REPLACE FUNCTION app_readmit_person(p_person uuid, p_house uuid)
RETURNS TABLE (episode_id uuid, episode_number integer) AS $$
DECLARE
  v_inst uuid; v_num integer; v_ep uuid;
BEGIN
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'sem_permissao_para_admitir' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM care_episode WHERE person_id = p_person AND status = 'ativo') THEN
    RAISE EXCEPTION 'episodio_ativo_existente' USING ERRCODE = 'unique_violation';
  END IF;
  -- Só quem já respondeu por esta pessoa pode reabrir o acolhimento.
  IF NOT app_person_in_scope(p_person) THEN
    RAISE EXCEPTION 'pessoa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT institution_id INTO v_inst FROM app_user WHERE id = app_current_user();
  SELECT coalesce(max(number), 0) + 1 INTO v_num FROM care_episode WHERE person_id = p_person;

  INSERT INTO care_episode (person_id, institution_id, number, created_by)
  VALUES (p_person, v_inst, v_num, app_current_user()) RETURNING id INTO v_ep;
  INSERT INTO house_stay (episode_id, person_id, house_id, created_by)
  VALUES (v_ep, p_person, p_house, app_current_user());

  RETURN QUERY SELECT v_ep, v_num;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_readmit_person(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_readmit_person(uuid, uuid) TO rede_app;
