-- OS VÍNCULOS EDUCACIONAIS (fase 282, primeira avaliação humana de 05/11, módulo 07;
-- decidido pela pessoa da Fundação em 06/11).
--
-- "Os vínculos ficam na aba Educação em ordem linear, parecido com um contrato:
-- educação infantil de tal época a tal época. [...] SCFV, educação integral,
-- aprendizagem, estágio, ensino médio, ensino fundamental e superior [...] podendo
-- colocar o jovem em mais de uma coisa ao mesmo tempo, de manhã colégio e à tarde
-- aprendizagem [...] sendo possível até colocar as notas dos jovens."
--
-- Até aqui a escola era um campo só do perfil (nome, série e turno), sem começo nem
-- fim, e a aprendizagem morava dentro do apoio educacional. O vínculo é a linha do
-- contrato: o tipo, a instituição, a turma, o turno, os dias, o endereço, quando
-- começou, quando deve terminar e quando terminou de fato.
--
--  * mais de um vínculo vigente ao mesmo tempo, sem limite;
--  * corrigir não apaga: o que constava antes vai para `education_link_change`, com
--    o motivo, o nome e a hora, na mesma transação;
--  * encerrar é dizer a data e o motivo; o vínculo encerrado continua na linha;
--  * a nota é da escola, lançada pela equipe, por período e disciplina; corrigir é
--    outra linha apontando para a anterior, que continua legível;
--  * o aviso do fim previsto vai à técnica, à coordenação e ao Líder Diurno, a 30 e
--    a 7 dias, uma vez cada (decidido em 06/11: fixos, sem configuração).
--
-- Quem escreve é a mesma equipe que escreve o Registro Educacional (0530): educador,
-- líder, técnica, coordenação e Gestor Geral. Lê quem alcança a criança.

