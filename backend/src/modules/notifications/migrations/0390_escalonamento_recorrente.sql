-- ============================================================
-- O alerta que morria no segundo dia
--
-- `escalation` tinha UNIQUE (entity, entity_id, level) — SEM componente de
-- tempo. E os dois escalonamentos recorrentes do sistema usavam a CASA como
-- entidade: `medication_overdue / <casa>` e `activity_batch / <casa>`.
--
-- Consequência: na primeira vez em que uma dose atrasou na Casa 03, o aviso
-- saiu. Da segunda vez em diante — em qualquer dia, para qualquer criança,
-- para qualquer medicamento — `ON CONFLICT DO NOTHING` devolvia zero, o
-- serviço retornava `{escalonado:false}` antes mesmo de gravar auditoria, e
-- ninguém era avisado. Para sempre. A rota continuava respondendo
-- "pendentes: 2", então nem a tela denunciava.
--
-- Isso anulava o §11.3 inteiro e os cenários de aceite #13 e #14.
--
-- Duas correções, uma de cada lado:
--
--   1. AQUI: a chave passa a incluir o DIA na instituição. Reprocessar a fila
--      depois de uma queda de internet continua sendo seguro (é o que a
--      idempotência protege), mas o dia seguinte é um fato novo.
--   2. NOS MÓDULOS: o escalonamento passa a ser por DOSE e por ATIVIDADE, não
--      por casa — que é o que a chave sempre quis dizer. O agrupamento na
--      caixa de entrada continua sendo feito por `group_key`, que existe
--      exatamente para não inundar o educador.
-- ============================================================

-- Dia do escalonamento no fuso da instituição. Coluna gerada: não há como
-- gravar um valor divergente de `at`.
ALTER TABLE escalation
  ADD COLUMN on_date date
  GENERATED ALWAYS AS ((at AT TIME ZONE 'America/Sao_Paulo')::date) STORED;

ALTER TABLE escalation DROP CONSTRAINT escalation_entity_entity_id_level_key;
ALTER TABLE escalation
  ADD CONSTRAINT escalation_unica_por_dia UNIQUE (entity, entity_id, level, on_date);

CREATE INDEX idx_escalation_dia ON escalation (on_date DESC, house_id);

-- O corpo do comando não muda; muda o alvo do ON CONFLICT.
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
  ON CONFLICT (entity, entity_id, level, on_date) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN 0; END IF;   -- já escalonado HOJE: idempotente no dia

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
