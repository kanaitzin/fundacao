-- O ENCONTRO DE ALINHAMENTO COM QUEM TRABALHA (fase 322, pedido e decisões do dono em 14/11).
--
-- Mensal, trimestral, semestral ou anual: a coordenação senta com quem trabalha na casa,
-- e a Coordenação Geral com quem está abaixo dela, e o encontro fica escrito, com os pontos
-- positivos, o que podemos melhorar e os combinados. A intenção é construtiva e de
-- alinhamento da casa, e por isso não há nota nem pontuação: o registro é texto.
--
-- Quem REGISTRA (decidido em 14/11): só a coordenação da casa, com quem trabalha na casa
-- dela (menos outra coordenação), e a Coordenação Geral, com todos abaixo dela (menos o
-- Gestor Geral e outra Coordenação Geral).
-- Quem LÊ: a própria pessoa, quem registrou, a coordenação da casa e a Coordenação Geral.
-- A coordenação da casa não lê o encontro de outra coordenação da mesma casa.
-- A pessoa dá CIÊNCIA e pode comentar, uma vez; quem registrou é avisado.
-- Quem registra marca a data do PRÓXIMO encontro e recebe o aviso no sino nesse dia.
--
-- O que foi escrito não se reescreve nem se apaga (§5.1): a correção é um adendo de quem
-- registrou, com a data. Ninguém escreve nestas tabelas direto: só pelas funções abaixo.

CREATE TABLE staff_alignment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institution(id),
  subject_id      uuid NOT NULL REFERENCES app_user(id),
  -- A casa da pessoa no dia do encontro. Nula para quem atende todas as casas (a
  -- Enfermagem, o Líder Noturno Geral), cujo encontro é da Coordenação Geral.
  house_id        uuid REFERENCES house(id),
  periodicity     text NOT NULL CHECK (periodicity IN ('mensal', 'trimestral', 'semestral', 'anual')),
  met_on          date NOT NULL,
  positives       text NOT NULL CHECK (length(btrim(positives)) BETWEEN 10 AND 4000),
  to_improve      text CHECK (to_improve IS NULL OR length(btrim(to_improve)) BETWEEN 1 AND 4000),
  agreements      text CHECK (agreements IS NULL OR length(btrim(agreements)) BETWEEN 1 AND 4000),
  next_on         date,
  -- Quando o relógio avisou quem registrou que o próximo encontro chegou (uma vez só).
  next_noticed_at timestamptz,
  written_by      uuid NOT NULL REFERENCES app_user(id),
  written_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (next_on IS NULL OR next_on > met_on),
  CHECK (subject_id <> written_by)
);
CREATE INDEX ix_salign_subject ON staff_alignment (subject_id, met_on DESC);
CREATE INDEX ix_salign_house   ON staff_alignment (house_id);
CREATE INDEX ix_salign_autor   ON staff_alignment (written_by);
CREATE INDEX ix_salign_inst    ON staff_alignment (institution_id);
CREATE INDEX ix_salign_proximo ON staff_alignment (next_on) WHERE next_noticed_at IS NULL;

