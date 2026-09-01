-- ============================================================
-- 0770 — A ADMINISTRAÇÃO TÉCNICA DEIXA DE EXISTIR
--
-- Decidido pelo Leonardo em 31/08/2026: o cargo não existe na Fundação. O que
-- ele fazia — cadastrar contas, redefinir senha, consultar o alcance dos
-- cargos e processar a fila do arquivo — passa para a EQUIPE TÉCNICA e a
-- COORDENAÇÃO. O Gestor Geral já alcançava tudo isso.
--
-- O Líder Diurno ficou de fora, e a pergunta foi feita antes de decidir: ele é
-- função de educador, e o §16.5 diz que educador não tem acesso às pastas do
-- arquivo. Dar-lhe a fila e a senha dos colegas exigiria mudar uma regra
-- escrita; a decisão foi manter a regra.
--
-- O VALOR DO ENUM CONTINUA. Não se apaga `admin_tecnico` de `role_code`:
--
--   * a regra 6 vale para o passado. Se alguma conta ou algum registro de
--     auditoria já carrega esse cargo, apagar o valor reescreveria a história
--     de quem fez o quê;
--   * `DROP VALUE` não existe em PostgreSQL sem recriar o tipo inteiro, o que
--     obrigaria a reescrever todas as colunas que o usam.
--
-- O que muda é o ALCANCE: o cargo sai de todas as listas de permissão e deixa
-- de ser atribuível. Um cargo que não alcança nada e ninguém pode conceder
-- está aposentado — sem que nenhuma linha antiga precise mentir.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ninguém mais é cadastrado com este cargo
-- ------------------------------------------------------------
-- `staff_role_grant` é TABELA DE CONFIGURAÇÃO — diz quem pode conceder o quê.
-- Apagar linhas aqui não apaga registro de ato nenhum: é a regra de hoje, e é
-- o único lugar por onde `app_create_staff`, `app_update_staff` e
-- `app_reset_staff_password` decidem.
DELETE FROM staff_role_grant
 WHERE grantable_role = 'admin_tecnico' OR creator_role = 'admin_tecnico';

-- A equipe técnica passa a montar equipe como a coordenação. É a metade
-- "cadastra contas e redefine senha" do cargo que saiu.
INSERT INTO staff_role_grant (creator_role, grantable_role) VALUES
  ('equipe_tecnica','educador'), ('equipe_tecnica','lider_diurno'),
  ('equipe_tecnica','equipe_tecnica'), ('equipe_tecnica','cozinha'),
  ('equipe_tecnica','enfermagem')
ON CONFLICT DO NOTHING;

-- Cargos transversais não têm vínculo de casa (§5.13).
CREATE OR REPLACE FUNCTION app_role_is_transversal(p_role role_code) RETURNS boolean AS $$
  SELECT p_role IN ('gestor_geral','enfermagem','lider_noturno_geral')
$$ LANGUAGE sql IMMUTABLE;

