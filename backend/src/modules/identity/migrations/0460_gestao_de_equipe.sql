-- ============================================================
-- Gestão da equipe pela coordenação (§5.3) — e o telefone institucional único
--
-- Duas coisas nesta migração, as duas vindas da conversa com o Marcelo.
--
-- 1. CADASTRO DE FUNCIONÁRIOS POR SETOR.
--    Criar conta é escrita em `app_user`, que não tem política de INSERT para
--    o papel da aplicação — e não deve ter: uma escrita genérica ali seria uma
--    porta para criar contas com qualquer cargo. Vira comando, com a regra de
--    quem pode criar o quê verificada por dentro.
--
--    A linha que a coordenação NÃO atravessa: ela não cria Gestor Geral nem
--    administração técnica. Se criasse, bastaria uma conta nova para enxergar
--    as oito casas — o isolamento do §5.13 cairia por dentro, sem precisar
--    furar nenhuma política. Enfermagem ela cria (é o pedido da Fundação, e a
--    Enfermagem é transversal por função), e cada criação dessas fica com
--    ação de auditoria própria.
--
-- 2. O TELEFONE INSTITUCIONAL É UM SÓ.
--    A resposta do Marcelo: os celulares de acesso são PESSOAIS; existe um
--    único aparelho institucional, que fica com a equipe técnica e a
--    coordenação. O registro de aparelhos nasceu por casa; passa a aceitar
--    aparelho da INSTITUIÇÃO (`house_id` nulo), que é o caso real.
--
--    Consequência honesta, registrada aqui para não se perder: com um aparelho
--    só, e ele não estando com quem faz o plantão, a confirmação de medicamento
--    OFFLINE deixa de existir na prática para o educador. Ele confirma online.
--    Isso não é um defeito do sistema — é a realidade da instituição, e é
--    melhor que a tela diga isso do que fingir uma funcionalidade que ninguém
--    consegue usar. Ver docs/pendencias-institucionais.md.
-- ============================================================

-- ---------- 1. Aparelho institucional pode ser da instituição ----------
ALTER TABLE institutional_device ALTER COLUMN house_id DROP NOT NULL;
ALTER TABLE institutional_device
  ADD COLUMN institution_id uuid REFERENCES institution(id);

-- Preenche o que já existe e passa a exigir um dos dois vínculos.
UPDATE institutional_device d
   SET institution_id = h.institution_id
  FROM house h WHERE h.id = d.house_id AND d.institution_id IS NULL;

ALTER TABLE institutional_device
  ADD CONSTRAINT aparelho_tem_dono CHECK (house_id IS NOT NULL OR institution_id IS NOT NULL);

DROP POLICY IF EXISTS dev_select ON institutional_device;
CREATE POLICY dev_select ON institutional_device FOR SELECT TO rede_app USING (
  (house_id IS NOT NULL AND app_house_in_scope(house_id))
  OR (house_id IS NULL AND EXISTS (
        SELECT 1 FROM app_user u WHERE u.id = app_current_user()
         AND u.institution_id = institutional_device.institution_id))
);

