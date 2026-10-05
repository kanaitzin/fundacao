-- AS DUAS ETAPAS PARA ENTRAR (fase 187, ideia 8 de 30/09; decidido em 05/10:
-- ninguém é obrigado, qualquer pessoa liga para si; quem perde o celular entra
-- com um dos oito códigos de reserva, e sem eles quem administra a conta dela
-- desliga, com motivo escrito).
--
-- O segundo passo é o código de seis dígitos de um aplicativo autenticador
-- (TOTP, RFC 6238). O segredo que o aplicativo e o servidor dividem fica
-- CIFRADO com a mesma chave do cofre (`CREDENTIAL_KEY`): lido do banco sem a
-- chave, não gera código nenhum.
--
-- O mesmo desenho da sessão (1190): a entrada acontece antes de existir
-- identidade, e por isso as tabelas ficam fechadas para a aplicação, que só
-- pode o que as funções abaixo permitem. Nada se apaga: desligar é marcar
-- quando, quem e por quê, e a linha fica.

CREATE TABLE user_second_factor (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES app_user(id),
  secret_enc        text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Nulo enquanto a pessoa não digitou o primeiro código: o aplicativo ainda
  -- pode não ter o segredo, e ligar sem conferir trancaria a pessoa do lado de fora.
  confirmed_at      timestamptz,
  -- O último passo de 30 segundos aceito: o mesmo código não entra duas vezes.
  last_step         bigint,
  turned_off_at     timestamptz,
  turned_off_by     uuid REFERENCES app_user(id),
  turned_off_reason text
);
CREATE UNIQUE INDEX uq_second_factor_vigente ON user_second_factor (user_id) WHERE turned_off_at IS NULL;

CREATE TABLE user_recovery_code (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factor_id  uuid NOT NULL REFERENCES user_second_factor(id),
  code_hash  text NOT NULL,
  used_at    timestamptz
);
CREATE INDEX idx_recovery_code_factor ON user_recovery_code (factor_id);

-- O desafio entre a senha certa e o código: vale cinco minutos e cinco tentativas.
CREATE TABLE login_challenge (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  tries       integer NOT NULL DEFAULT 0,
  used_at     timestamptz
);

REVOKE ALL ON user_second_factor FROM rede_app;
REVOKE ALL ON user_recovery_code FROM rede_app;
REVOKE ALL ON login_challenge FROM rede_app;
ALTER TABLE user_second_factor ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_recovery_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_challenge ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------- na entrada

