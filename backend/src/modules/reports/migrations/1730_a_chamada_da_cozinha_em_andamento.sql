-- A COZINHA SABE SE A CHAMADA DA REFEIÇÃO ESTÁ FEITA OU EM ANDAMENTO (conferência de 15/11).
--
-- Usando o sistema como a cozinha: o plano do dia dizia "chamada feita: comeram 2" assim que a
-- primeira criança era marcada, com a chamada ainda aberta em 2 de 14. Quem lê na cozinha
-- entende que só duas comeram. Agora a refeição diz se a chamada foi confirmada; enquanto não
-- foi, a tela diz quantas estão conferidas até agora. O corpo vem do catálogo e muda só aqui.

DO $migracao$
DECLARE
  v_antes  text;
  v_depois text;
BEGIN
  v_antes := pg_get_functiondef('app_plano_da_cozinha(uuid,date)'::regprocedure);
  v_depois := replace(v_antes,
    $a$'feita', true,$a$,
    $b$'feita', true,
                      'confirmada', bool_and(k.status = 'confirmada'),
                      'conferidas', count(r.id),$b$);
  IF v_depois = v_antes THEN
    RAISE EXCEPTION '1730: o ponto da chamada não foi achado em app_plano_da_cozinha';
  END IF;
  EXECUTE v_depois;
END
$migracao$;
