-- A CHEGADA DE NOITE (fase 173, decisão de 28/09).
--
-- A criança que chega de madrugada, trazida pelo Conselho Tutelar, só podia
-- ser cadastrada pela técnica, pela coordenação ou pelo gestor. Até a técnica
-- chegar, ela não estava na chamada, na refeição nem na ATA: a noite em que
-- ela mais precisava ser vista era a noite em que ela não existia no sistema.
--
-- O plantão (educador, Líder Diurno, Líder Noturno Geral) registra o mínimo:
-- como ela se chama, a idade aproximada e quem a trouxe. Ela entra na casa e
-- na rotina da noite. A técnica completa de manhã: documentos, dados
-- judiciais e a data de nascimento, que aqui nasce estimada em 1º de janeiro
-- do ano da idade informada e se corrige com motivo e histórico.
--
-- A vaga não barra: a criança já está na porta. Acima do limite, a ficha
-- nasce marcada e a coordenação confere.

CREATE OR REPLACE FUNCTION app_chegada_provisoria(
  p_house uuid, p_nome text, p_idade integer, p_trazida_por text, p_chegada text
) RETURNS TABLE (person_id uuid, episode_id uuid, acima_do_limite boolean) AS $$
DECLARE
  v_inst   uuid;
  v_person uuid;
  v_ep     uuid;
  v_cap    integer;
  v_ocup   integer;
BEGIN
  IF app_current_role() NOT IN ('educador','lider_diurno','lider_noturno_geral',
                                'equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'sem_permissao_chegada' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF length(btrim(coalesce(p_nome, ''))) < 3 THEN
    RAISE EXCEPTION 'chegada_sem_nome' USING ERRCODE = 'check_violation';
  END IF;
  IF p_idade IS NULL OR p_idade < 0 OR p_idade > 21 THEN
    RAISE EXCEPTION 'chegada_idade_invalida' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(p_trazida_por, ''))) < 3 THEN
    RAISE EXCEPTION 'chegada_sem_quem_trouxe' USING ERRCODE = 'check_violation';
  END IF;

  SELECT institution_id INTO v_inst FROM app_user WHERE id = app_current_user();
  SELECT capacity INTO v_cap FROM house WHERE id = p_house;
  SELECT count(*) INTO v_ocup FROM house_stay WHERE house_id = p_house AND status = 'ativa';

  INSERT INTO person (institution_id, cpf, cpf_pending, provisional_id,
                      full_name, birth_date, created_by)
  VALUES (v_inst, NULL, true, 'PROV-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)),
          btrim(p_nome), make_date(extract(year FROM app_hoje())::int - p_idade, 1, 1),
          app_current_user())
  RETURNING id INTO v_person;

  INSERT INTO care_episode (person_id, institution_id, number, created_by)
  VALUES (v_person, v_inst, 1, app_current_user())
  RETURNING id INTO v_ep;

  INSERT INTO house_stay (episode_id, person_id, house_id, created_by)
  VALUES (v_ep, v_person, p_house, app_current_user());

  INSERT INTO profile_detail (person_id, updated_by) VALUES (v_person, app_current_user());

  INSERT INTO admission_record (episode_id, person_id, house_id, provisional_reason,
                                brought_by, arrival_note, over_capacity, capacity_reason,
                                created_by, updated_by)
  VALUES (v_ep, v_person, p_house,
          format('Chegada registrada pelo plantão, com cadastro provisório. Idade aproximada '
                 'informada: %s anos. A equipe técnica completa o cadastro.', p_idade),
          btrim(p_trazida_por), nullif(btrim(coalesce(p_chegada, '')), ''),
          v_ocup >= coalesce(v_cap, 2147483647),
          CASE WHEN v_ocup >= coalesce(v_cap, 2147483647)
               THEN 'Chegada pelo plantão com a casa no limite; a coordenação confere a vaga.' END,
          app_current_user(), app_current_user());

  RETURN QUERY SELECT v_person, v_ep, v_ocup >= coalesce(v_cap, 2147483647);
END $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_chegada_provisoria(uuid, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_chegada_provisoria(uuid, text, integer, text, text) TO rede_app;
