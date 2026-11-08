-- QUEM ADMINISTRA UMA CONTA (fase 288; o que o auditor de segurança achou nas funções da
-- Equipe depois da 1679 e da 1680).
--
-- A 1679 tirou da aplicação a escrita direta do cargo e das casas; as funções SECURITY
-- DEFINER da Equipe continuavam abertas por dois lados, provados em 08/11 dentro de BEGIN
-- e ROLLBACK, como o papel da aplicação:
--
-- 1. A PRÓPRIA CONTA. `app_update_staff` não recusava a pessoa que pede: a técnica da Casa
--    03 pode editar técnica e conceder Enfermagem, e por `PATCH /staff/<o id dela>` virava
--    Enfermagem e passava de uma casa para as oito. A tela esconde o botão da própria
--    conta; o servidor aceitava.
-- 2. A CONTA DE QUEM ATENDE TODAS AS CASAS. A conferência da casa da conta (1570) só olha a
--    casa quando a conta tem uma; a Enfermagem e o Líder Noturno Geral nunca têm. Para eles
--    sobrava só o cargo, e a coordenação ou a técnica de QUALQUER casa redefinia a senha da
--    Enfermagem e recebia a senha nova, desativava a conta ou trocava o cargo. É a tomada
--    de conta da fase 156, pelo lado que ela não alcançou.
--
-- A regra mora num gatilho de `app_user`, e não em cada função: vale para as funções de
-- hoje e para as que vierem. Ela é a mesma pergunta da 156, com as duas metades:
--
--   * ninguém muda o próprio cargo, as próprias casas, a própria conta ativa, a própria
--     instituição nem o próprio e-mail. A troca da própria senha continua (`auth.service`);
--   * a conta que alcança a instituição inteira (Gestor Geral, Enfermagem, Líder Noturno
--     Geral, a conta técnica aposentada e a Coordenação Geral) só tem cargo, casas, conta
--     ativa, e-mail e senha alterados por quem também alcança a instituição inteira: o
--     Gestor Geral e a Coordenação Geral. A lista de cargos é a mesma de
--     `app_casas_no_alcance`.
--
-- Fica como estava, de propósito, porque é decisão da Fundação (PARA-A-REUNIAO §0):
-- a coordenação e a técnica de uma casa CRIAREM conta de Enfermagem, ou passarem alguém da
-- casa para Enfermagem. Hoje isso é permitido e tem auditoria própria
-- (`staff.create_transversal`, `staff.update` com o cargo novo); o gatilho olha o cargo
-- de ANTES da mudança, e por isso não muda essa regra. O que ele fecha é tomar a conta de
-- quem já atende todas as casas.
--
-- Sem identidade na sessão (a instalação, a semente, o primeiro acesso pelo convite), o
-- gatilho não confere nada: quem roda ali é o dono, e não uma pessoa.

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

  IF (v_acesso_mudou OR NEW.password_hash IS DISTINCT FROM OLD.password_hash)
     AND (OLD.todas_as_casas
          OR OLD.role IN ('gestor_geral', 'enfermagem', 'lider_noturno_geral', 'admin_tecnico'))
     AND EXISTS (SELECT 1 FROM house h
                  WHERE h.institution_id = OLD.institution_id
                    AND NOT app_house_in_scope(h.id)) THEN
    RAISE EXCEPTION 'conta_de_toda_a_instituicao';
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_quem_administra_a_conta() FROM PUBLIC;

CREATE TRIGGER trg_quem_administra_a_conta
  BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION app_quem_administra_a_conta();

COMMENT ON FUNCTION app_quem_administra_a_conta() IS
  'Ninguém muda o próprio acesso, e a conta que alcança a instituição inteira só é alterada por quem também a alcança (1681).';
