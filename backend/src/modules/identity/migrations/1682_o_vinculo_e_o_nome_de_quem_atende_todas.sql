-- O VÍNCULO E O NOME DE QUEM ATENDE TODAS AS CASAS (fase 288; o que a revisão do banco
-- achou depois da 1681).
--
-- A 1681 pôs num gatilho de `app_user` quem administra cada conta. Ficaram de fora duas
-- coisas, provadas em 08/11 dentro de BEGIN e ROLLBACK, como o papel da aplicação:
--
-- 1. O VÍNCULO DE CASA. `app_update_staff` grava a casa em `user_house_assignment`, que o
--    gatilho de `app_user` não vê: a coordenação da Casa 04 vinculou a Enfermagem à Casa 04
--    (e trocou o nome dela), e a conta passou a constar como da equipe da casa, na escala e
--    na passagem. O vínculo ganha o mesmo gatilho: ninguém muda as próprias casas, e a
--    casa de quem atende todas só é mudada por quem também alcança todas.
-- 2. O NOME. `full_name` entra na metade do gatilho de `app_user` que protege a conta de
--    quem atende todas as casas. O nome de quem é da própria equipe continua corrigível
--    pela coordenação da casa, como sempre.
--
-- E a tela: a lista da Equipe (`app_staff_list`) marcava como `editavel` a Enfermagem e o
-- Líder Noturno Geral para a coordenação de uma casa, e mostrava Editar, Convidar, Nova
-- senha e Desativar que o servidor passou a recusar. `editavel` passa a fazer a mesma
-- pergunta do gatilho.
--
-- Quem alcança a instituição inteira, na prática, é o Gestor Geral e a Coordenação Geral:
-- a Enfermagem e o Líder Noturno Geral também alcançam, mas a `staff_role_grant` não lhes
-- dá conta de ninguém para administrar.
--
-- Continua aberto, e está na pauta (PARA-A-REUNIAO §0): a coordenação e a técnica de uma
-- casa CRIAREM conta de Enfermagem, ou PASSAREM alguém da casa para Enfermagem.

-- A pergunta, num lugar só: a conta alcança a instituição inteira? (a mesma lista de
-- cargos de `app_casas_no_alcance` e `app_house_in_scope`, mais a Coordenação Geral)
CREATE OR REPLACE FUNCTION app_conta_de_toda_a_instituicao(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce((SELECT u.todas_as_casas
                       OR u.role IN ('gestor_geral', 'enfermagem', 'lider_noturno_geral', 'admin_tecnico')
                     FROM app_user u WHERE u.id = p_user), false)
$$;
-- Sem GRANT à aplicação: só os gatilhos e a `app_staff_list`, que rodam como dono, perguntam.
REVOKE ALL ON FUNCTION app_conta_de_toda_a_instituicao(uuid) FROM PUBLIC;

-- E quem pergunta alcança a instituição inteira da conta?
CREATE OR REPLACE FUNCTION app_alcanca_a_instituicao_de(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM house h JOIN app_user u ON u.id = p_user
     WHERE h.institution_id = u.institution_id AND NOT app_house_in_scope(h.id))
$$;
REVOKE ALL ON FUNCTION app_alcanca_a_instituicao_de(uuid) FROM PUBLIC;

-- O gatilho de `app_user` da 1681, com o nome na metade de quem atende todas as casas.
CREATE OR REPLACE FUNCTION app_quem_administra_a_conta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_me uuid := app_current_user();
  v_acesso_mudou boolean;
BEGIN
  IF v_me IS NULL THEN RETURN NEW; END IF;

  v_acesso_mudou := NEW.role IS DISTINCT FROM OLD.role
                 OR NEW.todas_as_casas IS DISTINCT FROM OLD.todas_as_casas
                 OR NEW.active IS DISTINCT FROM OLD.active
                 OR NEW.institution_id IS DISTINCT FROM OLD.institution_id
                 OR NEW.email IS DISTINCT FROM OLD.email;

  IF NEW.id = v_me THEN
    IF v_acesso_mudou THEN RAISE EXCEPTION 'nao_administra_a_si_mesmo'; END IF;
    RETURN NEW;
  END IF;

  IF (v_acesso_mudou
      OR NEW.password_hash IS DISTINCT FROM OLD.password_hash
      OR NEW.full_name IS DISTINCT FROM OLD.full_name)
     -- No BEFORE UPDATE a tabela ainda tem a linha de antes: a pergunta é pelo cargo de ANTES.
     AND app_conta_de_toda_a_instituicao(OLD.id)
     AND NOT app_alcanca_a_instituicao_de(OLD.id) THEN
    RAISE EXCEPTION 'conta_de_toda_a_instituicao';
  END IF;

  RETURN NEW;
END $$;

-- O vínculo de casa, pela mesma pergunta.
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
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_quem_muda_o_vinculo() FROM PUBLIC;

CREATE TRIGGER trg_quem_muda_o_vinculo
  BEFORE INSERT OR UPDATE ON user_house_assignment
  FOR EACH ROW EXECUTE FUNCTION app_quem_muda_o_vinculo();

-- A lista da Equipe: `editavel` faz a pergunta do gatilho, e a tela não oferece o botão
-- que o servidor recusa.
CREATE OR REPLACE FUNCTION app_staff_list()
 RETURNS TABLE(id uuid, full_name text, email text, role text, active boolean, house_code text, house_id uuid, last_login timestamp with time zone, must_change_password boolean, editavel boolean, line_color text, todas_as_casas boolean)
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
         u.line_color, u.todas_as_casas
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
