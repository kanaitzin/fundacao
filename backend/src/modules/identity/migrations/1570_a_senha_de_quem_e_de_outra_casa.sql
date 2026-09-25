-- A SENHA DE QUEM É DE OUTRA CASA (fase 156).
--
-- O DEFEITO, medido em 25/09: a coordenação da Casa 04 redefiniu a senha de um
-- educador que trabalha SÓ na Casa 03 — e recebeu a senha nova na resposta.
-- Com ela, entra-se no sistema COMO aquele educador, e lê-se tudo o que ele lê
-- sobre as crianças da Casa 03. O convite de primeiro acesso tinha a mesma
-- falta: o link vai para o e-mail da própria pessoa, mas a senha dela é
-- embaralhada no ato — a coordenação de outra casa tirava do sistema, no meio
-- do plantão, quem não é da equipe dela.
--
-- A CAUSA: as duas funções conferiam o CARGO (a coordenação administra
-- educador) e esqueciam a CASA. As outras três funções da equipe — criar,
-- editar, desativar — conferem as duas desde a 0460; a lista da equipe
-- também. Só estas duas não.
--
-- A REGRA daqui: se a pessoa tem casa — a atual, ou a última —, pelo menos
-- UMA delas tem de estar no alcance de quem pede. Pessoa que nunca teve casa é
-- de cargo institucional, e continua dependendo só do cargo, como na 0460. A
-- regra vale nas CINCO funções da equipe e na lista: criar já conferia a casa
-- nova; editar e desativar conferiam só a casa ATUAL. E a linha de auditoria passa a levar a casa (fase 149): antes ela
-- nascia sem casa, e a coordenação não lia quem redefiniu a senha da equipe dela.
--
-- Por que não o `LIMIT 1` da 0460: quem trabalha em duas casas teria uma delas
-- escolhida ao acaso, e a recusa dependeria da ordem das linhas.

