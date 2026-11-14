-- O ENCONTRO DE ALINHAMENTO DE QUEM SAIU (fase 322, achado na conferência de 14/11).
--
-- Provado como o papel da aplicação, contra a 1721:
--
--   1. a conta DESATIVADA continuava lendo os encontros em que é a pessoa ou quem
--      registrou, e conseguia dar ciência e escrever adendo. É a mesma classe que a
--      1717 e a 1718 fecharam no resto do banco: conta desativada não faz nada.
--   2. quando quem registrou foi desativado, o relógio marcava o próximo encontro como
--      avisado sem avisar ninguém, e o aviso se perdia. Agora ele fica pendente, e chega
--      se a conta voltar. Quem recebe no lugar de quem saiu é pergunta para a Fundação.
--
-- Fica anotado, sem mudar aqui: qualquer conta da casa pode chamar a função do relógio
-- e consumir o aviso do dia, como nas outras rotinas do relógio (o PIA, a receita, a
-- reavaliação). É uma regra do relógio inteiro, e não deste módulo.

CREATE OR REPLACE FUNCTION app_le_o_alinhamento(p_subject uuid, p_house uuid, p_autor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(
    EXISTS (SELECT 1 FROM app_user me WHERE me.id = app_current_user() AND me.active)
    AND (
      p_subject = app_current_user() OR p_autor = app_current_user()
      OR EXISTS (
        SELECT 1 FROM app_user me, app_user s
         WHERE me.id = app_current_user() AND me.active AND me.role = 'coordenador'
           AND s.id = p_subject AND s.institution_id = me.institution_id
           AND (me.todas_as_casas
                OR (p_house IS NOT NULL AND p_house IN (SELECT app_user_house_ids())
                    AND s.role <> 'coordenador')))),
    false)
$$;

/* Quem chama está ativo? As duas escritas da pessoa e de quem registrou perguntam aqui. */
CREATE OR REPLACE FUNCTION app_quem_chama_esta_ativo()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM app_user u WHERE u.id = app_current_user() AND u.active)
$$;
REVOKE ALL ON FUNCTION app_quem_chama_esta_ativo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_quem_chama_esta_ativo() TO rede_app;

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
  IF v_subject IS NULL OR v_subject IS DISTINCT FROM app_current_user()
     OR NOT app_quem_chama_esta_ativo() THEN
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
  IF v_autor IS NULL OR v_autor IS DISTINCT FROM app_current_user()
     OR NOT app_quem_chama_esta_ativo() THEN
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

/* O aviso do próximo encontro só se marca quando há quem receba: quem registrou,
   ativo. O de quem saiu fica pendente. */
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
       AND EXISTS (SELECT 1 FROM app_user w WHERE w.id = a.written_by AND w.active)
     RETURNING a.id, a.written_by, a.subject_id, a.house_id, a.next_on
  )
  SELECT c.id, c.written_by, u.full_name, c.house_id, c.next_on
    FROM chegaram c JOIN app_user u ON u.id = c.subject_id
   ORDER BY c.next_on;
END $$;