CREATE OR REPLACE FUNCTION app_register_device(p_house uuid, p_label text, p_token_hash text)
RETURNS TABLE (out_id uuid) AS $$
DECLARE v_me uuid; v_id uuid; v_inst uuid;
BEGIN
  v_me := app_current_user();
  IF app_current_role() NOT IN ('coordenador','gestor_geral','admin_tecnico') THEN
    RAISE EXCEPTION 'cargo_nao_registra_aparelho';
  END IF;
  IF coalesce(length(btrim(p_label)), 0) < 3 THEN RAISE EXCEPTION 'rotulo_insuficiente'; END IF;
  SELECT institution_id INTO v_inst FROM app_user WHERE id = v_me;

  -- Aparelho da instituição (sem casa): só o Gestor Geral registra, porque ele
  -- vale em todas as unidades.
  IF p_house IS NULL THEN
    IF app_current_role() NOT IN ('gestor_geral','admin_tecnico') THEN
      RAISE EXCEPTION 'aparelho_institucional_e_do_gestor';
    END IF;
  ELSE
    IF NOT app_house_in_scope(p_house) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  END IF;

  INSERT INTO institutional_device (house_id, institution_id, label, token_hash, registered_by)
  VALUES (p_house, v_inst, btrim(p_label), p_token_hash, v_me)
  RETURNING id INTO v_id;

  INSERT INTO audit_event (institution_id, house_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_inst, p_house, v_me, 'device.register', 'institutional_device', v_id,
          jsonb_build_object('rotulo', btrim(p_label), 'escopo',
                             CASE WHEN p_house IS NULL THEN 'instituicao' ELSE 'casa' END));

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_register_device(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_register_device(uuid, text, text) TO rede_app;

-- Verificação passa a aceitar o aparelho institucional em qualquer casa.
CREATE OR REPLACE FUNCTION app_check_device(p_house uuid, p_token_hash text)
RETURNS uuid AS $$
DECLARE v_id uuid; v_inst uuid;
BEGIN
  IF p_token_hash IS NULL THEN RETURN NULL; END IF;
  SELECT institution_id INTO v_inst FROM app_user WHERE id = app_current_user();

  SELECT id INTO v_id FROM institutional_device
   WHERE token_hash = p_token_hash AND active
     AND (house_id = p_house OR (house_id IS NULL AND institution_id = v_inst));

  IF v_id IS NOT NULL THEN
    UPDATE institutional_device SET last_seen_at = now() WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_check_device(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_check_device(uuid, text) TO rede_app;

-- ---------- 2. Quem pode criar quem ----------
-- Tabela, e não CASE dentro da função, pelo mesmo motivo dos níveis de
-- escalonamento: quando a Fundação mudar de ideia, isso é uma linha de dado.
CREATE TABLE staff_role_grant (
  creator_role role_code NOT NULL,
  grantable_role role_code NOT NULL,
  PRIMARY KEY (creator_role, grantable_role)
);

INSERT INTO staff_role_grant (creator_role, grantable_role) VALUES
  -- A coordenação monta a equipe da própria casa, e cadastra a Enfermagem.
  ('coordenador','educador'), ('coordenador','lider_diurno'),
  ('coordenador','equipe_tecnica'), ('coordenador','cozinha'),
  ('coordenador','enfermagem'),
  -- O Gestor Geral, além disso, cria coordenação, liderança noturna e TI.
  ('gestor_geral','educador'), ('gestor_geral','lider_diurno'),
  ('gestor_geral','equipe_tecnica'), ('gestor_geral','cozinha'),
  ('gestor_geral','enfermagem'), ('gestor_geral','coordenador'),
  ('gestor_geral','lider_noturno_geral'), ('gestor_geral','admin_tecnico'),
  ('gestor_geral','gestor_geral');

ALTER TABLE staff_role_grant ENABLE ROW LEVEL SECURITY;
CREATE POLICY srg_select ON staff_role_grant FOR SELECT TO rede_app USING (true);
GRANT SELECT ON staff_role_grant TO rede_app;

-- Cargos transversais não têm vínculo de casa (§5.13).
CREATE OR REPLACE FUNCTION app_role_is_transversal(p_role role_code) RETURNS boolean AS $$
  SELECT p_role IN ('gestor_geral','enfermagem','lider_noturno_geral','admin_tecnico')
$$ LANGUAGE sql IMMUTABLE;

-- ---------- 3. Criar funcionário ----------
CREATE OR REPLACE FUNCTION app_create_staff(
  p_email text, p_full_name text, p_role role_code, p_house uuid, p_password_hash text
) RETURNS TABLE (out_id uuid) AS $$
DECLARE v_me uuid; v_role role_code; v_inst uuid; v_id uuid;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT institution_id INTO v_inst FROM app_user WHERE id = v_me;

  IF NOT EXISTS (SELECT 1 FROM staff_role_grant
                 WHERE creator_role = v_role AND grantable_role = p_role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_criar:%', p_role::text;
  END IF;

  IF coalesce(length(btrim(p_full_name)), 0) < 3 THEN RAISE EXCEPTION 'nome_insuficiente'; END IF;
  IF btrim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'email_invalido';
  END IF;

  -- Cargo de casa exige casa no escopo de quem cria; transversal não leva casa.
  IF app_role_is_transversal(p_role) THEN
    p_house := NULL;
  ELSE
    IF p_house IS NULL THEN RAISE EXCEPTION 'cargo_exige_casa'; END IF;
    IF NOT app_house_in_scope(p_house) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  END IF;

  INSERT INTO app_user (institution_id, email, full_name, password_hash, role, must_change_password)
  VALUES (v_inst, lower(btrim(p_email)), btrim(p_full_name), p_password_hash, p_role, true)
  RETURNING id INTO v_id;

  IF p_house IS NOT NULL THEN
    INSERT INTO user_house_assignment (user_id, house_id, role, created_by)
    VALUES (v_id, p_house, p_role, v_me);
  END IF;

  INSERT INTO audit_event (institution_id, house_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_inst, p_house, v_me,
          CASE WHEN app_role_is_transversal(p_role)
               THEN 'staff.create_transversal' ELSE 'staff.create' END,
          'app_user', v_id,
          jsonb_build_object('cargo', p_role::text, 'transversal', app_role_is_transversal(p_role)));

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_create_staff(text, text, role_code, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_create_staff(text, text, role_code, uuid, text) TO rede_app;

-- ---------- 4. Alterar cargo, nome ou casa ----------
CREATE OR REPLACE FUNCTION app_update_staff(
  p_user uuid, p_full_name text, p_role role_code, p_house uuid
) RETURNS TABLE (out_ok boolean) AS $$
DECLARE v_me uuid; v_role role_code; v_alvo app_user%ROWTYPE; v_casa_atual uuid;
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

  SELECT house_id INTO v_casa_atual FROM user_house_assignment
   WHERE user_id = p_user AND valid_to IS NULL LIMIT 1;
  IF v_casa_atual IS NOT NULL AND NOT app_house_in_scope(v_casa_atual) THEN
    RAISE EXCEPTION 'fora_de_escopo';
  END IF;

  UPDATE app_user
     SET full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
         role = coalesce(p_role, role),
         updated_at = now()
   WHERE id = p_user;

  -- Troca de casa: o vínculo antigo é ENCERRADO, nunca apagado (§5.1).
  IF p_house IS NOT NULL AND p_house IS DISTINCT FROM v_casa_atual THEN
    IF NOT app_house_in_scope(p_house) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
    UPDATE user_house_assignment SET valid_to = now()
     WHERE user_id = p_user AND valid_to IS NULL;
    INSERT INTO user_house_assignment (user_id, house_id, role, created_by)
    VALUES (p_user, p_house, coalesce(p_role, v_alvo.role), v_me);
  END IF;

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id, detail)
  VALUES (v_me, coalesce(p_house, v_casa_atual), 'staff.update', 'app_user', p_user,
          jsonb_build_object('cargo_anterior', v_alvo.role::text,
                             'cargo_novo', coalesce(p_role, v_alvo.role)::text,
                             'mudou_de_casa', p_house IS DISTINCT FROM v_casa_atual));

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_update_staff(uuid, text, role_code, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_update_staff(uuid, text, role_code, uuid) TO rede_app;

-- ---------- 5. Desativar e reativar ----------
-- NÃO existe remover. Desligado é DESATIVADO (§3.3, §5.1): a autoria do que a
-- pessoa registrou continua atribuída a ela, e a ATA que ela assinou continua
-- assinada. Apagar a conta transformaria anos de registro em "usuário
-- desconhecido" — e este é um sistema de proteção, onde saber quem escreveu o
-- quê é metade do valor.
CREATE OR REPLACE FUNCTION app_set_staff_active(p_user uuid, p_active boolean, p_reason text)
RETURNS TABLE (out_ok boolean) AS $$
DECLARE v_me uuid; v_role role_code; v_alvo app_user%ROWTYPE; v_casa uuid;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  IF p_user = v_me THEN RAISE EXCEPTION 'nao_desativa_a_si_mesmo'; END IF;

  SELECT * INTO v_alvo FROM app_user WHERE id = p_user FOR UPDATE;
  IF v_alvo.id IS NULL THEN RAISE EXCEPTION 'usuario_inexistente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_role_grant
                 WHERE creator_role = v_role AND grantable_role = v_alvo.role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_editar:%', v_alvo.role::text;
  END IF;
  IF NOT p_active AND coalesce(length(btrim(p_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'motivo_insuficiente';
  END IF;

  SELECT house_id INTO v_casa FROM user_house_assignment
   WHERE user_id = p_user AND valid_to IS NULL LIMIT 1;
  IF v_casa IS NOT NULL AND NOT app_house_in_scope(v_casa) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;

  UPDATE app_user
     SET active = p_active,
         deactivated_at = CASE WHEN p_active THEN NULL ELSE now() END,
         deactivated_by = CASE WHEN p_active THEN NULL ELSE v_me END,
         updated_at = now()
   WHERE id = p_user;

  -- Desativar encerra as sessões abertas: o acesso acaba agora, não no logout.
  IF NOT p_active THEN
    UPDATE user_session SET revoked_at = now(), revoked_reason = 'usuario_desativado'
     WHERE user_id = p_user AND revoked_at IS NULL;
  END IF;

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id, purpose)
  VALUES (v_me, v_casa, CASE WHEN p_active THEN 'staff.reactivate' ELSE 'staff.deactivate' END,
          'app_user', p_user, nullif(btrim(coalesce(p_reason, '')), ''));

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_set_staff_active(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_set_staff_active(uuid, boolean, text) TO rede_app;

-- ---------- 6. Nova senha inicial ----------
CREATE OR REPLACE FUNCTION app_reset_staff_password(p_user uuid, p_password_hash text)
RETURNS TABLE (out_ok boolean) AS $$
DECLARE v_me uuid; v_role role_code; v_alvo app_user%ROWTYPE;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_alvo FROM app_user WHERE id = p_user FOR UPDATE;
  IF v_alvo.id IS NULL THEN RAISE EXCEPTION 'usuario_inexistente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_role_grant
                 WHERE creator_role = v_role AND grantable_role = v_alvo.role) THEN
    RAISE EXCEPTION 'cargo_nao_pode_editar:%', v_alvo.role::text;
  END IF;

  UPDATE app_user SET password_hash = p_password_hash, must_change_password = true, updated_at = now()
   WHERE id = p_user;
  -- Trocar a senha derruba as sessões: se foi por suspeita, o acesso acaba já.
  UPDATE user_session SET revoked_at = now(), revoked_reason = 'senha_redefinida'
   WHERE user_id = p_user AND revoked_at IS NULL;

  INSERT INTO audit_event (actor_id, action, entity, entity_id)
  VALUES (v_me, 'staff.reset_password', 'app_user', p_user);
  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_reset_staff_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_reset_staff_password(uuid, text) TO rede_app;

-- ---------- 7. A equipe que eu administro ----------
CREATE OR REPLACE FUNCTION app_staff_list()
RETURNS TABLE (id uuid, full_name text, email text, role text, active boolean,
               house_code text, house_id uuid, last_login timestamptz,
               must_change_password boolean, editavel boolean) AS $$
  SELECT u.id, u.full_name, u.email, u.role::text, u.active,
         app_house_label(a.house_id), a.house_id,
         (SELECT max(s.created_at) FROM user_session s WHERE s.user_id = u.id),
         u.must_change_password,
         EXISTS (SELECT 1 FROM staff_role_grant g
                 WHERE g.creator_role = app_current_role() AND g.grantable_role = u.role)
  FROM app_user u
  JOIN app_user eu ON eu.id = app_current_user()
  LEFT JOIN user_house_assignment a ON a.user_id = u.id AND a.valid_to IS NULL
  WHERE u.institution_id = eu.institution_id
    AND app_current_role() IN ('coordenador','gestor_geral','admin_tecnico')
    -- Cargo de casa: só quem está numa casa do meu escopo.
    -- Cargo transversal: aparece para quem pode administrá-lo.
    AND (
      (a.house_id IS NOT NULL AND app_house_in_scope(a.house_id))
      OR (a.house_id IS NULL AND EXISTS (
            SELECT 1 FROM staff_role_grant g
            WHERE g.creator_role = app_current_role() AND g.grantable_role = u.role))
    )
  ORDER BY u.active DESC, u.full_name
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_staff_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_staff_list() TO rede_app;
