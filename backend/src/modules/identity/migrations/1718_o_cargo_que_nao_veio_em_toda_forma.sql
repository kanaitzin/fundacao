-- O CARGO QUE NÃO VEIO, EM TODA FORMA (fase 317, o que a 1717 não alcançou).
--
-- A 1717 tratou a comparação escrita como `app_current_role() NOT IN (…)`. As
-- revisões da própria fase (o banco-de-dados e a auditoria de segurança) acharam
-- três formas que ela não via, e provaram gravando, com a 1717 já aplicada:
--
--   1. o cargo convertido antes de comparar, `app_current_role()::text NOT IN`:
--      a app_triar_evolucao deixava o educador DESATIVADO triar a evolução de
--      saúde (a evolução ia a assinada com ele como quem triou);
--   2. as funções SQL que respondem sim ou não pelo cargo devolvem NULL quando o
--      cargo não veio, e `IF NOT f() THEN RAISE` também não entra no IF com NULL:
--      SEM IDENTIDADE NENHUMA, a app_archive_queue entregava a fila do arquivo e a
--      app_archive_transition dava como guardado no Drive um documento que nunca
--      subiu; o educador desativado corrigia o cadastro de uma criança;
--   3. a conta DESATIVADA continuava com a casa: o ramo do vínculo da
--      app_user_house_ids não conferia `active`, e o alcance cai nele quando o
--      cargo é NULL. O comentário da 1717 (nas políticas o NULL já nega) estava
--      errado para as políticas que perguntam pela casa.
--
-- Pela aplicação nada disso estava aberto (o servidor recusa conta desativada a
-- cada pedido e a desativação encerra as sessões): é a segunda camada, o banco,
-- que falhava. E é ela que segura o dia em que a primeira falhar.
--
-- O CONSERTO:
--   1. a mesma reescrita da 1717, aceitando o cargo convertido e qualquer caixa;
--   2. toda função SQL que responde sim ou não e lê o cargo passa a devolver
--      FALSO no lugar de NULL, com o corpo dela dentro de coalesce(…, false). Nas
--      políticas, NULL e falso negam do mesmo jeito; nas funções que perguntam
--      `IF NOT f()`, só o falso recusa;
--   3. a app_user_house_ids devolve casa só para conta ativa, nos dois ramos.
--
-- ONDE MORA O CORPO VIGENTE: a 1717 e esta reescrevem pelo catálogo, e o texto com
-- a guarda NÃO está em nenhum arquivo de migração. Quem for mudar uma dessas
-- funções copia o corpo do banco (pg_get_functiondef), e não da última migração
-- que a define, ou traz de volta a versão sem guarda. A suíte
-- o-cargo-que-nao-veio-e-recusado reprova as duas formas.

-- 1. O cargo convertido antes de comparar, em qualquer caixa.
DO $migracao$
DECLARE
  f record;
  v_antes text;
  v_depois text;
  c_cargo constant text :=
    '(app_current_role\(\)|\mv_role\M)(?:::\w+)?(?=\s*(?:=|<>|!=|IN\M|NOT\s+IN\M))';
BEGIN
  FOR f IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public' AND l.lanname = 'plpgsql'
       AND p.prosrc ~* c_cargo
     ORDER BY p.proname, p.oid
  LOOP
    v_antes := pg_get_functiondef(f.oid);
    v_depois := regexp_replace(v_antes, c_cargo, 'coalesce(\1::text, '''')', 'gi');
    IF v_depois <> v_antes THEN
      EXECUTE v_depois;
    END IF;
  END LOOP;
END
$migracao$;

-- 2. As funções SQL que respondem sim ou não pelo cargo devolvem falso, e não NULL.
DO $migracao$
DECLARE
  f record;
  v_def text;
  v_corpo text;
  v_novo text;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, p.prosrc
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public' AND l.lanname = 'sql'
       AND p.prorettype = 'bool'::regtype AND NOT p.proretset
       AND p.prosrc ~ 'app_current_role\(\)'
       AND p.prosrc !~* '^\s*SELECT\s+coalesce\('
     ORDER BY p.proname, p.oid
  LOOP
    v_def := pg_get_functiondef(f.oid);
    IF position(f.prosrc IN v_def) = 0 THEN
      RAISE EXCEPTION 'o corpo de % não aparece na definição', f.proname;
    END IF;
    -- O corpo como subconsulta: o ponto e vírgula do fim sai, e a quebra de linha
    -- antes do fecho protege o comentário de linha que termine o corpo.
    v_corpo := regexp_replace(btrim(f.prosrc, E' \t\r\n'), ';\s*$', '');
    v_novo := E'\n  SELECT coalesce((\n' || v_corpo || E'\n  ), false)\n';
    EXECUTE replace(v_def, f.prosrc, v_novo);
  END LOOP;
END
$migracao$;

-- 3. A conta desativada não alcança casa nenhuma, nem pelo vínculo.
CREATE OR REPLACE FUNCTION app_user_house_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT h.id FROM house h
    JOIN app_user u ON u.id = app_current_user()
   WHERE u.todas_as_casas AND u.active AND h.institution_id = u.institution_id
  UNION
  SELECT a.house_id FROM user_house_assignment a
    JOIN app_user u ON u.id = a.user_id
   WHERE a.user_id = app_current_user() AND a.valid_to IS NULL AND u.active
$$;
