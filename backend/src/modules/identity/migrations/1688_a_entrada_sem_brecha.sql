-- A ENTRADA SEM BRECHA (fase 293, conserto do que as revisões do banco e de segurança acharam
-- na 1687; provado em BEGIN e ROLLBACK como o papel da aplicação, num banco à parte).
--
--  1. Um espaço no e-mail desligava a trava da conta. A `auth_entrar` achava a conta e anotava
--     o erro com o e-mail limpo (`lower(btrim(...))`), mas contava os erros com o e-mail cru:
--     com ' gestor@...' a contagem era sempre zero, a senha certa entrava como Gestor Geral, e
--     a dona da conta, digitando certo, ficava travada. Agora o e-mail é limpo uma vez, no
--     começo, e tudo usa o mesmo (a contagem também limpa).
--  2. O limite da trava vinha de quem chama. A `auth_entrar` é SECURITY DEFINER, e quem passava
--     o máximo de erros, a janela e as horas da sessão era a aplicação: com um máximo de um
--     milhão, a função virava um comparador sem limite. Os números do `.env` continuam valendo,
--     mas o banco os segura num teto: no máximo dez erros por conta, cinquenta contas por
--     endereço, janela de cinco a sessenta minutos, e sessão de uma a vinte e quatro horas.
--  3. O hash guardado era a própria chave. Quem tivesse uma cópia do banco e o papel da
--     aplicação entrava como qualquer pessoa sem quebrar senha nenhuma. Agora o banco guarda o
--     sha256 da chave (o formato `scrypt2`), e os hashes de antes são convertidos aqui, sem
--     pedir senha a ninguém.
--  4. E o resto: o hash novo é conferido por formato e custo antes de ser gravado; a entrada
--     confere as travas antes do scrypt (`auth_esta_travado`), para um endereço sozinho não
--     entupir o servidor; o endereço do próprio servidor volta a ser anotado (ele só não trava);
--     o segredo vazio para com uma frase clara; e a aplicação deixa de chamar as contagens.

-- A contagem por conta, com o e-mail limpo.
CREATE OR REPLACE FUNCTION auth_tentativas_recentes(p_email text, p_minutos int) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT count(*)::int FROM login_attempt
   WHERE email = lower(btrim(coalesce(p_email, ''))) AND success = false
     AND at > now() - make_interval(mins => p_minutos)
