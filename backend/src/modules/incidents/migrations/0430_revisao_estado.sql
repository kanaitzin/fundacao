-- ============================================================
-- A revisão técnica que fechava o que nunca foi encerrado
--
-- `app_review_incident` conferia cargo, escopo e decisão válida — e não
-- conferia o ESTADO da ocorrência. Como é SECURITY DEFINER, também escapava da
-- política `incident_update USING (... status <> 'fechada')`.
--
-- O que isso permitia:
--   * `validar` sobre uma ocorrência AINDA ABERTA fechava direto, pulando o
--     encerramento operacional que o §13.5 coloca antes da revisão. Uma
--     contenção constava fechada com `operational_closed_by` NULL: nenhum
--     líder encerrou etapa nenhuma, e o §26.2 #22 ficava sem efeito;
--   * `validar` sobre uma já fechada refechava, sobrescrevendo quem validou e
--     quando — a autoria da decisão original desaparecia;
--   * `reabrir` sobre uma aberta marcava como "reaberta" algo que jamais fechou.
--
-- Todos os comandos irmãos já checavam (`ata_ja_fechada`,
-- `transferencia_ja_decidida`, `ocorrencia_ja_fechada`). Só a revisão não.
--
-- Correção adicional: a exigência de síntese antes de fechar passa a valer
-- também para CONTENÇÃO e VIOLÊNCIA. Antes, ela só cobria saúde e medicamento,
-- justamente porque a contenção não marca nenhum dos dois — a categoria mais
-- delicada do sistema era a que podia fechar sem ninguém escrever a que se
-- chegou.
-- ============================================================

CREATE OR REPLACE FUNCTION app_review_incident(p_id uuid, p_decision text, p_note text)
RETURNS TABLE (out_status text) AS $$
DECLARE v_me uuid; v_role role_code; v_i incident%ROWTYPE; v_status text;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_i FROM incident WHERE id = p_id FOR UPDATE;
  IF v_i.id IS NULL THEN RAISE EXCEPTION 'ocorrencia_inexistente'; END IF;
  IF NOT app_house_in_scope(v_i.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF p_decision NOT IN ('validar','reabrir') THEN RAISE EXCEPTION 'decisao_invalida'; END IF;
  IF v_role NOT IN ('equipe_tecnica','coordenador') THEN RAISE EXCEPTION 'cargo_nao_revisa'; END IF;

  IF p_decision = 'reabrir' THEN
    -- Só se reabre o que está fechado ou encerrado.
    IF v_i.status NOT IN ('fechada','encerrada_operacional','aguardando_revisao_tecnica') THEN
      RAISE EXCEPTION 'ocorrencia_nao_esta_encerrada';
    END IF;
    UPDATE incident SET status = 'reaberta', reviewed_by = v_me, reviewed_at = now(),
                        closed_at = NULL
     WHERE id = p_id;
    v_status := 'reaberta';
  ELSE
    IF v_i.status = 'fechada' THEN
      RAISE EXCEPTION 'ocorrencia_ja_fechada';
    END IF;
    -- A revisão técnica vem DEPOIS do encerramento operacional (§13.5, §24).
    IF v_i.status NOT IN ('aguardando_revisao_tecnica','encerrada_operacional') THEN
      RAISE EXCEPTION 'etapa_operacional_em_aberto';
    END IF;
    -- Fechar um caso grave sem síntese seria fechar sem ninguém escrever a que
    -- se chegou. Vale para saúde, medicamento, contenção e violência.
    IF (v_i.health_related OR v_i.medication_related
        OR v_i.category IN ('contencao','violencia_ou_suspeita'))
       AND NOT EXISTS (SELECT 1 FROM incident_synthesis s WHERE s.incident_id = p_id) THEN
      RAISE EXCEPTION 'sintese_ausente';
    END IF;
    UPDATE incident SET status = 'fechada', reviewed_by = v_me, reviewed_at = now(),
                        closed_at = now()
     WHERE id = p_id;
    v_status := 'fechada';
  END IF;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose, detail)
  VALUES (v_i.house_id, v_me, 'incident.technical_review', 'incident', p_id, p_note,
          jsonb_build_object('decisao', p_decision, 'de', v_i.status, 'para', v_status));

  RETURN QUERY SELECT v_status;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_review_incident(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_review_incident(uuid, text, text) TO rede_app;

-- Mesma trava de linha no encerramento operacional.
CREATE OR REPLACE FUNCTION app_close_incident_operational(p_id uuid, p_note text)
RETURNS TABLE (out_status text, out_needs_review boolean) AS $$
DECLARE v_me uuid; v_role role_code; v_i incident%ROWTYPE; v_status text;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_i FROM incident WHERE id = p_id FOR UPDATE;
  IF v_i.id IS NULL THEN RAISE EXCEPTION 'ocorrencia_inexistente'; END IF;
  IF NOT app_house_in_scope(v_i.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF v_role NOT IN ('lider_diurno','lider_noturno_geral','equipe_tecnica','coordenador') THEN
    RAISE EXCEPTION 'cargo_nao_encerra_ocorrencia';
  END IF;
  IF v_i.status = 'fechada' THEN RAISE EXCEPTION 'ocorrencia_ja_fechada'; END IF;
  IF v_i.status IN ('encerrada_operacional','aguardando_revisao_tecnica') THEN
    RAISE EXCEPTION 'etapa_operacional_ja_encerrada';
  END IF;

  v_status := CASE WHEN v_i.requires_technical_review
                   THEN 'aguardando_revisao_tecnica' ELSE 'encerrada_operacional' END;

  UPDATE incident SET status = v_status, operational_closed_by = v_me,
                      operational_closed_at = now(),
                      pendencies = coalesce(p_note, pendencies)
   WHERE id = p_id;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_i.house_id, v_me, 'incident.close_operational', 'incident', p_id,
          jsonb_build_object('status', v_status, 'categoria', v_i.category));

  RETURN QUERY SELECT v_status, v_i.requires_technical_review;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_close_incident_operational(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_close_incident_operational(uuid, text) TO rede_app;

-- ---------- Comunicação externa: quem aprova não é quem redige ----------
-- O §13.6 lista "registrar; gerar documento; revisar/aprovar" como etapas
-- distintas. Na prática, o mesmo membro da equipe técnica que redigia o ofício
-- ao Conselho Tutelar podia aprová-lo sozinho — nem o serviço nem o gatilho
-- impediam.
--
-- Padrão protetivo, reversível (docs/pendencias-institucionais.md): quem
-- aprova precisa ser outra pessoa. Se a prática da Fundação for outra — casas
-- com uma única técnica, por exemplo —, muda-se esta função, não o fluxo.
CREATE OR REPLACE FUNCTION extcom_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'comunicacao_nao_e_apagada'; END IF;
  IF NEW.status = 'aprovado' AND OLD.status NOT IN ('rascunho','em_revisao') THEN
    RAISE EXCEPTION 'transicao_invalida:aprovacao';
  END IF;
  IF NEW.status = 'aprovado' AND NEW.approved_by IS NOT NULL
     AND NEW.approved_by = OLD.created_by THEN
    RAISE EXCEPTION 'aprovador_igual_ao_autor';
  END IF;
  IF NEW.status = 'entregue_manualmente' AND OLD.status <> 'aprovado' THEN
    RAISE EXCEPTION 'entrega_sem_aprovacao';
  END IF;
  IF OLD.status IN ('aprovado','entregue_manualmente')
     AND NEW.summary IS DISTINCT FROM OLD.summary THEN
    RAISE EXCEPTION 'conteudo_aprovado_nao_se_reescreve';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
