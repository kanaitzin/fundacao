-- ============================================================
-- Situação da ATA noturna de uma casa, vista da ATA Geral (§12.6)
--
-- Defeito acoplado ao `JOIN house` da ATA Geral: a subconsulta que buscava o
-- estado da ATA noturna de cada casa sofria o RLS de `ata` e voltava NULL para
-- as outras sete. O código traduzia esse NULL para "sem ATA aberta" — ou seja,
-- afirmava sobre a casa alheia um fato que não tinha como saber.
--
-- "Não existe" e "não posso ver" são coisas diferentes, e confundir as duas num
-- documento de plantão é como assinar em branco. Com esta função o valor é o
-- verdadeiro, e NULL volta a significar de fato: não há ATA noturna aberta.
--
-- O que ela devolve é o ESTADO (rascunho/fechada/…), nunca o conteúdo: o
-- Líder Noturno Geral confirma que a ATA de uma casa foi fechada; ele não lê
-- a ATA daquela casa por aqui.
-- ============================================================

CREATE OR REPLACE FUNCTION app_night_ata_status(p_house uuid, p_date date)
RETURNS text AS $$
  SELECT a.status
  FROM ata a
  JOIN app_user u ON u.id = app_current_user()
  JOIN house h ON h.id = a.house_id AND h.institution_id = u.institution_id
  WHERE a.house_id = p_house AND a.on_date = p_date AND a.period = 'noturno'
    -- Só quem tem função na ATA Geral pergunta pelo estado das outras casas.
    AND app_current_role() IN ('lider_noturno_geral','equipe_tecnica','coordenador','gestor_geral')
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_night_ata_status(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_night_ata_status(uuid, date) TO rede_app;
