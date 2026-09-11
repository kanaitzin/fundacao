-- ============================================================
-- 1110 — O combinado muda de situação uma vez só
--
-- Fase 90, da varredura da fase 89. A técnica marca "cumprido" enquanto a
-- coordenação marca "revogado". A função (0840) lia 'vigente', gravava o
-- histórico e DEPOIS a situação, com `UPDATE … WHERE id = …`. As duas
-- passavam: provado reprovando, o combinado ficou 'revogado' com um histórico
-- de DUAS transições saindo de 'vigente' — uma dizendo cumprido, outra
-- revogado —, e o motivo de quem perdeu contradizendo a situação que ficou.
--
-- Duas mudanças: o estado vai para o WHERE (regra 11), e a situação é gravada
-- ANTES do histórico, para a transição que não valeu não nascer. O resto do
-- corpo é o de 0840.
-- ============================================================

CREATE OR REPLACE FUNCTION app_mudar_combinado(
  p_agreement uuid, p_status text, p_motivo text, p_substituto uuid DEFAULT NULL
) RETURNS TABLE (id uuid, status text) AS $$
DECLARE v_ag team_agreement%ROWTYPE;
BEGIN
  SELECT * INTO v_ag FROM team_agreement WHERE team_agreement.id = p_agreement;
  IF v_ag.id IS NULL THEN
    RAISE EXCEPTION 'combinado_nao_encontrado';
  END IF;
  -- Escopo PRIMEIRO, antes de qualquer leitura útil (regra 8).
  IF NOT app_house_in_scope(v_ag.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_para_mudar_combinado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('cumprido','revogado','substituido') THEN
    RAISE EXCEPTION 'situacao_invalida';
  END IF;
  IF v_ag.status <> 'vigente' THEN
    RAISE EXCEPTION 'combinado_ja_encerrado';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;

  /*
   * A SITUAÇÃO PRIMEIRO, com o estado no WHERE; o histórico depois, na mesma
   * transação. Na ordem antiga o histórico nascia antes de saber se a mudança
   * ia valer — e a mudança que perdeu a corrida deixava a transição dela no
   * histórico mesmo assim.
   */
  UPDATE team_agreement SET status = p_status, status_reason = btrim(p_motivo),
         status_by = app_current_user(), status_at = now()
   WHERE team_agreement.id = p_agreement
     AND team_agreement.status = 'vigente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'combinado_ja_encerrado';
  END IF;

  INSERT INTO agreement_change (agreement_id, house_id, before_status, after_status,
                                reason, changed_by)
  VALUES (p_agreement, v_ag.house_id, 'vigente', p_status, btrim(p_motivo),
          app_current_user());

  IF p_substituto IS NOT NULL THEN
    UPDATE team_agreement SET replaces_id = p_agreement
     WHERE team_agreement.id = p_substituto;
  END IF;

  RETURN QUERY SELECT p_agreement, p_status;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_mudar_combinado(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_mudar_combinado(uuid, text, text, uuid) TO rede_app;
