-- O ESQUECI MINHA SENHA COM LIMITE (fase 296; o que a revisão de segurança da 295 achou).
--
-- O esqueci só segurava um pedido a cada dois minutos POR CONTA (1686), e cada pedido
-- novo revoga o link de antes. Quem soubesse os e-mails da casa, que se adivinham,
-- mandava de um endereço só até 720 e-mails por dia para cada conta: a cota do e-mail da
-- Fundação acabava, o convite da coordenação deixava de sair, e o link de quem pediu de
-- verdade era revogado a cada dois minutos.
--
-- Agora todo pedido fica anotado (`reset_request`: o e-mail como foi limpo, o endereço, se
-- saiu e-mail), e a função conta, antes de tudo:
--  * dez pedidos por hora do mesmo endereço (no IPv6, o bloco /64 conta como um, como na
--    trava da entrada, 1684), contando e-mail inventado também: errar o e-mail é pedir;
--  * sessenta e-mails de redefinição por hora para a instituição inteira.
-- Os números moram aqui, e não vêm de quem chama (a lição da 1688). Passou de um deles, a
-- resposta continua a mesma (nada conta que a conta existe) e o pedido fica anotado como
-- segurado; o teto geral anota uma linha na auditoria por hora, para quem cuida do
-- servidor ver.
--
-- A tabela é só metadado de segurança, como a `login_attempt`: ninguém da aplicação lê
-- nem escreve, só esta função. O prazo de guarda é o mesmo pedido ao DPO para as
-- tentativas de entrada (PARA-A-REUNIAO §0).

CREATE TABLE reset_request (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,
  ip          inet,
  enviado     boolean NOT NULL,
  segurado    text CHECK (segurado IN ('endereco', 'teto')),
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reset_request_ip ON reset_request (ip, at DESC);
CREATE INDEX idx_reset_request_enviado ON reset_request (at DESC) WHERE enviado;
ALTER TABLE reset_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reset_request FROM PUBLIC;
REVOKE ALL ON reset_request FROM rede_app;
COMMENT ON TABLE reset_request IS
  'Cada pedido do esqueci minha senha (fase 296): só a auth_pedir_nova_senha escreve e lê.';

DROP FUNCTION IF EXISTS auth_pedir_nova_senha(text, text, int);

CREATE FUNCTION auth_pedir_nova_senha(p_email text, p_hash text, p_minutos int, p_ip inet)
RETURNS TABLE (out_nome text, out_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_u app_user%ROWTYPE;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_do_endereco int;
  v_enviados int;
  -- Os limites: escritos aqui, nunca recebidos.
  c_por_endereco constant int := 10;
  c_teto_por_hora constant int := 60;
BEGIN
  -- Os pedidos do mesmo endereço em fila: dois ao mesmo tempo não passam do limite juntos.
  IF p_ip IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('esqueci:' || CASE
      WHEN family(p_ip) = 6 AND NOT p_ip <<= '::ffff:0:0/96'::inet
      THEN network(set_masklen(p_ip, 64))::text ELSE host(p_ip) END));
    SELECT count(*)::int INTO v_do_endereco FROM reset_request
     WHERE at > now() - interval '1 hour'
       AND CASE WHEN family(p_ip) = 6 AND NOT p_ip <<= '::ffff:0:0/96'::inet
                THEN ip <<= network(set_masklen(p_ip, 64))
                ELSE ip = p_ip END;
    IF v_do_endereco >= c_por_endereco THEN
      INSERT INTO reset_request (email, ip, enviado, segurado) VALUES (v_email, p_ip, false, 'endereco');
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_u FROM app_user WHERE lower(email) = v_email AND active FOR SHARE;
  IF v_u.id IS NULL THEN
    INSERT INTO reset_request (email, ip, enviado) VALUES (v_email, p_ip, false);
    RETURN;
  END IF;
  IF v_u.email_a_confirmar THEN
    INSERT INTO reset_request (email, ip, enviado) VALUES (v_email, p_ip, false);
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
    INSERT INTO reset_request (email, ip, enviado) VALUES (v_email, p_ip, false);
    RETURN;
  END IF;

  -- O teto da instituição: os e-mails que saíram na última hora, de qualquer endereço.
  PERFORM pg_advisory_xact_lock(hashtext('esqueci:teto'));
  SELECT count(*)::int INTO v_enviados FROM reset_request
   WHERE enviado AND at > now() - interval '1 hour';
  IF v_enviados >= c_teto_por_hora THEN
    INSERT INTO reset_request (email, ip, enviado, segurado) VALUES (v_email, p_ip, false, 'teto');
    IF NOT EXISTS (SELECT 1 FROM audit_event
                    WHERE action = 'auth.reset_teto' AND at > now() - interval '1 hour') THEN
      INSERT INTO audit_event (actor_id, action, entity, entity_id)
      VALUES (v_u.id, 'auth.reset_teto', 'app_user', v_u.id);
    END IF;
    RETURN;
  END IF;

  UPDATE user_invite SET revoked_at = now(), revoked_reason = 'pedido novo'
   WHERE user_id = v_u.id AND motivo = 'esqueci' AND used_at IS NULL AND revoked_at IS NULL;
  INSERT INTO user_invite (user_id, token_hash, expires_at, created_by, motivo)
  VALUES (v_u.id, p_hash, now() + make_interval(mins => p_minutos), v_u.id, 'esqueci');
  INSERT INTO reset_request (email, ip, enviado) VALUES (v_email, p_ip, true);
  INSERT INTO audit_event (actor_id, action, entity, entity_id)
  VALUES (v_u.id, 'auth.reset_requested', 'app_user', v_u.id);
  RETURN QUERY SELECT v_u.full_name, v_u.email;
END $$;
REVOKE ALL ON FUNCTION auth_pedir_nova_senha(text, text, int, inet) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_pedir_nova_senha(text, text, int, inet) TO rede_app;
