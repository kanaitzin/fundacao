-- ============================================================
-- A chamada dos 20 que fechava com 21 na casa
--
-- `expected` era fotografado na ABERTURA e a conferência era contada sobre
-- quem está ativo AGORA. Os dois números não medem a mesma coisa, e o
-- resultado eram dois defeitos opostos:
--
--   * CRIANÇA OMITIDA — a chamada final é aberta às 21h com 20 ativos
--     (`expected = 20`). Às 21h30 chega um acolhido de urgência: a casa tem 21.
--     A equipe confere os 20 que estavam na tela quando abriu. `20 >= 20` →
--     CONFIRMA. A "chamada final dos 20" fecha declarando todos conferidos,
--     com uma criança recém-chegada que ninguém olhou. É exatamente o que o
--     §10 e o cenário #10 existem para impedir.
--
--   * CHAMADA TRAVADA — a chamada do almoço abre com 20; à tarde uma
--     transferência é aceita e a criança sai. Os 20 resultados existem, mas o
--     cruzamento com permanência ativa devolve 19. `19 < 20` → incompleta,
--     para sempre. Não havia rota de reabertura nem de ajuste: a chamada ficava
--     aberta no relatório do dia sem ninguém conseguir fechá-la.
--
-- A CORREÇÃO: a conferência é medida contra o EFETIVO VIVO, não contra o
-- número congelado. Quem está ativo agora precisa ter sido conferido; quem
-- saiu no meio não trava nada, e o registro dele permanece.
--
-- `expected` continua gravado — passa a ser o que sempre deveria ter sido: um
-- dado histórico ("quantos havia quando abriu"), não a condição de fechamento.
-- ============================================================

-- A assinatura de retorno ganhou a lista de quem falta; o Postgres não troca
-- o tipo de retorno de uma função existente.
DROP FUNCTION IF EXISTS app_confirm_check(uuid);

CREATE OR REPLACE FUNCTION app_confirm_check(p_check uuid)
RETURNS TABLE (conferidos integer, esperados integer, faltam text[]) AS $$
DECLARE v_house uuid; v_conf integer; v_ativos integer; v_faltam text[];
BEGIN
  SELECT house_id INTO v_house FROM collective_check WHERE id = p_check FOR UPDATE;
  IF v_house IS NULL OR NOT app_house_in_scope(v_house) THEN
    RAISE EXCEPTION 'chamada_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Quem está ativo na casa NESTE momento e ainda não foi conferido.
  SELECT count(*)::int,
         array_agg(coalesce(nullif(p.social_name,''), p.full_name) ORDER BY p.full_name)
           FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM check_result r
             WHERE r.check_id = p_check AND r.person_id = p.id))
    INTO v_ativos, v_faltam
  FROM house_stay s JOIN person p ON p.id = s.person_id
  WHERE s.house_id = v_house AND s.status = 'ativa';

  IF v_faltam IS NOT NULL AND array_length(v_faltam, 1) > 0 THEN
    -- A mensagem nomeia quem falta: numa casa de 20, "faltam 2" sem dizer
    -- quem obriga a equipe a reconferir a lista inteira no fim do plantão.
    RAISE EXCEPTION 'conferencia_incompleta:%', array_to_string(v_faltam, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)::int INTO v_conf FROM check_result WHERE check_id = p_check;

  UPDATE collective_check SET status='confirmada', confirmed_at=now(), confirmed_by=app_current_user()
   WHERE id = p_check AND status <> 'confirmada';

  RETURN QUERY SELECT v_conf, v_ativos, coalesce(v_faltam, ARRAY[]::text[]);
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_confirm_check(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_confirm_check(uuid) TO rede_app;

-- Quem ainda falta conferir, para a tela mostrar ANTES de tentar fechar.
CREATE OR REPLACE FUNCTION app_check_missing(p_check uuid)
RETURNS TABLE (person_id uuid, nome text) AS $$
  SELECT p.id, coalesce(nullif(p.social_name,''), p.full_name)
  FROM collective_check k
  JOIN house_stay s ON s.house_id = k.house_id AND s.status = 'ativa'
  JOIN person p ON p.id = s.person_id
  WHERE k.id = p_check
    AND app_house_in_scope(k.house_id)
    AND NOT EXISTS (SELECT 1 FROM check_result r
                    WHERE r.check_id = p_check AND r.person_id = p.id)
  ORDER BY p.full_name
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_check_missing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_check_missing(uuid) TO rede_app;
