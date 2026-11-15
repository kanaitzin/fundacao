-- O FUNCIONÁRIO DO MÊS (fase 324, pedido e decidido pelo dono em 14/11).
--
-- Dois: um por casa, escolhido pela coordenação da casa com o porquê, e um da Fundação,
-- escolhido pela Coordenação Geral com o porquê. É reconhecimento de quem trabalha, e não
-- nota: não há ponto, ranking nem número, só a pessoa e o porquê, escritos por quem escolheu.
--
-- Quem LÊ (o mais aberto que cabe no pedido; a conferir com o dono): o da casa, quem
-- trabalha na casa (a cozinha e a portaria também, que podem ser escolhidas), a Coordenação
-- Geral e o Gestor Geral; o da Fundação, todas as contas ativas da instituição.
--
-- O que foi escrito não se apaga nem se reescreve (§5.1): trocar a escolha do mês é uma
-- linha nova, com o motivo, que aponta para a de antes; a de antes continua legível.
-- Escolhe-se o mês corrente ou o anterior, nunca um mês que ainda não começou.

CREATE TABLE staff_of_month (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institution(id),
  -- A casa; nula para o funcionário do mês da Fundação.
  house_id       uuid REFERENCES house(id),
  month          date NOT NULL CHECK (extract(day FROM month) = 1),
  person_id      uuid NOT NULL REFERENCES app_user(id),
  reason         text NOT NULL CHECK (length(btrim(reason)) BETWEEN 20 AND 2000),
  chosen_by      uuid NOT NULL REFERENCES app_user(id),
  chosen_at      timestamptz NOT NULL DEFAULT now(),
  -- A troca: a escolha de antes, e por que mudou.
  replaces_id    uuid UNIQUE REFERENCES staff_of_month(id),
  change_reason  text CHECK (change_reason IS NULL OR length(btrim(change_reason)) BETWEEN 10 AND 2000),
  CHECK ((replaces_id IS NULL) = (change_reason IS NULL)),
  CHECK (person_id <> chosen_by)
);
-- Uma escolha original por casa (ou pela Fundação) e mês; as trocas encadeiam nela.
CREATE UNIQUE INDEX ux_som_original ON staff_of_month
  (institution_id, coalesce(house_id, '00000000-0000-0000-0000-000000000000'::uuid), month)
  WHERE replaces_id IS NULL;
CREATE INDEX ix_som_house  ON staff_of_month (house_id, month DESC);
CREATE INDEX ix_som_person ON staff_of_month (person_id);
CREATE INDEX ix_som_autor  ON staff_of_month (chosen_by);
CREATE INDEX ix_som_inst   ON staff_of_month (institution_id, month DESC);

