-- O CPF INTEIRO AO TOCAR, NA PORTARIA (fase 277, decisão de 05/11).
--
-- A lista do portão mostra o CPF e o RG do visitante com os dígitos escondidos.
-- Quem confere a identidade (a portaria) e quem responde pelo cadastro (a equipe
-- técnica e a coordenação) pede o documento inteiro um visitante por vez, e o
-- servidor registra cada pedido na auditoria. Esta função devolve os números só
-- para esses três cargos, e só de visitante autorizado de criança da casa que a
-- pessoa alcança, pela mesma regra da foto do visitante.

DROP FUNCTION IF EXISTS app_cpf_do_visitante(uuid);
CREATE FUNCTION app_cpf_do_visitante(p_contact uuid)
RETURNS TABLE (cpf text, rg text, house_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_casa uuid;
BEGIN
  IF app_current_role() NOT IN ('portaria', 'equipe_tecnica', 'coordenador') THEN
    RAISE EXCEPTION 'sem_permissao_cpf_inteiro' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT s.house_id INTO v_casa FROM person_contact c
    JOIN house_stay s ON s.person_id = c.person_id AND s.status = 'ativa'
   WHERE c.id = p_contact AND c.visit_authorized AND c.active;
  IF v_casa IS NULL OR NOT app_registra_visita(v_casa) THEN
    RAISE EXCEPTION 'visitante_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN QUERY SELECT c.cpf, c.rg, v_casa FROM person_contact c WHERE c.id = p_contact;
END $$;
REVOKE ALL ON FUNCTION app_cpf_do_visitante(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cpf_do_visitante(uuid) TO rede_app;
