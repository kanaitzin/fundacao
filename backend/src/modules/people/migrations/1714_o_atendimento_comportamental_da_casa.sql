-- O ATENDIMENTO COMPORTAMENTAL DA CASA (fase 306, pedido de 10/11).
--
-- "A advertência vira atendimento comportamental da casa, um nome mais amigável que
-- envolve educar." É a conversa de quem cuida com a criança sobre o que aconteceu e o
-- combinado dali para frente, registrada como os outros atendimentos: o dia, a hora,
-- onde foi, quem conversou e o relato. Não é nota, ponto nem punição: não conta nada,
-- não compara criança com criança e não decide coisa nenhuma sozinho.

ALTER TABLE technical_session DROP CONSTRAINT IF EXISTS technical_session_area_check;
ALTER TABLE technical_session ADD CONSTRAINT technical_session_area_check
  CHECK (area IN ('psicologia','psicopedagogia','servico_social','pedagogia','comportamental','outra'));

CREATE OR REPLACE FUNCTION app_rotulo_da_area_do_atendimento(p_area text, p_outra text)
RETURNS text AS $$
  SELECT CASE p_area
    WHEN 'psicologia' THEN 'Psicologia'
    WHEN 'psicopedagogia' THEN 'Psicopedagogia'
    WHEN 'servico_social' THEN 'Assistência Social'
    WHEN 'pedagogia' THEN 'Pedagogia'
    WHEN 'comportamental' THEN 'Atendimento comportamental da casa'
    WHEN 'outra' THEN coalesce(nullif(btrim(p_outra), ''), 'Outra área')
    ELSE p_area
  END
$$ LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp;
