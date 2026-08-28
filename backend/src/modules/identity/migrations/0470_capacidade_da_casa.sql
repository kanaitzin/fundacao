-- ============================================================
-- Rede Acolher — Migração 047: capacidade da casa
--
-- Até aqui "cerca de 20 por unidade" era uma frase do documento. Vira número
-- da casa, com três cuidados:
--
--  1. o limite é POR CASA e começa em 20 nas oito unidades. Se um dia uma casa
--     precisar de 21, o número muda naquela casa — não no sistema inteiro;
--
--  2. mudar o limite é decisão registrada, não campo de tela: exige motivo e
--     fica com autor, data, número anterior e número novo. É o tipo de decisão
--     que um dia alguém vai precisar explicar ao Judiciário ou à vigilância;
--
--  3. a casa cheia NÃO bloqueia um acolhimento. Uma criança com guia na mão às
--     23h não pode esbarrar num CHECK. O sistema avisa que está no limite e
--     exige uma justificativa que fica registrada — quem decide é a
--     coordenação, e a decisão aparece depois no lugar certo em vez de virar
--     uma vaga fantasma na planilha.
-- ============================================================

ALTER TABLE house
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 20;

ALTER TABLE house
  DROP CONSTRAINT IF EXISTS ck_house_capacity;
ALTER TABLE house
  ADD CONSTRAINT ck_house_capacity CHECK (capacity BETWEEN 1 AND 60);

-- ---------- Histórico do limite (append-only) ----------
CREATE TABLE IF NOT EXISTS house_capacity_change (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      uuid NOT NULL REFERENCES house(id),
  from_capacity integer NOT NULL,
  to_capacity   integer NOT NULL,
  reason        text NOT NULL,
  changed_by    uuid NOT NULL REFERENCES app_user(id),
  changed_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (from_capacity <> to_capacity)
);
CREATE INDEX IF NOT EXISTS idx_capchange_house ON house_capacity_change (house_id, changed_at DESC);

ALTER TABLE house_capacity_change ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON house_capacity_change TO rede_app;

DROP POLICY IF EXISTS cap_select ON house_capacity_change;
CREATE POLICY cap_select ON house_capacity_change FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));

-- Sem policy de INSERT: só o comando de sistema abaixo escreve aqui.

-- ---------- Ocupação ----------
-- Conta permanências ativas. É SECURITY DEFINER de propósito: quem vê a
-- ocupação não passa a ver quem são as pessoas — devolve número, não lista.
DROP FUNCTION IF EXISTS app_house_occupancy(uuid);
CREATE FUNCTION app_house_occupancy(p_house uuid)
RETURNS TABLE (capacidade integer, ocupadas integer, vagas integer, acima_do_limite boolean) AS $$
DECLARE v_cap integer; v_oc integer;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT h.capacity INTO v_cap FROM house h WHERE h.id = p_house;
  SELECT count(*) INTO v_oc FROM house_stay s WHERE s.house_id = p_house AND s.status = 'ativa';
  RETURN QUERY SELECT v_cap, v_oc, greatest(v_cap - v_oc, 0), v_oc > v_cap;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_house_occupancy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_house_occupancy(uuid) TO rede_app;

-- ---------- Mudar o limite ----------
-- Coordenação muda o limite da SUA casa; Gestor Geral, de qualquer uma.
-- Reduzir abaixo da ocupação atual é permitido e não expulsa ninguém: o
-- sistema passa a mostrar a casa acima do limite, que é o fato.
DROP FUNCTION IF EXISTS app_set_house_capacity(uuid, integer, text);
CREATE FUNCTION app_set_house_capacity(p_house uuid, p_capacity integer, p_reason text)
RETURNS TABLE (capacidade integer, anterior integer) AS $$
DECLARE v_atual integer;
BEGIN
  IF app_current_role() NOT IN ('coordenador','gestor_geral')
     OR NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'sem_permissao_capacidade' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_capacity IS NULL OR p_capacity < 1 OR p_capacity > 60 THEN
    RAISE EXCEPTION 'capacidade_invalida' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 15 THEN
    RAISE EXCEPTION 'motivo_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  SELECT h.capacity INTO v_atual FROM house h WHERE h.id = p_house FOR UPDATE;
  IF v_atual IS NULL THEN
    RAISE EXCEPTION 'casa_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_atual = p_capacity THEN
    RAISE EXCEPTION 'capacidade_sem_mudanca' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE house SET capacity = p_capacity WHERE id = p_house;
  INSERT INTO house_capacity_change (house_id, from_capacity, to_capacity, reason, changed_by)
  VALUES (p_house, v_atual, p_capacity, btrim(p_reason), app_current_user());

  RETURN QUERY SELECT p_capacity, v_atual;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_set_house_capacity(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_set_house_capacity(uuid, integer, text) TO rede_app;

-- Todas as oito casas começam em 20, o número que a Fundação pratica hoje.
UPDATE house SET capacity = 20 WHERE capacity IS NULL;
