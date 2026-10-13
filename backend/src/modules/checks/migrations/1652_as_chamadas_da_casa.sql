-- AS CHAMADAS DA CASA (fase 211, pedido de 12/10).
--
-- Até aqui cada chamada era aberta à mão, com o tipo e o nome, todo dia. O
-- pedido: as chamadas da casa (café, almoço, janta, ceia, e o que mais a casa
-- fizer) definidas uma vez, com o nome, o horário, quantas pessoas costumam
-- estar, e uma cor escolhida numa paleta, para a tela da Chamada mostrar o dia
-- já montado e a pessoa abrir com um toque.
--
-- O modelo é da CASA, e muda com o tempo: mudar é encerrar o modelo de antes e
-- abrir outro, nunca reescrever. A chamada que já foi feita guarda o nome que
-- tinha no dia (collective_check.title), e o modelo de hoje não muda o passado.
--
-- A cor é uma das cores da paleta da tela (frontend/src/cores-da-casa.ts), pelo
-- código, e diz só QUAL chamada é. Nunca diz se a chamada foi bem ou mal.

CREATE TABLE IF NOT EXISTS house_check_model (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id     uuid NOT NULL REFERENCES house(id),
  kind         check_type NOT NULL,
  title        text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 60),
  at_time      time NOT NULL,
  -- Quantas pessoas costumam estar (acolhidos e equipe que comem, por exemplo).
  people_count integer CHECK (people_count IS NULL OR people_count BETWEEN 1 AND 200),
  color        text NOT NULL CHECK (color ~ '^[a-z0-9-]{2,24}$'),
  created_by   uuid NOT NULL REFERENCES app_user(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  ended_by     uuid REFERENCES app_user(id),
  ended_at     timestamptz,
  -- O modelo que este substituiu, quando é uma mudança.
  replaces     uuid REFERENCES house_check_model(id),
  CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_modelo_de_chamada ON house_check_model (house_id, at_time) WHERE ended_at IS NULL;

ALTER TABLE house_check_model ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON house_check_model TO rede_app;
DROP POLICY IF EXISTS hcm_select ON house_check_model;
CREATE POLICY hcm_select ON house_check_model FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));

-- Quem define as chamadas da casa: coordenação, equipe técnica e Líder Diurno.
CREATE OR REPLACE FUNCTION app_define_chamadas_da_casa() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT app_current_role() IN ('coordenador','equipe_tecnica','lider_diurno') $$;

-- Criar ou mudar (com p_substitui): mudar encerra o de antes.
CREATE OR REPLACE FUNCTION app_salvar_modelo_de_chamada(
  p_house uuid, p_substitui uuid, p_kind text, p_titulo text, p_hora time,
  p_pessoas integer, p_cor text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_id uuid; v_antigo house_check_model%ROWTYPE;
BEGIN
  IF NOT app_define_chamadas_da_casa() THEN
    RAISE EXCEPTION 'sem_permissao_modelo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_house IS NULL OR NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_substitui IS NOT NULL THEN
    SELECT * INTO v_antigo FROM house_check_model WHERE id = p_substitui;
    IF v_antigo.id IS NULL OR v_antigo.house_id <> p_house THEN
      RAISE EXCEPTION 'modelo_inexistente' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_antigo.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'modelo_ja_encerrado' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE house_check_model SET ended_at = now(), ended_by = app_current_user() WHERE id = p_substitui;
  END IF;
  INSERT INTO house_check_model (house_id, kind, title, at_time, people_count, color, created_by, replaces)
  VALUES (p_house, p_kind::check_type, btrim(p_titulo), p_hora, p_pessoas, p_cor, app_current_user(), p_substitui)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Tirar uma chamada da casa: o modelo encerra, e o passado continua.
CREATE OR REPLACE FUNCTION app_encerrar_modelo_de_chamada(p_modelo uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE r house_check_model%ROWTYPE;
BEGIN
  IF NOT app_define_chamadas_da_casa() THEN
    RAISE EXCEPTION 'sem_permissao_modelo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM house_check_model WHERE id = p_modelo;
  IF r.id IS NULL OR NOT app_house_in_scope(r.house_id) THEN
    RAISE EXCEPTION 'modelo_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF r.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'modelo_ja_encerrado' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE house_check_model SET ended_at = now(), ended_by = app_current_user() WHERE id = p_modelo;
  RETURN r.house_id;
END $$;

REVOKE ALL ON FUNCTION app_salvar_modelo_de_chamada(uuid, uuid, text, text, time, integer, text),
  app_encerrar_modelo_de_chamada(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_define_chamadas_da_casa(),
  app_salvar_modelo_de_chamada(uuid, uuid, text, text, time, integer, text),
  app_encerrar_modelo_de_chamada(uuid) TO rede_app;
