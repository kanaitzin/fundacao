-- A SENHA CONFERIDA DENTRO DO BANCO (fase 293, a última do A4 da análise geral de 08/11).
--
-- Até aqui o servidor lia o hash da senha e conferia sozinho: a `auth_find_user` (0010)
-- devolvia o hash de QUALQUER e-mail a quem tivesse o papel da aplicação, o `rede_app` lia a
-- coluna `password_hash` da equipe pela política, a `auth_criar_sessao` (1190) abria sessão
-- para qualquer usuário, e a própria conta apagava o `must_change_password` pelo SQL sem
-- trocar a senha. E a trava da entrada eram três chamadas soltas (contar, conferir, anotar):
-- uma rajada em paralelo passava do limite antes de a primeira anotação chegar.
--
-- Agora:
--  * o banco entrega só o SAL da senha (`auth_sal`); para e-mail que não existe, um sal falso
--    e fixo, tirado de um segredo que só o banco conhece, para a resposta não contar quais
--    e-mails têm conta. O servidor deriva a chave da senha digitada com o sal, como sempre, e
--    o custo é o mesmo com e sem conta;
--  * a entrada é uma função só (`auth_entrar`): com a trava do e-mail e do endereço tomadas,
--    conta as tentativas, compara a chave, anota a tentativa e abre a sessão. O hash nunca
--    sai do banco;
--  * a troca da própria senha e a reautenticação também conferem a chave dentro do banco, com
--    a mesma trava; o primeiro acesso pelo convite abre a sessão na mesma função;
--  * o `rede_app` deixa de ler o `password_hash`, de escrever em `app_user` e de chamar as
--    funções de antes.

-- O segredo do sal falso. Nasce na instalação, não sai do banco, e ninguém da aplicação o lê.
CREATE TABLE IF NOT EXISTS auth_segredo (
  id     boolean PRIMARY KEY DEFAULT true CHECK (id),
  valor  bytea NOT NULL
);
INSERT INTO auth_segredo (valor) SELECT gen_random_bytes(32)
 WHERE NOT EXISTS (SELECT 1 FROM auth_segredo);
ALTER TABLE auth_segredo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auth_segredo FROM PUBLIC;
REVOKE ALL ON auth_segredo FROM rede_app;
COMMENT ON TABLE auth_segredo IS
  'O segredo do sal falso da entrada (fase 293): o e-mail sem conta recebe um sal que não muda e não conta que a conta não existe. Só as funções auth_* leem.';

