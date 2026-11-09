-- CONFIRMAR O E-MAIL SÓ NA CONTA A CONFIRMAR, E POR QUEM ADMINISTRA O CARGO (fase 292,
-- conserto do que as revisões do banco e de segurança acharam na 1685).
--
-- A `app_confirmar_email` da 1685 perguntava só se quem confirma alcança toda a
-- instituição. Provado em 09/11, em BEGIN e ROLLBACK, como o papel da aplicação: a
-- Coordenação Geral trocava o e-mail do Gestor Geral para uma caixa dela, pedia o esqueci
-- minha senha, e o link chegava a ela. A função virou um trocar o e-mail de qualquer conta.
-- Agora ela só confirma conta ATIVA que está A CONFIRMAR, e só quem administra aquele
-- cargo (`staff_role_grant`, a mesma pergunta da redefinição de senha): a Coordenação Geral
-- confirma a Enfermagem; a Coordenação Geral e o Líder Noturno Geral, só o Gestor Geral.
--
-- E o resto das revisões: as contas promovidas antes da 1685 ficam a confirmar (o banco
-- não distingue a promovida da cadastrada assim; conta de todas as casas que já teve casa
-- foi promovida); o esqueci lê a conta travada e anota uma vez por janela; e a conta sem
-- casa atual devolvida à mesma casa não conta como troca.

CREATE OR REPLACE FUNCTION app_confirmar_email(p_user uuid, p_email text)
RETURNS TABLE (out_nome text, out_trocou boolean) AS $$
DECLARE v_alvo app_user%ROWTYPE; v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  SELECT * INTO v_alvo FROM app_user WHERE id = p_user FOR UPDATE;
  IF v_alvo.id IS NULL OR NOT v_alvo.active OR NOT v_alvo.email_a_confirmar
     OR NOT app_alcanca_a_instituicao_de(p_user) THEN
    RAISE EXCEPTION 'usuario_inexistente';
  END IF;
  IF p_user = app_current_user() THEN RAISE EXCEPTION 'nao_administra_a_si_mesmo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_role_grant
                  WHERE creator_role = app_current_role() AND grantable_role = v_alvo.role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_editar:%', v_alvo.role::text;
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'email_invalido'; END IF;
  IF EXISTS (SELECT 1 FROM app_user WHERE lower(email) = v_email AND id <> p_user) THEN
    RAISE EXCEPTION 'email_em_uso';
  END IF;

  UPDATE app_user SET email = v_email, email_a_confirmar = false, updated_at = now()
   WHERE id = p_user;
  IF v_email IS DISTINCT FROM lower(v_alvo.email) THEN
    UPDATE user_invite SET revoked_at = now(), revoked_reason = 'email_trocado'
     WHERE user_id = p_user AND used_at IS NULL AND revoked_at IS NULL;
  END IF;

  INSERT INTO audit_event (actor_id, action, entity, entity_id, detail)
  VALUES (app_current_user(), 'staff.email_confirmado', 'app_user', p_user,
          jsonb_build_object('trocou', v_email IS DISTINCT FROM lower(v_alvo.email)));
  RETURN QUERY SELECT v_alvo.full_name, v_email IS DISTINCT FROM lower(v_alvo.email);
