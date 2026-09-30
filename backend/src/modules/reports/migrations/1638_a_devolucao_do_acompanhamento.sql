-- A DEVOLUÇÃO DO ACOMPANHAMENTO (fase 181, decisão de 30/09, §10 item 1).
--
-- Quem aprova (coordenação e Gestor Geral) pode devolver para correção o
-- acompanhamento que está aguardando aprovação, com motivo escrito. O
-- acompanhamento volta a rascunho para quem redigiu, e a versão devolvida fica
-- guardada aqui, legível como estava: nada se sobrescreve sem rastro. Quem
-- redigiu não devolve o próprio texto, pelo mesmo motivo de não o aprovar.

CREATE TABLE followup_return (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id  uuid NOT NULL REFERENCES followup(id),
  house_id     uuid NOT NULL REFERENCES house(id),
  -- Os quatro eixos como estavam quando foram devolvidos, e quem os redigiu.
  eixos        jsonb NOT NULL,
  written_by   uuid REFERENCES app_user(id),
  reason       text NOT NULL CHECK (length(btrim(reason)) >= 15),
  returned_by  uuid NOT NULL REFERENCES app_user(id),
  returned_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_followup_return ON followup_return (followup_id, returned_at);

ALTER TABLE followup_return ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON followup_return TO rede_app;
-- Lê quem lê o acompanhamento: a política de followup responde por esta.
CREATE POLICY followup_return_select ON followup_return FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM followup f WHERE f.id = followup_return.followup_id));

CREATE OR REPLACE FUNCTION app_return_followup(p_followup uuid, p_reason text)
RETURNS TABLE (out_redator uuid, out_casa uuid, out_pessoa uuid, out_tipo text) AS $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM followup WHERE id = p_followup FOR UPDATE;
  IF f IS NULL THEN
    RAISE EXCEPTION 'acompanhamento_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(f.house_id) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app_current_role() NOT IN ('coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'somente_coordenacao_devolve' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF f.status <> 'em_aprovacao' THEN
    RAISE EXCEPTION 'acompanhamento_nao_esta_em_aprovacao' USING ERRCODE = 'check_violation';
  END IF;
  IF f.written_by = app_current_user() THEN
    RAISE EXCEPTION 'autor_nao_devolve_o_proprio_texto' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 15 THEN
    RAISE EXCEPTION 'motivo_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO followup_return (followup_id, house_id, eixos, written_by, reason, returned_by)
  VALUES (f.id, f.house_id,
          jsonb_build_object('saude', f.axis_health, 'escola', f.axis_school,
                             'convivencia', f.axis_coexistence, 'familia', f.axis_family),
          f.written_by, btrim(p_reason), app_current_user());

  UPDATE followup SET status = 'rascunho', submitted_at = NULL WHERE id = f.id;

  RETURN QUERY SELECT f.written_by, f.house_id, f.person_id, f.kind;
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_return_followup(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_return_followup(uuid, text) TO rede_app;
