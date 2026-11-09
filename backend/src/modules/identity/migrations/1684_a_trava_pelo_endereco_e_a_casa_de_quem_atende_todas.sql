-- A TRAVA DE TENTATIVAS PELO ENDEREÇO, E A CASA DE QUEM ATENDE TODAS (fase 291, o A4 da
-- análise geral de 08/11).
--
-- 1. A TRAVA PELO ENDEREÇO. Até aqui, a entrada travava só pelo e-mail: cinco erros em
--    quinze minutos e a conta espera. Quem tenta UMA senha comum em muitos e-mails
--    nunca chegava a cinco em nenhum. Agora a entrada também conta quantas CONTAS
--    diferentes erraram a partir do mesmo endereço (a troca de turno de uma casa, que sai
--    para a internet por um endereço só, erra nas mesmas poucas contas); o limite fica no
--    `.env` (`LOGIN_MAX_POR_ENDERECO`). No IPv6, quem tem um endereço tem o bloco /64
--    inteiro, e o bloco conta como um endereço só. Só conta, nunca lista: a aplicação
--    continua sem ler a `login_attempt` (1190).
--
-- 2. A CASA DE QUEM ATENDE TODAS AS CASAS (o que a revisão de segurança da 289 achou).
--    O `app_update_staff` passava a conta para a Enfermagem, o gatilho da 1683 encerrava
--    o vínculo da casa, e logo depois a mesma função abria um vínculo novo com a casa que
--    a tela mandou: conta de todas as casas com casa de trabalho, na escala e na passagem
--    daquela casa. O cadastro (0460) já tirava a casa do cargo transversal; a edição
--    passa a tirar também, e o gatilho do vínculo recusa o vínculo aberto de quem atende
--    todas as casas, como segunda trava.

CREATE INDEX IF NOT EXISTS idx_login_attempt_ip_falha
  ON login_attempt (ip, at DESC) WHERE NOT success;

CREATE OR REPLACE FUNCTION auth_tentativas_do_endereco(p_ip inet, p_minutos int)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT count(DISTINCT lower(email))::int FROM login_attempt
   WHERE p_ip IS NOT NULL AND success = false
     AND at > now() - make_interval(mins => p_minutos)
     AND CASE WHEN family(p_ip) = 6 AND NOT p_ip <<= '::ffff:0:0/96'::inet
              THEN ip <<= network(set_masklen(p_ip, 64))
              ELSE ip = p_ip END;
$$;
REVOKE ALL ON FUNCTION auth_tentativas_do_endereco(inet, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_tentativas_do_endereco(inet, int) TO rede_app;

CREATE OR REPLACE FUNCTION app_update_staff(
  p_user uuid, p_full_name text, p_role role_code, p_house uuid
) RETURNS TABLE (out_ok boolean) AS $$
DECLARE v_me uuid; v_role role_code; v_alvo app_user%ROWTYPE; v_casa_atual uuid; v_casa_nova uuid;
        v_tem boolean; v_casa_ref uuid;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_alvo FROM app_user WHERE id = p_user FOR UPDATE;
  IF v_alvo.id IS NULL THEN RAISE EXCEPTION 'usuario_inexistente'; END IF;

  -- Precisa poder criar o cargo que a pessoa TEM e o que ela vai passar a ter:
  -- senão a edição vira um caminho para promover alguém a um cargo que você
  -- não poderia ter criado.
  IF NOT EXISTS (SELECT 1 FROM staff_role_grant
                 WHERE creator_role = v_role AND grantable_role = v_alvo.role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_editar:%', v_alvo.role::text;
  END IF;
  IF p_role IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM staff_role_grant WHERE creator_role = v_role AND grantable_role = p_role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_criar:%', p_role::text;
  END IF;

  -- A casa da conta, pela casa ATUAL ou, sem ela, pela ÚLTIMA (1570).
  SELECT tem_casa, casa INTO v_tem, v_casa_ref FROM app_casa_da_conta_no_alcance(p_user);
  IF v_tem AND v_casa_ref IS NULL THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  SELECT house_id INTO v_casa_atual FROM user_house_assignment
   WHERE user_id = p_user AND valid_to IS NULL AND app_house_in_scope(house_id)
   ORDER BY house_id LIMIT 1;

  UPDATE app_user
     SET full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
         role = coalesce(p_role, role),
         updated_at = now()
   WHERE id = p_user;

  -- Troca de casa: o vínculo antigo é ENCERRADO, nunca apagado (§5.1). Quem passa a
  -- atender todas as casas não ganha casa de trabalho, como no cadastro (1684); o
  -- vínculo de antes já foi encerrado pelo gatilho da 1683, no UPDATE acima.
  IF NOT app_cargo_de_toda_a_instituicao(coalesce(p_role, v_alvo.role), v_alvo.todas_as_casas) THEN
    v_casa_nova := p_house;
  END IF;
  IF v_casa_nova IS NOT NULL AND v_casa_nova IS DISTINCT FROM v_casa_atual THEN
    IF NOT app_house_in_scope(p_house) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
    UPDATE user_house_assignment SET valid_to = now()
     WHERE user_id = p_user AND valid_to IS NULL;
    INSERT INTO user_house_assignment (user_id, house_id, role, created_by)
    VALUES (p_user, p_house, coalesce(p_role, v_alvo.role), v_me);
  END IF;

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id, detail)
  VALUES (v_me, coalesce(v_casa_nova, v_casa_atual, v_casa_ref), 'staff.update', 'app_user', p_user,
          jsonb_build_object('cargo_anterior', v_alvo.role::text,
                             'cargo_novo', coalesce(p_role, v_alvo.role)::text,
                             'mudou_de_casa', v_casa_nova IS NOT NULL AND v_casa_nova IS DISTINCT FROM v_casa_atual,
                             'saiu_da_casa', v_casa_atual IS NOT NULL
                               AND app_cargo_de_toda_a_instituicao(coalesce(p_role, v_alvo.role), v_alvo.todas_as_casas)));

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_update_staff(uuid, text, role_code, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_update_staff(uuid, text, role_code, uuid) TO rede_app;

-- O gatilho do vínculo (1682), com a segunda trava: vínculo ABERTO para quem atende todas
-- as casas é recusado a quem tem identidade (a semente e as funções sem identidade seguem
-- como antes).
CREATE OR REPLACE FUNCTION app_quem_muda_o_vinculo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_me uuid := app_current_user();
BEGIN
  IF v_me IS NULL THEN RETURN NEW; END IF;
  IF NEW.user_id = v_me THEN RAISE EXCEPTION 'nao_administra_a_si_mesmo'; END IF;
  IF app_conta_de_toda_a_instituicao(NEW.user_id)
     AND NOT app_alcanca_a_instituicao_de(NEW.user_id) THEN
    RAISE EXCEPTION 'conta_de_toda_a_instituicao';
  END IF;
  IF NEW.valid_to IS NULL AND app_conta_de_toda_a_instituicao(NEW.user_id) THEN
    RAISE EXCEPTION 'vinculo_de_quem_atende_todas';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_quem_muda_o_vinculo() FROM PUBLIC;

-- O que ficou de antes: entre a 1570 e a 1683, promover alguém pela edição deixava aberto
-- o vínculo da casa, e os gatilhos só seguram o que vem daqui em diante. Encerrado, nunca
-- apagado; sem identidade, o gatilho do vínculo não interfere.
UPDATE user_house_assignment a SET valid_to = now()
  FROM app_user u
 WHERE u.id = a.user_id AND a.valid_to IS NULL
   AND app_cargo_de_toda_a_instituicao(u.role, u.todas_as_casas);
