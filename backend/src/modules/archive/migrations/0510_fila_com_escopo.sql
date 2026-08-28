-- ============================================================
-- Rede Acolher — Migração 051: a fila do arquivo também tem dono
--
-- Dois defeitos encontrados pelo teste da Fase 6, ambos do mesmo tipo: nenhum
-- deles dava erro.
--
-- 1. `app_archive_queue` é SECURITY DEFINER — precisa ser, porque a fila
--    atravessa casas — e SECURITY DEFINER **ignora o RLS**. A policy
--    `arc_select` protegia a tabela e não protegia a função: o educador
--    consultando /archive/queue recebia a fila inteira, inclusive nomes de
--    arquivo da área restrita. A policy estava certa; a função é que não
--    perguntava nada. É a mesma lição das rodadas anteriores — quando uma
--    operação legítima precisa cruzar a fronteira, ela verifica a autorização
--    DENTRO, em vez de a fronteira ser afrouxada.
--
-- 2. `app_archive_transition` devolvia uma coluna chamada `tentativas`, igual
--    ao nome da coluna da tabela: dentro da função, o UPDATE ficava ambíguo.
--    Postgres reclamou alto, o que é sorte — a versão silenciosa deste erro
--    teria somado tentativa errada.
-- ============================================================

DROP FUNCTION IF EXISTS app_archive_queue(integer);
CREATE FUNCTION app_archive_queue(p_limite integer DEFAULT 20)
RETURNS TABLE (id uuid, caminho text, filename text, entity text, entity_id uuid,
               versao text, status text, tentativas integer, area_restrita boolean) AS $$
BEGIN
  -- Educador, líder e cozinha não têm acesso às pastas (§16.5) — nem à fila.
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral','admin_tecnico') THEN
    RAISE EXCEPTION 'sem_permissao_ver_fila' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT i.id, i.caminho, i.filename, i.entity, i.entity_id, i.versao,
           i.status, i.tentativas, i.area_restrita
      FROM archive_item i
     WHERE i.status IN ('aguardando','falhou')
       AND i.tentativas < 5
       -- Mesmo perímetro da policy: casa no escopo, e área restrita só para
       -- coordenação e Gestor Geral.
       AND (i.house_id IS NULL OR app_house_in_scope(i.house_id))
       AND (NOT i.area_restrita OR app_current_role() IN ('coordenador','gestor_geral'))
     ORDER BY i.fechado_em
     LIMIT greatest(coalesce(p_limite, 20), 1);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_archive_queue(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_archive_queue(integer) TO rede_app;

-- Nomes de saída sem colisão com as colunas da tabela.
DROP FUNCTION IF EXISTS app_archive_transition(uuid, text, text, text, text);
CREATE FUNCTION app_archive_transition(
  p_item uuid, p_para text, p_drive_id text DEFAULT NULL,
  p_sha text DEFAULT NULL, p_erro text DEFAULT NULL
) RETURNS TABLE (novo_status text, total_tentativas integer, escalar boolean) AS $$
DECLARE it record; v_ok boolean; v_tent integer;
BEGIN
  IF app_current_role() NOT IN ('admin_tecnico','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_mover_fila' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO it FROM archive_item WHERE archive_item.id = p_item FOR UPDATE;
  IF it IS NULL THEN
    RAISE EXCEPTION 'item_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF it.house_id IS NOT NULL AND NOT app_house_in_scope(it.house_id) THEN
    RAISE EXCEPTION 'item_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_ok := CASE
    WHEN it.status = 'aguardando' AND p_para = 'enviando' THEN true
    WHEN it.status = 'enviando'   AND p_para IN ('salvo','falhou') THEN true
    WHEN it.status = 'salvo'      AND p_para = 'verificado' THEN true
    WHEN it.status = 'falhou'     AND p_para = 'enviando' THEN true
    ELSE false
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'check_violation';
  END IF;

  v_tent := it.tentativas + CASE WHEN p_para = 'enviando' THEN 1 ELSE 0 END;

  INSERT INTO archive_attempt (item_id, de, para, erro)
  VALUES (p_item, it.status, p_para, p_erro);

  UPDATE archive_item SET
      status = p_para,
      tentativas = v_tent,
      ultimo_erro = CASE WHEN p_para = 'falhou' THEN p_erro ELSE archive_item.ultimo_erro END,
      drive_file_id = coalesce(p_drive_id, archive_item.drive_file_id),
      sha256 = coalesce(p_sha, archive_item.sha256),
      enviado_em = CASE WHEN p_para = 'salvo' THEN now() ELSE archive_item.enviado_em END,
      verificado_em = CASE WHEN p_para = 'verificado' THEN now() ELSE archive_item.verificado_em END
   WHERE archive_item.id = p_item;

  -- Três tentativas é onde "a rede oscilou" deixa de ser explicação (§16.4).
  RETURN QUERY SELECT p_para, v_tent, (p_para = 'falhou' AND v_tent >= 3);
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_archive_transition(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_archive_transition(uuid, text, text, text, text) TO rede_app;
