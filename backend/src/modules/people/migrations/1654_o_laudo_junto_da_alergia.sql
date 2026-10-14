-- O LAUDO JUNTO DA ALERGIA (fase 217, pedido de 14/10).
--
-- "A restrição alimentar e o remédio poderiam ter em anexo a receita médica,
-- não só o registro à mão, no perfil da criança." A receita do remédio já
-- tinha lugar desde a fase 108, presa à prescrição e espelhada no dossiê. A
-- alergia, a condição de saúde e a restrição alimentar eram só texto: o laudo
-- que diz que a Alice não pode comer amendoim ficava na pasta de papel, ou
-- solto na pasta da saúde, sem dizer a qual registro respondia.
--
-- O documento continua sendo do dossiê, na categoria saúde, com a mesma
-- conferência e o mesmo registro de abertura. O que muda é que ele pode
-- nascer dizendo a que registro responde. A ligação é gravada no INSERT e não
-- muda depois: laudo que foi anexado à alergia errada se anexa de novo à
-- certa, e o primeiro continua no histórico.
--
-- De passagem: a política de INSERT do `document` conferia o cargo e não a
-- casa. Pela tela não passava nada, mas por acaso: o `RETURNING id` do
-- serviço obriga a linha nova a passar também pela política de LEITURA, e é
-- ela que recusava a outra casa. Um INSERT sem RETURNING teria entrado. Agora
-- a casa é conferida na própria política, como nas outras tabelas da criança.

ALTER TABLE document ADD COLUMN IF NOT EXISTS health_condition_id uuid REFERENCES health_condition(id);
ALTER TABLE document ADD COLUMN IF NOT EXISTS food_restriction_id uuid REFERENCES food_restriction(id);

ALTER TABLE document DROP CONSTRAINT IF EXISTS document_um_registro_de_saude;
ALTER TABLE document ADD CONSTRAINT document_um_registro_de_saude CHECK (
  num_nonnulls(health_condition_id, food_restriction_id) <= 1
  AND (num_nonnulls(health_condition_id, food_restriction_id) = 0 OR category = 'saude')
);
CREATE INDEX IF NOT EXISTS idx_document_condicao ON document (health_condition_id)
  WHERE health_condition_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_restricao ON document (food_restriction_id)
  WHERE food_restriction_id IS NOT NULL;

-- O registro de saúde tem de ser DA MESMA criança, e a ligação não se reescreve.
-- SECURITY DEFINER para comparar a pessoa mesmo quando o registro está fora do
-- alcance de quem grava: fora do alcance também é "não é desta criança".
CREATE OR REPLACE FUNCTION app_documento_do_registro_de_saude() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.health_condition_id IS DISTINCT FROM OLD.health_condition_id
       OR NEW.food_restriction_id IS DISTINCT FROM OLD.food_restriction_id THEN
      RAISE EXCEPTION 'registro_de_saude_nao_muda';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.health_condition_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM health_condition h
        WHERE h.id = NEW.health_condition_id AND h.person_id = NEW.person_id) THEN
    RAISE EXCEPTION 'registro_de_saude_de_outra_crianca';
  END IF;
  IF NEW.food_restriction_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM food_restriction f
        WHERE f.id = NEW.food_restriction_id AND f.person_id = NEW.person_id) THEN
    RAISE EXCEPTION 'registro_de_saude_de_outra_crianca';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

DROP TRIGGER IF EXISTS document_registro_de_saude ON document;
CREATE TRIGGER document_registro_de_saude BEFORE INSERT OR UPDATE ON document
  FOR EACH ROW EXECUTE FUNCTION app_documento_do_registro_de_saude();

DROP POLICY IF EXISTS doc_insert ON document;
CREATE POLICY doc_insert ON document FOR INSERT TO rede_app
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance())
              AND (app_can_edit_profile() OR app_can_edit_health()));
