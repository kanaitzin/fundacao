-- SÓ QUEM ALCANÇA TODAS AS CASAS CRIA CONTA QUE ALCANÇA TODAS (fase 289; decisão do dono
-- do projeto em 08/11, depois da revisão do banco sobre a fase 288).
--
-- A 0460 e a 0770 deram à coordenação e à técnica de uma casa (`staff_role_grant`) o
-- cadastro da Enfermagem, e quem cadastra escolhe a senha e a recebe de volta. A conta da
-- Enfermagem alcança as oito casas. Provado em 08/11, dentro de BEGIN e ROLLBACK, como o
-- papel da aplicação: a técnica da Casa 03 cadastrou uma Enfermagem com o e-mail e a senha
-- que escolheu, e com essa conta alcançava oito casas; ou redefinia a senha de um educador
-- da casa e o passava para Enfermagem. A recusa do próprio servidor já dizia que conta de
-- escopo institucional é criada pelo Gestor Geral.
--
-- Decidido em 08/11: criar conta de cargo que alcança todas as casas, ou passar alguém para
-- um desses cargos, é só do Gestor Geral e da Coordenação Geral. A regra entra no gatilho de
-- `app_user` da 1681, que agora olha também a inserção e o cargo de DEPOIS da mudança.
--
-- E a senha de antes não acompanha a conta para um cargo que quem a sabia não administra.
-- A revisão do banco provou, em BEGIN e ROLLBACK: a técnica emitiu convite para uma
-- educadora da casa, o Gestor Geral passou a educadora para Enfermagem, e o convite da
-- técnica ainda entrava na conta. E a revisão de segurança achou o mesmo pela coordenação:
-- a técnica redefine a senha de uma educadora, o Gestor Geral a passa para coordenação e a
-- marca como Coordenação Geral, e a senha da técnica administra as oito casas. A senha de
-- uma conta pode ser sabida por quem a cadastrou ou redefiniu. Quando a mudança tira a
-- conta do alcance de algum cargo que a administrava (`app_estreita_quem_administra`), a
-- senha de antes deixa de valer, as sessões abertas e os convites pendentes se encerram, e
-- a senha nova sai pela mão de quem fez a mudança (o servidor redefine na mesma transação).
-- E quem passa a atender todas as casas deixa o vínculo da casa, como quem é cadastrado
-- assim (a conta de todas as casas não tem casa).
--
-- E a pergunta *esta conta é de toda a instituição?* passa a morar numa função só
-- (`app_cargo_de_toda_a_instituicao`), lida pelo gatilho da conta, pelo do vínculo e pela
-- lista da Equipe. A lista de cargos dela é a mesma que o `app_house_in_scope` e o
-- `app_casas_no_alcance` escrevem por extenso, mais a Coordenação Geral; trocar aquelas
-- duas por esta mexe no alcance de todas as políticas e fica para outra fase. O que
-- impede as listas de divergirem é o teste: a suíte `a-conta-nao-muda-o-proprio-cargo`
-- confere, cargo por cargo, que esta função diz sim exatamente a quem o alcance dá todas
-- as casas.

CREATE OR REPLACE FUNCTION app_cargo_de_toda_a_instituicao(p_role role_code, p_todas boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(p_todas, false)
      OR p_role IN ('gestor_geral', 'enfermagem', 'lider_noturno_geral', 'admin_tecnico')
$$;
REVOKE ALL ON FUNCTION app_cargo_de_toda_a_instituicao(role_code, boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_conta_de_toda_a_instituicao(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce((SELECT app_cargo_de_toda_a_instituicao(u.role, u.todas_as_casas)
                     FROM app_user u WHERE u.id = p_user), false)
$$;

-- Quem pergunta administra as contas de toda a instituição? É o Gestor Geral ou a
-- Coordenação Geral dela, com a conta ativa: a decisão de 08/11 nomeia os dois. A pergunta
-- é pela própria conta, e não pelo alcance: a Enfermagem e o Líder Noturno Geral alcançam
-- as oito casas e não administram a equipe. Instituição nula, ou sem identidade, responde não.
CREATE OR REPLACE FUNCTION app_alcanca_toda_a_instituicao(p_inst uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_user u
     WHERE u.id = app_current_user() AND u.active AND u.institution_id = p_inst
       AND (u.role = 'gestor_geral' OR (u.role = 'coordenador' AND u.todas_as_casas)))
$$;
REVOKE ALL ON FUNCTION app_alcanca_toda_a_instituicao(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_alcanca_a_instituicao_de(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT app_alcanca_toda_a_instituicao((SELECT institution_id FROM app_user WHERE id = p_user))
$$;

-- A mudança tira a conta do alcance de algum cargo que a administrava? Passar a atender
-- todas as casas sempre tira (a casa deixa de administrar); entre cargos de uma casa, tira
-- quando algum cargo que cadastrava o de antes não cadastra o de depois (`staff_role_grant`:
-- educador para coordenação, por exemplo, que só o Gestor Geral cadastra).
CREATE OR REPLACE FUNCTION app_estreita_quem_administra(
  p_antes role_code, p_antes_todas boolean, p_depois role_code, p_depois_todas boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN app_cargo_de_toda_a_instituicao(p_antes, p_antes_todas) THEN false
    WHEN app_cargo_de_toda_a_instituicao(p_depois, p_depois_todas) THEN true
    ELSE EXISTS (
      SELECT 1 FROM staff_role_grant g
       WHERE g.grantable_role = p_antes
         AND NOT EXISTS (SELECT 1 FROM staff_role_grant g2
                          WHERE g2.creator_role = g.creator_role AND g2.grantable_role = p_depois))
  END
$$;
REVOKE ALL ON FUNCTION app_estreita_quem_administra(role_code, boolean, role_code, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_estreita_quem_administra(role_code, boolean, role_code, boolean) TO rede_app;

-- A pergunta da tela: eu administro as contas de toda a minha instituição? (a lista de
-- cargos que a Equipe oferece para cadastrar). Só pergunta sobre quem pergunta.
CREATE OR REPLACE FUNCTION app_eu_alcanco_toda_a_instituicao() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(app_alcanca_toda_a_instituicao(
    (SELECT institution_id FROM app_user WHERE id = app_current_user())), false)
$$;
REVOKE ALL ON FUNCTION app_eu_alcanco_toda_a_instituicao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_eu_alcanco_toda_a_instituicao() TO rede_app;

-- O gatilho de quem administra a conta, agora também na criação e no cargo de depois.
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

  -- Criar conta que alcança todas as casas é de quem também alcança todas (1683).
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
                 OR NEW.email IS DISTINCT FROM OLD.email;

  -- Ninguém muda o próprio acesso (1681).
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

  -- Quem passa a atender todas as casas deixa o vínculo da casa (encerrado, nunca apagado).
  IF app_cargo_de_toda_a_instituicao(NEW.role, NEW.todas_as_casas)
     AND NOT app_cargo_de_toda_a_instituicao(OLD.role, OLD.todas_as_casas) THEN
    UPDATE user_house_assignment SET valid_to = now()
     WHERE user_id = NEW.id AND valid_to IS NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_quem_administra_a_conta ON app_user;
CREATE TRIGGER trg_quem_administra_a_conta
  BEFORE INSERT OR UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION app_quem_administra_a_conta();
