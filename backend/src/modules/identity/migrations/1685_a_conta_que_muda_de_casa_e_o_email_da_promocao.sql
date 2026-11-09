-- A CONTA QUE MUDA DE CASA, E O E-MAIL DA PROMOÇÃO (fase 292, o resto do A4 da análise
-- geral de 08/11; a segunda parte decidida pelo dono do projeto em 09/11).
--
-- 1. A conta que muda de casa levava a senha que a casa de antes sabia. Quem cadastra ou
--    redefine a senha de uma educadora é a coordenação ou a técnica da casa dela; quando a
--    educadora passa a outra casa, a senha que a casa de antes conhecia continuava valendo
--    na casa nova. É o mesmo encerramento da 1683, agora quando a CASA muda: a senha de
--    antes deixa de valer, as sessões abertas e os convites pendentes se encerram, e a
--    senha nova sai, na mesma transação, para quem fez a mudança.
--
-- 2. O e-mail herdado. A conta promovida para atender todas as casas (Enfermagem, Líder
--    Noturno Geral, Coordenação Geral) continuava com o e-mail que a casa digitou, e o
--    esqueci minha senha e o convite iam a ele: quem tivesse aquela caixa recebia o acesso
--    às oito casas. Decidido em 09/11: na promoção, o e-mail fica A CONFIRMAR, e o Gestor
--    Geral ou a Coordenação Geral o confirmam ou trocam. Até lá, o esqueci minha senha não
--    manda nada para essa conta (a resposta da tela é a mesma de sempre, para não contar
--    que a conta existe) e o convite é recusado. A senha nova da promoção vai a quem
--    promoveu, que a entrega em mãos.

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS email_a_confirmar boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN app_user.email_a_confirmar IS
  'O e-mail veio da casa e a conta passou a atender todas as casas (fase 292): até o Gestor Geral '
  'ou a Coordenação Geral confirmar, o esqueci minha senha e o convite não vão a ele.';

-- O gatilho de quem administra a conta (1683), com o e-mail a confirmar na promoção.
CREATE OR REPLACE FUNCTION app_quem_administra_a_conta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_me uuid := app_current_user();
  v_acesso_mudou boolean;