-- ------------------------------------------------------------
-- 2. A tela Equipe
-- ------------------------------------------------------------
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
    AND app_current_role() IN ('coordenador','gestor_geral','equipe_tecnica')
    AND (
      (a.house_id IS NOT NULL AND app_house_in_scope(a.house_id))
      OR (a.house_id IS NULL AND EXISTS (
            SELECT 1 FROM staff_role_grant g
             WHERE g.creator_role = app_current_role() AND g.grantable_role = u.role))
    )
  ORDER BY u.full_name
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------
-- 3. Aparelhos institucionais
-- ------------------------------------------------------------
-- Sem tela até hoje, e agora sem o cargo que os registrava. Fica com a
-- coordenação e o Gestor Geral — o aparelho é da casa ou da instituição.
CREATE OR REPLACE FUNCTION app_register_device(p_house uuid, p_label text, p_token_hash text)
RETURNS TABLE (out_id uuid) AS $$
DECLARE v_me uuid; v_id uuid; v_inst uuid;
BEGIN
  v_me := app_current_user();
  IF app_current_role() NOT IN ('coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'cargo_nao_registra_aparelho';
  END IF;
  IF coalesce(length(btrim(p_label)), 0) < 3 THEN RAISE EXCEPTION 'rotulo_insuficiente'; END IF;
  SELECT institution_id INTO v_inst FROM app_user WHERE id = v_me;

  -- Aparelho da instituição (sem casa): só o Gestor Geral registra, porque ele
  -- vale em todas as unidades.
  IF p_house IS NULL THEN
    IF app_current_role() <> 'gestor_geral' THEN
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

CREATE OR REPLACE FUNCTION app_revoke_device(p_device uuid, p_reason text)
RETURNS TABLE (out_ok boolean) AS $$
DECLARE v_me uuid; v_house uuid;
BEGIN
  v_me := app_current_user();
  IF app_current_role() NOT IN ('coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'cargo_nao_registra_aparelho';
  END IF;
  SELECT house_id INTO v_house FROM institutional_device WHERE id = p_device FOR UPDATE;
  IF v_house IS NULL OR NOT app_house_in_scope(v_house) THEN
    RAISE EXCEPTION 'aparelho_inexistente';
  END IF;

  -- Revogar, nunca apagar: as confirmações já feitas por este aparelho
  -- continuam rastreáveis até ele.
  UPDATE institutional_device
     SET active = false, revoked_at = now(), revoked_by = v_me, revoked_reason = p_reason
   WHERE id = p_device;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose)
  VALUES (v_house, v_me, 'device.revoke', 'institutional_device', p_device, p_reason);

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 4. Arquivo documental (§16.5)
-- ------------------------------------------------------------
-- Quem alcança a fila passa a ter UM lugar só. Estava repetido em quatro
-- funções e numa policy, e é assim que uma lista fica desatualizada em três
-- delas.
CREATE OR REPLACE FUNCTION app_pode_ver_fila_arquivo() RETURNS boolean AS $$
  SELECT app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
$$ LANGUAGE sql STABLE;
GRANT EXECUTE ON FUNCTION app_pode_ver_fila_arquivo() TO rede_app;

DROP POLICY IF EXISTS arc_select ON archive_item;
CREATE POLICY arc_select ON archive_item FOR SELECT TO rede_app
  USING (
    app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
    AND (house_id IS NULL OR app_house_in_scope(house_id))
    AND (NOT area_restrita OR app_current_role() IN ('coordenador','gestor_geral'))
  );

-- A FILA e o processamento. As duas funções vêm de `0510_fila_com_escopo` e
-- são recriadas inteiras: substituir só a linha do cargo exigiria editar uma
-- migração já aplicada, e migração aplicada não se reescreve.
DROP FUNCTION IF EXISTS app_archive_queue(integer);
CREATE FUNCTION app_archive_queue(p_limite integer DEFAULT 20)
RETURNS TABLE (id uuid, caminho text, filename text, entity text, entity_id uuid,
               versao text, status text, tentativas integer, area_restrita boolean) AS $$
BEGIN
  -- Educador, líder e cozinha não têm acesso às pastas (§16.5) — nem à fila.
  IF NOT app_pode_ver_fila_arquivo() THEN
    RAISE EXCEPTION 'sem_permissao_ver_fila' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT i.id, i.caminho, i.filename, i.entity, i.entity_id, i.versao,
           i.status, i.tentativas, i.area_restrita
      FROM archive_item i
     WHERE i.status IN ('aguardando','falhou')
       AND i.tentativas < 5
       AND (i.house_id IS NULL OR app_house_in_scope(i.house_id))
       AND (NOT i.area_restrita OR app_current_role() IN ('coordenador','gestor_geral'))
     ORDER BY i.fechado_em
     LIMIT greatest(coalesce(p_limite, 20), 1);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_archive_queue(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_archive_queue(integer) TO rede_app;

-- ------------------------------------------------------------
-- 5. A ATA Geral Noturna
-- ------------------------------------------------------------
DROP POLICY IF EXISTS gna_select ON general_night_ata;
CREATE POLICY gna_select ON general_night_ata FOR SELECT TO rede_app
  USING (app_current_role() IN
         ('lider_noturno_geral','equipe_tecnica','coordenador','gestor_geral'));

-- Mover a fila. Mesma recriação, mesmo motivo.
DROP FUNCTION IF EXISTS app_archive_transition(uuid, text, text, text, text);
CREATE FUNCTION app_archive_transition(
  p_item uuid, p_para text, p_drive_id text DEFAULT NULL,
  p_sha text DEFAULT NULL, p_erro text DEFAULT NULL
) RETURNS TABLE (novo_status text, total_tentativas integer, escalar boolean) AS $$
DECLARE it record; v_ok boolean; v_tent integer;
BEGIN
  IF NOT app_pode_ver_fila_arquivo() THEN
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

-- ------------------------------------------------------------
-- 6. Acompanhamentos e relatórios
-- ------------------------------------------------------------
DROP POLICY IF EXISTS rep_select ON report_document;
CREATE POLICY rep_select ON report_document FOR SELECT TO rede_app
  USING (
    (house_id IS NULL OR app_house_in_scope(house_id))
    AND (person_id IS NULL OR app_person_in_scope(person_id))
    AND (kind <> 'beneficios' OR app_current_role() IN ('coordenador','gestor_geral'))
    AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral','enfermagem')
  );

-- ------------------------------------------------------------
-- 7. Perfil do acolhido
-- ------------------------------------------------------------
-- Era o único caso em que um cargo de infraestrutura enxergava perfil de
-- criança sem permanência ativa. Sai, e não é substituído por ninguém.
CREATE OR REPLACE FUNCTION app_person_in_scope(p uuid) RETURNS boolean AS $$
  SELECT CASE
    WHEN app_person_house(p) IS NOT NULL THEN app_house_in_scope(app_person_house(p))
    WHEN app_current_role() = 'gestor_geral' THEN true
    WHEN app_current_role() IN ('equipe_tecnica','coordenador') THEN EXISTS (
      SELECT 1 FROM house_stay s
      WHERE s.person_id = p AND app_house_in_scope(s.house_id))
    ELSE false
  END
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- As demais menções ao cargo em migrações antigas (a geração de
-- acompanhamentos, a checagem de aparelho) ficam onde estão: são listas de
-- permissão que citam um cargo que ninguém mais pode ter. Reescrevê-las
-- mudaria migração já aplicada sem mudar comportamento nenhum.

-- ------------------------------------------------------------
-- 8. Conferência: nenhuma conta ativa ficou com o cargo aposentado
-- ------------------------------------------------------------
-- Não desativa ninguém automaticamente — desligar pessoa é ato humano (§15).
-- Só avisa em voz alta na migração, para que a implantação trate o caso.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM app_user WHERE role = 'admin_tecnico' AND active;
  IF n > 0 THEN
    RAISE WARNING 'Há % conta(s) ativa(s) com o cargo aposentado admin_tecnico. '
      'Elas continuam existindo e param de alcançar as telas: a coordenação precisa '
      'trocar o cargo de cada uma, o que fica registrado com autor.', n;
  END IF;
END $$;
