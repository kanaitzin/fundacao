-- ---------------------------------------------------------------------------
-- PRIMEIRO ACESSO POR CONVITE (§8.2, pendência da entrada em dois passos).
--
-- A entrada em dois passos existe para não distribuir senha inicial a 40
-- pessoas — senha distribuída vira mensagem em grupo, circula, some no
-- histórico e nunca é trocada. Mas, do jeito que estava, faltava a outra
-- metade: se o e-mail sozinho abre a criação de senha, o e-mail É a senha, e
-- qualquer pessoa que saiba o endereço de uma educadora entra no lugar dela.
--
-- O convite fecha isso com três propriedades, e as três moram aqui no banco:
--
--   * UMA VEZ. `used_at` é gravado na mesma transação que cria a senha. Não
--     existe janela entre "usei" e "marquei como usado".
--   * COM PRAZO. 24 horas, contadas do envio. Convite vencido não avisa que
--     existiu: quem chega com ele recebe a mesma resposta de quem chega com um
--     código inventado.
--   * COM AUTOR. Quem convidou fica registrado. Um acesso criado é um acesso
--     que alguém autorizou, com nome.
--
-- O token NUNCA é guardado. Só o hash — do mesmo jeito que a sessão (§22).
-- Quem tiver o banco na mão não consegue entrar no lugar de ninguém.
-- ---------------------------------------------------------------------------

