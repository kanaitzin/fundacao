-- ============================================================
-- 1100 — A ATA Geral Noturna fecha uma vez só
--
-- Fase 90, da varredura da fase 89. Só o próprio líder assina a ATA Geral, e
-- por isso a corrida é ELE MESMO: em dois aparelhos, ou a fila offline
-- reenviando uma assinatura que já tinha subido. A função (0310) lia
-- 'rascunho' e gravava com `UPDATE … WHERE id = p_id`. O segundo fechamento,
-- liberado da trava, reescrevia as pendências e a hora da assinatura de uma
-- ATA já fechada, e a auditoria passava a registrar DOIS fechamentos. Provado
-- reprovando: ficaram as pendências do segundo e duas linhas de auditoria.
--
-- Regra 11: a leitura diz a frase certa ("inexistente", "só o autor assina",
-- "pendência exige descrição"); quem garante que é uma vez só é o
-- `UPDATE … WHERE status = 'rascunho'`. O corpo é o de 0310, com essa mudança.
-- ============================================================

CREATE OR REPLACE FUNCTION app_close_general_night_ata(p_id uuid, p_pendencies text)
RETURNS TABLE (out_status text, out_confirmed integer, out_total integer, out_open text[]) AS $$
DECLARE v_me uuid; v_g general_night_ata%ROWTYPE; v_total integer; v_conf integer;
        v_open text[]; v_status text;
BEGIN
  v_me := app_current_user();
  SELECT * INTO v_g FROM general_night_ata WHERE id = p_id;
  IF v_g.id IS NULL THEN RAISE EXCEPTION 'ata_geral_inexistente'; END IF;
  IF v_g.leader_id <> v_me THEN RAISE EXCEPTION 'apenas_o_autor_assina'; END IF;
  IF v_g.status <> 'rascunho' THEN RAISE EXCEPTION 'ata_geral_ja_fechada'; END IF;

  SELECT count(*)::int,
         count(*) FILTER (WHERE e.house_ata_confirmed)::int,
         array_agg(h.code ORDER BY h.code) FILTER (WHERE NOT e.house_ata_confirmed)
    INTO v_total, v_conf, v_open
  FROM general_night_house_entry e JOIN house h ON h.id = e.house_id
  WHERE e.general_ata_id = p_id;

  -- Faltar confirmação não impede fechar: impede fechar EM SILÊNCIO.
  v_status := CASE WHEN v_conf = v_total THEN 'fechada' ELSE 'fechada_com_pendencia' END;
  IF v_status = 'fechada_com_pendencia' AND coalesce(length(btrim(p_pendencies)),0) < 10 THEN
    RAISE EXCEPTION 'pendencia_exige_descricao';
  END IF;

  UPDATE general_night_ata
     SET status = v_status, pendencies = p_pendencies, signed_at = now()
   WHERE id = p_id
     AND status = 'rascunho';
  /* O mesmo líder fechou em outro aparelho — ou a fila reenviou — entre a
     leitura e a gravação. O primeiro fechamento fica, e a auditoria não
     registra um segundo. */
  IF NOT FOUND THEN RAISE EXCEPTION 'ata_geral_ja_fechada'; END IF;

  INSERT INTO audit_event (institution_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_g.institution_id, v_me, 'ata_geral.close', 'general_night_ata', p_id,
          jsonb_build_object('confirmadas', v_conf, 'total', v_total, 'status', v_status));

  RETURN QUERY SELECT v_status, v_conf, v_total, coalesce(v_open, ARRAY[]::text[]);
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_close_general_night_ata(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_close_general_night_ata(uuid, text) TO rede_app;
