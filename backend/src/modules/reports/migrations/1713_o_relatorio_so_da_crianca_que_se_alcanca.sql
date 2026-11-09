-- O RELATÓRIO SÓ DA CRIANÇA QUE SE ALCANÇA -- (fase 298; o que a revisão do banco achou depois da 1702.)
--
-- O relatório conferia a casa, e aceitava casa vazia com a criança de qualquer casa: provado
-- como o papel da aplicação, a coordenação da Casa 04 punha um relatório na ficha de uma
-- criança da Casa 03, e a técnica da Casa 03 passava a lê-lo. Agora a criança também tem de
-- estar no alcance de quem cria.

DROP POLICY rep_insert ON report_document;
CREATE POLICY rep_insert ON report_document FOR INSERT TO rede_app
  WITH CHECK (created_by = app_current_user()
              AND (house_id IS NULL OR house_id = ANY (ARRAY(SELECT app_casas_no_alcance())))
              AND (person_id IS NULL OR person_id IN (SELECT app_pessoas_no_alcance())));
