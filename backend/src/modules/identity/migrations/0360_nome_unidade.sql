-- ============================================================
-- Nome da unidade — companheiro de `app_house_label`
--
-- A ATA Geral Noturna precisa listar as OITO casas com código e nome. A
-- política de `general_night_house_entry` entrega as oito de propósito
-- (cláusula OR para coordenação e técnica), mas o `JOIN house` da consulta
-- desfazia essa decisão: sobrava uma casa só, e os contadores da tela — "8 de
-- 8 confirmadas" — eram calculados sobre a lista já truncada.
--
-- Uma tela que afirma que a noite inteira está confirmada quando sete casas
-- sequer foram lidas é pior do que uma tela vazia.
-- ============================================================

CREATE OR REPLACE FUNCTION app_house_name(p_house uuid) RETURNS text AS $$
  SELECT h.name
  FROM house h
  JOIN app_user u ON u.id = app_current_user()
  WHERE h.id = p_house AND h.institution_id = u.institution_id
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_house_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_house_name(uuid) TO rede_app;