-- A CASA DE UMA CONTA, e se ela está no alcance de quem pergunta.
--
-- A casa ATUAL da pessoa; sem casa atual, a ÚLTIMA em que ela trabalhou. Sem
-- esta segunda metade, a 0460 tratava "sem vínculo atual" como cargo
-- institucional: o educador que saiu da Casa 03 passava a ser administrável por
-- QUALQUER coordenação — reativar, redefinir a senha e receber a senha nova. Foi
-- assim que a sondagem da fase 156 achou o defeito mesmo depois do conserto da
-- redefinição: a conta de teste tinha o vínculo encerrado.
--
-- `tem_casa` diz se a pessoa já teve casa; `casa` é uma das casas de referência
-- que está no alcance de quem pergunta, ou NULL se nenhuma está.
CREATE OR REPLACE FUNCTION app_casa_da_conta_no_alcance(p_user uuid)
RETURNS TABLE (tem_casa boolean, casa uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH atual AS (
    SELECT house_id FROM user_house_assignment WHERE user_id = p_user AND valid_to IS NULL
  ), referencia AS (
    SELECT house_id FROM atual
    UNION ALL
    SELECT house_id FROM (
      SELECT house_id FROM user_house_assignment
       WHERE user_id = p_user AND NOT EXISTS (SELECT 1 FROM atual)
       ORDER BY valid_to DESC LIMIT 1) ultima
  )
  SELECT EXISTS (SELECT 1 FROM referencia),
         (SELECT house_id FROM referencia WHERE app_house_in_scope(house_id)
           ORDER BY house_id LIMIT 1)
$$;
REVOKE ALL ON FUNCTION app_casa_da_conta_no_alcance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_casa_da_conta_no_alcance(uuid) TO rede_app;

CREATE OR REPLACE FUNCTION app_reset_staff_password(p_user uuid, p_password_hash text)
RETURNS TABLE (out_ok boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_me uuid; v_role role_code; v_alvo app_user%ROWTYPE; v_tem boolean; v_casa uuid;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_alvo FROM app_user WHERE id = p_user FOR UPDATE;
  IF v_alvo.id IS NULL THEN RAISE EXCEPTION 'usuario_inexistente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_role_grant
                 WHERE creator_role = v_role AND grantable_role = v_alvo.role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_editar:%', v_alvo.role::text;
  END IF;

  SELECT tem_casa, casa INTO v_tem, v_casa FROM app_casa_da_conta_no_alcance(p_user);
  IF v_tem AND v_casa IS NULL THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;

  UPDATE app_user SET password_hash = p_password_hash, must_change_password = true, updated_at = now()
   WHERE id = p_user;
  -- Trocar a senha derruba as sessões: se foi por suspeita, o acesso acaba já.
  UPDATE user_session SET revoked_at = now(), revoked_reason = 'senha_redefinida'
   WHERE user_id = p_user AND revoked_at IS NULL;

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id)
  VALUES (v_me, v_casa, 'staff.reset_password', 'app_user', p_user);
  RETURN QUERY SELECT true;
END $$;
REVOKE ALL ON FUNCTION app_reset_staff_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_reset_staff_password(uuid, text) TO rede_app;

CREATE OR REPLACE FUNCTION app_issue_invite(p_user uuid, p_token_hash text, p_hours integer,
                                            p_scramble_hash text)
RETURNS TABLE (out_id uuid, out_email text, out_nome text, out_expira timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_me uuid; v_role role_code; v_alvo app_user%ROWTYPE; v_id uuid; v_exp timestamptz;
        v_tem boolean; v_casa uuid;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_alvo FROM app_user WHERE id = p_user FOR UPDATE;
  IF v_alvo.id IS NULL THEN RAISE EXCEPTION 'usuario_inexistente'; END IF;
  IF NOT v_alvo.active THEN RAISE EXCEPTION 'usuario_inativo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_role_grant
                 WHERE creator_role = v_role AND grantable_role = v_alvo.role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_editar:%', v_alvo.role::text;
  END IF;

  SELECT tem_casa, casa INTO v_tem, v_casa FROM app_casa_da_conta_no_alcance(p_user);
  IF v_tem AND v_casa IS NULL THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;

  -- O convite anterior morre agora: dois convites válidos são duas portas.
  UPDATE user_invite SET revoked_at = now(), revoked_reason = 'substituido'
   WHERE user_id = p_user AND used_at IS NULL AND revoked_at IS NULL;

  -- A senha atual é embaralhada por um valor que ninguém conhece (0700): a
  -- partir daqui, a única porta é o link do convite, e as sessões caem junto.
  UPDATE app_user SET password_hash = p_scramble_hash, must_change_password = false,
         updated_at = now()
   WHERE id = p_user;
  UPDATE user_session SET revoked_at = now(), revoked_reason = 'convite_emitido'
   WHERE user_id = p_user AND revoked_at IS NULL;

  v_exp := now() + (p_hours || ' hours')::interval;
  INSERT INTO user_invite (user_id, token_hash, expires_at, created_by)
  VALUES (p_user, p_token_hash, v_exp, v_me) RETURNING id INTO v_id;

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id)
  VALUES (v_me, v_casa, 'auth.invite_issued', 'app_user', p_user);

  RETURN QUERY SELECT v_id, v_alvo.email, v_alvo.full_name, v_exp;
END $$;
REVOKE ALL ON FUNCTION app_issue_invite(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_issue_invite(uuid, text, integer, text) TO rede_app;

-- ---------- As outras funções da equipe, e a lista, pela mesma regra ----------

CREATE OR REPLACE FUNCTION app_update_staff(
  p_user uuid, p_full_name text, p_role role_code, p_house uuid
) RETURNS TABLE (out_ok boolean) AS $$
DECLARE v_me uuid; v_role role_code; v_alvo app_user%ROWTYPE; v_casa_atual uuid;
        v_tem boolean; v_casa_ref uuid;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_alvo FROM app_user WHERE id = p_user FOR UPDATE;
  IF v_alvo.id IS NULL THEN RAISE EXCEPTION 'usuario_inexistente'; END IF;

  -- Precisa poder criar o cargo que a pessoa TEM e o que ela vai passar a ter:
  -- senão a edição vira um caminho para promover alguém a um cargo que você
  -- não poderia ter criado.
  IF NOT EXISTS (SELECT 1 FROM staff_role_grant
                 WHERE creator_role = v_role AND grantable_role = v_alvo.role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_editar:%', v_alvo.role::text;
  END IF;
  IF p_role IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM staff_role_grant WHERE creator_role = v_role AND grantable_role = p_role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_criar:%', p_role::text;
  END IF;

  -- A casa da conta, pela casa ATUAL ou, sem ela, pela ÚLTIMA (1570).
  SELECT tem_casa, casa INTO v_tem, v_casa_ref FROM app_casa_da_conta_no_alcance(p_user);
  IF v_tem AND v_casa_ref IS NULL THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  SELECT house_id INTO v_casa_atual FROM user_house_assignment
   WHERE user_id = p_user AND valid_to IS NULL AND app_house_in_scope(house_id)
   ORDER BY house_id LIMIT 1;

  UPDATE app_user
     SET full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
         role = coalesce(p_role, role),
         updated_at = now()
   WHERE id = p_user;

  -- Troca de casa: o vínculo antigo é ENCERRADO, nunca apagado (§5.1).
  IF p_house IS NOT NULL AND p_house IS DISTINCT FROM v_casa_atual THEN
    IF NOT app_house_in_scope(p_house) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
    UPDATE user_house_assignment SET valid_to = now()
     WHERE user_id = p_user AND valid_to IS NULL;
    INSERT INTO user_house_assignment (user_id, house_id, role, created_by)
    VALUES (p_user, p_house, coalesce(p_role, v_alvo.role), v_me);
  END IF;

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id, detail)
  VALUES (v_me, coalesce(p_house, v_casa_atual, v_casa_ref), 'staff.update', 'app_user', p_user,
          jsonb_build_object('cargo_anterior', v_alvo.role::text,
                             'cargo_novo', coalesce(p_role, v_alvo.role)::text,
                             'mudou_de_casa', p_house IS DISTINCT FROM v_casa_atual));

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_update_staff(uuid, text, role_code, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_update_staff(uuid, text, role_code, uuid) TO rede_app;

CREATE OR REPLACE FUNCTION app_set_staff_active(p_user uuid, p_active boolean, p_reason text)
RETURNS TABLE (out_ok boolean) AS $$
DECLARE v_me uuid; v_role role_code; v_alvo app_user%ROWTYPE; v_casa uuid; v_tem boolean;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  IF p_user = v_me THEN RAISE EXCEPTION 'nao_desativa_a_si_mesmo'; END IF;

  SELECT * INTO v_alvo FROM app_user WHERE id = p_user FOR UPDATE;
  IF v_alvo.id IS NULL THEN RAISE EXCEPTION 'usuario_inexistente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_role_grant
                 WHERE creator_role = v_role AND grantable_role = v_alvo.role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_editar:%', v_alvo.role::text;
  END IF;
  IF NOT p_active AND coalesce(length(btrim(p_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'motivo_insuficiente';
  END IF;

  -- A casa da conta, pela casa ATUAL ou, sem ela, pela ÚLTIMA (1570).
  SELECT tem_casa, casa INTO v_tem, v_casa FROM app_casa_da_conta_no_alcance(p_user);
  IF v_tem AND v_casa IS NULL THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;

  UPDATE app_user
     SET active = p_active,
         deactivated_at = CASE WHEN p_active THEN NULL ELSE now() END,
         deactivated_by = CASE WHEN p_active THEN NULL ELSE v_me END,
         updated_at = now()
   WHERE id = p_user;

  -- Desativar encerra as sessões abertas: o acesso acaba agora, não no logout.
  IF NOT p_active THEN
    UPDATE user_session SET revoked_at = now(), revoked_reason = 'usuario_desativado'
     WHERE user_id = p_user AND revoked_at IS NULL;
  END IF;

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id, purpose)
  VALUES (v_me, v_casa, CASE WHEN p_active THEN 'staff.reactivate' ELSE 'staff.deactivate' END,
          'app_user', p_user, nullif(btrim(coalesce(p_reason, '')), ''));

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_set_staff_active(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_set_staff_active(uuid, boolean, text) TO rede_app;

-- A versão vigente é a da 0990 (com a cor da linha); só a condição muda.
CREATE OR REPLACE FUNCTION app_staff_list()
RETURNS TABLE (id uuid, full_name text, email text, role text, active boolean,
               house_code text, house_id uuid, last_login timestamptz,
               must_change_password boolean, editavel boolean, line_color text) AS $$
  SELECT u.id, u.full_name, u.email, u.role::text, u.active,
         app_house_label(a.house_id), a.house_id,
         (SELECT max(s.created_at) FROM user_session s WHERE s.user_id = u.id),
         u.must_change_password,
         EXISTS (SELECT 1 FROM staff_role_grant g
                 WHERE g.creator_role = app_current_role() AND g.grantable_role = u.role),
         u.line_color
  FROM app_user u
  JOIN app_user eu ON eu.id = app_current_user()
  LEFT JOIN user_house_assignment a ON a.user_id = u.id AND a.valid_to IS NULL
  CROSS JOIN LATERAL app_casa_da_conta_no_alcance(u.id) h
  WHERE u.institution_id = eu.institution_id
    AND app_current_role() IN ('coordenador','gestor_geral','equipe_tecnica')
    AND (
      (a.house_id IS NOT NULL AND app_house_in_scope(a.house_id))
      -- Sem casa ATUAL: se já teve casa, aparece para quem alcança a ÚLTIMA
      -- (1570); se nunca teve, é cargo institucional e vale o cargo.
      OR (a.house_id IS NULL AND (
            (h.tem_casa AND h.casa IS NOT NULL)
            OR (NOT h.tem_casa AND EXISTS (
                  SELECT 1 FROM staff_role_grant g
                   WHERE g.creator_role = app_current_role() AND g.grantable_role = u.role))))
    )
  ORDER BY u.full_name
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_staff_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_staff_list() TO rede_app;
