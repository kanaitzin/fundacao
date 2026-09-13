-- ============================================================
-- 1210 — Como o relógio descobre em nome de quem escreve
--
-- O relógio (fase 103) roda antes de existir identidade na sessão — como o
-- login. Ao procurar a conta de `RELOGIO_USER_EMAIL` pela conexão da
-- aplicação, o RLS de `app_user` negava e a resposta vinha VAZIA: a mensagem
-- dizia "a conta não existe ou está inativa" para uma conta que existe e está
-- ativa.
--
-- É o mesmo desenho de `auth_find_user`: uma função `SECURITY DEFINER` que
-- devolve só o necessário. Aqui, sem o hash da senha — o relógio não
-- autentica ninguém, e trazer o hash seria dar mais do que a tarefa pede.
--
-- `search_path` fixo desde o nascimento, como manda a 1200.
-- ============================================================

CREATE OR REPLACE FUNCTION app_conta_do_relogio(p_email text)
RETURNS TABLE (id uuid, email text, full_name text, role role_code,
               institution_id uuid, active boolean) AS $$
  SELECT u.id, u.email, u.full_name, u.role, u.institution_id, u.active
    FROM app_user u
   WHERE lower(u.email) = lower(p_email);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_conta_do_relogio(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_conta_do_relogio(text) TO rede_app;