-- A ciência da pessoa, com o comentário dela (opcional). Uma por encontro.
CREATE TABLE staff_alignment_reply (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alignment_id uuid NOT NULL UNIQUE REFERENCES staff_alignment(id),
  note         text CHECK (note IS NULL OR length(btrim(note)) BETWEEN 1 AND 4000),
  written_by   uuid NOT NULL REFERENCES app_user(id),
  written_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_salign_reply_autor ON staff_alignment_reply (written_by);

-- O adendo de quem registrou: a correção que não apaga o que estava escrito.
CREATE TABLE staff_alignment_addendum (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alignment_id uuid NOT NULL REFERENCES staff_alignment(id),
  note         text NOT NULL CHECK (length(btrim(note)) BETWEEN 10 AND 4000),
  written_by   uuid NOT NULL REFERENCES app_user(id),
  written_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_salign_add_alinhamento ON staff_alignment_addendum (alignment_id);
CREATE INDEX ix_salign_add_autor       ON staff_alignment_addendum (written_by);

/* Quem chama registra um encontro com esta pessoa? A pergunta mora num lugar só: o
   registro, a tela (pela rota) e a lista da Equipe leem esta. */
CREATE OR REPLACE FUNCTION app_alinha_com(p_subject uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce((
    SELECT CASE
      WHEN me.id = s.id OR NOT s.active OR me.institution_id <> s.institution_id THEN false
      -- A Coordenação Geral: todos abaixo dela.
      WHEN me.role = 'coordenador' AND me.todas_as_casas THEN
           s.role <> 'gestor_geral' AND NOT (s.role = 'coordenador' AND s.todas_as_casas)
      -- A coordenação da casa: quem trabalha na casa dela, menos outra coordenação.
      WHEN me.role = 'coordenador' THEN
           s.role <> 'coordenador' AND NOT s.todas_as_casas
           AND EXISTS (SELECT 1 FROM user_house_assignment a
                        WHERE a.user_id = s.id AND a.valid_to IS NULL
                          AND a.house_id IN (SELECT app_user_house_ids()))
      ELSE false END
      FROM app_user me, app_user s
     WHERE me.id = app_current_user() AND me.active AND s.id = p_subject), false)
$$;

/* Quem chama lê este encontro? A pessoa, quem registrou, a coordenação da casa (menos o
   encontro de outra coordenação) e a Coordenação Geral da instituição. */
CREATE OR REPLACE FUNCTION app_le_o_alinhamento(p_subject uuid, p_house uuid, p_autor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(
    p_subject = app_current_user() OR p_autor = app_current_user()
    OR EXISTS (
      SELECT 1 FROM app_user me, app_user s
       WHERE me.id = app_current_user() AND me.active AND me.role = 'coordenador'
         AND s.id = p_subject AND s.institution_id = me.institution_id
         AND (me.todas_as_casas
              OR (p_house IS NOT NULL AND p_house IN (SELECT app_user_house_ids())
                  AND s.role <> 'coordenador'))),
    false)
$$;

ALTER TABLE staff_alignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY salign_select ON staff_alignment FOR SELECT TO rede_app
  USING (app_le_o_alinhamento(subject_id, house_id, written_by));

ALTER TABLE staff_alignment_reply ENABLE ROW LEVEL SECURITY;
CREATE POLICY salign_reply_select ON staff_alignment_reply FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM staff_alignment a WHERE a.id = alignment_id));

ALTER TABLE staff_alignment_addendum ENABLE ROW LEVEL SECURITY;
CREATE POLICY salign_add_select ON staff_alignment_addendum FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM staff_alignment a WHERE a.id = alignment_id));

GRANT SELECT ON staff_alignment, staff_alignment_reply, staff_alignment_addendum TO rede_app;
REVOKE INSERT, UPDATE, DELETE ON staff_alignment, staff_alignment_reply, staff_alignment_addendum
  FROM rede_app;

/* Registrar o encontro. A casa é a da pessoa no dia: para a coordenação da casa, a casa
   dela em que a pessoa trabalha; para a Coordenação Geral, a casa atual da pessoa, ou
   nenhuma para quem atende todas as casas. */
CREATE OR REPLACE FUNCTION app_registrar_alinhamento(
  p_subject uuid, p_periodicidade text, p_dia date, p_positivos text,
  p_melhorar text, p_combinados text, p_proximo date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_dia   date := coalesce(p_dia, app_hoje());
  v_house uuid;
  v_inst  uuid;
  v_id    uuid;
BEGIN
  IF NOT coalesce(app_alinha_com(p_subject), false) THEN
    RAISE EXCEPTION 'alinhamento_sem_alcance' USING ERRCODE = '42501';
  END IF;
  IF p_periodicidade IS NULL OR p_periodicidade NOT IN ('mensal', 'trimestral', 'semestral', 'anual') THEN
    RAISE EXCEPTION 'alinhamento_sem_periodicidade' USING ERRCODE = '22023';
  END IF;
  IF v_dia > app_hoje() THEN
    RAISE EXCEPTION 'alinhamento_no_futuro' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_positivos, ''))) < 10 THEN
    RAISE EXCEPTION 'alinhamento_sem_positivos' USING ERRCODE = '22023';
  END IF;
  IF p_proximo IS NOT NULL AND p_proximo <= v_dia THEN
    RAISE EXCEPTION 'alinhamento_proximo_antes' USING ERRCODE = '22023';
  END IF;

  SELECT u.institution_id INTO v_inst FROM app_user u WHERE u.id = p_subject;
  SELECT a.house_id INTO v_house
    FROM user_house_assignment a
   WHERE a.user_id = p_subject AND a.valid_to IS NULL
   ORDER BY (a.house_id IN (SELECT app_user_house_ids())) DESC, a.valid_from
   LIMIT 1;

  INSERT INTO staff_alignment (institution_id, subject_id, house_id, periodicity, met_on,
                               positives, to_improve, agreements, next_on, written_by)
  VALUES (v_inst, p_subject, v_house, p_periodicidade, v_dia, btrim(p_positivos),
          nullif(btrim(coalesce(p_melhorar, '')), ''), nullif(btrim(coalesce(p_combinados, '')), ''),
          p_proximo, app_current_user())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