$$;
REVOKE ALL ON FUNCTION auth_tentativas_recentes(text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth_tentativas_recentes(text, int) FROM rede_app;
REVOKE EXECUTE ON FUNCTION auth_tentativas_do_endereco(inet, int) FROM rede_app;

-- Os tetos da trava, que a aplicação não passa.
CREATE OR REPLACE FUNCTION auth_teto(p_valor int, p_minimo int, p_maximo int) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT greatest(p_minimo, least(p_maximo, coalesce(p_valor, p_maximo)))
$$;
REVOKE ALL ON FUNCTION auth_teto(int, int, int) FROM PUBLIC;

-- A chave confere: no formato novo, pelo sha256; no de antes, ainda pela chave.
CREATE OR REPLACE FUNCTION auth_chave_confere(p_hash text, p_chave text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(length(coalesce(p_chave, '')) > 0 AND CASE
    WHEN p_hash LIKE 'scrypt2$%' THEN
      split_part(p_hash, '$', 7) = encode(digest(decode(p_chave, 'base64'), 'sha256'), 'base64')
    WHEN p_hash LIKE 'scrypt$%' THEN split_part(p_hash, '$', 6) = p_chave
    ELSE false END, false)
$$;
REVOKE ALL ON FUNCTION auth_chave_confere(text, text) FROM PUBLIC;

-- O hash que vem da aplicação tem o formato e o custo certos?
CREATE OR REPLACE FUNCTION auth_hash_aceito(p_hash text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(p_hash ~ '^scrypt2\$[0-9]{5,7}\$8\$1\$64\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$'
                  AND split_part(p_hash, '$', 2)::int >= 32768, false)
$$;
REVOKE ALL ON FUNCTION auth_hash_aceito(text) FROM PUBLIC;

-- Os hashes de antes, convertidos no lugar (a chave vira o sha256 dela).
UPDATE app_user
   SET password_hash = 'scrypt2$' || split_part(password_hash, '$', 2) || '$' || split_part(password_hash, '$', 3)
       || '$' || split_part(password_hash, '$', 4) || '$' || length(decode(split_part(password_hash, '$', 6), 'base64'))
       || '$' || split_part(password_hash, '$', 5)
       || '$' || encode(digest(decode(split_part(password_hash, '$', 6), 'base64'), 'sha256'), 'base64')
 WHERE password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$';

-- O sal: nos dois formatos, e o falso com os parâmetros de uma conta.
CREATE OR REPLACE FUNCTION auth_sal(p_email text)
RETURNS TABLE (out_n int, out_r int, out_p int, out_sal text, out_tamanho int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_hash text; v_partes text[]; v_segredo bytea;
BEGIN
  SELECT password_hash INTO v_hash FROM app_user
   WHERE lower(email) = lower(btrim(coalesce(p_email, ''))) AND active;
  v_partes := string_to_array(coalesce(v_hash, ''), '$');
  IF array_length(v_partes, 1) = 7 AND v_partes[1] = 'scrypt2' THEN
    RETURN QUERY SELECT v_partes[2]::int, v_partes[3]::int, v_partes[4]::int, v_partes[6], v_partes[5]::int;
    RETURN;
  END IF;
  IF array_length(v_partes, 1) = 6 AND v_partes[1] = 'scrypt' THEN
    RETURN QUERY SELECT v_partes[2]::int, v_partes[3]::int, v_partes[4]::int, v_partes[5],
                        length(decode(v_partes[6], 'base64'));
    RETURN;
  END IF;
  SELECT valor INTO v_segredo FROM auth_segredo;
  IF v_segredo IS NULL OR length(v_segredo) < 16 THEN RAISE EXCEPTION 'auth_segredo_ausente'; END IF;
  RETURN QUERY
    SELECT 32768, 8, 1,
           encode(substring(hmac(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8'), v_segredo, 'sha256') FOR 16), 'base64'),
           64;
END $$;
REVOKE ALL ON FUNCTION auth_sal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_sal(text) TO rede_app;

-- As travas antes do scrypt: uma pergunta barata, com a mesma resposta para conta que existe e
-- que não existe. A que vale é a de dentro da `auth_entrar`.
CREATE OR REPLACE FUNCTION auth_esta_travado(
  p_email text, p_ip inet, p_trava_endereco boolean,
  p_max_conta int, p_max_endereco int, p_minutos int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT auth_tentativas_recentes(p_email, auth_teto(p_minutos, 5, 60)) >= auth_teto(p_max_conta, 1, 10)
      OR (p_trava_endereco AND p_ip IS NOT NULL
          AND auth_tentativas_do_endereco(p_ip, auth_teto(p_minutos, 5, 60)) >= auth_teto(p_max_endereco, 1, 50))
$$;
REVOKE ALL ON FUNCTION auth_esta_travado(text, inet, boolean, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_esta_travado(text, inet, boolean, int, int, int) TO rede_app;

-- A ENTRADA (1687), com o e-mail limpo uma vez, os tetos, e o endereço do próprio servidor
-- anotado sem travar.
DROP FUNCTION IF EXISTS auth_entrar(text, text, inet, int, int, int, text, int, text);
CREATE FUNCTION auth_entrar(
  p_email text, p_chave text, p_ip inet, p_trava_endereco boolean,
  p_max_conta int, p_max_endereco int, p_minutos int,
  p_sessao_hash text, p_horas int, p_user_agent text)
RETURNS TABLE (out_status text, out_id uuid, out_institution_id uuid, out_email text,
               out_nome text, out_role role_code, out_must_change boolean, out_sessao uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_minutos int := auth_teto(p_minutos, 5, 60);
  v_u app_user%ROWTYPE; v_ok boolean; v_sessao uuid;
BEGIN
  PERFORM auth_travar_a_tentativa(v_email, CASE WHEN p_trava_endereco THEN p_ip END);
  IF auth_tentativas_recentes(v_email, v_minutos) >= auth_teto(p_max_conta, 1, 10) THEN
    RETURN QUERY SELECT 'conta_travada'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
                        NULL::role_code, NULL::boolean, NULL::uuid;
    RETURN;
  END IF;
  IF p_trava_endereco AND p_ip IS NOT NULL
     AND auth_tentativas_do_endereco(p_ip, v_minutos) >= auth_teto(p_max_endereco, 1, 50) THEN
    RETURN QUERY SELECT 'endereco_travado'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
                        NULL::role_code, NULL::boolean, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_u FROM app_user WHERE lower(email) = v_email;
  v_ok := v_u.id IS NOT NULL AND v_u.active AND auth_chave_confere(v_u.password_hash, p_chave);
  INSERT INTO login_attempt (email, ip, success) VALUES (v_email, p_ip, v_ok);
  IF NOT v_ok THEN
    RETURN QUERY SELECT 'falhou'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
                        NULL::role_code, NULL::boolean, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO user_session (user_id, token_hash, expires_at, user_agent, ip)
  VALUES (v_u.id, p_sessao_hash, now() + make_interval(hours => auth_teto(p_horas, 1, 24)), p_user_agent, p_ip)
  RETURNING id INTO v_sessao;
  RETURN QUERY SELECT 'ok'::text, v_u.id, v_u.institution_id, v_u.email, v_u.full_name, v_u.role,
                      v_u.must_change_password, v_sessao;
END $$;
REVOKE ALL ON FUNCTION auth_entrar(text, text, inet, boolean, int, int, int, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_entrar(text, text, inet, boolean, int, int, int, text, int, text) TO rede_app;

-- A senha de quem já entrou, com os tetos.
CREATE OR REPLACE FUNCTION auth_conferir_pela_sessao(
  p_sessao uuid, p_chave text, p_ip inet, p_max_conta int, p_minutos int)
RETURNS TABLE (out_status text, out_user uuid)
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_u app_user%ROWTYPE; v_minutos int := auth_teto(p_minutos, 5, 60);
BEGIN
  SELECT u.* INTO v_u FROM user_session s JOIN app_user u ON u.id = s.user_id
   WHERE s.id = p_sessao AND s.revoked_at IS NULL AND s.expires_at > now() AND u.active;
  IF v_u.id IS NULL THEN RETURN QUERY SELECT 'sem_sessao'::text, NULL::uuid; RETURN; END IF;
  PERFORM auth_travar_a_tentativa(v_u.email, NULL);
  IF auth_tentativas_recentes(v_u.email, v_minutos) >= auth_teto(p_max_conta, 1, 10) THEN
    RETURN QUERY SELECT 'conta_travada'::text, NULL::uuid; RETURN;
  END IF;
  IF NOT auth_chave_confere(v_u.password_hash, p_chave) THEN
    INSERT INTO login_attempt (email, ip, success) VALUES (lower(btrim(v_u.email)), p_ip, false);
    RETURN QUERY SELECT 'falhou'::text, NULL::uuid; RETURN;
  END IF;
  RETURN QUERY SELECT 'ok'::text, v_u.id;
END $$;
REVOKE ALL ON FUNCTION auth_conferir_pela_sessao(uuid, text, inet, int, int) FROM PUBLIC;

-- A troca da própria senha (1687), com o hash novo conferido.
CREATE OR REPLACE FUNCTION auth_trocar_minha_senha(
  p_sessao uuid, p_chave_atual text, p_hash_novo text, p_ip inet, p_max_conta int, p_minutos int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_status text; v_user uuid;
BEGIN
  IF NOT auth_hash_aceito(p_hash_novo) THEN RAISE EXCEPTION 'hash_invalido'; END IF;
  SELECT out_status, out_user INTO v_status, v_user
    FROM auth_conferir_pela_sessao(p_sessao, p_chave_atual, p_ip, p_max_conta, p_minutos);
  IF v_status <> 'ok' THEN RETURN v_status; END IF;
  UPDATE app_user SET password_hash = p_hash_novo, must_change_password = false, updated_at = now()
   WHERE id = v_user;
  UPDATE user_session SET revoked_at = now(), revoked_reason = 'senha_alterada_pelo_usuario'
   WHERE user_id = v_user AND revoked_at IS NULL AND id <> p_sessao;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION auth_trocar_minha_senha(uuid, text, text, inet, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_trocar_minha_senha(uuid, text, text, inet, int, int) TO rede_app;

-- O primeiro acesso pelo convite (1687), com o hash conferido e a sessão no teto.
CREATE OR REPLACE FUNCTION auth_concluir_convite(
  p_token_hash text, p_password_hash text, p_ip text,
  p_sessao_hash text, p_horas int, p_user_agent text)
RETURNS TABLE (out_user uuid, out_email text, out_sessao uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_user uuid; v_email text; v_sessao uuid;
BEGIN
  IF NOT auth_hash_aceito(p_password_hash) THEN RAISE EXCEPTION 'hash_invalido'; END IF;
  SELECT c.out_user, c.out_email INTO v_user, v_email
    FROM app_consume_invite(p_token_hash, p_password_hash, p_ip) c;
  INSERT INTO user_session (user_id, token_hash, expires_at, user_agent, ip)
  VALUES (v_user, p_sessao_hash, now() + make_interval(hours => auth_teto(p_horas, 1, 24)), p_user_agent,
          nullif(p_ip, '')::inet)
  RETURNING id INTO v_sessao;
  RETURN QUERY SELECT v_user, v_email, v_sessao;
END $$;
REVOKE ALL ON FUNCTION auth_concluir_convite(text, text, text, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_concluir_convite(text, text, text, text, int, text) TO rede_app;
