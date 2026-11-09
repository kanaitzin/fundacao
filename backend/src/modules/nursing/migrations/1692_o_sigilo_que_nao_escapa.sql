-- O SIGILO QUE NÃO ESCAPA (fase 297; o que as revisões acharam na 1691).
--
--  1. O RETORNO DE UMA CONSULTA SIGILOSA NASCIA ABERTO. A educadora escolhe o retorno pelo
--     rótulo "Retorno de um registro sigiloso" e escreve a especialidade, o lugar e como a
--     criança voltou: tudo ficava para a casa inteira, ligado ao sigiloso pelo
--     `return_done_in`. Agora o atendimento que cumpre o retorno de um sigiloso nasce
--     sigiloso, na mesma transação, com a linha no histórico do sigilo.
--  2. O MOTIVO DO SIGILO ficava legível no banco para qualquer pessoa da casa (só o servidor
--     o escondia), e o "por quê" pode levar conteúdo. Agora o histórico do sigilo se lê só
--     com o sigilo: quem não o lê também não lê quem marcou nem por quê.
--
-- E uma correção ao comentário da 1691, que não se edita: a camada nova NÃO protege de uma
-- aplicação comprometida, que escolhe a identidade da sessão (`app.user_id`) e pode se passar
-- por uma enfermeira. O que ela protege é o que o M4 pedia: a consulta nova que esquece o
-- sigilo não entrega o conteúdo, porque o banco não o dá.

CREATE OR REPLACE FUNCTION app_retorno_herda_o_sigilo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.encounter_id IS NULL OR NEW.confidential THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM health_encounter o
                  WHERE o.return_done_in = NEW.encounter_id AND o.confidential) THEN
    RETURN NULL;
  END IF;
  UPDATE health_encounter SET confidential = true WHERE id = NEW.encounter_id;
  UPDATE health_evolution SET confidential = true WHERE id = NEW.id;
  INSERT INTO health_confidential_change (encounter_id, evolution_id, person_id, house_id,
                                          confidential, reason, created_by)
  VALUES (NEW.encounter_id, NEW.id, NEW.person_id, NEW.house_id, true,
          'Retorno de um registro sigiloso.', NEW.accompanied_by);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app_retorno_herda_o_sigilo() FROM PUBLIC;

CREATE TRIGGER trg_retorno_herda_o_sigilo
  AFTER INSERT ON health_evolution
  FOR EACH ROW EXECUTE FUNCTION app_retorno_herda_o_sigilo();

DROP POLICY hcc_select ON health_confidential_change;
CREATE POLICY hcc_select ON health_confidential_change FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())) AND app_le_sigilo_de_saude());
