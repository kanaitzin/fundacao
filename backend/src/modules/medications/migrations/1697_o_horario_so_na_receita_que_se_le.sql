-- O HORÁRIO SÓ NA RECEITA QUE SE LÊ (fase 298; o M5 da análise geral de 08/11).
--
-- A política de inserir horário de remédio conferia só o cargo: provado como o papel da
-- aplicação, a coordenação da Casa 04 punha um horário das 03:00 na receita de uma criança da
-- Casa 03, e a grade da casa gerava a dose. Agora a receita tem de ser uma que quem grava lê
-- (a política da `prescription` confere o alcance).

DROP POLICY sched_write ON medication_schedule;
CREATE POLICY sched_write ON medication_schedule FOR INSERT TO rede_app
  WITH CHECK (app_can_prescribe()
              AND EXISTS (SELECT 1 FROM prescription p WHERE p.id = medication_schedule.prescription_id));

-- E a dose: a linha de antes conferia a casa, e a de depois só quem deu. Quem a levasse para a
-- criança de outra casa era recusado só porque o PostgreSQL confere a linha nova também pela
-- política de leitura quando a consulta lê colunas; a regra fica escrita, e não por acaso.
DROP POLICY adm_update ON medication_administration;
CREATE POLICY adm_update ON medication_administration FOR UPDATE TO rede_app
  USING (person_id IN (SELECT app_pessoas_no_alcance()))
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance())
              AND (administered_by IS NULL OR administered_by = app_current_user()));
