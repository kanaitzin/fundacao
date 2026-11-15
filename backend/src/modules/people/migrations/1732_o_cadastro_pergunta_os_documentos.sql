-- O CADASTRO PERGUNTA O RG, O CARTÃO SUS E A FILIAÇÃO (fase 326, pedido do dono em 15/11).
--
-- "Volte a trabalhar no cadastro dos acolhidos, nos documentos e nos dados." O banco guarda o
-- RG, o cartão SUS (CNS) e a filiação desde a correção pelo papel (fase 235), mas o cadastro
-- não perguntava: eles só entravam depois, pela correção, com motivo, como se fossem erro. Agora
-- entram no próprio cadastro, opcionais como a naturalidade e o NIS. O corpo da função vem do
-- catálogo e muda só na gravação da pessoa.

DO $migracao$
DECLARE
  v_antes  text;
  v_depois text;
BEGIN
  v_antes := pg_get_functiondef('app_admit_person_full(uuid,jsonb,jsonb,jsonb)'::regprocedure);
  v_depois := replace(replace(v_antes,
    'gender, race, birthplace, nis, civil_registry, created_by)',
    'gender, race, birthplace, nis, civil_registry, rg, cns, filiation, created_by)'),
    $a$nullif(p_pessoa->>'civilRegistry',''), app_current_user())$a$,
    $b$nullif(p_pessoa->>'civilRegistry',''),
          nullif(btrim(coalesce(p_pessoa->>'rg','')),''), nullif(btrim(coalesce(p_pessoa->>'cns','')),''),
          nullif(btrim(coalesce(p_pessoa->>'filiation','')),''), app_current_user())$b$);
  IF v_depois = v_antes OR position('rg, cns, filiation' IN v_depois) = 0
     OR position($c$p_pessoa->>'filiation'$c$ IN v_depois) = 0 THEN
    RAISE EXCEPTION '1732: a gravação da pessoa não foi achada em app_admit_person_full';
  END IF;
  EXECUTE v_depois;
END
$migracao$;