-- O sal da senha de um e-mail (ou o falso, fixo para aquele e-mail).
CREATE OR REPLACE FUNCTION auth_sal(p_email text)
RETURNS TABLE (out_n int, out_r int, out_p int, out_sal text, out_tamanho int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_hash text; v_partes text[];
BEGIN
  SELECT password_hash INTO v_hash FROM app_user
   WHERE lower(email) = lower(btrim(coalesce(p_email, ''))) AND active;
  v_partes := string_to_array(coalesce(v_hash, ''), '$');
  IF array_length(v_partes, 1) = 6 AND v_partes[1] = 'scrypt' THEN
    RETURN QUERY SELECT v_partes[2]::int, v_partes[3]::int, v_partes[4]::int, v_partes[5],
                        length(decode(v_partes[6], 'base64'));
    RETURN;
  END IF;
  RETURN QUERY
    SELECT 32768, 8, 1,
           encode(substring(hmac(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8'), (SELECT valor FROM auth_segredo), 'sha256') FOR 16), 'base64'),
           64;
END $$;
REVOKE ALL ON FUNCTION auth_sal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_sal(text) TO rede_app;

-- A chave confere com o hash guardado? Só dentro do banco.
CREATE OR REPLACE FUNCTION auth_chave_confere(p_hash text, p_chave text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(p_hash LIKE 'scrypt$%' AND split_part(p_hash, '$', 6) = p_chave
                  AND length(coalesce(p_chave, '')) > 0, false)
$$;
REVOKE ALL ON FUNCTION auth_chave_confere(text, text) FROM PUBLIC;

-- As travas de uma tentativa, na ordem (endereço, depois e-mail), para duas entradas ao mesmo
-- tempo nunca se esperarem em ordens trocadas.
CREATE OR REPLACE FUNCTION auth_travar_a_tentativa(p_email text, p_ip inet) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_ip IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('auth-endereco:' ||
      CASE WHEN family(p_ip) = 6 AND NOT p_ip <<= '::ffff:0:0/96'::inet
           THEN network(set_masklen(p_ip, 64))::text ELSE host(p_ip) END));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('auth-conta:' || lower(btrim(coalesce(p_email, '')))));
END $$;
REVOKE ALL ON FUNCTION auth_travar_a_tentativa(text, inet) FROM PUBLIC;

-- A ENTRADA, numa função só. p_ip nulo: o próprio servidor, que não trava pelo endereço.
CREATE OR REPLACE FUNCTION auth_entrar(
  p_email text, p_chave text, p_ip inet,
  p_max_conta int, p_max_endereco int, p_minutos int,
  p_sessao_hash text, p_horas int, p_user_agent text)
RETURNS TABLE (out_status text, out_id uuid, out_institution_id uuid, out_email text,
               out_nome text, out_role role_code, out_must_change boolean, out_sessao uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_u app_user%ROWTYPE; v_ok boolean; v_sessao uuid;
BEGIN
  PERFORM auth_travar_a_tentativa(p_email, p_ip);
  IF auth_tentativas_recentes(p_email, p_minutos) >= p_max_conta THEN
    RETURN QUERY SELECT 'conta_travada'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
                        NULL::role_code, NULL::boolean, NULL::uuid;
    RETURN;
  END IF;
  IF p_ip IS NOT NULL AND auth_tentativas_do_endereco(p_ip, p_minutos) >= p_max_endereco THEN
    RETURN QUERY SELECT 'endereco_travado'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
                        NULL::role_code, NULL::boolean, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_u FROM app_user WHERE lower(email) = lower(btrim(coalesce(p_email, '')));
  v_ok := v_u.id IS NOT NULL AND v_u.active AND auth_chave_confere(v_u.password_hash, p_chave);
  INSERT INTO login_attempt (email, ip, success) VALUES (lower(btrim(coalesce(p_email, ''))), p_ip, v_ok);
  IF NOT v_ok THEN
    RETURN QUERY SELECT 'falhou'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
                        NULL::role_code, NULL::boolean, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO user_session (user_id, token_hash, expires_at, user_agent, ip)
  VALUES (v_u.id, p_sessao_hash, now() + make_interval(hours => p_horas), p_user_agent, p_ip)
  RETURNING id INTO v_sessao;
  RETURN QUERY SELECT 'ok'::text, v_u.id, v_u.institution_id, v_u.email, v_u.full_name, v_u.role,
                      v_u.must_change_password, v_sessao;
END $$;
REVOKE ALL ON FUNCTION auth_entrar(text, text, inet, int, int, int, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_entrar(text, text, inet, int, int, int, text, int, text) TO rede_app;

-- A senha de quem já entrou, conferida pela sessão dela, com a trava da conta. Devolve a
-- conta quando confere, e anota o erro quando não.
CREATE OR REPLACE FUNCTION auth_conferir_pela_sessao(
  p_sessao uuid, p_chave text, p_ip inet, p_max_conta int, p_minutos int)
RETURNS TABLE (out_status text, out_user uuid)
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_u app_user%ROWTYPE;
BEGIN
  SELECT u.* INTO v_u FROM user_session s JOIN app_user u ON u.id = s.user_id
   WHERE s.id = p_sessao AND s.revoked_at IS NULL AND s.expires_at > now() AND u.active;
  IF v_u.id IS NULL THEN RETURN QUERY SELECT 'sem_sessao'::text, NULL::uuid; RETURN; END IF;
  PERFORM auth_travar_a_tentativa(v_u.email, NULL);
  IF auth_tentativas_recentes(v_u.email, p_minutos) >= p_max_conta THEN
    RETURN QUERY SELECT 'conta_travada'::text, NULL::uuid; RETURN;
  END IF;
  IF NOT auth_chave_confere(v_u.password_hash, p_chave) THEN
    INSERT INTO login_attempt (email, ip, success) VALUES (lower(v_u.email), p_ip, false);
    RETURN QUERY SELECT 'falhou'::text, NULL::uuid; RETURN;
  END IF;
  RETURN QUERY SELECT 'ok'::text, v_u.id;
END $$;
REVOKE ALL ON FUNCTION auth_conferir_pela_sessao(uuid, text, inet, int, int) FROM PUBLIC;

-- A REAUTENTICAÇÃO (§4.5): a senha de novo, e a marca na sessão.
CREATE OR REPLACE FUNCTION auth_reautenticar(
  p_sessao uuid, p_chave text, p_ip inet, p_max_conta int, p_minutos int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_status text;
BEGIN
  SELECT out_status INTO v_status FROM auth_conferir_pela_sessao(p_sessao, p_chave, p_ip, p_max_conta, p_minutos);
  IF v_status = 'ok' THEN
    UPDATE user_session SET last_reauth_at = now() WHERE id = p_sessao;
  END IF;
  RETURN v_status;
END $$;
REVOKE ALL ON FUNCTION auth_reautenticar(uuid, text, inet, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_reautenticar(uuid, text, inet, int, int) TO rede_app;

-- A TROCA DA PRÓPRIA SENHA: confere a atual, grava a nova, apaga o pedido de trocar e encerra
-- as OUTRAS sessões (quem trocou continua trabalhando).
CREATE OR REPLACE FUNCTION auth_trocar_minha_senha(
  p_sessao uuid, p_chave_atual text, p_hash_novo text, p_ip inet, p_max_conta int, p_minutos int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_status text; v_user uuid;
BEGIN
  SELECT out_status, out_user INTO v_status, v_user
    FROM auth_conferir_pela_sessao(p_sessao, p_chave_atual, p_ip, p_max_conta, p_minutos);
  IF v_status <> 'ok' THEN RETURN v_status; END IF;
  IF coalesce(p_hash_novo, '') NOT LIKE 'scrypt$%' THEN RAISE EXCEPTION 'hash_invalido'; END IF;
  UPDATE app_user SET password_hash = p_hash_novo, must_change_password = false, updated_at = now()
   WHERE id = v_user;
  UPDATE user_session SET revoked_at = now(), revoked_reason = 'senha_alterada_pelo_usuario'
   WHERE user_id = v_user AND revoked_at IS NULL AND id <> p_sessao;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION auth_trocar_minha_senha(uuid, text, text, inet, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_trocar_minha_senha(uuid, text, text, inet, int, int) TO rede_app;

-- O PRIMEIRO ACESSO (e o esqueci) pelo convite, com a sessão aberta na mesma função: a sessão
-- só nasce para a conta do convite que acabou de ser gasto.
CREATE OR REPLACE FUNCTION auth_concluir_convite(
  p_token_hash text, p_password_hash text, p_ip text,
  p_sessao_hash text, p_horas int, p_user_agent text)
RETURNS TABLE (out_user uuid, out_email text, out_sessao uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_user uuid; v_email text; v_sessao uuid;
BEGIN
  IF coalesce(p_password_hash, '') NOT LIKE 'scrypt$%' THEN RAISE EXCEPTION 'hash_invalido'; END IF;
  SELECT c.out_user, c.out_email INTO v_user, v_email
    FROM app_consume_invite(p_token_hash, p_password_hash, p_ip) c;
  INSERT INTO user_session (user_id, token_hash, expires_at, user_agent, ip)
  VALUES (v_user, p_sessao_hash, now() + make_interval(hours => p_horas), p_user_agent,
          nullif(p_ip, '')::inet)
  RETURNING id INTO v_sessao;
  RETURN QUERY SELECT v_user, v_email, v_sessao;
END $$;
REVOKE ALL ON FUNCTION auth_concluir_convite(text, text, text, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_concluir_convite(text, text, text, text, int, text) TO rede_app;

-- O que a aplicação deixa de alcançar.
REVOKE EXECUTE ON FUNCTION auth_find_user(text) FROM rede_app;
REVOKE EXECUTE ON FUNCTION auth_criar_sessao(uuid, text, integer, text, inet) FROM rede_app;
REVOKE EXECUTE ON FUNCTION app_consume_invite(text, text, text) FROM rede_app;
REVOKE EXECUTE ON FUNCTION auth_registrar_tentativa(text, inet, boolean) FROM rede_app;
REVOKE EXECUTE ON FUNCTION auth_marcar_reautenticacao(uuid) FROM rede_app;
REVOKE ALL ON FUNCTION auth_find_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_criar_sessao(uuid, text, integer, text, inet) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_consume_invite(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_registrar_tentativa(text, inet, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_marcar_reautenticacao(uuid) FROM PUBLIC;

-- A leitura da conta sem o hash, e nenhuma escrita direta (a troca da senha é função).
REVOKE SELECT, UPDATE ON app_user FROM rede_app;
REVOKE UPDATE (password_hash, must_change_password, updated_at) ON app_user FROM rede_app;
GRANT SELECT (id, institution_id, email, full_name, role, active, must_change_password,
              created_at, updated_at, deactivated_at, deactivated_by, line_color,
              todas_as_casas, email_a_confirmar) ON app_user TO rede_app;
