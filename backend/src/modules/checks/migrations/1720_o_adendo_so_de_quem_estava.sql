-- O ADENDO SÓ DE QUEM ESTAVA NA CHAMADA (fase 320; o que a revisão do banco achou na 1719).
--
-- 1. A 1719 aceitava o adendo para quem está no `app_efetivo_da_chamada`, que pergunta
--    quem está na casa HOJE. Numa chamada confirmada de março, a técnica escrevia que
--    uma criança que chegou em setembro recusou o almoço, e o registro não se apaga.
--    Agora a criança é da chamada se foi marcada nela, ou se tinha acolhimento na casa
--    da chamada no instante dela (instante contra instante, sem `::date`). A criança
--    marcada e depois transferida continua aceita: o adendo é registro da chamada da
--    casa, e só quem alcança a casa o lê.
-- 2. O cargo vai para a variável no corpo, como nas outras funções (a declaração com
--    valor escondia a variável da suíte `o-cargo-que-nao-veio-e-recusado`).
-- 3. A aplicação criava chamada direto, já confirmada e em nome de outra pessoa, sem a
--    conferência do `app_confirm_check`, e é nesse estado que o adendo confia. Abrir é
--    o `app_open_check`, e o INSERT sai do papel da aplicação, como o UPDATE saiu na 1709.

CREATE OR REPLACE FUNCTION app_adendo_da_chamada(p_check uuid, p_person uuid,
                                                p_opcao text, p_nota text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role   text;
  v_house  uuid;
  v_status text;
  v_ref    timestamptz;
  v_id     uuid;
BEGIN
  v_role := app_current_role()::text;
  IF coalesce(v_role, '') NOT IN ('equipe_tecnica', 'coordenador') THEN
    RAISE EXCEPTION 'adendo_so_tecnica_e_coordenacao' USING ERRCODE = '42501';
  END IF;

  SELECT k.house_id, k.status::text, k.reference_at INTO v_house, v_status, v_ref
    FROM collective_check k WHERE k.id = p_check;
  IF v_house IS NULL OR NOT coalesce(app_house_in_scope(v_house), false) THEN
    RAISE EXCEPTION 'chamada_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'confirmada' THEN
    RAISE EXCEPTION 'chamada_ainda_aberta' USING ERRCODE = '22023';
  END IF;

  -- A criança é da chamada: foi marcada nela, ou estava acolhida na casa no instante dela.
  IF NOT EXISTS (SELECT 1 FROM check_result r WHERE r.check_id = p_check AND r.person_id = p_person)
     AND NOT EXISTS (SELECT 1 FROM house_stay s
                      WHERE s.person_id = p_person AND s.house_id = v_house
                        AND s.started_at <= v_ref AND (s.ended_at IS NULL OR s.ended_at > v_ref)) THEN
    RAISE EXCEPTION 'crianca_fora_da_chamada' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(p_nota, ''))) < 10 THEN
    RAISE EXCEPTION 'adendo_sem_motivo' USING ERRCODE = '22023';
  END IF;

  INSERT INTO check_result_addendum (check_id, person_id, house_id, option_code, note, written_by)
  VALUES (p_check, p_person, v_house, btrim(p_opcao), btrim(p_nota), app_current_user())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION app_adendo_da_chamada(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_adendo_da_chamada(uuid, uuid, text, text) TO rede_app;

REVOKE INSERT ON collective_check FROM rede_app;
