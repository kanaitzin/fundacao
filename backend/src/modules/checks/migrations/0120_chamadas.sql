-- ============================================================
-- Módulo `checks` — Chamadas coletivas e acompanhamento diário (§10)
--
-- Uma chamada confere TODOS os acolhidos ativos numa operação e gera um
-- registro individual por acolhido — a conferência é coletiva, o registro
-- nunca é. É o que sustenta "cada seleção gera registro individual no perfil".
--
-- Restrição ligada a comportamento exige fato concreto, decisor, norma,
-- duração e acompanhamento (§10) — e nunca rótulo. O esquema obriga o fato.
-- ============================================================

CREATE TYPE check_type AS ENUM
  ('acordar','alimentacao','escola','banho','lazer','dormir','chamada_final','outro');

CREATE TABLE collective_check (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      uuid NOT NULL REFERENCES house(id),
  kind          check_type NOT NULL,
  title         text NOT NULL,               -- "Almoço", "Saída para escola — manhã"
  reference_at  timestamptz NOT NULL,        -- momento a que a chamada se refere
  status        text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','confirmada')),
  expected      integer NOT NULL DEFAULT 0,  -- quantos acolhidos ativos havia
  confirmed_at  timestamptz,
  confirmed_by  uuid REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES app_user(id)
);
CREATE INDEX idx_check_house_day ON collective_check (house_id, reference_at);

CREATE TABLE check_result (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id      uuid NOT NULL REFERENCES collective_check(id),
  person_id     uuid NOT NULL REFERENCES person(id),
  option_code   text NOT NULL,               -- normal, parcial, recusou…
  note          text,                        -- justificativa objetiva quando exceção
  -- Autoria por LINHA: numa chamada longa, educadores diferentes podem
  -- registrar partes; cada registro guarda quem o fez (§8.2).
  recorded_by   uuid NOT NULL REFERENCES app_user(id),
  happened_at   timestamptz NOT NULL DEFAULT now(),
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  offline       boolean NOT NULL DEFAULT false,
  client_op_id  text,
  UNIQUE (check_id, person_id)               -- um resultado por acolhido por chamada
);
CREATE UNIQUE INDEX uq_check_client_op ON check_result (client_op_id) WHERE client_op_id IS NOT NULL;

-- ---------- Escopo ----------
ALTER TABLE collective_check ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_select ON collective_check FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY cc_insert ON collective_check FOR INSERT TO rede_app WITH CHECK (app_house_in_scope(house_id));
CREATE POLICY cc_update ON collective_check FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id)) WITH CHECK (true);

ALTER TABLE check_result ENABLE ROW LEVEL SECURITY;
CREATE POLICY cr_select ON check_result FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM collective_check k WHERE k.id = check_id));
-- Quem marca assina o próprio registro; ninguém marca em nome de outro.
CREATE POLICY cr_insert ON check_result FOR INSERT TO rede_app
  WITH CHECK (recorded_by = app_current_user()
              AND EXISTS (SELECT 1 FROM collective_check k WHERE k.id = check_id));
CREATE POLICY cr_update ON check_result FOR UPDATE TO rede_app
  USING (EXISTS (SELECT 1 FROM collective_check k WHERE k.id = check_id)) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON collective_check, check_result TO rede_app;
REVOKE DELETE ON collective_check, check_result FROM rede_app;

-- ---------- Abertura da chamada ----------
-- Fixa quantos acolhidos ativos existem no momento: é contra esse número que
-- a conferência final é medida. "Todos os acolhidos ativos devem ser
-- conferidos" (§10) — inclusive quem não tem nada a relatar.
CREATE OR REPLACE FUNCTION app_open_check(p_house uuid, p_kind text, p_title text, p_at timestamptz)
RETURNS TABLE (check_id uuid, esperados integer) AS $$
DECLARE v_id uuid; v_n integer;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT count(*) INTO v_n FROM house_stay WHERE house_id = p_house AND status = 'ativa';
  INSERT INTO collective_check (house_id, kind, title, reference_at, expected, created_by)
  VALUES (p_house, p_kind::check_type, p_title, p_at, v_n, app_current_user())
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, v_n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_open_check(uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_open_check(uuid, text, text, timestamptz) TO rede_app;

-- ---------- Confirmação ----------
-- Só confirma quando TODOS os ativos foram conferidos individualmente.
-- Não existe "confirmar tudo" que preencha o que não foi olhado (§11.2 proíbe
-- marcação em lote; o mesmo princípio vale aqui).
CREATE OR REPLACE FUNCTION app_confirm_check(p_check uuid)
RETURNS TABLE (conferidos integer, esperados integer) AS $$
DECLARE v_conf integer; v_exp integer; v_house uuid;
BEGIN
  SELECT house_id, expected INTO v_house, v_exp FROM collective_check WHERE id = p_check;
  IF v_house IS NULL OR NOT app_house_in_scope(v_house) THEN
    RAISE EXCEPTION 'chamada_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT count(*) INTO v_conf FROM check_result r
   JOIN house_stay s ON s.person_id = r.person_id AND s.status = 'ativa' AND s.house_id = v_house
   WHERE r.check_id = p_check;

  IF v_conf < v_exp THEN
    RAISE EXCEPTION 'conferencia_incompleta' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE collective_check SET status='confirmada', confirmed_at=now(), confirmed_by=app_current_user()
   WHERE id = p_check;
  RETURN QUERY SELECT v_conf, v_exp;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_confirm_check(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_confirm_check(uuid) TO rede_app;
