-- QUEM ACOMPANHA A CRIANÇA (pedido do dono em 14/11).
--
-- *Fui delegar alguém para levar uma criança a uma atividade externa e apareceram o
-- pessoal da cozinha e da portaria.* A lista do responsável do compromisso tirava a
-- cozinha desde a 0580, e a portaria, que chegou depois (fase 160), nunca saiu. A
-- mesma lista serve ao Dia (quem realizou, a quem delegar, quem substitui), e a
-- designação da atividade e o acompanhante da internação aceitavam qualquer pessoa.
--
-- A regra mora num lugar só: `app_acompanha_crianca`. A cozinha e a portaria não
-- levam, não acompanham, não realizam nem substituem atividade de criança. O espelho
-- em TypeScript é o `NAO_ACOMPANHAM_CRIANCA` (`identity/quem-acompanha.regra.ts`), e a
-- suíte `quem-acompanha-a-crianca` confere que os dois dizem a mesma lista.

CREATE OR REPLACE FUNCTION app_acompanha_crianca(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce((
    SELECT u.active AND u.role::text NOT IN ('cozinha', 'portaria')
      FROM app_user u
     WHERE u.id = p_user
       AND u.institution_id = (SELECT me.institution_id FROM app_user me WHERE me.id = app_current_user())
  ), false)
$$;
REVOKE ALL ON FUNCTION app_acompanha_crianca(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_acompanha_crianca(uuid) TO rede_app;

/* As duas funções que já existem mudam só no trecho da regra: o resto do corpo vem do
   catálogo, como na 1717, para não copiar à mão o que outras fases já reescreveram. */
DO $migracao$
DECLARE
  v_antes  text;
  v_depois text;
BEGIN
  -- A lista do compromisso: a cozinha E a portaria saem.
  v_antes := pg_get_functiondef('app_staff_for_commitment(uuid,date,time without time zone)'::regprocedure);
  v_depois := replace(v_antes,
    $a$AND u.role <> 'cozinha'   -- a cozinha não acompanha saída nem atividade$a$,
    $b$AND app_acompanha_crianca(u.id)   -- a cozinha e a portaria não acompanham saída nem atividade (1724)$b$);
  IF v_depois = v_antes THEN
    RAISE EXCEPTION '1724: o trecho da cozinha não foi achado em app_staff_for_commitment';
  END IF;
  EXECUTE v_depois;

  -- A designação da atividade: só para quem acompanha criança.
  v_antes := pg_get_functiondef('app_delegate_activity(uuid,uuid,text)'::regprocedure);
  v_depois := replace(v_antes,
    $a$  -- A designação anterior NÃO é apagada$a$,
    $b$  IF NOT app_acompanha_crianca(p_to) THEN
    RAISE EXCEPTION 'pessoa_nao_acompanha_crianca' USING ERRCODE = 'check_violation';
  END IF;

  -- A designação anterior NÃO é apagada$b$);
  IF v_depois = v_antes THEN
    RAISE EXCEPTION '1724: o ponto da designação não foi achado em app_delegate_activity';
  END IF;
  EXECUTE v_depois;
END
$migracao$;

COMMENT ON FUNCTION app_acompanha_crianca(uuid) IS
  'Quem pode levar, acompanhar, realizar ou substituir atividade de criança: a conta ativa da instituição, menos a cozinha e a portaria (1724, pedido de 14/11).';