BEGIN
  -- Sem identidade na sessão: a instalação, a semente e o primeiro acesso pelo convite.
  IF v_me IS NULL THEN RETURN NEW; END IF;

  -- Criar conta que alcança todas as casas é de quem também alcança todas (1683). O
  -- e-mail, aqui, foi digitado por quem alcança todas: nasce confirmado.
  IF TG_OP = 'INSERT' THEN
    IF app_cargo_de_toda_a_instituicao(NEW.role, NEW.todas_as_casas)
       AND NOT app_alcanca_toda_a_instituicao(NEW.institution_id) THEN
      RAISE EXCEPTION 'conta_de_toda_a_instituicao';
    END IF;
    RETURN NEW;
  END IF;

  v_acesso_mudou := NEW.role IS DISTINCT FROM OLD.role
                 OR NEW.todas_as_casas IS DISTINCT FROM OLD.todas_as_casas
                 OR NEW.active IS DISTINCT FROM OLD.active
                 OR NEW.institution_id IS DISTINCT FROM OLD.institution_id
                 OR NEW.email IS DISTINCT FROM OLD.email
                 OR NEW.email_a_confirmar IS DISTINCT FROM OLD.email_a_confirmar;

  -- Ninguém muda o próprio acesso (1681), nem confirma o próprio e-mail (1685).
  IF NEW.id = v_me THEN
    IF v_acesso_mudou THEN RAISE EXCEPTION 'nao_administra_a_si_mesmo'; END IF;
    RETURN NEW;
  END IF;

  -- A conta de quem já atende todas as casas (1681 e 1682)...
  IF (v_acesso_mudou
      OR NEW.password_hash IS DISTINCT FROM OLD.password_hash
      OR NEW.full_name IS DISTINCT FROM OLD.full_name)
     AND app_cargo_de_toda_a_instituicao(OLD.role, OLD.todas_as_casas)
     AND NOT app_alcanca_toda_a_instituicao(OLD.institution_id) THEN
    RAISE EXCEPTION 'conta_de_toda_a_instituicao';
  END IF;

  -- ... e quem passa a atender todas (1683).
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.todas_as_casas IS DISTINCT FROM OLD.todas_as_casas)
     AND app_cargo_de_toda_a_instituicao(NEW.role, NEW.todas_as_casas)
     AND NOT app_alcanca_toda_a_instituicao(NEW.institution_id) THEN
    RAISE EXCEPTION 'conta_de_toda_a_instituicao';
  END IF;

  -- A senha de antes não acompanha a conta para um cargo que quem a sabia não administra
  -- (1683), a não ser que a mesma mudança já traga a senha nova.
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.todas_as_casas IS DISTINCT FROM OLD.todas_as_casas)
     AND app_estreita_quem_administra(OLD.role, OLD.todas_as_casas, NEW.role, NEW.todas_as_casas)
     AND NEW.password_hash IS NOT DISTINCT FROM OLD.password_hash THEN
    NEW.password_hash := 'senha-encerrada-na-mudanca-de-cargo';
    NEW.must_change_password := true;
    UPDATE user_session SET revoked_at = now(), revoked_reason = 'mudanca_de_cargo'
     WHERE user_id = NEW.id AND revoked_at IS NULL;
    UPDATE user_invite SET revoked_at = now(), revoked_reason = 'mudanca_de_cargo'
     WHERE user_id = NEW.id AND used_at IS NULL AND revoked_at IS NULL;
  END IF;

  -- Quem passa a atender todas as casas deixa o vínculo da casa (encerrado, nunca apagado),
  -- e o e-mail que veio da casa fica a confirmar (1685).
  IF app_cargo_de_toda_a_instituicao(NEW.role, NEW.todas_as_casas)
     AND NOT app_cargo_de_toda_a_instituicao(OLD.role, OLD.todas_as_casas) THEN
    UPDATE user_house_assignment SET valid_to = now()
     WHERE user_id = NEW.id AND valid_to IS NULL;
    NEW.email_a_confirmar := true;
  END IF;

  -- Quem volta a ser de uma casa volta ao e-mail da casa: nada a confirmar.
  IF NOT app_cargo_de_toda_a_instituicao(NEW.role, NEW.todas_as_casas)
     AND app_cargo_de_toda_a_instituicao(OLD.role, OLD.todas_as_casas) THEN
    NEW.email_a_confirmar := false;
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_quem_administra_a_conta() FROM PUBLIC;

