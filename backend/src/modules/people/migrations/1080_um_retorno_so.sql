-- ============================================================
-- 1080 — Um retorno só: o segundo não sobrescreve o primeiro
--
-- Achado na verificação da fase 88, e provado reprovando antes do conserto.
--
-- A função de 1010 (mantida assim em 1060) lia o estado numa consulta e
-- gravava com `UPDATE … WHERE id = p_id`. Duas pessoas registrando a MESMA
-- chegada — a educadora na porta e o líder no celular, que é exatamente o
-- domingo às 18h — passavam as duas pela leitura, porque nenhuma ainda via o
-- retorno da outra. A segunda esperava a trava da linha e, liberada,
-- sobrescrevia a primeira: outra hora, outro "como chegou", outro "o que
-- trouxe", e OUTRO NOME em quem recebeu. As duas pessoas recebiam sucesso.
--
-- É registro fechado sobrescrito com a autoria trocada (regra 3), e é o
-- caminho que a regra 11 descreve: a leitura DIAGNOSTICA, a atomicidade mora
-- no `UPDATE … WHERE status = <esperado>`. Com o estado no WHERE, a segunda
-- gravação reavalia a linha depois da trava, não encontra mais
-- 'em_andamento', e é recusada com a mesma frase de quem chega depois.
--
-- A leitura de antes continua: é ela que diz "saída inexistente" e "retorno
-- antes da saída" com a frase certa. Quem garante que só existe um retorno é
-- o UPDATE.
-- ============================================================

CREATE OR REPLACE FUNCTION app_registrar_retorno_familiar(
  p_id uuid, p_quando timestamptz, p_nota text, p_trouxe text DEFAULT NULL)
RETURNS TABLE (encerrada boolean) AS $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM family_stay WHERE id = p_id;
  IF f IS NULL OR NOT app_house_in_scope(f.house_id) THEN
    RAISE EXCEPTION 'saida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF f.status = 'encerrada' THEN
    RAISE EXCEPTION 'retorno_ja_registrado' USING ERRCODE = 'check_violation';
  END IF;

  IF p_quando < f.started_at THEN
    RAISE EXCEPTION 'retorno_antes_da_saida' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE family_stay
     SET returned_at = p_quando,
         return_note = nullif(btrim(p_nota), ''),
         brought_back = nullif(btrim(p_trouxe), ''),
         status = 'encerrada', closed_by = app_current_user(), closed_at = now()
   WHERE id = p_id
     AND status = 'em_andamento';

  /* Outra pessoa registrou a chegada entre a leitura e a gravação. O retorno
     dela fica; o desta chamada é recusado, com a frase de sempre. */
  IF NOT FOUND THEN
    RAISE EXCEPTION 'retorno_ja_registrado' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_registrar_retorno_familiar(uuid, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_retorno_familiar(uuid, timestamptz, text, text) TO rede_app;
