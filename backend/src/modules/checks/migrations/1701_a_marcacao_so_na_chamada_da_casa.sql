-- A MARCAÇÃO SÓ NA CHAMADA DA CASA (fase 298; o M5 da análise geral de 08/11).
--
-- A marcação da chamada conferia a casa na linha de antes e, na de depois, só quem marcou.
-- Levá-la para a chamada de outra casa era recusado porque o PostgreSQL confere a linha nova
-- também pela política de leitura quando a consulta lê colunas; a regra fica escrita.

DROP POLICY cr_update ON check_result;
CREATE POLICY cr_update ON check_result FOR UPDATE TO rede_app
  USING (EXISTS (SELECT 1 FROM collective_check k
                  WHERE k.id = check_result.check_id AND k.status = 'aberta'
                    AND k.house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))))
  WITH CHECK (recorded_by = app_current_user()
              AND EXISTS (SELECT 1 FROM collective_check k
                           WHERE k.id = check_result.check_id AND k.status = 'aberta'
                             AND k.house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))));
