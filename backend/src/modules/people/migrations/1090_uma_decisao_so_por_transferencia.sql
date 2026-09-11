-- ============================================================
-- 1090 — Uma decisão só sobre cada pedido de transferência
--
-- Achado na fase 89 (a mesma varredura que achou o retorno familiar, 1080) e
-- provado reprovando na fase 90, com o estrago lido de volta do banco.
--
-- `app_accept_transfer` (0410) trava o pedido com FOR UPDATE. Recusar e
-- cancelar (0330) liam o estado SEM trava e gravavam com
-- `UPDATE … WHERE id = p_transfer`. Quem chegava durante o aceite passava pela
-- leitura — o pedido ainda era 'solicitada' para ele —, esperava a trava da
-- linha e, liberado, gravava POR CIMA. O que as três corridas deixaram:
--
--   * aceite + recusa: a criança MORA no destino, o pedido diz 'devolvida', e
--     a recusa ficou registrada na auditoria das DUAS casas — a origem lê que o
--     destino recusou uma criança que já está lá;
--   * aceite + cancelamento: a criança mora no destino, e o pedido diz que a
--     origem desistiu;
--   * recusa + cancelamento: o pedido diz 'cancelada', e as duas casas guardam
--     o registro de uma recusa que o pedido não mostra.
--
-- Nenhuma das duas pessoas via erro. É a regra 11: a leitura DIAGNOSTICA — é
-- ela que diz "inexistente", "quem decide é o destino", "motivo curto" com a
-- frase certa —, e a atomicidade mora no `UPDATE … WHERE status = <esperado>`.
-- Com o estado no WHERE, a segunda gravação reavalia a linha depois da trava,
-- não encontra mais 'solicitada', e recebe a mesma frase de quem chega depois
-- de a decisão estar tomada. A auditoria da recusa vem DEPOIS do UPDATE, então
-- a recusa que não aconteceu não deixa rastro em casa nenhuma.
--
-- As assinaturas não mudam. O resto do corpo é o de 0330, sem alteração.
-- ============================================================

CREATE OR REPLACE FUNCTION app_cancel_transfer(p_transfer uuid, p_reason text)
RETURNS TABLE (out_from uuid, out_to uuid, out_person uuid) AS $$
DECLARE t transfer_request%ROWTYPE; v_me uuid;
BEGIN
  v_me := app_current_user();
  SELECT * INTO t FROM transfer_request WHERE id = p_transfer;
  IF t.id IS NULL THEN RAISE EXCEPTION 'transferencia_inexistente'; END IF;
  IF t.status <> 'solicitada' THEN RAISE EXCEPTION 'transferencia_ja_decidida'; END IF;
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(t.from_house_id) THEN
    RAISE EXCEPTION 'somente_a_origem_cancela';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 10 THEN RAISE EXCEPTION 'motivo_insuficiente'; END IF;

  UPDATE transfer_request
     SET status = 'cancelada', decided_by = v_me, decided_at = now(),
         decision_note = btrim(p_reason)
   WHERE id = p_transfer
     AND status = 'solicitada';
  /* O destino decidiu entre a leitura e a gravação. A decisão dele fica. */
  IF NOT FOUND THEN RAISE EXCEPTION 'transferencia_ja_decidida'; END IF;

  RETURN QUERY SELECT t.from_house_id, t.to_house_id, t.person_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_cancel_transfer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cancel_transfer(uuid, text) TO rede_app;

CREATE OR REPLACE FUNCTION app_decline_transfer(p_transfer uuid, p_reason text)
RETURNS TABLE (out_from uuid, out_to uuid, out_person uuid) AS $$
DECLARE t transfer_request%ROWTYPE; v_me uuid;
BEGIN
  v_me := app_current_user();
  SELECT * INTO t FROM transfer_request WHERE id = p_transfer;
  IF t.id IS NULL THEN RAISE EXCEPTION 'transferencia_inexistente'; END IF;
  IF t.status <> 'solicitada' THEN RAISE EXCEPTION 'transferencia_ja_decidida'; END IF;
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral')
     OR NOT app_house_in_scope(t.to_house_id) THEN
    RAISE EXCEPTION 'somente_o_destino_decide';
  END IF;
  -- Recusar sem dizer por quê deixaria a origem sem o que fazer com a criança.
  IF coalesce(length(btrim(p_reason)), 0) < 15 THEN RAISE EXCEPTION 'motivo_insuficiente'; END IF;

  UPDATE transfer_request
     SET status = 'devolvida', decided_by = v_me, decided_at = now(),
         decision_note = btrim(p_reason)
   WHERE id = p_transfer
     AND status = 'solicitada';
  /* Aceita ou cancelada entre a leitura e a gravação. Nada de auditoria de
     uma recusa que não aconteceu. */
  IF NOT FOUND THEN RAISE EXCEPTION 'transferencia_ja_decidida'; END IF;

  -- Um evento de auditoria para cada casa: a recusa consta nos dois lugares.
  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose)
  VALUES (t.to_house_id,   v_me, 'transfer.decline', 'transfer_request', p_transfer, btrim(p_reason)),
         (t.from_house_id, v_me, 'transfer.declined_received', 'transfer_request', p_transfer, btrim(p_reason));

  RETURN QUERY SELECT t.from_house_id, t.to_house_id, t.person_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_decline_transfer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_decline_transfer(uuid, text) TO rede_app;
