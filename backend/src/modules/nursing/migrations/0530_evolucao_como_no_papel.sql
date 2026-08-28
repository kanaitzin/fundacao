-- ============================================================
-- Rede Acolher — Migração 053: a Evolução de Saúde como ela existe hoje
--
-- Feita a partir do "Modelo de Evolução de Saúde" real da Fundação. O que o
-- papel pede e o sistema ainda não guardava:
--
--  * HORÁRIO da consulta separado da data (o modelo tem os dois campos, e a
--    Enfermagem usa o horário para conferir deslocamento e medicação);
--  * ACOMPANHANTE como texto — hoje o sistema exige um usuário do sistema, e
--    quem leva à consulta às vezes é motorista, estagiário ou familiar
--    autorizado. Exigir usuário cadastrado obrigava a mentir no campo;
--  * COMPORTAMENTO AO CHEGAR e AO SAIR do atendimento, com as quatro opções
--    do papel. Não é avaliação de personalidade: é o estado observado em dois
--    momentos, e a comparação entre eles é o que a Enfermagem lê;
--  * OCORRÊNCIAS NO TRAJETO, campo próprio;
--  * DATA DA RECONSULTA (o sistema tinha "prazo de retorno"; o papel marca a
--    data, que é o que gera a pendência);
--  * a assinatura da ENFERMEIRA e do COORDENADOR DA CASA, que no papel são
--    duas linhas no rodapé e aqui viram duas confirmações datadas.
--
-- O que NÃO foi copiado do papel: nada. Este modelo não tem excesso — é curto
-- porque foi escrito por quem preenche.
-- ============================================================

ALTER TABLE health_evolution
  ADD COLUMN IF NOT EXISTS companion_name  text,   -- quem acompanhou, como no papel
  ADD COLUMN IF NOT EXISTS behavior_before text
    CHECK (behavior_before IS NULL OR behavior_before IN
           ('tranquila','ansiosa_temerosa_chorosa','agressiva','apatica')),
  ADD COLUMN IF NOT EXISTS behavior_after  text
    CHECK (behavior_after IS NULL OR behavior_after IN
           ('tranquila','ansiosa_temerosa_chorosa','agressiva','apatica')),
  ADD COLUMN IF NOT EXISTS trip_incidents  text,
  ADD COLUMN IF NOT EXISTS reconsult_on    date,
  ADD COLUMN IF NOT EXISTS nurse_signed_by uuid REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS nurse_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS coord_signed_by uuid REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS coord_signed_at timestamptz;

