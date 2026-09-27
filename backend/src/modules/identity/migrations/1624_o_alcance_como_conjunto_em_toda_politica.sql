-- =========================================================================
-- O ALCANCE COMO CONJUNTO EM TODA POLÍTICA — 27/09/2026 (fase 167)
--
-- O ensaio de carga com dois anos de casa mediu as métricas do remédio da
-- Casa 03 num ano: **15,3 segundos**. A consulta é simples; o custo era a
-- política `adm_select`, que chama `app_person_in_scope(person_id)` UMA VEZ
-- POR LINHA. A função é `SECURITY DEFINER` com `search_path` declarado — e
-- tem de ser, pela regra da casa —, e por isso o Postgres não a desdobra
-- dentro da consulta: são 0,26 ms por chamada, e 52 mil doses num ano.
--
-- A 0920 já tinha resolvido isto para a auditoria (1 096 ms para 122 ms) e
-- outras catorze políticas seguiram, cada uma na sua fase. Sobravam 172
-- chamadas por linha em 119 políticas. Esta migração as troca TODAS:
--
--   app_house_in_scope(x)   →  (x = ANY (ARRAY(SELECT app_casas_no_alcance())))
--   app_person_in_scope(x)  →  (x IN (SELECT app_pessoas_no_alcance()))
--
-- O conjunto das casas é pequeno (no máximo as oito) e vira um arranjo
-- calculado uma vez. O das pessoas cresce com os anos, e por isso é `IN
-- (SELECT …)`: o Postgres monta uma tabela de hash uma vez, e cada linha é
-- uma consulta nela, não uma varredura do arranjo.
--
-- A SEMÂNTICA É A MESMA, e é a parte perigosa, por isso está escrita:
--
--  * `app_casas_no_alcance()` devolve exatamente as casas para as quais
--    `app_house_in_scope` diria sim (0920, 1591; cobrado cargo por cargo no
--    `alcance-como-conjunto.spec.ts`).
--  * `app_pessoas_no_alcance()` devolve exatamente as pessoas para as quais
--    `app_person_in_scope` diria sim: quem tem acolhimento ativo é decidido
--    pela casa de hoje; quem não tem é visto pelo Gestor Geral, e pela
--    técnica e coordenação se já passou por uma casa delas. Cobrado pessoa
--    por pessoa, cargo por cargo, na mesma suíte.
--  * Onde a coluna é nula, as duas formas diferem num único caso: o Gestor
--    Geral e `app_person_in_scope(NULL)`, que dava SIM. A única coluna de
--    pessoa anulável sob estas políticas é `report_document.person_id`, e a
--    política dela já pergunta `person_id IS NULL OR …` antes. Para as casas,
--    NULL dá falso ou nulo nas duas formas.
--  * Falso e nulo só se distinguem sob `NOT`, `coalesce` ou `IS FALSE`.
--    Nenhuma das 119 políticas usa as funções assim (conferido no catálogo
--    ao escrever esta migração): elas aparecem em `AND`, `OR` e no resultado
--    de `CASE`, onde os dois negam do mesmo jeito.
--
-- As funções por linha CONTINUAM existindo, e continuam certas para
-- perguntar sobre UMA casa ou UMA pessoa dentro de função e serviço. O que a
-- suíte passa a cobrar é que nenhuma POLÍTICA as chame.
-- =========================================================================

CREATE OR REPLACE FUNCTION app_pessoas_no_alcance() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  WITH casas AS MATERIALIZED (SELECT app_casas_no_alcance() AS id),
       papel AS MATERIALIZED (SELECT app_current_role() AS r)
  -- Quem tem acolhimento ativo: decide a casa de hoje (o primeiro ramo de
  -- `app_person_in_scope`, por `app_person_house`).
  SELECT s.person_id FROM house_stay s
   WHERE s.status = 'ativa' AND s.house_id IN (SELECT id FROM casas)
  UNION ALL
  -- Quem não tem: o Gestor Geral vê; técnica e coordenação veem quem passou
  -- por uma casa delas; os demais cargos, não.
  SELECT p.id FROM person p CROSS JOIN papel
   WHERE NOT EXISTS (SELECT 1 FROM house_stay a WHERE a.person_id = p.id AND a.status = 'ativa')
     AND (papel.r = 'gestor_geral'
          OR (papel.r IN ('equipe_tecnica', 'coordenador')
              AND EXISTS (SELECT 1 FROM house_stay s
                           WHERE s.person_id = p.id AND s.house_id IN (SELECT id FROM casas))))
$$;

REVOKE ALL ON FUNCTION app_pessoas_no_alcance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_pessoas_no_alcance() TO rede_app;

-- A 0920 criou a função sem `search_path`; a 1591 a redefiniu com ele. Fica
-- declarado de novo aqui, porque a política toda passa a depender dela.
ALTER FUNCTION app_casas_no_alcance() SET search_path = pg_catalog, public, pg_temp;

/*
 * A troca, lida do CATÁLOGO e não de uma lista escrita à mão (lição da 157):
 * o que roda é o que está no `pg_policy`. O argumento tem de ser uma coluna,
 * qualificada ou não; qualquer outra forma fica como está, e o teste do
 * catálogo reprova até alguém olhar.
 */
DO $$
DECLARE
  pol record;
  usando text;
  checando text;
  casa constant text := 'app_house_in_scope\(([a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?)\)';
  pessoa constant text := 'app_person_in_scope\(([a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?)\)';
BEGIN
  FOR pol IN
    SELECT p.polname, p.polrelid::regclass AS tabela,
           pg_get_expr(p.polqual, p.polrelid) AS q,
           pg_get_expr(p.polwithcheck, p.polrelid) AS w
      FROM pg_policy p
     WHERE coalesce(pg_get_expr(p.polqual, p.polrelid), '')
           || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
           ~ 'app_(house|person)_in_scope\('
  LOOP
    usando := regexp_replace(regexp_replace(pol.q, casa,
                '(\1 = ANY (ARRAY(SELECT app_casas_no_alcance())))', 'g'),
                pessoa, '(\1 IN (SELECT app_pessoas_no_alcance()))', 'g');
    checando := regexp_replace(regexp_replace(pol.w, casa,
                '(\1 = ANY (ARRAY(SELECT app_casas_no_alcance())))', 'g'),
                pessoa, '(\1 IN (SELECT app_pessoas_no_alcance()))', 'g');
    IF usando IS NOT NULL AND checando IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %s USING (%s) WITH CHECK (%s)',
                     pol.polname, pol.tabela, usando, checando);
    ELSIF usando IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %s USING (%s)', pol.polname, pol.tabela, usando);
    ELSE
      EXECUTE format('ALTER POLICY %I ON %s WITH CHECK (%s)', pol.polname, pol.tabela, checando);
    END IF;
  END LOOP;
END $$;
