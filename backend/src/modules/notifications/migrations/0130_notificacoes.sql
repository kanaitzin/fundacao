-- ============================================================
-- Módulo `notifications` — Central de notificações e escalonamento (§19)
--
-- Tudo permanece NO SISTEMA (§3.3 proíbe WhatsApp). Push é conveniência
-- quando há internet; a central é a fonte.
--
-- Nada sensível na tela bloqueada (§19): a notificação guarda um título
-- neutro para exibição externa e o conteúdo real só dentro do app.
-- ============================================================

CREATE TABLE notification (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      uuid REFERENCES house(id),
  user_id       uuid NOT NULL REFERENCES app_user(id),
  -- Texto que PODE aparecer fora do app (tela bloqueada, push).
  -- Ex.: "Há uma atividade pendente na Rede Acolher".
  safe_title    text NOT NULL,
  -- Conteúdo real: só dentro do sistema, com sessão válida.
  title         text NOT NULL,
  body          text,
  priority      text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','alta','critica')),
  entity        text,
  entity_id     uuid,
  -- Agrupamento antiexcesso (§19): notificações do mesmo assunto se somam
  -- em vez de inundar o educador no meio do plantão.
  group_key     text,
  read_at       timestamptz,
  acknowledged_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON notification (user_id, created_at DESC);
CREATE INDEX idx_notif_unread ON notification (user_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX uq_notif_group ON notification (user_id, group_key)
  WHERE group_key IS NOT NULL AND read_at IS NULL;

-- Escalonamento idempotente e auditável (§8.5)
CREATE TABLE escalation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      uuid NOT NULL REFERENCES house(id),
  entity        text NOT NULL,
  entity_id     uuid NOT NULL,
  level         text NOT NULL,          -- 'equipe', 'tecnica_coordenacao', 'enfermagem'
  reason        text NOT NULL,
  at            timestamptz NOT NULL DEFAULT now(),
  -- A chave impede escalonar duas vezes o mesmo fato para o mesmo nível:
  -- reprocessar a fila é seguro, o que importa quando a internet oscila.
  UNIQUE (entity, entity_id, level)
);

ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
-- Notificação é pessoal: cada um vê as suas.
CREATE POLICY notif_select ON notification FOR SELECT TO rede_app USING (user_id = app_current_user());
CREATE POLICY notif_update ON notification FOR UPDATE TO rede_app
  USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user());
CREATE POLICY notif_insert ON notification FOR INSERT TO rede_app WITH CHECK (true);

ALTER TABLE escalation ENABLE ROW LEVEL SECURITY;
CREATE POLICY esc_select ON escalation FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY esc_insert ON escalation FOR INSERT TO rede_app WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON notification, escalation TO rede_app;
REVOKE DELETE ON notification, escalation FROM rede_app;

-- ---------- Destinatários de um escalonamento ----------
-- Resolve quem deve ser avisado, pelo cargo e pela casa. Fica no banco porque
-- é onde vive a matriz de vínculos — e assim o módulo de notificações não
-- precisa importar identity nem people.
CREATE OR REPLACE FUNCTION app_escalation_targets(p_house uuid, p_level text)
RETURNS TABLE (user_id uuid) AS $$
  SELECT DISTINCT a.user_id
  FROM user_house_assignment a
  JOIN app_user u ON u.id = a.user_id AND u.active
  WHERE a.valid_to IS NULL
    AND a.house_id = p_house
    AND u.role::text = ANY (
      CASE p_level
        WHEN 'tecnica_coordenacao' THEN ARRAY['equipe_tecnica','coordenador']
        WHEN 'lider' THEN ARRAY['lider_diurno']
        WHEN 'equipe' THEN ARRAY['educador','lider_diurno']
        ELSE ARRAY[]::text[]
      END)
  UNION
  -- Funções transversais não têm vínculo de casa: entram por cargo.
  SELECT u.id FROM app_user u
  WHERE u.active AND p_level = 'enfermagem' AND u.role = 'enfermagem'
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_escalation_targets(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_escalation_targets(uuid, text) TO rede_app;

-- ---------- Emissão como comando de sistema ----------
-- Notificação e escalonamento são efeitos DO SISTEMA, não escritas de um
-- usuário: nascem de um evento (atividade vencida, substituição pedida) e se
-- destinam a OUTRAS pessoas. Sob RLS, escrever "em nome de ninguém" falharia,
-- e afrouxar a política para permitir isso abriria a caixa de entrada alheia.
--
-- Por isso a emissão é um comando privilegiado, e a LEITURA continua estrita:
-- cada pessoa só enxerga as próprias notificações.
CREATE OR REPLACE FUNCTION app_emit_escalation(
  p_house uuid, p_entity text, p_entity_id uuid, p_level text, p_reason text,
  p_title text, p_body text, p_priority text, p_group_key text
) RETURNS integer AS $$
DECLARE v_novo boolean; v_n integer := 0; v_user uuid;
BEGIN
  INSERT INTO escalation (house_id, entity, entity_id, level, reason)
  VALUES (p_house, p_entity, p_entity_id, p_level, p_reason)
  ON CONFLICT (entity, entity_id, level) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN 0; END IF;   -- já escalonado: idempotente

  v_n := 0;
  FOR v_user IN SELECT t.user_id FROM app_escalation_targets(p_house, p_level) t LOOP
    INSERT INTO notification (user_id, house_id, safe_title, title, body, priority, entity, entity_id, group_key)
    VALUES (v_user, p_house, 'Há uma pendência na Rede Acolher', p_title, p_body,
            coalesce(p_priority,'normal'), p_entity, p_entity_id, p_group_key)
    ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL AND read_at IS NULL
    DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, created_at = now();
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_emit_escalation(uuid,text,uuid,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_emit_escalation(uuid,text,uuid,text,text,text,text,text,text) TO rede_app;

CREATE OR REPLACE FUNCTION app_emit_notification(
  p_user uuid, p_house uuid, p_title text, p_body text, p_priority text,
  p_entity text, p_entity_id uuid
) RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO notification (user_id, house_id, safe_title, title, body, priority, entity, entity_id)
  VALUES (p_user, p_house, 'Há uma pendência na Rede Acolher', p_title, p_body,
          coalesce(p_priority,'normal'), p_entity, p_entity_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_emit_notification(uuid,uuid,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_emit_notification(uuid,uuid,text,text,text,text,uuid) TO rede_app;