CREATE TABLE user_invite (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user(id),
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  created_by   uuid NOT NULL REFERENCES app_user(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  used_at      timestamptz,
  used_ip      text,
  revoked_at   timestamptz,
  revoked_reason text
);

-- Um convite ativo por pessoa: emitir de novo cancela o anterior. Sem isto,
-- o convite de três semanas atrás continuaria valendo em paralelo.
CREATE UNIQUE INDEX uq_invite_ativo ON user_invite (user_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

ALTER TABLE user_invite ENABLE ROW LEVEL SECURITY;
-- Ninguém lê convite pela aplicação, nem o próprio dono: não há nada de útil
-- para mostrar (o token não está aqui) e há muito a proteger. Todo o trabalho
-- passa pelas funções abaixo, que são SECURITY DEFINER.
REVOKE ALL ON user_invite FROM rede_app;

-- ---------------------------------------------------------------------------
-- 1. Emitir. Só quem já pode gerir aquele cargo (mesma regra de
--    app_reset_staff_password: staff_role_grant).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_issue_invite(p_user uuid, p_token_hash text, p_hours integer,
                                            p_scramble_hash text)
RETURNS TABLE (out_id uuid, out_email text, out_nome text, out_expira timestamptz) AS $$
DECLARE v_me uuid; v_role role_code; v_alvo app_user%ROWTYPE; v_id uuid; v_exp timestamptz;
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

  -- O convite anterior morre agora: dois convites válidos são duas portas.
  UPDATE user_invite SET revoked_at = now(), revoked_reason = 'substituido'
   WHERE user_id = p_user AND used_at IS NULL AND revoked_at IS NULL;

  -- A senha atual é embaralhada por um valor que ninguém conhece — nem quem
  -- convidou, nem quem vai receber. `password_hash` é NOT NULL, então "conta
  -- sem senha" não existe no banco; o que existe é conta cuja senha ninguém
  -- pode digitar. A partir daqui, a única porta é o link do convite.
  --
  -- Isso vale também quando o convite é reenvio para quem perdeu a senha: as
  -- sessões abertas caem junto, como já acontece na redefinição pela
  -- coordenação. Se foi por suspeita de acesso indevido, o acesso acaba agora.
  UPDATE app_user SET password_hash = p_scramble_hash, must_change_password = false,
         updated_at = now()
   WHERE id = p_user;
  UPDATE user_session SET revoked_at = now(), revoked_reason = 'convite_emitido'
   WHERE user_id = p_user AND revoked_at IS NULL;

  v_exp := now() + (p_hours || ' hours')::interval;
  INSERT INTO user_invite (user_id, token_hash, expires_at, created_by)
  VALUES (p_user, p_token_hash, v_exp, v_me) RETURNING id INTO v_id;

  INSERT INTO audit_event (actor_id, action, entity, entity_id)
  VALUES (v_me, 'auth.invite_issued', 'app_user', p_user);

  RETURN QUERY SELECT v_id, v_alvo.email, v_alvo.full_name, v_exp;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_issue_invite(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_issue_invite(uuid, text, integer, text) TO rede_app;

-- ---------------------------------------------------------------------------
-- 2. Conferir sem gastar. A tela precisa saber se vale ANTES de pedir a senha
--    nova — mandar a pessoa digitar duas vezes uma senha para só então dizer
--    "seu convite venceu" é o tipo de tela que faz alguém desistir às 23h.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_check_invite(p_token_hash text)
RETURNS TABLE (out_valido boolean, out_nome text, out_email text) AS $$
  SELECT true, u.full_name, u.email
    FROM user_invite i JOIN app_user u ON u.id = i.user_id
   WHERE i.token_hash = p_token_hash
     AND i.used_at IS NULL AND i.revoked_at IS NULL
     AND i.expires_at > now() AND u.active
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_check_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_check_invite(text) TO rede_app;

-- ---------------------------------------------------------------------------
-- 3. Gastar. Marcar como usado e gravar a senha acontecem na MESMA transação:
--    é isso que faz o convite valer uma vez só, mesmo com dois toques
--    simultâneos ou com a fila offline reenviando.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_consume_invite(p_token_hash text, p_password_hash text, p_ip text)
RETURNS TABLE (out_user uuid, out_email text) AS $$
DECLARE v_inv user_invite%ROWTYPE; v_u app_user%ROWTYPE;
BEGIN
  -- FOR UPDATE: a segunda transação espera aqui e, ao seguir, já encontra
  -- used_at preenchido.
  SELECT * INTO v_inv FROM user_invite
   WHERE token_hash = p_token_hash FOR UPDATE;

  IF v_inv.id IS NULL OR v_inv.used_at IS NOT NULL
     OR v_inv.revoked_at IS NOT NULL OR v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'convite_invalido';
  END IF;

  SELECT * INTO v_u FROM app_user WHERE id = v_inv.user_id FOR UPDATE;
  IF v_u.id IS NULL OR NOT v_u.active THEN RAISE EXCEPTION 'convite_invalido'; END IF;

  UPDATE user_invite SET used_at = now(), used_ip = p_ip WHERE id = v_inv.id;

  -- must_change_password fica FALSO: a senha foi criada pela própria pessoa,
  -- no aparelho dela. Pedir que troque a senha que ela acabou de escolher é
  -- ruído, e ruído de segurança ensina a ignorar avisos de segurança.
  UPDATE app_user SET password_hash = p_password_hash, must_change_password = false,
         updated_at = now()
   WHERE id = v_u.id;

  -- Sessão antiga não sobrevive à criação da senha.
  UPDATE user_session SET revoked_at = now(), revoked_reason = 'primeiro_acesso'
   WHERE user_id = v_u.id AND revoked_at IS NULL;

  INSERT INTO audit_event (actor_id, action, entity, entity_id)
  VALUES (v_u.id, 'auth.first_access', 'app_user', v_u.id);

  RETURN QUERY SELECT v_u.id, v_u.email;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_consume_invite(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_consume_invite(text, text, text) TO rede_app;

-- ---------------------------------------------------------------------------
-- 4. Passo 1 da entrada: esta conta já tem senha?
--    Responde SEM revelar quem existe: conta inexistente responde igual a
--    conta com senha. E "não tem senha" só sai quando há convite válido —
--    senão a resposta viraria a porta permanente que o convite veio fechar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_account_has_password(p_email text)
RETURNS boolean AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM app_user u
     JOIN user_invite i ON i.user_id = u.id
    WHERE lower(u.email) = lower(btrim(p_email))
      AND u.active
      AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now())
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_account_has_password(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_account_has_password(text) TO rede_app;
