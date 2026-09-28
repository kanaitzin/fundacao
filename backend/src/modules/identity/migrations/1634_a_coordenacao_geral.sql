-- A COORDENAÇÃO GERAL (fase 176, decisão de 28/09).
--
-- O cargo novo do Marcelo: coordenar as oito casas. A Fundação decidiu que ele
-- faz tudo o que a coordenação de uma casa faz, nas oito, e que o Gestor Geral
-- continua olhando, com o painel e os relatórios.
--
-- Não é um código de cargo novo, e isso é decisão de engenharia medida: a
-- palavra coordenador decide permissão em 78 funções e 61 políticas do banco,
-- em 76 conferências do servidor e em 44 da tela. Um cargo novo exigiria
-- acrescentá-lo em todas, e a lição da fase 145 é que uma cópia fica para
-- trás. A Coordenação Geral é o cargo coordenador com a marca todas_as_casas,
-- e quem responde de quais casas a pessoa é continua sendo uma função só,
-- app_user_house_ids, lida por app_house_in_scope e app_casas_no_alcance.
--
-- A marca só vale para coordenador, e só o Gestor Geral a põe ou tira. Quem é
-- marcado deixa de ter vínculo com uma casa: ele não entra na escala, na
-- passagem nem nos avisos de escalonamento de nenhuma, porque não é da equipe
-- de nenhuma, e nas oito seria uma enxurrada.

ALTER TABLE app_user ADD COLUMN todas_as_casas boolean NOT NULL DEFAULT false;
ALTER TABLE app_user ADD CONSTRAINT app_user_todas_as_casas_so_coordenador
  CHECK (NOT todas_as_casas OR role = 'coordenador');

CREATE OR REPLACE FUNCTION app_user_house_ids() RETURNS SETOF uuid AS $$
  SELECT h.id FROM house h
    JOIN app_user u ON u.id = app_current_user()
   WHERE u.todas_as_casas AND u.active AND h.institution_id = u.institution_id
  UNION
  SELECT house_id FROM user_house_assignment
   WHERE user_id = app_current_user() AND valid_to IS NULL
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION app_marcar_coordenacao_geral(p_user uuid, p_todas boolean)
RETURNS TABLE (out_nome text, out_todas boolean) AS $$
DECLARE v_alvo app_user%ROWTYPE; v_inst uuid;
BEGIN
  IF app_current_role() <> 'gestor_geral' THEN
    RAISE EXCEPTION 'so_o_gestor_marca_coordenacao_geral' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT institution_id INTO v_inst FROM app_user WHERE id = app_current_user();
  SELECT * INTO v_alvo FROM app_user WHERE id = p_user AND institution_id = v_inst;
  IF v_alvo.id IS NULL THEN
    RAISE EXCEPTION 'usuario_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_alvo.role <> 'coordenador' THEN
    RAISE EXCEPTION 'coordenacao_geral_so_para_coordenador' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE app_user SET todas_as_casas = coalesce(p_todas, false) WHERE id = p_user;
  /* Quem passa a coordenar as oito sai da equipe da casa em que estava. O
     vínculo antigo fecha com a data, e nada se apaga. */
  IF coalesce(p_todas, false) THEN
    UPDATE user_house_assignment SET valid_to = now()
     WHERE user_id = p_user AND valid_to IS NULL;
  END IF;
  RETURN QUERY SELECT v_alvo.full_name, coalesce(p_todas, false);
END $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_marcar_coordenacao_geral(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_marcar_coordenacao_geral(uuid, boolean) TO rede_app;

/* O CADASTRO JÁ COMO COORDENAÇÃO GERAL. O app_create_staff exige casa para o
   cargo coordenador, e com razão: a coordenação de uma casa sem casa não
   coordena nada. A Coordenação Geral não tem casa, e inventar uma para depois
   encerrar o vínculo deixaria no histórico uma passagem que não houve. Esta
   função é só do Gestor Geral e só cria esse cargo. */
CREATE OR REPLACE FUNCTION app_create_coordenacao_geral(p_email text, p_full_name text, p_password_hash text)
RETURNS TABLE (out_id uuid) AS $$
DECLARE v_me uuid; v_inst uuid; v_id uuid;
BEGIN
  v_me := app_current_user();
  IF app_current_role() <> 'gestor_geral' THEN
    RAISE EXCEPTION 'so_o_gestor_marca_coordenacao_geral' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT institution_id INTO v_inst FROM app_user WHERE id = v_me;
  IF coalesce(length(btrim(p_full_name)), 0) < 3 THEN RAISE EXCEPTION 'nome_insuficiente'; END IF;
  IF btrim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'email_invalido';
  END IF;

  INSERT INTO app_user (institution_id, email, full_name, password_hash, role,
                        must_change_password, todas_as_casas)
  VALUES (v_inst, lower(btrim(p_email)), btrim(p_full_name), p_password_hash,
          'coordenador', true, true)
  RETURNING id INTO v_id;

  INSERT INTO audit_event (institution_id, house_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_inst, NULL, v_me, 'staff.coordenacao_geral', 'app_user', v_id,
          jsonb_build_object('cargo', 'coordenador', 'todasAsCasas', true, 'cadastro', true));

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_create_coordenacao_geral(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_create_coordenacao_geral(text, text, text) TO rede_app;

/* A lista da equipe diz quem coordena as oito: sem isto a Coordenação Geral
   aparecia sem casa, como quem saiu. A coluna nova muda o tipo devolvido, e
   por isso a função é recriada, com o corpo da 1570 e a coluna a mais. */
DROP FUNCTION app_staff_list();
CREATE FUNCTION app_staff_list()
 RETURNS TABLE(id uuid, full_name text, email text, role text, active boolean, house_code text,
               house_id uuid, last_login timestamp with time zone, must_change_password boolean,
               editavel boolean, line_color text, todas_as_casas boolean)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT u.id, u.full_name, u.email, u.role::text, u.active,
         app_house_label(a.house_id), a.house_id,
         (SELECT max(s.created_at) FROM user_session s WHERE s.user_id = u.id),
         u.must_change_password,
         EXISTS (SELECT 1 FROM staff_role_grant g
                 WHERE g.creator_role = app_current_role() AND g.grantable_role = u.role),
         u.line_color, u.todas_as_casas
  FROM app_user u
  JOIN app_user eu ON eu.id = app_current_user()
  LEFT JOIN user_house_assignment a ON a.user_id = u.id AND a.valid_to IS NULL
  CROSS JOIN LATERAL app_casa_da_conta_no_alcance(u.id) h
  WHERE u.institution_id = eu.institution_id
    AND app_current_role() IN ('coordenador','gestor_geral','equipe_tecnica')
    AND (
      (a.house_id IS NOT NULL AND app_house_in_scope(a.house_id))
      OR (a.house_id IS NULL AND (
            (h.tem_casa AND h.casa IS NOT NULL)
            OR (NOT h.tem_casa AND EXISTS (
                  SELECT 1 FROM staff_role_grant g
                   WHERE g.creator_role = app_current_role() AND g.grantable_role = u.role))))
    )
  ORDER BY u.full_name
$function$;
REVOKE ALL ON FUNCTION app_staff_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_staff_list() TO rede_app;
