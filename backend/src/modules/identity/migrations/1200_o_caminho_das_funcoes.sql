-- ============================================================
-- 1200 — O caminho que as funções privilegiadas procuram
--
-- 150 das 151 funções `SECURITY DEFINER` não fixavam `search_path`. Elas rodam
-- como DONA do banco: se um dia um objeto com o mesmo nome aparecer num schema
-- procurado antes de `public`, é ele que roda — com todos os privilégios.
--
-- O RISCO HOJE É TEÓRICO, e isso está dito para ninguém achar que se corrigiu
-- uma porta aberta: `rede_app` não pode criar schema (`CREATE` negado no
-- banco) nem objeto em `public`. Foi conferido pela própria conexão da
-- aplicação, não pela de dono. Sem poder criar nada, não há o que sombrear.
--
-- ENTÃO POR QUE FAZER: porque o `search_path` padrão começa com `"$user"`, e
-- basta UM privilégio concedido por engano — um `GRANT CREATE` para resolver
-- uma pressa, um schema novo para um relatório — para o risco deixar de ser
-- teórico, em 151 funções de uma vez. A defesa custa uma linha por função e
-- não depende de ninguém lembrar disso depois. Uma função já fazia assim desde
-- a 0760; esta migração leva o mesmo cuidado às outras.
--
-- `pg_temp` vai POR ÚLTIMO de propósito: ele é procurado primeiro quando não
-- está listado, e é o único schema em que a aplicação escreve.
-- ============================================================

DO $$
DECLARE f record; n int := 0;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname = 'public'
     WHERE p.prosecdef
       AND (p.proconfig IS NULL
            OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp',
                   f.assinatura);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'search_path fixado em % função(ões)', n;
END $$;
