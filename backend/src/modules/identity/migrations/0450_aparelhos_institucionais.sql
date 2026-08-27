-- ============================================================
-- Aparelhos institucionais — a regra que se apoiava na palavra do cliente
--
-- O §11.7 e o cenário de aceite #15 dizem que, offline, SOMENTE o aparelho
-- institucional designado confirma medicamento. O sistema verificava isso com
-- um campo booleano `institutionalDevice` que vinha **no corpo da requisição**:
-- quem enviasse `true` passava. A regra existia no papel e no código, e não
-- existia de fato.
--
-- Agora o aparelho é uma CREDENCIAL, não uma afirmação:
--   * a coordenação registra o aparelho da casa e recebe um token, mostrado
--     UMA vez (o banco guarda só o hash — mesmo padrão das sessões, ADR-002);
--   * o aparelho envia o token na sincronização;
--   * o servidor decide, contra o registro da casa. O que o cliente afirma
--     sobre si mesmo deixa de ter efeito.
--
-- Aparelho perdido ou trocado: revoga-se: o registro não é apagado, para que
-- as confirmações feitas por ele continuem rastreáveis (§3.3).
--
-- Isto encerra a pendência institucional #7 do lado do sistema. Falta a
-- Fundação dizer quais aparelhos existem em cada casa — que agora é um
-- cadastro, não uma suposição.
-- ============================================================

CREATE TABLE institutional_device (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       uuid NOT NULL REFERENCES house(id),
  label          text NOT NULL,               -- "Tablet da Casa 03 — plantão noturno"
  token_hash     text NOT NULL UNIQUE,        -- sha256(token); o token nunca é armazenado
  active         boolean NOT NULL DEFAULT true,
  registered_by  uuid NOT NULL REFERENCES app_user(id),
  registered_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  revoked_by     uuid REFERENCES app_user(id),
  revoked_reason text,
  last_seen_at   timestamptz,
  UNIQUE (house_id, label)
);
CREATE INDEX idx_device_house ON institutional_device (house_id) WHERE active;

ALTER TABLE institutional_device ENABLE ROW LEVEL SECURITY;
-- A equipe da casa vê QUAIS aparelhos existem — é o que permite conferir se o
-- tablet em mãos é o designado. O token não está aqui: só o hash.
CREATE POLICY dev_select ON institutional_device FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));
GRANT SELECT (id, house_id, label, active, registered_by, registered_at,
              revoked_at, revoked_by, revoked_reason, last_seen_at)
  ON institutional_device TO rede_app;
-- Sem INSERT/UPDATE por escrita comum: registrar e revogar são comandos.

-- ---------- Registrar ----------
-- Comando porque gera credencial: o token é devolvido UMA vez, o banco fica
-- só com o hash, e a autorização é verificada por dentro.
CREATE OR REPLACE FUNCTION app_register_device(p_house uuid, p_label text, p_token_hash text)
RETURNS TABLE (out_id uuid) AS $$
DECLARE v_me uuid; v_id uuid;
BEGIN
  v_me := app_current_user();
  IF app_current_role() NOT IN ('coordenador','gestor_geral','admin_tecnico') THEN
    RAISE EXCEPTION 'cargo_nao_registra_aparelho';
  END IF;
  IF NOT app_house_in_scope(p_house) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF coalesce(length(btrim(p_label)), 0) < 3 THEN RAISE EXCEPTION 'rotulo_insuficiente'; END IF;

  INSERT INTO institutional_device (house_id, label, token_hash, registered_by)
  VALUES (p_house, btrim(p_label), p_token_hash, v_me)
  RETURNING id INTO v_id;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, detail)
  VALUES (p_house, v_me, 'device.register', 'institutional_device', v_id,
          jsonb_build_object('rotulo', btrim(p_label)));

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_register_device(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_register_device(uuid, text, text) TO rede_app;

CREATE OR REPLACE FUNCTION app_revoke_device(p_device uuid, p_reason text)
RETURNS TABLE (out_ok boolean) AS $$
DECLARE v_me uuid; v_house uuid;
BEGIN
  v_me := app_current_user();
  IF app_current_role() NOT IN ('coordenador','gestor_geral','admin_tecnico') THEN
    RAISE EXCEPTION 'cargo_nao_registra_aparelho';
  END IF;
  SELECT house_id INTO v_house FROM institutional_device WHERE id = p_device FOR UPDATE;
  IF v_house IS NULL OR NOT app_house_in_scope(v_house) THEN
    RAISE EXCEPTION 'aparelho_inexistente';
  END IF;

  -- Revogar, nunca apagar: as confirmações já feitas por este aparelho
  -- continuam rastreáveis até ele.
  UPDATE institutional_device
     SET active = false, revoked_at = now(), revoked_by = v_me, revoked_reason = p_reason
   WHERE id = p_device;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose)
  VALUES (v_house, v_me, 'device.revoke', 'institutional_device', p_device, p_reason);

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_revoke_device(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_revoke_device(uuid, text) TO rede_app;

-- ---------- Verificar ----------
-- O servidor decide. Devolve o id do aparelho quando o token confere com um
-- aparelho ATIVO daquela casa; NULL em qualquer outro caso.
CREATE OR REPLACE FUNCTION app_check_device(p_house uuid, p_token_hash text)
RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  IF p_token_hash IS NULL OR p_house IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM institutional_device
   WHERE house_id = p_house AND token_hash = p_token_hash AND active;
  IF v_id IS NOT NULL THEN
    UPDATE institutional_device SET last_seen_at = now() WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_check_device(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_check_device(uuid, text) TO rede_app;