-- Encerra a senha, as sessões e os convites de antes (a troca de casa usa; o gatilho da
-- 1683 faz o mesmo na mudança de cargo).
CREATE OR REPLACE FUNCTION app_encerrar_o_acesso_de_antes(p_user uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE app_user SET password_hash = 'senha-encerrada-na-' || p_motivo,
                      must_change_password = true, updated_at = now()
   WHERE id = p_user;
  UPDATE user_session SET revoked_at = now(), revoked_reason = p_motivo
   WHERE user_id = p_user AND revoked_at IS NULL;
  UPDATE user_invite SET revoked_at = now(), revoked_reason = p_motivo
   WHERE user_id = p_user AND used_at IS NULL AND revoked_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION app_encerrar_o_acesso_de_antes(uuid, text) FROM PUBLIC;

-- A edição da Equipe (1684), agora encerrando o acesso de antes quando a casa muda.
CREATE OR REPLACE FUNCTION app_update_staff(
  p_user uuid, p_full_name text, p_role role_code, p_house uuid
) RETURNS TABLE (out_ok boolean) AS $$
DECLARE v_me uuid; v_role role_code; v_alvo app_user%ROWTYPE; v_casa_atual uuid; v_casa_nova uuid;
        v_tem boolean; v_casa_ref uuid; v_mudou_de_casa boolean := false;
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
    -- A senha que a casa de antes sabia não vale na casa nova (1685). Conta que nunca
    -- teve casa (a primeira casa dela) não leva senha de casa nenhuma.
    v_mudou_de_casa := coalesce(v_casa_atual, v_casa_ref) IS NOT NULL;
    IF v_mudou_de_casa THEN
      PERFORM app_encerrar_o_acesso_de_antes(p_user, 'troca_de_casa');
    END IF;
  END IF;

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id, detail)
  VALUES (v_me, coalesce(v_casa_nova, v_casa_atual, v_casa_ref), 'staff.update', 'app_user', p_user,
          jsonb_build_object('cargo_anterior', v_alvo.role::text,
                             'cargo_novo', coalesce(p_role, v_alvo.role)::text,
                             'mudou_de_casa', v_mudou_de_casa,
                             'saiu_da_casa', v_casa_atual IS NOT NULL
                               AND app_cargo_de_toda_a_instituicao(coalesce(p_role, v_alvo.role), v_alvo.todas_as_casas)));

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_update_staff(uuid, text, role_code, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_update_staff(uuid, text, role_code, uuid) TO rede_app;

-- A senha desta conta acabou de ser encerrada por uma mudança (cargo ou casa)? O servidor
-- pergunta depois da edição, na mesma transação, para redefinir e devolver a senha nova a
-- quem mudou. Só responde sobre conta que quem pergunta administra.
CREATE OR REPLACE FUNCTION app_acesso_encerrado(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce((SELECT u.password_hash LIKE 'senha-encerrada-na-%'
                     FROM app_user u
                    WHERE u.id = p_user
                      AND EXISTS (SELECT 1 FROM app_staff_list() s WHERE s.id = p_user AND s.editavel)),
                  false)
$$;
REVOKE ALL ON FUNCTION app_acesso_encerrado(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_acesso_encerrado(uuid) TO rede_app;

-- Confirmar (ou trocar) o e-mail de quem passou a atender todas as casas. Só o Gestor
-- Geral e a Coordenação Geral, e nunca o próprio. A auditoria diz se trocou, sem o e-mail.
CREATE OR REPLACE FUNCTION app_confirmar_email(p_user uuid, p_email text)
RETURNS TABLE (out_nome text, out_trocou boolean) AS $$
DECLARE v_alvo app_user%ROWTYPE; v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  SELECT * INTO v_alvo FROM app_user WHERE id = p_user FOR UPDATE;
  IF v_alvo.id IS NULL OR NOT app_alcanca_a_instituicao_de(p_user) THEN
    RAISE EXCEPTION 'usuario_inexistente';
  END IF;
  IF p_user = app_current_user() THEN RAISE EXCEPTION 'nao_administra_a_si_mesmo'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'email_invalido'; END IF;
  IF EXISTS (SELECT 1 FROM app_user WHERE lower(email) = v_email AND id <> p_user) THEN
    RAISE EXCEPTION 'email_em_uso';
  END IF;

  UPDATE app_user SET email = v_email, email_a_confirmar = false, updated_at = now()
   WHERE id = p_user;
  -- O e-mail trocado leva os convites e os pedidos de senha que iam para o antigo.
  IF v_email IS DISTINCT FROM lower(v_alvo.email) THEN
    UPDATE user_invite SET revoked_at = now(), revoked_reason = 'email_trocado'
     WHERE user_id = p_user AND used_at IS NULL AND revoked_at IS NULL;
  END IF;

  INSERT INTO audit_event (actor_id, action, entity, entity_id, detail)
  VALUES (app_current_user(), 'staff.email_confirmado', 'app_user', p_user,
          jsonb_build_object('trocou', v_email IS DISTINCT FROM lower(v_alvo.email)));
  RETURN QUERY SELECT v_alvo.full_name, v_email IS DISTINCT FROM lower(v_alvo.email);
END $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_confirmar_email(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_confirmar_email(uuid, text) TO rede_app;

-- O esqueci minha senha (1644) não manda nada para o e-mail a confirmar. A resposta da
-- tela continua a mesma: dizer que não mandou contaria que a conta existe.
CREATE OR REPLACE FUNCTION auth_pedir_nova_senha(p_email text, p_hash text, p_minutos int)
RETURNS TABLE (out_nome text, out_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_u app_user%ROWTYPE;
BEGIN
  SELECT * INTO v_u FROM app_user WHERE lower(email) = lower(btrim(coalesce(p_email, ''))) AND active;
  IF v_u.id IS NULL THEN RETURN; END IF;
  IF v_u.email_a_confirmar THEN
    INSERT INTO audit_event (actor_id, action, entity, entity_id)
    VALUES (v_u.id, 'auth.reset_email_a_confirmar', 'app_user', v_u.id);
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM user_invite
              WHERE user_id = v_u.id AND motivo = 'esqueci' AND created_at > now() - interval '2 minutes') THEN
    RETURN;
  END IF;
  UPDATE user_invite SET revoked_at = now(), revoked_reason = 'pedido novo'
   WHERE user_id = v_u.id AND motivo = 'esqueci' AND used_at IS NULL AND revoked_at IS NULL;
  INSERT INTO user_invite (user_id, token_hash, expires_at, created_by, motivo)
  VALUES (v_u.id, p_hash, now() + make_interval(mins => p_minutos), v_u.id, 'esqueci');
  INSERT INTO audit_event (actor_id, action, entity, entity_id)
  VALUES (v_u.id, 'auth.reset_requested', 'app_user', v_u.id);
  RETURN QUERY SELECT v_u.full_name, v_u.email;
END $$;
REVOKE ALL ON FUNCTION auth_pedir_nova_senha(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_pedir_nova_senha(text, text, int) TO rede_app;

-- E o convite também não sai para o e-mail a confirmar (qualquer função que o emita).
CREATE OR REPLACE FUNCTION app_convite_so_com_email_confirmado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM app_user WHERE id = NEW.user_id AND email_a_confirmar) THEN
    RAISE EXCEPTION 'email_a_confirmar';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_convite_so_com_email_confirmado() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_convite_so_com_email_confirmado ON user_invite;
CREATE TRIGGER trg_convite_so_com_email_confirmado
  BEFORE INSERT ON user_invite
  FOR EACH ROW EXECUTE FUNCTION app_convite_so_com_email_confirmado();

-- A lista da Equipe (1682) diz o e-mail a confirmar.
DROP FUNCTION IF EXISTS app_staff_list();
CREATE FUNCTION app_staff_list()
 RETURNS TABLE(id uuid, full_name text, email text, role text, active boolean, house_code text, house_id uuid, last_login timestamp with time zone, must_change_password boolean, editavel boolean, line_color text, todas_as_casas boolean, email_a_confirmar boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH quem AS (
    SELECT app_current_role() AS papel,
           (SELECT institution_id FROM app_user WHERE id = app_current_user()) AS instituicao
  ), administra AS (
    SELECT coalesce(array_agg(g.grantable_role), '{}') AS cargos
      FROM staff_role_grant g, quem WHERE g.creator_role = quem.papel
  )
  SELECT u.id, u.full_name, u.email, u.role::text, u.active,
         app_house_label(a.house_id), a.house_id,
         (SELECT s.created_at FROM user_session s WHERE s.user_id = u.id
           ORDER BY s.created_at DESC LIMIT 1),
         u.must_change_password,
         u.role = ANY (administra.cargos)
           AND (NOT app_conta_de_toda_a_instituicao(u.id) OR app_alcanca_a_instituicao_de(u.id)),
         u.line_color, u.todas_as_casas, u.email_a_confirmar
  FROM app_user u
  CROSS JOIN quem
  CROSS JOIN administra
  LEFT JOIN user_house_assignment a ON a.user_id = u.id AND a.valid_to IS NULL
  CROSS JOIN LATERAL app_casa_da_conta_no_alcance(u.id) h
  WHERE u.institution_id = quem.instituicao
    AND quem.papel IN ('coordenador','gestor_geral','equipe_tecnica')
    AND (
      (a.house_id IS NOT NULL AND app_house_in_scope(a.house_id))
      OR (a.house_id IS NULL AND (
            (h.tem_casa AND h.casa IS NOT NULL)
            OR (NOT h.tem_casa AND u.role = ANY (administra.cargos))))
    )
  ORDER BY u.full_name
$function$;
REVOKE ALL ON FUNCTION app_staff_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_staff_list() TO rede_app;
