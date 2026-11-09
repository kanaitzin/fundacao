-- O ESQUECI SEM BRECHA (fase 296; o que as revisões do banco e de segurança acharam na 1689).
--
-- A 1689 pôs limite no esqueci, e as duas revisões acharam, nela:
--  1. O TETO DERRUBAVA O ESQUECI DE TODOS com dois e-mails reais: cada conta recebia um
--     envio a cada dois minutos, trinta por hora, e duas contas enchiam os sessenta. Agora o
--     teto segura só a REPETIÇÃO: o primeiro e-mail de cada conta na hora sempre sai.
--  2. CADA PEDIDO NOVO REVOGA O LINK DE ANTES, e quem souber o e-mail de uma colega cancela
--     o link dela. Continua assim: um convite aberto por pessoa é regra desde a 0700 (o
--     índice `uq_invite_ativo`); o que segura é o limite por endereço, e um limite por conta
--     na hora é pergunta para a Fundação (PARA-A-REUNIAO §0 A14).
--  3. A REGRA DOS DOIS MINUTOS era conferida fora de trava, e pedidos ao mesmo tempo de
--     endereços diferentes passavam juntos. A LINHA DA CONTA ficava presa enquanto o pedido
--     esperava o teto, e o tempo de resposta contava que a conta existe. Agora todo pedido,
--     com conta ou sem, toma as travas na mesma ordem (o endereço, depois a da instituição)
--     ANTES de ler a conta, e lê a conta sem prendê-la.
--  4. TODO PEDIDO GRAVAVA UMA LINHA, com o e-mail digitado sem limite de tamanho: uma origem
--     enchia o disco. Agora a tabela guarda a CONTA (nula quando não há) e o BLOCO do
--     endereço, nunca o que foi digitado; o pedido segurado é anotado uma vez por janela, e
--     a contagem para no limite.
--  5. O TETO NA AUDITORIA tinha como autora a conta que por acaso caiu nele. Agora vai sem
--     autor, uma vez por hora, e também na saúde da implantação (o e-mail que não saiu).
--  6. As chaves das travas usam a forma de dois números, num espaço só do esqueci.
--
-- Pedido sem endereço (o que chega da própria máquina: o servidor manda nulo, como a
-- entrada faz desde a 291) não conta por endereço e só deixa linha quando sai e-mail.

CREATE OR REPLACE FUNCTION app_bloco_do_endereco(p_ip inet) RETURNS inet
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE
    WHEN p_ip IS NULL THEN NULL
    WHEN family(p_ip) = 6 AND p_ip <<= '::ffff:0:0/96'::inet
      THEN set_masklen('0.0.0.0'::inet + (host(p_ip)::inet - '::ffff:0.0.0.0'::inet), 32)
    WHEN family(p_ip) = 6 THEN network(set_masklen(p_ip, 64))
    ELSE set_masklen(p_ip, 32)
  END;
$$;
REVOKE ALL ON FUNCTION app_bloco_do_endereco(inet) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_bloco_do_endereco(inet) TO rede_app;

-- A tabela da 1689 só teve dado de teste: nasce de novo, sem o e-mail.
DROP TABLE reset_request;
CREATE TABLE reset_request (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES app_user(id),
  bloco       inet,
  enviado     boolean NOT NULL,
  segurado    text CHECK (segurado IN ('endereco', 'teto')),
  at          timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (enviado AND segurado IS NOT NULL))
);
CREATE INDEX idx_reset_request_bloco ON reset_request (bloco, at DESC);
CREATE INDEX idx_reset_request_enviado ON reset_request (at DESC) WHERE enviado;
CREATE INDEX idx_reset_request_user ON reset_request (user_id, at DESC);
ALTER TABLE reset_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reset_request FROM PUBLIC;
REVOKE ALL ON reset_request FROM rede_app;
COMMENT ON TABLE reset_request IS
  'Cada pedido do esqueci minha senha (fase 296): só a auth_pedir_nova_senha escreve e lê.';

