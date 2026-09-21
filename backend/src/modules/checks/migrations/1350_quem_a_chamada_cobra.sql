-- =============================================================================
-- QUEM A CHAMADA COBRA — uma lista só, e não quatro.
-- =============================================================================
--
-- O DEFEITO (achado em 20/09/2026, rodando a suíte com o relógio deslocado).
--
-- Quem a chamada cobra estava escrito em QUATRO lugares, e só UM deles sabia
-- que a criança pode não estar na casa:
--
--   * `checks.service.ts`, a lista que a tela mostra — excluía quem está
--     internado (0890) e quem está em casa com a família (1010);
--   * `app_bulk_check` (0780) — não excluía;
--   * `app_confirm_check` (0440) — não excluía;
--   * `app_check_missing` (0440) — não excluía.
--
-- As três do banco nasceram ANTES da internação e da convivência familiar, e
-- ninguém voltou para lhes contar. O resultado, medido pelas rotas:
--
--   1. a conferência de mesa gravava `normal` para a criança que estava no
--      HOSPITAL — um registro dizendo que ela almoçou na casa. Silencioso: a
--      tela mostrava `faltam: 0` e o lote dizia ter marcado 20 de 19;
--   2. a chamada final NÃO FECHAVA. O fechamento cobrava pelo nome uma criança
--      que a tela se recusava a listar, e a educadora das 22h não tinha por
--      onde sair — marcar era impossível, e fechar também.
--
-- O primeiro inventa um fato sobre a criança; o segundo trava o fim do plantão.
--
-- A CORREÇÃO não é repetir as duas exclusões em três lugares — é tirar a lista
-- dos quatro e pôr num só. `app_efetivo_da_chamada` passa a ser a resposta
-- única para "de quem esta chamada trata", e as três funções e o serviço
-- passam a perguntar a ela. Uma regra nova de presença (e vai haver outra:
-- escola em turno integral, acampamento, hospital-dia) se escreve aqui dentro,
-- uma vez.
--
-- POR DIA, E NÃO POR AGORA. A chamada carrega o dia a que se refere, e é esse
-- o dia que vale: a chamada de ontem, reaberta hoje para correção, precisa
-- saber como a casa estava ONTEM. As duas funções de presença já respondiam
-- por dia (0890 e 1010) e estavam sendo chamadas sem dia — quer dizer, sempre
-- sobre hoje. Aqui elas recebem o dia da chamada.
--
-- NÃO É `SECURITY DEFINER`, de propósito. Chamada de dentro das funções que o
-- são, ela lê como dona; chamada pelo serviço, lê sob o RLS do educador — que
-- é exatamente o que a consulta em linha fazia antes. Definer aqui abriria
-- `house_stay` de outra casa para quem chamasse pelo serviço.
--
-- E AS TRÊS QUE SÃO DEFINER TRAZEM O `search_path` POR EXTENSO (§6). Não por
-- herança: `CREATE OR REPLACE FUNCTION` APAGA o `SET` que a função já tinha, e
-- as três já o tinham desde a fase 102. Redefini-las sem repetir a linha
-- desarma três funções que rodam como dona do banco, e é o
-- `arquivo-tem-saida.spec.ts` que cobra — ele lê o catálogo, não o texto da
-- migração, justamente porque quem olha só a migração que fixou não vê a que
-- redefiniu depois.

CREATE OR REPLACE FUNCTION app_efetivo_da_chamada(p_check uuid)
RETURNS TABLE (person_id uuid) LANGUAGE sql STABLE AS $$
  SELECT s.person_id
    FROM collective_check k
    JOIN house_stay s ON s.house_id = k.house_id AND s.status = 'ativa'
   WHERE k.id = p_check
     AND NOT app_esta_internado(
           s.person_id, (coalesce(k.reference_at, k.created_at) AT TIME ZONE app_fuso())::date)
     AND NOT app_em_convivencia_familiar(
           s.person_id, (coalesce(k.reference_at, k.created_at) AT TIME ZONE app_fuso())::date)