-- Assinar a evolução: duas confirmações, cada uma com seu dono.
-- Como no papel — só que aqui ninguém assina no lugar de outro (§5.1).
CREATE OR REPLACE FUNCTION app_sign_evolution(p_evolution uuid, p_papel text)
RETURNS TABLE (assinada_enfermagem boolean, assinada_coordenacao boolean) AS $$
DECLARE e record;
BEGIN
  SELECT * INTO e FROM health_evolution WHERE id = p_evolution FOR UPDATE;
  IF e IS NULL THEN
    RAISE EXCEPTION 'evolucao_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(e.house_id) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_papel = 'enfermagem' THEN
    IF app_current_role() NOT IN ('enfermagem','gestor_geral') THEN
      RAISE EXCEPTION 'somente_enfermagem_assina' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF e.nurse_signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'ja_assinada' USING ERRCODE = 'unique_violation';
    END IF;
    UPDATE health_evolution
       SET nurse_signed_by = app_current_user(), nurse_signed_at = now()
     WHERE id = p_evolution;
  ELSIF p_papel = 'coordenacao' THEN
    IF app_current_role() NOT IN ('coordenador','gestor_geral') THEN
      RAISE EXCEPTION 'somente_coordenacao_assina' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF e.coord_signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'ja_assinada' USING ERRCODE = 'unique_violation';
    END IF;
    UPDATE health_evolution
       SET coord_signed_by = app_current_user(), coord_signed_at = now()
     WHERE id = p_evolution;
  ELSE
    RAISE EXCEPTION 'papel_invalido' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
    SELECT (SELECT nurse_signed_at IS NOT NULL FROM health_evolution WHERE id = p_evolution),
           (SELECT coord_signed_at IS NOT NULL FROM health_evolution WHERE id = p_evolution);
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_sign_evolution(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_sign_evolution(uuid, text) TO rede_app;

-- ============================================================
-- Prontuário Individual de Evolução — EDUCAÇÃO
--
-- Do formulário real do AI 3. O sistema já guardava escola, série e turno no
-- perfil; o que faltava é o que a educadora de referência da Educação
-- acompanha de verdade: sala de recursos, equipe multiprofissional e
-- aprendizagem profissional.
--
-- Fica no módulo de saúde? Não: fica aqui, junto com quem acompanha. É
-- registro EDUCACIONAL, com a mesma visibilidade do perfil escolar — a casa
-- inteira precisa saber que a criança tem fono às terças.
-- ============================================================
CREATE TABLE IF NOT EXISTS education_support (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES person(id),
  house_id     uuid NOT NULL REFERENCES house(id),
  -- Sala de recursos
  resource_room      boolean NOT NULL DEFAULT false,
  resource_reason    text,
  resource_teacher   text,
  -- Equipe multiprofissional: um registro por serviço
  service_kind text CHECK (service_kind IS NULL OR service_kind IN
                    ('fono','pedagoga','psicopedagoga','outro')),
  service_other text,
  service_place text,
  service_professional text,
  -- Aprendizagem profissional (Jovem Aprendiz)
  apprentice        boolean NOT NULL DEFAULT false,
  apprentice_mode   text CHECK (apprentice_mode IS NULL OR apprentice_mode IN ('presencial','online')),
  course_name       text,
  course_start      date,
  course_end        date,
  course_shift      text,
  training_unit     text,
  workplace         text,
  workplace_address text,     -- endereço para logística; nunca rastreamento (§7.5)
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES app_user(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES app_user(id)
);
CREATE INDEX IF NOT EXISTS idx_edusup_person ON education_support (person_id) WHERE active;

-- Evolução educacional: o campo livre do papel, datado e com autor.
CREATE TABLE IF NOT EXISTS education_evolution (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL REFERENCES person(id),
  house_id   uuid NOT NULL REFERENCES house(id),
  on_date    date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  narrative  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES app_user(id)
);
CREATE INDEX IF NOT EXISTS idx_eduevo_person ON education_evolution (person_id, on_date DESC);

ALTER TABLE education_support ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_evolution ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON education_support TO rede_app;
GRANT SELECT, INSERT ON education_evolution TO rede_app;

-- Quem cuida enxerga: é o que permite levar à fono e cobrar o curso.
CREATE POLICY edusup_select ON education_support FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id));
CREATE POLICY edusup_write ON education_support FOR INSERT TO rede_app
  WITH CHECK (app_person_in_scope(person_id)
              AND app_current_role() IN ('educador','lider_diurno','equipe_tecnica','coordenador','gestor_geral'));
CREATE POLICY edusup_update ON education_support FOR UPDATE TO rede_app
  USING (app_person_in_scope(person_id)
         AND app_current_role() IN ('educador','lider_diurno','equipe_tecnica','coordenador','gestor_geral'))
  WITH CHECK (app_person_in_scope(person_id));

CREATE POLICY eduevo_select ON education_evolution FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id));
-- A evolução é do autor: ninguém escreve em nome de outro (§5.1). E não se
-- edita depois — correção é novo registro, como no caderno.
CREATE POLICY eduevo_insert ON education_evolution FOR INSERT TO rede_app
  WITH CHECK (created_by = app_current_user() AND app_person_in_scope(person_id));