CREATE OR REPLACE FUNCTION auth_pedir_nova_senha(p_email text, p_hash text, p_minutos int, p_ip inet)
RETURNS TABLE (out_nome text, out_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_u app_user%ROWTYPE;
  v_email text := left(lower(btrim(coalesce(p_email, ''))), 254);
  v_bloco inet := app_bloco_do_endereco(p_ip);
  v_do_bloco int;
  v_enviados int;
  -- Os limites: escritos aqui, nunca recebidos.
  c_por_endereco constant int := 10;
  c_teto_por_hora constant int := 60;
  c_espaco constant int := 1690;   -- o espaço das travas do esqueci
BEGIN
  -- 1. O endereço: os pedidos do mesmo bloco em fila, contados até o limite e não além.
  IF v_bloco IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(c_espaco, hashtext(v_bloco::text));
    SELECT count(*)::int INTO v_do_bloco FROM (
      SELECT 1 FROM reset_request
       WHERE bloco = v_bloco AND at > now() - interval '1 hour'
       LIMIT c_por_endereco + 1) s;
    IF v_do_bloco >= c_por_endereco THEN
      -- Uma marca por janela: a do pedido que encontrou o limite cheio pela primeira vez.
      IF v_do_bloco = c_por_endereco THEN
        INSERT INTO reset_request (bloco, enviado, segurado) VALUES (v_bloco, false, 'endereco');
      END IF;
      RETURN;
    END IF;
  END IF;

  -- 2. A instituição: todo pedido passa por esta trava, com conta ou sem, antes de ler a
  --    conta. A regra dos dois minutos e o teto ficam sem corrida, e o tempo é o mesmo.
  PERFORM pg_advisory_xact_lock(c_espaco, 0);

  SELECT * INTO v_u FROM app_user WHERE lower(email) = v_email AND active;
  IF v_u.id IS NULL OR v_u.email_a_confirmar
     OR EXISTS (SELECT 1 FROM user_invite
                 WHERE user_id = v_u.id AND motivo = 'esqueci'
                   AND created_at > now() - interval '2 minutes') THEN
    IF v_bloco IS NOT NULL THEN
      INSERT INTO reset_request (user_id, bloco, enviado) VALUES (v_u.id, v_bloco, false);
    END IF;
    IF v_u.email_a_confirmar AND NOT EXISTS (
         SELECT 1 FROM audit_event
          WHERE entity = 'app_user' AND entity_id = v_u.id AND action = 'auth.reset_email_a_confirmar'
            AND at > now() - interval '2 minutes') THEN
      INSERT INTO audit_event (actor_id, action, entity, entity_id)
      VALUES (v_u.id, 'auth.reset_email_a_confirmar', 'app_user', v_u.id);
    END IF;
    RETURN;
  END IF;

  -- 3. O teto segura só a repetição: quem já recebeu um e-mail na última hora.
  SELECT count(*)::int INTO v_enviados FROM reset_request
   WHERE enviado AND at > now() - interval '1 hour';
  IF v_enviados >= c_teto_por_hora AND EXISTS (
       SELECT 1 FROM reset_request
        WHERE user_id = v_u.id AND enviado AND at > now() - interval '1 hour') THEN
    INSERT INTO reset_request (user_id, bloco, enviado, segurado) VALUES (v_u.id, v_bloco, false, 'teto');
    IF NOT EXISTS (SELECT 1 FROM audit_event
                    WHERE entity = 'reset_request' AND entity_id IS NULL AND action = 'auth.reset_teto'
                      AND at > now() - interval '1 hour') THEN
      INSERT INTO audit_event (actor_id, action, entity, entity_id, detail)
      VALUES (NULL, 'auth.reset_teto', 'reset_request', NULL,
              jsonb_build_object('enviados', v_enviados, 'teto', c_teto_por_hora));
      PERFORM app_anotar_implantacao('email', false,
              jsonb_build_object('motivo', 'teto_do_esqueci', 'teto', c_teto_por_hora));
    END IF;
    RETURN;
  END IF;

  -- 4. O link novo, no lugar do de antes (um convite aberto por pessoa, 0700).
  UPDATE user_invite SET revoked_at = now(), revoked_reason = 'pedido novo'
   WHERE user_id = v_u.id AND motivo = 'esqueci' AND used_at IS NULL AND revoked_at IS NULL;
  INSERT INTO user_invite (user_id, token_hash, expires_at, created_by, motivo)
  VALUES (v_u.id, p_hash, now() + make_interval(mins => p_minutos), v_u.id, 'esqueci');
  INSERT INTO reset_request (user_id, bloco, enviado) VALUES (v_u.id, v_bloco, true);
  INSERT INTO audit_event (actor_id, action, entity, entity_id)
  VALUES (v_u.id, 'auth.reset_requested', 'app_user', v_u.id);
  RETURN QUERY SELECT v_u.full_name, v_u.email;
END $$;
REVOKE ALL ON FUNCTION auth_pedir_nova_senha(text, text, int, inet) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_pedir_nova_senha(text, text, int, inet) TO rede_app;
