-- ESQUECI MINHA SENHA (fase 188, decidido em 05/10: o link vai para o e-mail
-- cadastrado, vale uma hora e serve uma vez).
--
-- O mesmo caminho do convite de primeiro acesso (0700): um link de uso único
-- que leva à tela de criar a senha, e as travas (uso único, prazo) no banco.
-- O que muda é quem pede: aqui é a própria pessoa, sem entrar, só com o
-- e-mail. Por isso três cuidados que o convite não precisava:
--
--   * a resposta é a mesma para e-mail cadastrado ou não: a tela de entrada
--     não conta quem trabalha na Fundação;
--   * pedir NÃO troca a senha atual. Quem pediu pode não ser a pessoa, e a
--     senha que ela usa continua valendo até ela abrir o link;
--   * um pedido a cada dois minutos por conta, e o pedido novo anula o anterior:
--     sem isso, a tela viraria um jeito de encher a caixa de alguém.

ALTER TABLE user_invite ADD COLUMN motivo text NOT NULL DEFAULT 'convite'
  CHECK (motivo IN ('convite', 'esqueci'));

CREATE OR REPLACE FUNCTION auth_pedir_nova_senha(p_email text, p_hash text, p_minutos int)
RETURNS TABLE (out_nome text, out_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_u app_user%ROWTYPE;
BEGIN
  SELECT * INTO v_u FROM app_user WHERE lower(email) = lower(btrim(coalesce(p_email, ''))) AND active;
  IF v_u.id IS NULL THEN RETURN; END IF;
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

-- A tela do link precisa saber se é primeiro acesso ou senha nova, para dizer
-- a coisa certa. A assinatura muda, e por isso a função é recriada.
DROP FUNCTION app_check_invite(text);
CREATE FUNCTION app_check_invite(p_token_hash text)
RETURNS TABLE (out_valido boolean, out_nome text, out_email text, out_motivo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT true, u.full_name, u.email, i.motivo
    FROM user_invite i JOIN app_user u ON u.id = i.user_id
   WHERE i.token_hash = p_token_hash
     AND i.used_at IS NULL AND i.revoked_at IS NULL
     AND i.expires_at > now() AND u.active
$$;
REVOKE ALL ON FUNCTION app_check_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_check_invite(text) TO rede_app;

-- Gastar o link: o mesmo ato do convite, com a auditoria dizendo qual dos dois foi.
CREATE OR REPLACE FUNCTION app_consume_invite(p_token_hash text, p_password_hash text, p_ip text)
RETURNS TABLE (out_user uuid, out_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_inv user_invite%ROWTYPE; v_u app_user%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM user_invite WHERE token_hash = p_token_hash FOR UPDATE;
  IF v_inv.id IS NULL OR v_inv.used_at IS NOT NULL
     OR v_inv.revoked_at IS NOT NULL OR v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'convite_invalido';
  END IF;
  SELECT * INTO v_u FROM app_user WHERE id = v_inv.user_id FOR UPDATE;
  IF v_u.id IS NULL OR NOT v_u.active THEN RAISE EXCEPTION 'convite_invalido'; END IF;

  UPDATE user_invite SET used_at = now(), used_ip = p_ip WHERE id = v_inv.id;
  UPDATE app_user SET password_hash = p_password_hash, must_change_password = false, updated_at = now()
   WHERE id = v_u.id;
  -- Sessão antiga não sobrevive à senha nova: se alguém entrava com a antiga, para aqui.
  UPDATE user_session
     SET revoked_at = now(),
         revoked_reason = CASE WHEN v_inv.motivo = 'esqueci' THEN 'senha_recriada' ELSE 'primeiro_acesso' END
   WHERE user_id = v_u.id AND revoked_at IS NULL;

  INSERT INTO audit_event (actor_id, action, entity, entity_id)
  VALUES (v_u.id, CASE WHEN v_inv.motivo = 'esqueci' THEN 'auth.password_reset' ELSE 'auth.first_access' END,
          'app_user', v_u.id);
  RETURN QUERY SELECT v_u.id, v_u.email;
END $$;
