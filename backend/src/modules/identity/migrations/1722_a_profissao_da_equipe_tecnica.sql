-- A PROFISSÃO DE QUEM É DA EQUIPE TÉCNICA (fase 322, pedido de 14/11).
--
-- A equipe técnica tem assistente social e psicóloga, e o sistema dizia *Equipe técnica*
-- para todas. A profissão é uma coluna da conta, dita por quem administra a conta, e só
-- existe para o cargo equipe_tecnica. Ela não muda o que a pessoa faz no sistema: o
-- cargo continua decidindo. Os códigos são os de `identity/profissao.regra.ts`.

ALTER TABLE app_user ADD COLUMN profissao text
  CHECK (profissao IN ('assistente_social', 'psicologa', 'psicologo', 'psicopedagoga', 'psicopedagogo'));
ALTER TABLE app_user ADD CONSTRAINT app_user_profissao_so_da_tecnica
  CHECK (profissao IS NULL OR role = 'equipe_tecnica');

COMMENT ON COLUMN app_user.profissao IS
  'A profissão de quem é da equipe técnica (assistente social, psicóloga...). Só para o cargo equipe_tecnica; sai quando o cargo muda. Gravada por app_definir_profissao.';

-- A aplicação lê a coluna (o GRANT por coluna da 1687) e não a escreve.
GRANT SELECT (profissao) ON app_user TO rede_app;

-- Quem deixa a equipe técnica deixa a profissão: o CHECK recusaria a troca de cargo.
CREATE OR REPLACE FUNCTION app_profissao_segue_o_cargo()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM 'equipe_tecnica'::role_code THEN NEW.profissao := NULL; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_profissao_segue_o_cargo
  BEFORE INSERT OR UPDATE OF role, profissao ON app_user
  FOR EACH ROW EXECUTE FUNCTION app_profissao_segue_o_cargo();

-- Dizer a profissão: quem pode editar a conta de uma técnica (o mesmo que a
-- app_update_staff confere: o cargo que administra, e a casa da conta no alcance).
CREATE OR REPLACE FUNCTION app_definir_profissao(p_user uuid, p_profissao text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_me uuid; v_role role_code;
        v_alvo app_user%ROWTYPE; v_tem boolean; v_casa uuid;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  IF v_me IS NULL OR coalesce(v_role::text, '') = '' THEN RAISE EXCEPTION 'sem_identidade'; END IF;
  SELECT * INTO v_alvo FROM app_user WHERE id = p_user FOR UPDATE;
  IF v_alvo.id IS NULL THEN RAISE EXCEPTION 'usuario_inexistente'; END IF;
  IF v_alvo.role IS DISTINCT FROM 'equipe_tecnica'::role_code THEN
    RAISE EXCEPTION 'profissao_so_da_tecnica';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_role_grant
                  WHERE creator_role = v_role AND grantable_role = 'equipe_tecnica') THEN
    RAISE EXCEPTION 'cargo_nao_pode_editar:%', v_alvo.role::text;
  END IF;
  SELECT tem_casa, casa INTO v_tem, v_casa FROM app_casa_da_conta_no_alcance(p_user);
  IF v_tem AND v_casa IS NULL THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF v_alvo.institution_id IS DISTINCT FROM (SELECT institution_id FROM app_user WHERE id = v_me) THEN
    RAISE EXCEPTION 'fora_de_escopo';
  END IF;

  UPDATE app_user SET profissao = nullif(btrim(coalesce(p_profissao, '')), ''), updated_at = now()
   WHERE id = p_user;

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id, detail)
  VALUES (v_me, v_casa, 'staff.profissao', 'app_user', p_user,
          jsonb_build_object('antes', v_alvo.profissao, 'depois', nullif(btrim(coalesce(p_profissao, '')), '')));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION app_definir_profissao(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_definir_profissao(uuid, text) TO rede_app;

-- A profissão de outra pessoa, como o app_user_cargo (172): o JOIN em app_user volta vazio
-- para quem só lê a própria linha. Só dentro da mesma instituição.
CREATE OR REPLACE FUNCTION app_user_profissao(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT u.profissao FROM app_user u
   WHERE u.id = p_user AND u.role = 'equipe_tecnica'
     AND u.institution_id = (SELECT institution_id FROM app_user WHERE id = app_current_user())
$$;
REVOKE ALL ON FUNCTION app_user_profissao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_user_profissao(uuid) TO rede_app;
