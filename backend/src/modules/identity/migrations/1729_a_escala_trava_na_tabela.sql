-- A ESCALA DE PLANTÃO TRAVA NA PRÓPRIA TABELA (revisão da 1726, achado em 15/11).
--
-- A 1726 fechou três portas da escala (escalar, incluir no rascunho e substituir), mas a
-- revisão à mão, provada como o papel da aplicação numa transação desfeita, achou mais três:
--
--   1. a aplicação tem INSERT e UPDATE na `shift_assignment`, e a política deixa a
--      coordenação, a técnica e o Líder Diurno gravarem nela direto: a cozinha entrava na
--      escala sem passar por função nenhuma;
--   2. "repetir o mês anterior" (`app_repetir_escala`) copiava para o rascunho quem estava na
--      escala de quatro semanas antes, a cozinha e a portaria de antes da 1726 incluídas;
--   3. e publicar o rascunho (`app_publicar_rascunho`) as punha na escala.
--
-- O conserto é um lugar só: o gatilho na tabela recusa a cozinha e a portaria em toda
-- gravação e em toda troca de pessoa, venha de onde vier, com a mesma frase da 1726. O
-- repetir deixa de copiá-las. Um rascunho aberto de antes que ainda as tenha não publica:
-- a coordenação recebe a frase e retira a pessoa do rascunho, em vez de ela sumir calada.

CREATE OR REPLACE FUNCTION app_escala_so_de_quem_cuida()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM app_user u WHERE u.id = NEW.user_id AND u.role::text IN ('cozinha', 'portaria')) THEN
    RAISE EXCEPTION 'escala: a cozinha e a portaria não entram na escala de plantão. Elas veem a própria tela ao entrar, e a equipe da casa imprime o que precisarem.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_escala_so_de_quem_cuida() FROM PUBLIC;

CREATE TRIGGER trg_escala_so_de_quem_cuida
  BEFORE INSERT OR UPDATE OF user_id ON shift_assignment
  FOR EACH ROW EXECUTE FUNCTION app_escala_so_de_quem_cuida();
CREATE TRIGGER trg_rascunho_so_de_quem_cuida
  BEFORE INSERT OR UPDATE OF user_id ON shift_draft_item
  FOR EACH ROW EXECUTE FUNCTION app_escala_so_de_quem_cuida();

/* O repetir do mês não copia quem não entra na escala. O corpo vem do catálogo, como na
   1726, e muda só na junção de quem é copiado. */
DO $migracao$
DECLARE
  v_antes  text;
  v_depois text;
BEGIN
  v_antes := pg_get_functiondef('app_repetir_escala(uuid,date)'::regprocedure);
  v_depois := replace(v_antes,
    'JOIN app_user u ON u.id = a.user_id AND u.active',
    $b$JOIN app_user u ON u.id = a.user_id AND u.active AND u.role::text NOT IN ('cozinha', 'portaria')$b$);
  IF v_depois = v_antes THEN
    RAISE EXCEPTION '1729: a junção de quem é copiado não foi achada em app_repetir_escala';
  END IF;
  EXECUTE v_depois;
END
$migracao$;

COMMENT ON FUNCTION app_escala_so_de_quem_cuida() IS
  'A escala de plantão é de quem cuida das crianças: a cozinha e a portaria não entram, em nenhuma gravação nem troca de pessoa (1729, revisão da 1726).';
