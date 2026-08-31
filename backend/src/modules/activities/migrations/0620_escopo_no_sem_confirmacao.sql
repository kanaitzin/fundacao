-- ---------------------------------------------------------------------------
-- Defeito 1 — app_mark_unconfirmed rodava SECURITY DEFINER sem checar escopo.
--
-- SECURITY DEFINER desliga o RLS: dentro da função o banco deixa de ser a
-- última linha e passa a obedecer só ao que a função mandar. Como a casa vinha
-- por parâmetro e ninguém conferia, qualquer usuário autenticado podia passar o
-- uuid de OUTRA casa e marcar as atividades dela como "sem confirmação" — sem
-- ver a casa, sem aparecer na tela, e com efeito visível no painel do plantão
-- alheio. É o mesmo desenho dos geradores (app_generate_day, app_generate_doses),
-- que já conferem; esta função ficou de fora.
--
-- A checagem entra AQUI, não no serviço: quem chamar a função por qualquer
-- outro caminho encontra a mesma porta fechada.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_mark_unconfirmed(p_house uuid, p_minutes integer DEFAULT 60)
RETURNS integer AS $$
DECLARE n integer;
BEGIN
  IF p_house IS NULL THEN RAISE EXCEPTION 'casa_obrigatoria'; END IF;
  IF NOT app_house_in_scope(p_house) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;

  -- Marca como "sem confirmação" — NUNCA como "não realizada". A diferença é o
  -- ponto inteiro: o sistema constata ausência de registro, não afirma omissão.
  UPDATE activity SET state = 'sem_confirmacao', updated_at = now()
   WHERE house_id = p_house
     AND state IN ('agendada','aguardando_ciencia','ciente')
     AND scheduled_at < now() - (p_minutes || ' minutes')::interval;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION app_mark_unconfirmed(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_mark_unconfirmed(uuid, integer) TO rede_app;