$$;
REVOKE ALL ON FUNCTION app_efetivo_da_chamada(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_efetivo_da_chamada(uuid) TO rede_app;

-- ---------- O ato da mesa (0780), agora sobre quem está na mesa ----------
CREATE OR REPLACE FUNCTION app_bulk_check(p_check uuid, p_option text)
RETURNS TABLE (bulk_id uuid, marcados integer, ja_tinham integer) AS $$
DECLARE
  v_house uuid; v_kind check_type; v_status text;
  v_bulk uuid; v_marcados integer; v_ja integer;
BEGIN
  SELECT house_id, kind, status INTO v_house, v_kind, v_status
    FROM collective_check WHERE id = p_check;
  IF v_house IS NULL THEN
    RAISE EXCEPTION 'chamada_inexistente';
  END IF;
  IF NOT app_house_in_scope(v_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_status <> 'aberta' THEN
    RAISE EXCEPTION 'chamada_confirmada';
  END IF;
  IF v_kind = 'chamada_final' THEN
    RAISE EXCEPTION 'chamada_final_e_um_a_um';
  END IF;

  -- Quem ainda NÃO tem registro nesta chamada, entre quem ela cobra. Quem já
  -- tem fica como está; quem não está na casa não é marcado por ninguém.
  SELECT count(*) INTO v_marcados
    FROM app_efetivo_da_chamada(p_check) e
   WHERE NOT EXISTS (SELECT 1 FROM check_result r
                      WHERE r.check_id = p_check AND r.person_id = e.person_id);
  IF v_marcados = 0 THEN
    RAISE EXCEPTION 'ninguem_pendente';
  END IF;

  SELECT count(*) INTO v_ja FROM check_result WHERE check_id = p_check;

  INSERT INTO check_bulk (check_id, option_code, quantos, recorded_by)
  VALUES (p_check, p_option, v_marcados, app_current_user())
  RETURNING id INTO v_bulk;

  INSERT INTO check_result (check_id, person_id, option_code, recorded_by, bulk_id)
  SELECT p_check, e.person_id, p_option, app_current_user(), v_bulk
    FROM app_efetivo_da_chamada(p_check) e
   WHERE NOT EXISTS (SELECT 1 FROM check_result r
                      WHERE r.check_id = p_check AND r.person_id = e.person_id);

  RETURN QUERY SELECT v_bulk, v_marcados, v_ja;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_bulk_check(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_bulk_check(uuid, text) TO rede_app;

-- ---------- O fechamento (0440), que travava ----------
CREATE OR REPLACE FUNCTION app_confirm_check(p_check uuid)
RETURNS TABLE (conferidos integer, esperados integer, faltam text[]) AS $$
DECLARE v_house uuid; v_conf integer; v_ativos integer; v_faltam text[];
BEGIN
  SELECT house_id INTO v_house FROM collective_check WHERE id = p_check FOR UPDATE;
  IF v_house IS NULL OR NOT app_house_in_scope(v_house) THEN
    RAISE EXCEPTION 'chamada_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Quem esta chamada cobra e ainda não foi conferido — a MESMA lista da tela.
  SELECT count(*)::int,
         array_agg(coalesce(nullif(p.social_name,''), p.full_name) ORDER BY p.full_name)
           FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM check_result r
             WHERE r.check_id = p_check AND r.person_id = p.id))
    INTO v_ativos, v_faltam
  FROM app_efetivo_da_chamada(p_check) e JOIN person p ON p.id = e.person_id;

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
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_confirm_check(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_confirm_check(uuid) TO rede_app;

-- ---------- E quem a tela diz que falta (0440) ----------
CREATE OR REPLACE FUNCTION app_check_missing(p_check uuid)
RETURNS TABLE (person_id uuid, nome text) AS $$
  SELECT p.id, coalesce(nullif(p.social_name,''), p.full_name)
  FROM collective_check k
  JOIN app_efetivo_da_chamada(k.id) e ON true
  JOIN person p ON p.id = e.person_id
  WHERE k.id = p_check
    AND app_house_in_scope(k.house_id)
    AND NOT EXISTS (SELECT 1 FROM check_result r
                    WHERE r.check_id = p_check AND r.person_id = p.id)
  ORDER BY p.full_name
$$ LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_check_missing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_check_missing(uuid) TO rede_app;
