-- O QUE PROTEGE O BANCO, uma linha por item (fase 290).
--
-- O backup grava esta lista ao lado do dump (PERMISSOES.txt), e a restauração,
-- de ensaio ou de verdade, compara a do destino com ela. Contar linhas como dono
-- não diz nada: o dono enxerga tudo. Quem usa o sistema é o rede_app, e o que o
-- limita mora aqui:
--   * as permissões do rede_app e de PUBLIC no esquema public (tabelas, colunas,
--     funções, sequências e o próprio esquema). O que não tem permissão escrita
--     conta pela de fábrica (`acldefault`), para o REVOKE também ser conferido;
--   * o RLS ligado em cada tabela, e as políticas pelo nome, pelo comando e pelo
--     conteúdo (a soma do USING, do WITH CHECK e dos papéis);
--   * os gatilhos e se estão ligados: a auditoria que só acrescenta e as travas das
--     fases 288 e 289 moram neles;
--   * o dono de cada função SECURITY DEFINER: com `--no-owner`, ela passa a ser de
--     quem restaura, e restaurada por um superusuário rodaria como superusuário.
--
-- Até a 289 o backup ia com --no-privileges, e o banco restaurado não dava ao
-- rede_app nem a leitura das casas. O ensaio passava.
WITH quem AS (SELECT oid FROM pg_roles WHERE rolname = 'rede_app' UNION ALL SELECT 0),
nome AS (SELECT 0::oid AS oid, 'PUBLIC' AS n UNION ALL SELECT oid, rolname FROM pg_roles)
SELECT linha FROM (
  SELECT 'tabela ' || c.relname || ' ' || nm.n || ' ' || a.privilege_type AS linha
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace,
         aclexplode(coalesce(c.relacl, acldefault((CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END)::"char", c.relowner))) a
         JOIN nome nm ON nm.oid = a.grantee
   WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S') AND a.grantee IN (SELECT oid FROM quem)
  UNION ALL
  SELECT 'coluna ' || c.relname || '.' || t.attname || ' ' || nm.n || ' ' || a.privilege_type
    FROM pg_attribute t JOIN pg_class c ON c.oid = t.attrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace,
         aclexplode(t.attacl) a JOIN nome nm ON nm.oid = a.grantee
   WHERE ns.nspname = 'public' AND t.attacl IS NOT NULL AND a.grantee IN (SELECT oid FROM quem)
  UNION ALL
  SELECT 'funcao ' || p.oid::regprocedure::text || ' ' || nm.n || ' ' || a.privilege_type
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a JOIN nome nm ON nm.oid = a.grantee
   WHERE ns.nspname = 'public' AND a.grantee IN (SELECT oid FROM quem)
  UNION ALL
  SELECT 'esquema public ' || nm.n || ' ' || a.privilege_type
    FROM pg_namespace ns, aclexplode(coalesce(ns.nspacl, acldefault('n', ns.nspowner))) a
         JOIN nome nm ON nm.oid = a.grantee
   WHERE ns.nspname = 'public' AND a.grantee IN (SELECT oid FROM quem)
  UNION ALL
  SELECT 'rls ' || c.relname || CASE WHEN c.relforcerowsecurity THEN ' ligado e forçado' ELSE ' ligado' END
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
  UNION ALL
  SELECT 'politica ' || tablename || ' ' || policyname || ' ' || cmd || ' '
         || md5(coalesce(qual, '') || '|' || coalesce(with_check, '') || '|' || roles::text)
    FROM pg_policies WHERE schemaname = 'public'
  UNION ALL
  SELECT 'gatilho ' || c.relname || ' ' || t.tgname || ' ' || t.tgenabled::text
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'definer ' || p.oid::regprocedure::text || ' dono ' || p.proowner::regrole::text
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.prosecdef
) x ORDER BY 1;