CREATE TABLE IF NOT EXISTS education_link (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id      uuid NOT NULL REFERENCES person(id),
  house_id       uuid NOT NULL REFERENCES house(id),
  kind           text NOT NULL CHECK (kind IN (
                   'educacao_infantil','ensino_fundamental','ensino_medio','eja',
                   'ensino_tecnico','ensino_superior','educacao_integral','scfv',
                   'aprendizagem','estagio','curso','outro')),
  kind_other     text,
  institution    text NOT NULL,
  course         text,
  grade          text,          -- série, ano ou etapa
  class_group    text,          -- turma
  shift          text CHECK (shift IS NULL OR shift IN ('manha','tarde','noite','integral','variavel')),
  weekdays       smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',  -- 1 segunda ... 7 domingo
  training_unit  text,          -- unidade de formação
  company        text,          -- empresa, quando houver
  address        text,          -- logística de quem leva; nunca rastreamento (§7.5)
  starts_on      date NOT NULL,
  expected_end   date,
  ended_on       date,
  end_reason     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL REFERENCES app_user(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL REFERENCES app_user(id),
  CONSTRAINT vinculo_tem_instituicao CHECK (length(btrim(institution)) >= 2),
  CONSTRAINT vinculo_outro_tem_nome CHECK (kind <> 'outro' OR length(btrim(coalesce(kind_other, ''))) >= 2),
  CONSTRAINT vinculo_fim_depois_do_inicio CHECK (expected_end IS NULL OR expected_end >= starts_on),
  CONSTRAINT vinculo_encerrado_depois_do_inicio CHECK (ended_on IS NULL OR ended_on >= starts_on),
  CONSTRAINT vinculo_encerrado_tem_motivo CHECK (ended_on IS NULL OR length(btrim(coalesce(end_reason, ''))) >= 5),
  CONSTRAINT vinculo_dias_validos CHECK (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[])
);
CREATE INDEX IF NOT EXISTS ix_education_link_pessoa ON education_link (person_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS ix_education_link_casa ON education_link (house_id);
CREATE INDEX IF NOT EXISTS ix_education_link_criou ON education_link (created_by);
CREATE INDEX IF NOT EXISTS ix_education_link_mudou ON education_link (updated_by);

-- O que constava antes de cada correção ou encerramento.
CREATE TABLE IF NOT EXISTS education_link_change (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id     uuid NOT NULL REFERENCES education_link(id),
  house_id    uuid NOT NULL REFERENCES house(id),
  kind        text NOT NULL CHECK (kind IN ('correcao','encerramento')),
  before      jsonb NOT NULL,
  reason      text NOT NULL CHECK (length(btrim(reason)) >= 5),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  changed_by  uuid NOT NULL REFERENCES app_user(id)
);
CREATE INDEX IF NOT EXISTS ix_education_link_change_vinculo ON education_link_change (link_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS ix_education_link_change_casa ON education_link_change (house_id);
CREATE INDEX IF NOT EXISTS ix_education_link_change_quem ON education_link_change (changed_by);

-- A nota da escola, por período e disciplina.
CREATE TABLE IF NOT EXISTS education_grade (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id        uuid NOT NULL REFERENCES education_link(id),
  person_id      uuid NOT NULL REFERENCES person(id),
  house_id       uuid NOT NULL REFERENCES house(id),
  period         text NOT NULL CHECK (length(btrim(period)) >= 2),   -- 1º trimestre de 2026
  subject        text NOT NULL CHECK (length(btrim(subject)) >= 2),  -- Matemática
  grade          text NOT NULL CHECK (length(btrim(grade)) >= 1),    -- 7,5 ou B ou Satisfatório
  note           text,
  replaces_id    uuid REFERENCES education_grade(id),
  replaced_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL REFERENCES app_user(id)
);
CREATE INDEX IF NOT EXISTS ix_education_grade_vinculo ON education_grade (link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_education_grade_pessoa ON education_grade (person_id);
CREATE INDEX IF NOT EXISTS ix_education_grade_casa ON education_grade (house_id);
CREATE INDEX IF NOT EXISTS ix_education_grade_substitui ON education_grade (replaces_id);
CREATE INDEX IF NOT EXISTS ix_education_grade_quem ON education_grade (created_by);

-- A marca de já avisei: uma linha por vínculo, fim previsto e antecedência.
CREATE TABLE IF NOT EXISTS education_link_notice (
  link_id      uuid NOT NULL REFERENCES education_link(id),
  expected_end date NOT NULL,
  days_before  integer NOT NULL CHECK (days_before IN (30, 7)),
  notified_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, expected_end, days_before)
);

ALTER TABLE education_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_link_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_grade ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_link_notice ENABLE ROW LEVEL SECURITY;

-- Lê quem alcança a casa da criança. Escreve só pelas funções abaixo.
CREATE POLICY edlink_select ON education_link FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
CREATE POLICY edlinkchg_select ON education_link_change FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
CREATE POLICY edgrade_select ON education_grade FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
GRANT SELECT ON education_link, education_link_change, education_grade TO rede_app;
REVOKE INSERT, UPDATE, DELETE ON education_link, education_link_change, education_grade FROM rede_app;
REVOKE ALL ON education_link_notice FROM rede_app;

COMMENT ON TABLE education_link IS
  'Vínculo educacional da criança: escola, curso, SCFV, aprendizagem, estágio, com começo, fim previsto e encerramento (fase 282). Vários ao mesmo tempo; nada se apaga.';
COMMENT ON TABLE education_link_change IS
  'O que constava num vínculo educacional antes de cada correção ou encerramento, com o motivo, o nome e a hora (fase 282).';
COMMENT ON TABLE education_grade IS
  'Nota da escola lançada pela equipe, por vínculo, período e disciplina (fase 282). Corrigir é outra linha apontando para a anterior.';
COMMENT ON TABLE education_link_notice IS
  'Marca de já avisei do fim previsto de um vínculo educacional (fase 282): uma linha por vínculo, data e antecedência, escrita e lida só por app_vinculos_terminando. Não há tela: o que a pessoa lê é o aviso.';

/* Quem escreve nos vínculos: a equipe do Registro Educacional. */
CREATE OR REPLACE FUNCTION app_escreve_vinculo_educacional() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_current_role()::text IN ('educador','lider_diurno','equipe_tecnica','coordenador','gestor_geral')
$$;
REVOKE ALL ON FUNCTION app_escreve_vinculo_educacional() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_escreve_vinculo_educacional() TO rede_app;

/* A casa de agora da criança, conferida pelo alcance de quem pede. */
CREATE OR REPLACE FUNCTION app_casa_do_vinculo_novo(p_person uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_house uuid;
BEGIN
  SELECT s.house_id INTO v_house FROM house_stay s
   WHERE s.person_id = p_person AND s.status = 'ativa'
   ORDER BY s.started_at DESC LIMIT 1;
  IF v_house IS NULL OR NOT app_house_in_scope(v_house) THEN
    RAISE EXCEPTION 'acolhido_fora_de_escopo';
  END IF;
  RETURN v_house;
END $$;
REVOKE ALL ON FUNCTION app_casa_do_vinculo_novo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_casa_do_vinculo_novo(uuid) TO rede_app;

/* CADASTRAR um vínculo. */
CREATE OR REPLACE FUNCTION app_cadastrar_vinculo_educacional(p_person uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_house uuid; v_id uuid;
BEGIN
  IF NOT app_escreve_vinculo_educacional() THEN RAISE EXCEPTION 'sem_permissao_vinculo'; END IF;
  v_house := app_casa_do_vinculo_novo(p_person);
  INSERT INTO education_link (person_id, house_id, kind, kind_other, institution, course, grade,
                              class_group, shift, weekdays, training_unit, company, address,
                              starts_on, expected_end, created_by, updated_by)
  VALUES (p_person, v_house, p->>'kind', nullif(btrim(p->>'kind_other'), ''), btrim(p->>'institution'),
          nullif(btrim(p->>'course'), ''), nullif(btrim(p->>'grade'), ''),
          nullif(btrim(p->>'class_group'), ''), nullif(p->>'shift', ''),
          coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'weekdays')::smallint), '{1,2,3,4,5}'),
          nullif(btrim(p->>'training_unit'), ''), nullif(btrim(p->>'company'), ''),
          nullif(btrim(p->>'address'), ''),
          (p->>'starts_on')::date, nullif(p->>'expected_end', '')::date,
          app_current_user(), app_current_user())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION app_cadastrar_vinculo_educacional(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cadastrar_vinculo_educacional(uuid, jsonb) TO rede_app;

/* A fotografia do vínculo, para o histórico. */
CREATE OR REPLACE FUNCTION app_vinculo_como_estava(l education_link) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'kind', l.kind, 'kind_other', l.kind_other, 'institution', l.institution, 'course', l.course,
    'grade', l.grade, 'class_group', l.class_group, 'shift', l.shift, 'weekdays', l.weekdays,
    'training_unit', l.training_unit, 'company', l.company, 'address', l.address,
    'starts_on', l.starts_on, 'expected_end', l.expected_end,
    'ended_on', l.ended_on, 'end_reason', l.end_reason)
$$;

/* CORRIGIR um vínculo: o que constava vai para o histórico, com o motivo. */
CREATE OR REPLACE FUNCTION app_corrigir_vinculo_educacional(p_link uuid, p jsonb, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v education_link%ROWTYPE;
BEGIN
  IF NOT app_escreve_vinculo_educacional() THEN RAISE EXCEPTION 'sem_permissao_vinculo'; END IF;
  SELECT * INTO v FROM education_link WHERE id = p_link FOR UPDATE;
  IF v.id IS NULL OR NOT app_house_in_scope(v.house_id) THEN RAISE EXCEPTION 'vinculo_inexistente'; END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'motivo_curto'; END IF;
  INSERT INTO education_link_change (link_id, house_id, kind, before, reason, changed_by)
  VALUES (v.id, v.house_id, 'correcao', app_vinculo_como_estava(v), btrim(p_motivo), app_current_user());
  UPDATE education_link SET
    kind = coalesce(p->>'kind', kind),
    kind_other = CASE WHEN p ? 'kind_other' THEN nullif(btrim(p->>'kind_other'), '') ELSE kind_other END,
    institution = coalesce(nullif(btrim(p->>'institution'), ''), institution),
    course = CASE WHEN p ? 'course' THEN nullif(btrim(p->>'course'), '') ELSE course END,
    grade = CASE WHEN p ? 'grade' THEN nullif(btrim(p->>'grade'), '') ELSE grade END,
    class_group = CASE WHEN p ? 'class_group' THEN nullif(btrim(p->>'class_group'), '') ELSE class_group END,
    shift = CASE WHEN p ? 'shift' THEN nullif(p->>'shift', '') ELSE shift END,
    weekdays = CASE WHEN p ? 'weekdays'
                    THEN ARRAY(SELECT jsonb_array_elements_text(p->'weekdays')::smallint) ELSE weekdays END,
    training_unit = CASE WHEN p ? 'training_unit' THEN nullif(btrim(p->>'training_unit'), '') ELSE training_unit END,
    company = CASE WHEN p ? 'company' THEN nullif(btrim(p->>'company'), '') ELSE company END,
    address = CASE WHEN p ? 'address' THEN nullif(btrim(p->>'address'), '') ELSE address END,
    starts_on = coalesce(nullif(p->>'starts_on', '')::date, starts_on),
    expected_end = CASE WHEN p ? 'expected_end' THEN nullif(p->>'expected_end', '')::date ELSE expected_end END,
    updated_at = now(), updated_by = app_current_user()
  WHERE id = v.id;
  RETURN v.house_id;
END $$;
REVOKE ALL ON FUNCTION app_corrigir_vinculo_educacional(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_corrigir_vinculo_educacional(uuid, jsonb, text) TO rede_app;

/* ENCERRAR um vínculo: a data e o motivo. Encerrar duas vezes é recusado. */
CREATE OR REPLACE FUNCTION app_encerrar_vinculo_educacional(p_link uuid, p_em date, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v education_link%ROWTYPE;
BEGIN
  IF NOT app_escreve_vinculo_educacional() THEN RAISE EXCEPTION 'sem_permissao_vinculo'; END IF;
  SELECT * INTO v FROM education_link WHERE id = p_link FOR UPDATE;
  IF v.id IS NULL OR NOT app_house_in_scope(v.house_id) THEN RAISE EXCEPTION 'vinculo_inexistente'; END IF;
  IF v.ended_on IS NOT NULL THEN RAISE EXCEPTION 'vinculo_ja_encerrado'; END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'motivo_curto'; END IF;
  IF p_em IS NULL OR p_em < v.starts_on THEN RAISE EXCEPTION 'encerramento_antes_do_inicio'; END IF;
  IF p_em > app_hoje() THEN RAISE EXCEPTION 'encerramento_no_futuro'; END IF;
  INSERT INTO education_link_change (link_id, house_id, kind, before, reason, changed_by)
  VALUES (v.id, v.house_id, 'encerramento', app_vinculo_como_estava(v), btrim(p_motivo), app_current_user());
  UPDATE education_link SET ended_on = p_em, end_reason = btrim(p_motivo),
         updated_at = now(), updated_by = app_current_user()
   WHERE id = v.id;
  RETURN v.house_id;
END $$;
REVOKE ALL ON FUNCTION app_encerrar_vinculo_educacional(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_encerrar_vinculo_educacional(uuid, date, text) TO rede_app;

/* LANÇAR uma nota; com p_substitui, corrige a anterior sem apagá-la. */
CREATE OR REPLACE FUNCTION app_lancar_nota_educacional(
  p_link uuid, p_periodo text, p_disciplina text, p_nota text, p_obs text, p_substitui uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v education_link%ROWTYPE; v_id uuid; v_ant education_grade%ROWTYPE;
BEGIN
  IF NOT app_escreve_vinculo_educacional() THEN RAISE EXCEPTION 'sem_permissao_vinculo'; END IF;
  SELECT * INTO v FROM education_link WHERE id = p_link;
  IF v.id IS NULL OR NOT app_house_in_scope(v.house_id) THEN RAISE EXCEPTION 'vinculo_inexistente'; END IF;
  IF p_substitui IS NOT NULL THEN
    SELECT * INTO v_ant FROM education_grade WHERE id = p_substitui FOR UPDATE;
    IF v_ant.id IS NULL OR v_ant.link_id <> v.id THEN RAISE EXCEPTION 'nota_inexistente'; END IF;
    IF v_ant.replaced_at IS NOT NULL THEN RAISE EXCEPTION 'nota_ja_corrigida'; END IF;
  END IF;
  INSERT INTO education_grade (link_id, person_id, house_id, period, subject, grade, note, replaces_id, created_by)
  VALUES (v.id, v.person_id, v.house_id, btrim(p_periodo), btrim(p_disciplina), btrim(p_nota),
          nullif(btrim(coalesce(p_obs, '')), ''), p_substitui, app_current_user())
  RETURNING id INTO v_id;
  IF p_substitui IS NOT NULL THEN
    UPDATE education_grade SET replaced_at = now() WHERE id = p_substitui;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION app_lancar_nota_educacional(uuid, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_lancar_nota_educacional(uuid, text, text, text, text, uuid) TO rede_app;

/*
 * O FIM PREVISTO CHEGANDO: o relógio do dia pergunta casa a casa. Devolve só o que o
 * aviso precisa (quem, o quê, até quando e a antecedência), e marca para não repetir.
 * Fim previsto já passado não vira aviso: o vínculo esquecido aberto se vê no perfil.
 */
CREATE OR REPLACE FUNCTION app_vinculos_terminando(p_house uuid)
RETURNS TABLE (out_vinculo uuid, out_pessoa uuid, out_nome text, out_instituicao text,
               out_fim date, out_dias integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH candidatos AS (
    SELECT l.id, l.person_id, l.institution, l.expected_end,
           CASE WHEN l.expected_end - app_hoje() <= 7 THEN 7 ELSE 30 END AS dias
      FROM education_link l
     WHERE l.house_id = p_house AND l.ended_on IS NULL
       AND l.expected_end BETWEEN app_hoje() AND app_hoje() + 30
  ), novos AS (
    INSERT INTO education_link_notice (link_id, expected_end, days_before)
    SELECT c.id, c.expected_end, c.dias FROM candidatos c
    ON CONFLICT DO NOTHING
    RETURNING link_id, expected_end, days_before
  )
  SELECT n.link_id, l.person_id, coalesce(p.social_name, p.full_name), l.institution,
         n.expected_end, n.days_before
    FROM novos n
    JOIN education_link l ON l.id = n.link_id
    JOIN person p ON p.id = l.person_id
   ORDER BY n.expected_end;
END $$;
REVOKE ALL ON FUNCTION app_vinculos_terminando(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_vinculos_terminando(uuid) TO rede_app;
