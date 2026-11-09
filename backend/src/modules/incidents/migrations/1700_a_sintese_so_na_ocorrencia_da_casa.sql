-- A SÍNTESE SÓ NA OCORRÊNCIA DA CASA (fase 298; o M5 da análise geral de 08/11).
--
-- A síntese conferia o autor e o cargo: a coordenação da Casa 04 escrevia a síntese de uma
-- ocorrência da Casa 03, e a casa da síntese era a que viesse. Agora a ocorrência tem de ser
-- uma que quem escreve lê, e a casa da síntese é a dela.

DROP POLICY isyn_insert ON incident_synthesis;
CREATE POLICY isyn_insert ON incident_synthesis FOR INSERT TO rede_app
  WITH CHECK (author_id = app_current_user()
              AND app_current_role() IN ('equipe_tecnica', 'coordenador')
              AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
              AND EXISTS (SELECT 1 FROM incident i
                           WHERE i.id = incident_synthesis.incident_id AND i.house_id = incident_synthesis.house_id));
