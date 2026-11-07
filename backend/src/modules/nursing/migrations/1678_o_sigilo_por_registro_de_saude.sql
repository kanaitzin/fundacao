-- O SIGILO POR REGISTRO DE SAÚDE (fase 287, primeira avaliação humana de 05/11, módulo de
-- saúde; decidido em 07/11 pela pessoa da Fundação):
--
--  * quem LÊ o conteúdo de um registro sigiloso: a Enfermagem, a equipe técnica e a
--    coordenação (a Coordenação Geral lê como coordenação; o Gestor Geral não lê);
--    os outros veem só que existe, o dia e quem registrou;
--  * quem MARCA: quem registrou, e também a Enfermagem, a técnica e a coordenação;
--  * quem TIRA: só a técnica e a coordenação, com o motivo; nada se apaga, e as duas
--    coisas ficam em `health_confidential_change` com o nome e a hora.
--
-- Um registro de saúde é a consulta (`health_encounter`) e o atendimento escrito por quem
-- levou (`health_evolution`), que nascem juntos pelo `app_submit_evolution`: marcar um
-- marca o outro, porque o sigilo de um com o outro aberto não protege nada.

ALTER TABLE health_encounter ADD COLUMN IF NOT EXISTS confidential boolean NOT NULL DEFAULT false;
ALTER TABLE health_evolution ADD COLUMN IF NOT EXISTS confidential boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN health_encounter.confidential IS
  'Registro de saúde sigiloso (fase 287): o conteúdo só para Enfermagem, técnica e coordenação (app_le_sigilo_de_saude).';
COMMENT ON COLUMN health_evolution.confidential IS
  'Registro de saúde sigiloso (fase 287): o conteúdo só para Enfermagem, técnica e coordenação (app_le_sigilo_de_saude).';

CREATE TABLE IF NOT EXISTS health_confidential_change (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id  uuid REFERENCES health_encounter(id),
  evolution_id  uuid REFERENCES health_evolution(id),
  person_id     uuid NOT NULL REFERENCES person(id),
  house_id      uuid NOT NULL REFERENCES house(id),
  confidential  boolean NOT NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL REFERENCES app_user(id),
  CONSTRAINT sigilo_aponta_um_registro CHECK (encounter_id IS NOT NULL OR evolution_id IS NOT NULL),
  CONSTRAINT tirar_o_sigilo_tem_motivo
    CHECK (confidential OR length(btrim(coalesce(reason, ''))) >= 5)
);
CREATE INDEX IF NOT EXISTS ix_sigilo_consulta ON health_confidential_change (encounter_id);
CREATE INDEX IF NOT EXISTS ix_sigilo_atendimento ON health_confidential_change (evolution_id);
CREATE INDEX IF NOT EXISTS ix_sigilo_pessoa ON health_confidential_change (person_id);
CREATE INDEX IF NOT EXISTS ix_sigilo_casa ON health_confidential_change (house_id);
CREATE INDEX IF NOT EXISTS ix_sigilo_quem ON health_confidential_change (created_by);
ALTER TABLE health_confidential_change ENABLE ROW LEVEL SECURITY;
CREATE POLICY hcc_select ON health_confidential_change FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
GRANT SELECT ON health_confidential_change TO rede_app;
REVOKE INSERT, UPDATE, DELETE ON health_confidential_change FROM rede_app;
COMMENT ON TABLE health_confidential_change IS
  'Quem marcou e quem tirou o sigilo de um registro de saúde, com o motivo e a hora (fase 287). Só cresce.';

/* Quem lê o conteúdo de um registro sigiloso. Lida pelo servidor e pelas consultas dos relatórios. */
CREATE OR REPLACE FUNCTION app_le_sigilo_de_saude()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(app_current_role()::text IN ('enfermagem','equipe_tecnica','coordenador'), false)
$$;
REVOKE ALL ON FUNCTION app_le_sigilo_de_saude() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_le_sigilo_de_saude() TO rede_app;

/*
 * MARCAR ou TIRAR o sigilo de um registro (consulta ou atendimento). Devolve a casa, para a
 * auditoria. p_qual: 'consulta' ou 'atendimento'.
 */
CREATE OR REPLACE FUNCTION app_marcar_sigilo_de_saude(p_qual text, p_id uuid, p_sigiloso boolean, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_role text; v_enc uuid; v_evo uuid; v_person uuid; v_house uuid; v_autor uuid; v_atual boolean;
BEGIN
  v_role := app_current_role()::text;
  IF p_qual = 'consulta' THEN
    SELECT e.id, e.person_id, e.house_id, e.created_by, e.confidential
      INTO v_enc, v_person, v_house, v_autor, v_atual
      FROM health_encounter e WHERE e.id = p_id;
    SELECT ev.id INTO v_evo FROM health_evolution ev WHERE ev.encounter_id = v_enc LIMIT 1;
  ELSIF p_qual = 'atendimento' THEN
    SELECT ev.id, ev.encounter_id, ev.person_id, ev.house_id, ev.accompanied_by, ev.confidential
      INTO v_evo, v_enc, v_person, v_house, v_autor, v_atual
      FROM health_evolution ev WHERE ev.id = p_id;
  ELSE
    RAISE EXCEPTION 'registro_inexistente';
  END IF;
  IF v_house IS NULL OR NOT app_house_in_scope(v_house) THEN RAISE EXCEPTION 'registro_inexistente'; END IF;

  IF p_sigiloso THEN
    IF v_atual THEN RAISE EXCEPTION 'ja_sigiloso'; END IF;
    IF NOT (v_role IN ('enfermagem','equipe_tecnica','coordenador') OR v_autor = app_current_user()) THEN
      RAISE EXCEPTION 'sem_permissao_sigilo';
    END IF;
  ELSE
    IF NOT v_atual THEN RAISE EXCEPTION 'nao_e_sigiloso'; END IF;
    IF v_role NOT IN ('equipe_tecnica','coordenador') THEN RAISE EXCEPTION 'sem_permissao_tirar_sigilo'; END IF;
    IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'motivo_curto'; END IF;
  END IF;

  IF v_enc IS NOT NULL THEN UPDATE health_encounter SET confidential = p_sigiloso WHERE id = v_enc; END IF;
  IF v_evo IS NOT NULL THEN UPDATE health_evolution SET confidential = p_sigiloso WHERE id = v_evo; END IF;
  INSERT INTO health_confidential_change (encounter_id, evolution_id, person_id, house_id, confidential, reason, created_by)
  VALUES (v_enc, v_evo, v_person, v_house, p_sigiloso, nullif(btrim(coalesce(p_motivo, '')), ''), app_current_user());
  RETURN v_house;
END $$;
REVOKE ALL ON FUNCTION app_marcar_sigilo_de_saude(text, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_marcar_sigilo_de_saude(text, uuid, boolean, text) TO rede_app;