END $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_confirmar_email(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_confirmar_email(uuid, text) TO rede_app;

-- As contas promovidas antes da 1685 (sem identidade, o gatilho da conta não interfere).
UPDATE app_user SET email_a_confirmar = true
 WHERE app_cargo_de_toda_a_instituicao(role, todas_as_casas) AND role <> 'gestor_geral'
   AND NOT email_a_confirmar
   AND EXISTS (SELECT 1 FROM user_house_assignment a WHERE a.user_id = app_user.id);

-- O esqueci minha senha (1685), lendo a conta travada (a promoção que corre junto termina antes)
-- e anotando o pedido para e-mail a confirmar uma vez por janela de dois minutos (1686). A resposta da
-- tela continua a mesma: dizer que não mandou contaria que a conta existe.
CREATE OR REPLACE FUNCTION auth_pedir_nova_senha(p_email text, p_hash text, p_minutos int)
RETURNS TABLE (out_nome text, out_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_u app_user%ROWTYPE;
BEGIN
  SELECT * INTO v_u FROM app_user WHERE lower(email) = lower(btrim(coalesce(p_email, ''))) AND active FOR SHARE;
  IF v_u.id IS NULL THEN RETURN; END IF;
  IF v_u.email_a_confirmar THEN
    IF NOT EXISTS (SELECT 1 FROM audit_event
                    WHERE entity_id = v_u.id AND action = 'auth.reset_email_a_confirmar'
                      AND at > now() - interval '2 minutes') THEN
      INSERT INTO audit_event (actor_id, action, entity, entity_id)
      VALUES (v_u.id, 'auth.reset_email_a_confirmar', 'app_user', v_u.id);
    END IF;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM user_invite
              WHERE user_id = v_u.id AND motivo = 'esqueci' AND created_at > now() - interval '2 minutes') THEN
    RETURN;
  END IF;
  UPDATE user_invite SET revoked_at = now(), revoked_reason = 'pedido novo'
   WHERE user_id = v_u.id AND motivo = 'esqueci' AND used_at IS NULL AND revoked_at IS NULL;
  INSERT INTO user_invite (user_id, token_hash, expires_at, created_by, motivo)
  VALUES (v_u.id, p_hash, now() + make_interval(mins => p_minutos), v_u.id, 'esqueci');
  INSERT INTO audit_event (actor_id, action, entity, entity_id)
  VALUES (v_u.id, 'auth.reset_requested', 'app_user', v_u.id);
  RETURN QUERY SELECT v_u.full_name, v_u.email;
END $$;
REVOKE ALL ON FUNCTION auth_pedir_nova_senha(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_pedir_nova_senha(text, text, int) TO rede_app;

-- A edição da Equipe (1685), com a volta para a mesma casa sem contar como troca (1686).
CREATE OR REPLACE FUNCTION app_update_staff(
  p_user uuid, p_full_name text, p_role role_code, p_house uuid
) RETURNS TABLE (out_ok boolean) AS $$
DECLARE v_me uuid; v_role role_code; v_alvo app_user%ROWTYPE; v_casa_atual uuid; v_casa_nova uuid;
        v_tem boolean; v_casa_ref uuid; v_mudou_de_casa boolean := false;
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

  -- Troca de casa: o vínculo antigo é ENCERRADO, nunca apagado (§5.1). Quem passa a
  -- atender todas as casas não ganha casa de trabalho, como no cadastro (1684); o
  -- vínculo de antes já foi encerrado pelo gatilho da 1683, no UPDATE acima.
  IF NOT app_cargo_de_toda_a_instituicao(coalesce(p_role, v_alvo.role), v_alvo.todas_as_casas) THEN
    v_casa_nova := p_house;
  END IF;
  IF v_casa_nova IS NOT NULL AND v_casa_nova IS DISTINCT FROM v_casa_atual THEN
    IF NOT app_house_in_scope(p_house) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
    UPDATE user_house_assignment SET valid_to = now()
     WHERE user_id = p_user AND valid_to IS NULL;
    INSERT INTO user_house_assignment (user_id, house_id, role, created_by)
    VALUES (p_user, p_house, coalesce(p_role, v_alvo.role), v_me);
    -- A senha que a casa de antes sabia não vale na casa nova (1685). Conta que nunca
    -- teve casa (a primeira casa dela) não leva senha de casa nenhuma.
    v_mudou_de_casa := coalesce(v_casa_atual, v_casa_ref) IS NOT NULL
                   AND coalesce(v_casa_atual, v_casa_ref) IS DISTINCT FROM v_casa_nova;
    IF v_mudou_de_casa THEN
      PERFORM app_encerrar_o_acesso_de_antes(p_user, 'troca_de_casa');
    END IF;
  END IF;

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id, detail)
  VALUES (v_me, coalesce(v_casa_nova, v_casa_atual, v_casa_ref), 'staff.update', 'app_user', p_user,
          jsonb_build_object('cargo_anterior', v_alvo.role::text,
                             'cargo_novo', coalesce(p_role, v_alvo.role)::text,
                             'mudou_de_casa', v_mudou_de_casa,
                             'saiu_da_casa', v_casa_atual IS NOT NULL
                               AND app_cargo_de_toda_a_instituicao(coalesce(p_role, v_alvo.role), v_alvo.todas_as_casas)));

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_update_staff(uuid, text, role_code, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_update_staff(uuid, text, role_code, uuid) TO rede_app;

