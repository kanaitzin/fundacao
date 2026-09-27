-- A COZINHA RECEBE A LISTA, E O PEDIDO SE EDITA COM HISTÓRICO (fase 162).
--
-- PROMPT MESTRE de 25/09 e duas decisões do humano em 26/09:
--
--  1. "SELECIONAR TODOS" GRAVA UM PEDIDO POR CRIANÇA. Marcou doze, são doze
--     pedidos com a mesma data, quantidade e finalidade, gravados JUNTOS (tudo
--     ou nada) e ligados pelo mesmo `batch_id`. A folha da cozinha lista cada
--     nome, e cancelar o de uma criança não mexe nos outros.
--  2. EDITAR: quem pediu, a coordenação, a técnica e o líder — enquanto o
--     pedido estiver aberto e a data dele não tiver passado. Depois do dia, só
--     cancelar com motivo: a cozinha já serviu. A versão anterior fica em
--     `kitchen_request_change`, com o motivo e o autor; nada se sobrescreve sem
--     rastro.

ALTER TABLE kitchen_request ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE INDEX IF NOT EXISTS idx_pedido_em_lote ON kitchen_request (batch_id) WHERE batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS kitchen_request_change (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES kitchen_request(id),
  house_id    uuid NOT NULL REFERENCES house(id),
  before      jsonb NOT NULL,
  after       jsonb NOT NULL,
  reason      text NOT NULL CHECK (length(btrim(reason)) >= 5),
  changed_by  uuid NOT NULL REFERENCES app_user(id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mudanca_do_pedido ON kitchen_request_change (request_id, changed_at);
ALTER TABLE kitchen_request_change ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON kitchen_request_change TO rede_app;
DROP POLICY IF EXISTS krc_select ON kitchen_request_change;
CREATE POLICY krc_select ON kitchen_request_change FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));

-- ------------------------------------------------------------ pedir para várias
CREATE OR REPLACE FUNCTION app_pedir_a_cozinha_em_lote(
  p_house uuid, p_kind text, p_pessoas uuid[], p_data date, p_quantidade integer,
  p_finalidade text, p_obs text, p_entregar_a text)
RETURNS TABLE (pedido_id uuid, lote uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_lote uuid := gen_random_uuid(); v_p uuid; v_id uuid;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app_current_role() NOT IN ('educador','lider_diurno','lider_noturno_geral',
                                'equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_pedido_cozinha' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_pessoas IS NULL OR cardinality(p_pessoas) = 0 THEN
    RAISE EXCEPTION 'ninguem_marcado' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(length(btrim(p_finalidade)), 0) < 5 THEN
    RAISE EXCEPTION 'finalidade_obrigatoria' USING ERRCODE = 'check_violation';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'quantidade_invalida' USING ERRCODE = 'check_violation';
  END IF;
  -- Tudo ou nada: uma criança que não está na casa recusa o lote inteiro, e a
  -- tela diz qual — doze pedidos pela metade seriam pior que nenhum.
  FOREACH v_p IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(p_pessoas) x) LOOP
    IF NOT EXISTS (SELECT 1 FROM house_stay s
                    WHERE s.person_id = v_p AND s.house_id = p_house AND s.status = 'ativa') THEN
      RAISE EXCEPTION 'pessoa_fora_da_casa' USING ERRCODE = 'no_data_found';
    END IF;
    INSERT INTO kitchen_request (house_id, kind, person_id, on_date, quantity,
                                 purpose, notes, handover_to, requested_by, batch_id)
    VALUES (p_house, p_kind, v_p, p_data, p_quantidade, btrim(p_finalidade),
            nullif(btrim(p_obs), ''), nullif(btrim(p_entregar_a), ''), app_current_user(), v_lote)
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, v_lote;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION app_pedir_a_cozinha_em_lote(uuid, text, uuid[], date, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_pedir_a_cozinha_em_lote(uuid, text, uuid[], date, integer, text, text, text) TO rede_app;

-- ------------------------------------------------------------ editar, com o antes guardado
CREATE OR REPLACE FUNCTION app_editar_pedido_cozinha(
  p_id uuid, p_data date, p_quantidade integer, p_finalidade text, p_obs text,
  p_entregar_a text, p_motivo text)
RETURNS TABLE (editado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE r kitchen_request%ROWTYPE; v_antes jsonb; v_depois jsonb;
BEGIN
  SELECT * INTO r FROM kitchen_request WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL OR NOT app_house_in_scope(r.house_id) THEN
    RAISE EXCEPTION 'pedido_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF r.requested_by <> app_current_user()
     AND app_current_role() NOT IN ('coordenador','equipe_tecnica','lider_diurno',
                                    'lider_noturno_geral','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_editar_pedido' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status <> 'aberto' THEN RAISE EXCEPTION 'pedido_cancelado'; END IF;
  -- Até o dia do pedido, no dia da instituição (`app_hoje`, nunca current_date).
  IF r.on_date < app_hoje() THEN RAISE EXCEPTION 'pedido_passado'; END IF;
  IF p_data IS NOT NULL AND p_data < app_hoje() THEN RAISE EXCEPTION 'data_no_passado'; END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 5 THEN RAISE EXCEPTION 'motivo_obrigatorio'; END IF;
  IF p_quantidade IS NOT NULL AND p_quantidade <= 0 THEN RAISE EXCEPTION 'quantidade_invalida'; END IF;
  IF p_finalidade IS NOT NULL AND length(btrim(p_finalidade)) < 5 THEN
    RAISE EXCEPTION 'finalidade_obrigatoria';
  END IF;

  v_antes := jsonb_build_object('data', r.on_date, 'quantidade', r.quantity,
    'finalidade', r.purpose, 'observacao', r.notes, 'entregarA', r.handover_to);
  UPDATE kitchen_request
     SET on_date = coalesce(p_data, on_date),
         quantity = coalesce(p_quantidade, quantity),
         purpose = coalesce(btrim(p_finalidade), purpose),
         notes = CASE WHEN p_obs IS NULL THEN notes ELSE nullif(btrim(p_obs), '') END,
         handover_to = CASE WHEN p_entregar_a IS NULL THEN handover_to ELSE nullif(btrim(p_entregar_a), '') END
   WHERE id = p_id AND status = 'aberto'
  RETURNING jsonb_build_object('data', on_date, 'quantidade', quantity, 'finalidade', purpose,
                               'observacao', notes, 'entregarA', handover_to) INTO v_depois;
  IF v_depois = v_antes THEN RAISE EXCEPTION 'nada_mudou'; END IF;

  INSERT INTO kitchen_request_change (request_id, house_id, before, after, reason, changed_by)
  VALUES (p_id, r.house_id, v_antes, v_depois, btrim(p_motivo), app_current_user());
  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id)
  VALUES (app_current_user(), r.house_id, 'kitchen.request_edit', 'kitchen_request', p_id);
  RETURN QUERY SELECT true;
END $$;
REVOKE ALL ON FUNCTION app_editar_pedido_cozinha(uuid, date, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_editar_pedido_cozinha(uuid, date, integer, text, text, text, text) TO rede_app;
