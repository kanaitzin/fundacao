-- O ATENDIMENTO COM O LOCAL E QUEM ATENDEU (fase 284, primeira avaliação humana de
-- 05/11, módulo 08).
--
-- "Registrar nome da área/profissional, local do encontro e se o atendimento foi
-- interno ou externo." E o rótulo explícito Assistência Social, no lugar de Serviço
-- social: o código da área continua o mesmo, muda só o nome que a pessoa lê.
--
-- Os atendimentos de antes ficam sem local e sem a marca de interno ou externo: não
-- se adivinha onde foi. O profissional, quando não é quem registrou (a fono da UBS,
-- a psicóloga do CAPS), vai escrito; sem ele, quem atendeu é quem registrou.
--
-- E o arquivo que chega depois: quem registrou o atendimento pode juntar a foto ou o
-- documento que faltou, sem reescrever nada (a política da 1655 já exige que o
-- atendimento seja de quem anexa).

ALTER TABLE technical_session ADD COLUMN IF NOT EXISTS place text;
ALTER TABLE technical_session ADD COLUMN IF NOT EXISTS setting text;
ALTER TABLE technical_session ADD COLUMN IF NOT EXISTS professional text;
ALTER TABLE technical_session DROP CONSTRAINT IF EXISTS atendimento_interno_ou_externo;
ALTER TABLE technical_session ADD CONSTRAINT atendimento_interno_ou_externo
  CHECK (setting IS NULL OR setting IN ('interno','externo'));
COMMENT ON COLUMN technical_session.place IS
  'Onde foi o atendimento: a sala da casa, a UBS, o CAPS, a escola (fase 284). Nulo nos de antes.';
COMMENT ON COLUMN technical_session.setting IS
  'interno (na casa) ou externo (fora dela), fase 284. Nulo nos de antes: não se adivinha.';
COMMENT ON COLUMN technical_session.professional IS
  'Quem atendeu, quando não é quem registrou (fase 284). Sem ele, quem atendeu é quem registrou.';

CREATE OR REPLACE FUNCTION app_rotulo_da_area_do_atendimento(p_area text, p_outra text)
RETURNS text AS $$
  SELECT CASE p_area
    WHEN 'psicologia' THEN 'Psicologia'
    WHEN 'psicopedagogia' THEN 'Psicopedagogia'
    WHEN 'servico_social' THEN 'Assistência Social'
    WHEN 'pedagogia' THEN 'Pedagogia'
    WHEN 'outra' THEN coalesce(nullif(btrim(p_outra), ''), 'Outra área')
    ELSE p_area
  END
$$ LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp;
