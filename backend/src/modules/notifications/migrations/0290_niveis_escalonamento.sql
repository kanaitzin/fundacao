-- ============================================================
-- Módulo `notifications` — o vocabulário de níveis vira DADO
--
-- Até aqui, "para quem vai o aviso" estava escrito dentro de um CASE na
-- função `app_escalation_targets`. Funcionava com quatro níveis; a Fase 5
-- trouxe o Líder Noturno Geral (função transversal, sem vínculo de casa) e
-- deixou claro o problema: cada domínio novo obrigaria a editar o módulo de
-- notificações — exatamente o acoplamento que a arquitetura em partições
-- existe para evitar.
--
-- Agora o nível é uma LINHA numa tabela publicada por este módulo. Um módulo
-- novo que precise de um destinatário inédito insere a linha na sua própria
-- migração e nunca toca no código de notificações.
-- ============================================================

CREATE TABLE escalation_level (
  level       text PRIMARY KEY,
  -- Cargos avisados. Quando `transversal`, o vínculo de casa é ignorado:
  -- Enfermagem e Líder Noturno Geral cobrem as oito casas por função (§5.13).
  roles       text[] NOT NULL,
  transversal boolean NOT NULL DEFAULT false,
  descricao   text NOT NULL
);

INSERT INTO escalation_level (level, roles, transversal, descricao) VALUES
  ('equipe',              ARRAY['educador','lider_diurno'],       false, 'Equipe da casa em plantão'),
  ('lider',               ARRAY['lider_diurno'],                  false, 'Líder Diurno da casa'),
  ('tecnica_coordenacao', ARRAY['equipe_tecnica','coordenador'],  false, 'Equipe técnica e coordenação da casa'),
  ('enfermagem',          ARRAY['enfermagem'],                    true,  'Enfermagem (transversal às oito casas)'),
  ('lider_noturno',       ARRAY['lider_noturno_geral'],           true,  'Líder Noturno Geral'),
  ('gestao',              ARRAY['gestor_geral'],                  true,  'Gestor Geral — só por escalonamento humano, nunca automático (§13.2)');

ALTER TABLE escalation_level ENABLE ROW LEVEL SECURITY;
CREATE POLICY esc_level_select ON escalation_level FOR SELECT TO rede_app USING (true);
GRANT SELECT ON escalation_level TO rede_app;

-- Mesma assinatura de antes: quem chama não muda.
CREATE OR REPLACE FUNCTION app_escalation_targets(p_house uuid, p_level text)
RETURNS TABLE (user_id uuid) AS $$
  -- Cargos ligados à casa: só quem tem vínculo vigente ali.
  SELECT DISTINCT a.user_id
  FROM escalation_level n
  JOIN user_house_assignment a ON a.valid_to IS NULL AND a.house_id = p_house
  JOIN app_user u ON u.id = a.user_id AND u.active
  WHERE n.level = p_level AND NOT n.transversal
    AND u.role::text = ANY (n.roles)
  UNION
  -- Cargos transversais: entram por função, sem vínculo de casa.
  SELECT u.id
  FROM escalation_level n
  JOIN app_user u ON u.active AND u.role::text = ANY (n.roles)
  JOIN house h ON h.id = p_house AND h.institution_id = u.institution_id
  WHERE n.level = p_level AND n.transversal
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_escalation_targets(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_escalation_targets(uuid, text) TO rede_app;

-- Um nível inexistente não pode virar aviso silenciosamente perdido: o
-- comando de emissão recusa em vez de escalonar para ninguém.
CREATE OR REPLACE FUNCTION app_emit_escalation(
  p_house uuid, p_entity text, p_entity_id uuid, p_level text, p_reason text,
  p_title text, p_body text, p_priority text, p_group_key text
) RETURNS integer AS $$
DECLARE v_n integer := 0; v_user uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM escalation_level WHERE level = p_level) THEN
    RAISE EXCEPTION 'nivel_escalonamento_desconhecido:%', p_level;
  END IF;

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