/* Quem chama escolhe o funcionário do mês desta casa (ou da Fundação, com nulo)? */
CREATE OR REPLACE FUNCTION app_escolhe_o_do_mes(p_house uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce((
    SELECT me.active AND me.role::text = 'coordenador'
       AND CASE WHEN p_house IS NULL THEN me.todas_as_casas
                ELSE NOT me.todas_as_casas
                     AND p_house IN (SELECT app_user_house_ids())
                     AND EXISTS (SELECT 1 FROM house h WHERE h.id = p_house
                                    AND h.institution_id = me.institution_id) END
      FROM app_user me WHERE me.id = app_current_user()), false)
$$;

/* Quem chama lê o funcionário do mês desta casa (ou da Fundação)? */
CREATE OR REPLACE FUNCTION app_le_o_do_mes(p_house uuid, p_inst uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce((
    SELECT me.active AND me.institution_id = p_inst
       AND (p_house IS NULL
            OR me.role::text = 'gestor_geral'
            OR me.todas_as_casas
            OR EXISTS (SELECT 1 FROM user_house_assignment a
                        WHERE a.user_id = me.id AND a.house_id = p_house
                          AND a.valid_from <= app_hoje()
                          AND (a.valid_to IS NULL OR a.valid_to >= app_hoje())))
      FROM app_user me WHERE me.id = app_current_user()), false)
$$;

/* Quem pode ser escolhido: a conta ativa da instituição, menos o Gestor Geral e quem
   escolhe; na casa, quem trabalha nela hoje. */
CREATE OR REPLACE FUNCTION app_pode_ser_o_do_mes(p_house uuid, p_pessoa uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce((
    SELECT s.active AND s.id <> me.id AND s.institution_id = me.institution_id
       AND s.role::text <> 'gestor_geral'
       AND (p_house IS NULL
            OR EXISTS (SELECT 1 FROM user_house_assignment a
                        WHERE a.user_id = s.id AND a.house_id = p_house
                          AND a.valid_from <= app_hoje()
                          AND (a.valid_to IS NULL OR a.valid_to >= app_hoje())))
      FROM app_user me, app_user s
     WHERE me.id = app_current_user() AND s.id = p_pessoa), false)
$$;

ALTER TABLE staff_of_month ENABLE ROW LEVEL SECURITY;
CREATE POLICY som_select ON staff_of_month FOR SELECT TO rede_app
  USING (app_le_o_do_mes(house_id, institution_id));
GRANT SELECT ON staff_of_month TO rede_app;
REVOKE INSERT, UPDATE, DELETE ON staff_of_month FROM rede_app;

/* Escolher (ou trocar, com o motivo) o funcionário do mês. */
CREATE OR REPLACE FUNCTION app_escolher_o_do_mes(
  p_house uuid, p_mes date, p_pessoa uuid, p_porque text, p_motivo_da_troca text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_mes   date := date_trunc('month', coalesce(p_mes, app_hoje()))::date;
  v_agora date := date_trunc('month', app_hoje())::date;
  v_inst  uuid;
  v_atual uuid;
  v_id    uuid;
BEGIN
  IF NOT app_escolhe_o_do_mes(p_house) THEN
    RAISE EXCEPTION 'do_mes_sem_alcance' USING ERRCODE = '42501';
  END IF;
  IF v_mes > v_agora OR v_mes < (v_agora - interval '1 month')::date THEN
    RAISE EXCEPTION 'do_mes_fora_do_mes' USING ERRCODE = '22023';
  END IF;
  IF NOT app_pode_ser_o_do_mes(p_house, p_pessoa) THEN
    RAISE EXCEPTION 'do_mes_pessoa_fora' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_porque, ''))) < 20 THEN
    RAISE EXCEPTION 'do_mes_sem_porque' USING ERRCODE = '22023';
  END IF;
  SELECT u.institution_id INTO v_inst FROM app_user u WHERE u.id = app_current_user();

  /* A escolha que vale hoje para a casa e o mês: a última da corrente de trocas. Trava a
     linha para duas trocas ao mesmo tempo não seguirem a mesma escolha. */
  SELECT s.id INTO v_atual FROM staff_of_month s
   WHERE s.institution_id = v_inst AND s.house_id IS NOT DISTINCT FROM p_house AND s.month = v_mes
     AND NOT EXISTS (SELECT 1 FROM staff_of_month t WHERE t.replaces_id = s.id)
   FOR UPDATE;

  IF v_atual IS NOT NULL AND length(btrim(coalesce(p_motivo_da_troca, ''))) < 10 THEN
    RAISE EXCEPTION 'do_mes_ja_escolhido' USING ERRCODE = '23505';
  END IF;

  INSERT INTO staff_of_month (institution_id, house_id, month, person_id, reason, chosen_by,
                              replaces_id, change_reason)
  VALUES (v_inst, p_house, v_mes, p_pessoa, btrim(p_porque), app_current_user(),
          v_atual, CASE WHEN v_atual IS NULL THEN NULL ELSE btrim(p_motivo_da_troca) END)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION app_escolhe_o_do_mes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_le_o_do_mes(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_pode_ser_o_do_mes(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_escolher_o_do_mes(uuid, date, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_escolhe_o_do_mes(uuid) TO rede_app;
GRANT EXECUTE ON FUNCTION app_le_o_do_mes(uuid, uuid) TO rede_app;
GRANT EXECUTE ON FUNCTION app_pode_ser_o_do_mes(uuid, uuid) TO rede_app;
GRANT EXECUTE ON FUNCTION app_escolher_o_do_mes(uuid, date, uuid, text, text) TO rede_app;

COMMENT ON TABLE staff_of_month IS
  'O funcionário do mês (fase 324): um por casa, escolhido pela coordenação da casa, e um da '
  'Fundação, escolhido pela Coordenação Geral, sempre com o porquê. Trocar é uma linha nova com o motivo.';