/* A ciência da pessoa, com o comentário dela. Só a própria pessoa, e uma vez. */
CREATE OR REPLACE FUNCTION app_responder_alinhamento(p_id uuid, p_nota text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_subject uuid;
  v_id      uuid;
BEGIN
  SELECT a.subject_id INTO v_subject FROM staff_alignment a WHERE a.id = p_id;
  IF v_subject IS NULL OR v_subject IS DISTINCT FROM app_current_user() THEN
    RAISE EXCEPTION 'alinhamento_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM staff_alignment_reply r WHERE r.alignment_id = p_id) THEN
    RAISE EXCEPTION 'alinhamento_ja_respondido' USING ERRCODE = '23505';
  END IF;
  INSERT INTO staff_alignment_reply (alignment_id, note, written_by)
  VALUES (p_id, nullif(btrim(coalesce(p_nota, '')), ''), app_current_user())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

/* O adendo: só quem registrou, com pelo menos 10 letras. */
CREATE OR REPLACE FUNCTION app_adendo_do_alinhamento(p_id uuid, p_nota text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_autor uuid;
  v_id    uuid;
BEGIN
  SELECT a.written_by INTO v_autor FROM staff_alignment a WHERE a.id = p_id;
  IF v_autor IS NULL OR v_autor IS DISTINCT FROM app_current_user() THEN
    RAISE EXCEPTION 'alinhamento_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF length(btrim(coalesce(p_nota, ''))) < 10 THEN
    RAISE EXCEPTION 'alinhamento_adendo_curto' USING ERRCODE = '22023';
  END IF;
  INSERT INTO staff_alignment_addendum (alignment_id, note, written_by)
  VALUES (p_id, btrim(p_nota), app_current_user())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

/* O relógio do dia: os encontros cujo próximo encontro chegou, para avisar quem
   registrou, uma vez só. Com a casa, os encontros da casa; sem a casa, os de quem atende
   todas as casas, e aí só quem também alcança todas pergunta. Devolve o mínimo para o
   aviso: o encontro, quem registrou, o nome da pessoa e a casa. */
CREATE OR REPLACE FUNCTION app_alinhamentos_que_chegam(p_house uuid)
RETURNS TABLE(out_id uuid, out_autor uuid, out_nome text, out_house uuid, out_proximo date)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_inst uuid;
BEGIN
  SELECT u.institution_id INTO v_inst FROM app_user u
   WHERE u.id = app_current_user() AND u.active
     AND (u.todas_as_casas OR u.role IN ('enfermagem', 'lider_noturno_geral', 'gestor_geral'));
  IF p_house IS NOT NULL THEN
    IF NOT coalesce(app_house_in_scope(p_house), false) THEN
      RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_inst IS NULL THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH chegaram AS (
    UPDATE staff_alignment a SET next_noticed_at = now()
     WHERE a.next_noticed_at IS NULL AND a.next_on <= app_hoje()
       AND (CASE WHEN p_house IS NULL THEN a.house_id IS NULL AND a.institution_id = v_inst
                 ELSE a.house_id = p_house END)
     RETURNING a.id, a.written_by, a.subject_id, a.house_id, a.next_on
  )
  SELECT c.id, c.written_by, u.full_name, c.house_id, c.next_on
    FROM chegaram c JOIN app_user u ON u.id = c.subject_id
   WHERE EXISTS (SELECT 1 FROM app_user w WHERE w.id = c.written_by AND w.active)
   ORDER BY c.next_on;
END $$;

REVOKE ALL ON FUNCTION app_alinha_com(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_le_o_alinhamento(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_registrar_alinhamento(uuid, text, date, text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_responder_alinhamento(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_adendo_do_alinhamento(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_alinhamentos_que_chegam(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_alinha_com(uuid) TO rede_app;
GRANT EXECUTE ON FUNCTION app_le_o_alinhamento(uuid, uuid, uuid) TO rede_app;
GRANT EXECUTE ON FUNCTION app_registrar_alinhamento(uuid, text, date, text, text, text, date) TO rede_app;
GRANT EXECUTE ON FUNCTION app_responder_alinhamento(uuid, text) TO rede_app;
GRANT EXECUTE ON FUNCTION app_adendo_do_alinhamento(uuid, text) TO rede_app;
GRANT EXECUTE ON FUNCTION app_alinhamentos_que_chegam(uuid) TO rede_app;

COMMENT ON TABLE staff_alignment IS
  'O encontro de alinhamento com quem trabalha (fase 322): mensal, trimestral, semestral ou '
  'anual, com pontos positivos, o que melhorar e combinados. Sem nota nem pontuação.';
COMMENT ON TABLE staff_alignment_reply IS
  'A ciência da pessoa ao encontro de alinhamento, com o comentário dela (fase 322).';
COMMENT ON TABLE staff_alignment_addendum IS
  'O adendo de quem registrou o encontro de alinhamento: a correção que não apaga (fase 322).';
