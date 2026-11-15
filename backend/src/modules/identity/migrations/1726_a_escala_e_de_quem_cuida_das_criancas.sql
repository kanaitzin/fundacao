-- A ESCALA DE PLANTÃO É DE QUEM CUIDA DAS CRIANÇAS (pedido do dono em 15/11).
--
-- *Também não controlamos a escala da cozinha ou da portaria: eles entram para ver só
-- as partes deles, ou a equipe da casa e os líderes imprimem para eles.* A escala de
-- plantão é a de quem cuida das crianças, a mesma regra de quem acompanha a criança
-- (activities/1724, `app_acompanha_crianca`): a cozinha e a portaria não entram nela.
--
-- As três portas de entrada da escala recusam: escalar, incluir no rascunho do mês e
-- substituir. O corpo de cada função vem do catálogo, como na 1717, e muda só no ponto
-- em que a pessoa é conferida.

DO $migracao$
DECLARE
  f record;
  v_antes  text;
  v_depois text;
BEGIN
  FOR f IN
    SELECT * FROM (VALUES
      ('app_escalar(uuid,uuid,date,text,time without time zone,time without time zone,text,integer,date)', 'p_user'),
      ('app_rascunho_incluir(uuid,uuid,date,text,time without time zone,time without time zone,text)', 'p_user'),
      ('app_substituir_no_plantao(uuid,uuid,text)', 'p_novo_user')
    ) AS t(assinatura, parametro)
  LOOP
    v_antes := pg_get_functiondef(f.assinatura::regprocedure);
    v_depois := replace(v_antes,
      format('IF NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = %s AND u.active) THEN', f.parametro),
      format($b$IF EXISTS (SELECT 1 FROM app_user u WHERE u.id = %1$s AND u.role::text IN ('cozinha', 'portaria')) THEN
    RAISE EXCEPTION 'escala: a cozinha e a portaria não entram na escala de plantão. Elas veem a própria tela ao entrar, e a equipe da casa imprime o que precisarem.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = %1$s AND u.active) THEN$b$, f.parametro));
    IF v_depois = v_antes THEN
      RAISE EXCEPTION '1726: o ponto da conferência da pessoa não foi achado em %', f.assinatura;
    END IF;
    EXECUTE v_depois;
  END LOOP;
END
$migracao$;
