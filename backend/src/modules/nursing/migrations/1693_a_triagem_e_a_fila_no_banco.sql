-- A TRIAGEM PELO BANCO, A CASA CONFERIDA E A FILA QUE NÃO SE LÊ (fase 297; o que a revisão do
-- banco achou depois da 1692).
--
--  1. A SITUAÇÃO DO ATENDIMENTO MUDAVA SEM TRIAGEM. A 1691 deixou à aplicação o UPDATE da
--     situação, e a política só confere o cargo: a Enfermagem reabria um atendimento
--     assinado, e o Gestor assinava sem nenhuma linha de triagem. Agora a triagem é uma
--     função (`app_triar_evolucao`): confere o cargo e o alcance, prende a linha, muda a
--     situação só a partir de uma pendente e grava a triagem, tudo junto. A aplicação não
--     escreve mais nem a situação nem a triagem.
--  2. O ATENDIMENTO ACEITAVA A CASA QUE VIESSE. A função que grava conferia só a criança: o
--     educador da Casa 03 gravava o atendimento de uma criança da Casa 03 com a casa 04, e os
--     relatórios por casa contavam errado. Agora a casa tem de estar no alcance de quem grava
--     e ser uma casa em que a criança esteve. E a versão antiga da função, de 24 parâmetros,
--     sai: ninguém a chama, e com ela a chamada curta era ambígua.
--  3. A fila sem internet e os conflitos: na `sync/1694`, que é a partição dona das tabelas.

-- 1. A triagem.
CREATE OR REPLACE FUNCTION app_triar_evolucao(p_evolution uuid, p_acao text, p_complemento text,
                                              p_nota_clinica text, p_pedido text)
RETURNS TABLE (out_resultado text, out_person uuid, out_house uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE e record; v_novo text;
BEGIN
  IF app_current_role()::text NOT IN ('enfermagem', 'gestor_geral') THEN
    RAISE EXCEPTION 'somente_enfermagem_tria' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_acao NOT IN ('assinar', 'pedir_complemento') THEN
    RAISE EXCEPTION 'acao_invalida' USING ERRCODE = 'check_violation';
  END IF;
  -- A situação lida primeiro, sem prender; o UPDATE confere que ela não mudou (fase 91):
  -- duas triagens ao mesmo tempo, uma vale e a outra volta como corrida, sem desfazer a primeira.
  SELECT id, person_id, house_id, status INTO e FROM health_evolution WHERE id = p_evolution;
  IF e.id IS NULL OR NOT app_person_in_scope(e.person_id) THEN
    RETURN QUERY SELECT 'inexistente'::text, NULL::uuid, NULL::uuid; RETURN;
  END IF;
  IF e.status NOT IN ('aguardando_triagem', 'complemento_solicitado') THEN
    RETURN QUERY SELECT 'ja_assinada'::text, e.person_id, e.house_id; RETURN;
  END IF;
  v_novo := CASE p_acao WHEN 'assinar' THEN 'assinada' ELSE 'complemento_solicitado' END;
  UPDATE health_evolution SET status = v_novo WHERE id = p_evolution AND status = e.status;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'corrida'::text, e.person_id, e.house_id; RETURN;
  END IF;
  INSERT INTO nursing_triage (evolution_id, nurse_id, complement, clinical_note, action, request_note)
  VALUES (p_evolution, app_current_user(), p_complemento, p_nota_clinica, v_novo, p_pedido);
  RETURN QUERY SELECT 'feita'::text, e.person_id, e.house_id;
END $$;
REVOKE ALL ON FUNCTION app_triar_evolucao(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_triar_evolucao(uuid, text, text, text, text) TO rede_app;

REVOKE UPDATE ON health_evolution FROM rede_app;
REVOKE INSERT ON nursing_triage FROM rede_app;

-- 2. A casa do atendimento.
CREATE OR REPLACE FUNCTION app_casa_do_atendimento_confere()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  -- Sem identidade é a semente ou a migração, como dono: não há a quem conferir.
  IF app_current_user() IS NULL THEN RETURN NEW; END IF;
  IF NOT app_house_in_scope(NEW.house_id)
     OR NOT EXISTS (SELECT 1 FROM house_stay s
                     WHERE s.person_id = NEW.person_id AND s.house_id = NEW.house_id) THEN
    RAISE EXCEPTION 'casa_nao_confere' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_casa_do_atendimento_confere() FROM PUBLIC;
CREATE TRIGGER trg_casa_da_consulta_confere BEFORE INSERT ON health_encounter
  FOR EACH ROW EXECUTE FUNCTION app_casa_do_atendimento_confere();
CREATE TRIGGER trg_casa_do_atendimento_confere BEFORE INSERT ON health_evolution
  FOR EACH ROW EXECUTE FUNCTION app_casa_do_atendimento_confere();

DROP FUNCTION app_submit_evolution(uuid, uuid, text, timestamptz, text, text, text, text, text, text,
  text, text, text, text, text, text, text, date, text, text, text, boolean, text, text);