/** O fator ligado (confirmado e não desligado) de uma conta, se houver. */
CREATE OR REPLACE FUNCTION auth_segunda_etapa_de(p_user uuid)
RETURNS TABLE (factor_id uuid, secret_enc text, last_step bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT id, secret_enc, last_step FROM user_second_factor
   WHERE user_id = p_user AND confirmed_at IS NOT NULL AND turned_off_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION auth_criar_desafio(p_user uuid, p_hash text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO login_challenge (user_id, token_hash, expires_at)
  VALUES (p_user, p_hash, now() + interval '5 minutes');
$$;

/**
 * Conta uma tentativa no desafio e devolve de quem ele é, se ainda vale. O
 * `WHERE` é o que protege: não usado, não vencido, menos de cinco tentativas.
 */
CREATE OR REPLACE FUNCTION auth_tentar_desafio(p_hash text)
RETURNS TABLE (challenge_id uuid, user_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  UPDATE login_challenge SET tries = tries + 1
   WHERE token_hash = p_hash AND used_at IS NULL AND expires_at > now() AND tries < 5
   RETURNING id, user_id;
$$;

CREATE OR REPLACE FUNCTION auth_gastar_desafio(p_challenge uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  UPDATE login_challenge SET used_at = now() WHERE id = p_challenge;
$$;

/** Aceita o passo só se for depois do último aceito: código repetido não entra. */
CREATE OR REPLACE FUNCTION auth_aceitar_passo(p_factor uuid, p_step bigint)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  WITH x AS (
    UPDATE user_second_factor SET last_step = p_step
     WHERE id = p_factor AND turned_off_at IS NULL AND (last_step IS NULL OR last_step < p_step)
     RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM x);
$$;

/** Gasta um código de reserva: cada um entra uma vez só. */
CREATE OR REPLACE FUNCTION auth_usar_codigo_reserva(p_factor uuid, p_hash text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  WITH x AS (
    UPDATE user_recovery_code SET used_at = now()
     WHERE id = (SELECT id FROM user_recovery_code
                  WHERE factor_id = p_factor AND code_hash = p_hash AND used_at IS NULL LIMIT 1)
     RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM x);
$$;

-- ------------------------------------------------- a própria pessoa liga e desliga

/** Como estão as duas etapas de quem pergunta. */
CREATE OR REPLACE FUNCTION app_minha_segunda_etapa()
RETURNS TABLE (ligada boolean, desde timestamptz, reservas_restantes int, pendente boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT f.confirmed_at IS NOT NULL, f.confirmed_at,
         (SELECT count(*)::int FROM user_recovery_code r WHERE r.factor_id = f.id AND r.used_at IS NULL),
         f.confirmed_at IS NULL
    FROM (SELECT 1) um
    LEFT JOIN user_second_factor f ON f.user_id = app_current_user() AND f.turned_off_at IS NULL;
$$;

/**
 * Começa a ligar: guarda o segredo novo, ainda sem valer. Um começo anterior
 * que não foi confirmado é descartado com motivo (a linha fica).
 */
CREATE OR REPLACE FUNCTION app_iniciar_segunda_etapa(p_secret_enc text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_me uuid := app_current_user(); v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'sem_identidade' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF EXISTS (SELECT 1 FROM user_second_factor
              WHERE user_id = v_me AND turned_off_at IS NULL AND confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'segunda_etapa_ja_ligada' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE user_second_factor
     SET turned_off_at = now(), turned_off_by = v_me, turned_off_reason = 'começo não confirmado'
   WHERE user_id = v_me AND turned_off_at IS NULL;
  INSERT INTO user_second_factor (user_id, secret_enc) VALUES (v_me, p_secret_enc) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

/** O segredo do começo pendente, para o serviço conferir o primeiro código. */
CREATE OR REPLACE FUNCTION app_segunda_etapa_pendente()
RETURNS TABLE (factor_id uuid, secret_enc text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT id, secret_enc FROM user_second_factor
   WHERE user_id = app_current_user() AND turned_off_at IS NULL AND confirmed_at IS NULL;
$$;

/** Confirma com o primeiro código certo e guarda os códigos de reserva (só o hash). */
CREATE OR REPLACE FUNCTION app_confirmar_segunda_etapa(p_factor uuid, p_step bigint, p_hashes text[])
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE user_second_factor SET confirmed_at = now(), last_step = p_step
   WHERE id = p_factor AND user_id = app_current_user() AND turned_off_at IS NULL AND confirmed_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO user_recovery_code (factor_id, code_hash) SELECT p_factor, unnest(p_hashes);
  RETURN true;
END $$;

/** A própria pessoa desliga. */
CREATE OR REPLACE FUNCTION app_desligar_minha_segunda_etapa()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE user_second_factor
     SET turned_off_at = now(), turned_off_by = app_current_user(), turned_off_reason = 'desligada pela própria pessoa'
   WHERE user_id = app_current_user() AND turned_off_at IS NULL;
  RETURN FOUND;
END $$;

-- ------------------------------------------- quem administra a conta desliga

/**
 * Para quem perdeu o celular e os códigos de reserva. As duas perguntas de
 * toda conferência de permissão (lição da 156): o cargo administra o cargo da
 * pessoa, e a casa dela está no alcance. Motivo escrito, e a auditoria leva a
 * casa da conta.
 */
CREATE OR REPLACE FUNCTION app_desligar_segunda_etapa_de(p_user uuid, p_motivo text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_me uuid := app_current_user(); v_role role_code := app_current_role();
        v_alvo app_user%ROWTYPE; v_tem boolean; v_casa uuid;
BEGIN
  SELECT * INTO v_alvo FROM app_user WHERE id = p_user;
  IF v_alvo.id IS NULL THEN RAISE EXCEPTION 'usuario_inexistente' USING ERRCODE = 'no_data_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_role_grant WHERE creator_role = v_role AND grantable_role = v_alvo.role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_editar:%', v_alvo.role::text;
  END IF;
  SELECT tem_casa, casa INTO v_tem, v_casa FROM app_casa_da_conta_no_alcance(p_user);
  IF v_tem AND v_casa IS NULL THEN RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 15 THEN
    RAISE EXCEPTION 'motivo_curto' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE user_second_factor
     SET turned_off_at = now(), turned_off_by = v_me, turned_off_reason = btrim(p_motivo)
   WHERE user_id = p_user AND turned_off_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id, detail)
  VALUES (v_me, v_casa, 'staff.segunda_etapa_desligada', 'app_user', p_user,
          jsonb_build_object('motivo', btrim(p_motivo)));
  RETURN true;
END $$;

/**
 * Se a conta tem as duas etapas ligadas, para a lista da equipe: só a própria
 * pessoa e quem administra a conta dela (as mesmas duas perguntas de cima)
 * recebem a resposta. Para os demais, é falso.
 */
CREATE OR REPLACE FUNCTION app_segunda_etapa_ligada(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM user_second_factor
                  WHERE user_id = p_user AND confirmed_at IS NOT NULL AND turned_off_at IS NULL)
     AND (p_user = app_current_user()
          OR (EXISTS (SELECT 1 FROM staff_role_grant g JOIN app_user u ON u.id = p_user
                       WHERE g.creator_role = app_current_role() AND g.grantable_role = u.role)
              AND NOT EXISTS (SELECT 1 FROM app_casa_da_conta_no_alcance(p_user) c
                               WHERE c.tem_casa AND c.casa IS NULL)));
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'auth_segunda_etapa_de(uuid)', 'auth_criar_desafio(uuid, text)', 'auth_tentar_desafio(text)',
    'auth_gastar_desafio(uuid)', 'auth_aceitar_passo(uuid, bigint)', 'auth_usar_codigo_reserva(uuid, text)',
    'app_minha_segunda_etapa()', 'app_iniciar_segunda_etapa(text)', 'app_segunda_etapa_pendente()',
    'app_confirmar_segunda_etapa(uuid, bigint, text[])', 'app_desligar_minha_segunda_etapa()',
    'app_desligar_segunda_etapa_de(uuid, text)', 'app_segunda_etapa_ligada(uuid)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO rede_app', f);
  END LOOP;
END $$;
