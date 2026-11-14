-- O ACOMPANHANTE DA INTERNAÇÃO É QUEM ACOMPANHA CRIANÇA (pedido do dono em 14/11).
--
-- A regra é a da activities/1724 (`app_acompanha_crianca`): a cozinha e a portaria não
-- acompanham a criança internada. A aplicação grava a linha direto, e por isso a
-- conferência mora aqui, além da tela e do servidor.

/* O acompanhante da internação, no banco: a aplicação grava a linha direto, e a
   conferência da tela e do servidor não basta. */
CREATE OR REPLACE FUNCTION app_acompanhante_acompanha_crianca()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT app_acompanha_crianca(NEW.user_id) THEN
    RAISE EXCEPTION 'pessoa_nao_acompanha_crianca' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_acompanhante_acompanha_crianca ON hospitalization_companion;
CREATE TRIGGER trg_acompanhante_acompanha_crianca
  BEFORE INSERT ON hospitalization_companion
  FOR EACH ROW EXECUTE FUNCTION app_acompanhante_acompanha_crianca();

