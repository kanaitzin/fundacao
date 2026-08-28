-- ============================================================
-- Rede Acolher — Migração 052: a ordem em que a versão nasce
--
-- Defeito encontrado pelo teste da Fase 6, e daqueles que só aparecem no
-- caminho completo: `app_amend_followup` inseria a versão 2 ANTES de marcar a
-- versão 1 como substituída. Como o índice único garante um acompanhamento
-- por (pessoa, tipo, período) entre os não-substituídos, a inserção esbarrava
-- na própria versão anterior.
--
-- Resultado prático: **nenhuma correção de acompanhamento aprovado seria
-- possível.** A equipe técnica descobriria isso na primeira vez que
-- precisasse corrigir uma data antes de uma audiência — que é exatamente o
-- pior momento.
--
-- A correção é a ordem: primeiro a anterior sai de cena, depois a nova entra.
-- Dentro de uma transação, ninguém vê o intervalo em que não há versão vigente.
-- ============================================================

CREATE OR REPLACE FUNCTION app_amend_followup(p_followup uuid, p_motivo text)
RETURNS TABLE (novo_id uuid, versao integer) AS $$
DECLARE f record; v_novo uuid;
BEGIN
  SELECT * INTO f FROM followup WHERE id = p_followup FOR UPDATE;
  IF f IS NULL THEN
    RAISE EXCEPTION 'acompanhamento_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(f.house_id)
     OR app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF f.status <> 'aprovado' THEN
    RAISE EXCEPTION 'somente_aprovado_gera_versao' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 15 THEN
    RAISE EXCEPTION 'motivo_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  -- Primeiro a anterior sai de cena. Ela continua inteira e legível: o
  -- 'substituido' diz que existe versão mais nova, não que aquilo foi apagado.
  UPDATE followup SET status = 'substituido' WHERE id = p_followup;

  INSERT INTO followup (person_id, house_id, episode_id, kind, period_start, period_end,
                        status, axis_health, axis_school, axis_coexistence, axis_family,
                        version, supersedes_id, created_by, written_by, approval_note)
  VALUES (f.person_id, f.house_id, f.episode_id, f.kind, f.period_start, f.period_end,
          'rascunho', f.axis_health, f.axis_school, f.axis_coexistence, f.axis_family,
          f.version + 1, f.id, app_current_user(), app_current_user(),
          'Correção: ' || btrim(p_motivo))
  RETURNING id INTO v_novo;

  INSERT INTO followup_source (followup_id, entity, entity_id, origem, autor,
                               registrado_em, classificacao, escolhido_por)
  SELECT v_novo, s.entity, s.entity_id, s.origem, s.autor, s.registrado_em,
         s.classificacao, app_current_user()
    FROM followup_source s WHERE s.followup_id = p_followup;

  RETURN QUERY SELECT v_novo, f.version + 1;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
