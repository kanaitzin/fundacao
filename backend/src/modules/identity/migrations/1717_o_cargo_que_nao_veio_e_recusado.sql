-- O CARGO QUE NÃO VEIO É RECUSADO (a guarda de cargo nulo, anotada desde a 1634).
--
-- O app_current_role() devolve NULL quando a transação chega sem identidade ou
-- quando a conta está desativada. E NULL comparado com qualquer coisa não é
-- verdadeiro nem falso: o
--
--     IF app_current_role() NOT IN ('coordenador','gestor_geral') THEN RAISE …
--
-- não entra no IF, e a função SEGUE. Medido em 12/11 no catálogo: 76 comparações
-- assim, em 67 funções plpgsql. Como o papel da aplicação, sem identidade:
--
--   * app_register_device passava do cargo e era recusada adiante, pelo rótulo
--     e depois pela casa;
--   * app_create_coordenacao_geral passava do cargo e só não criava a conta
--     porque a instituição, nula, bate no NOT NULL da tabela;
--   * app_metricas_do_trabalho passava do cargo e devolvia vazio pelo RLS.
--
-- Nenhuma chegou a gravar ou a entregar dado: a casa, o RLS ou uma restrição da
-- tabela seguravam depois. Mas seguravam por acaso, e a primeira função nova sem
-- a segunda barreira passaria inteira.
--
-- O CONSERTO É UM SÓ, PARA TODAS: a comparação do cargo de quem chama passa a
-- tratar o cargo que não veio como cargo nenhum,
--
--     coalesce(app_current_role()::text, '') NOT IN (…)
--
-- e cada função continua recusando do jeito dela (a mesma exceção, ou a mesma
-- lista vazia). Vale para app_current_role() e para a variável v_role, que é o
-- nome que as funções dão ao cargo de quem chama.
--
-- Por que não mexer no app_current_role(): as políticas de RLS o leem, e nelas
-- o NULL já NEGA. Devolver um cargo de mentira abriria as políticas escritas
-- como "cargo diferente de portaria".
--
-- A reescrita é feita pelo catálogo, e não função por função à mão, para não
-- copiar 67 corpos nem perder o search_path, o SECURITY DEFINER e as permissões
-- de nenhuma: o pg_get_functiondef devolve a função como está, e o CREATE OR
-- REPLACE mantém o dono e as permissões. Função nova que compare o cargo sem o
-- coalesce reprova na suíte o-cargo-que-nao-veio-e-recusado.

DO $migracao$
DECLARE
  f record;
  v_antes text;
  v_depois text;
  c_cargo constant text :=
    '(app_current_role\(\)|\mv_role\M)(?=\s*(?:=|<>|!=|IN\M|NOT\s+IN\M))';
BEGIN
  FOR f IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public' AND l.lanname = 'plpgsql'
       AND p.prosrc ~ c_cargo
     ORDER BY p.proname, p.oid
  LOOP
    v_antes := pg_get_functiondef(f.oid);
    v_depois := regexp_replace(v_antes, c_cargo, 'coalesce(\1::text, '''')', 'g');
    IF v_depois <> v_antes THEN
      EXECUTE v_depois;
    END IF;
  END LOOP;
END
$migracao$;
