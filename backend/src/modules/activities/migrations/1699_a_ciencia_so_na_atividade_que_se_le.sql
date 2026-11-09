-- A CIÊNCIA E A EXECUÇÃO SÓ NA ATIVIDADE QUE SE LÊ (fase 298; o M5 da análise geral de 08/11).
--
-- A ciência conferia só que quem dá ciência é a própria pessoa: o educador da Casa 04 dava
-- ciência numa atividade da Casa 03. A execução tinha a mesma política, e só um gatilho de
-- outra regra a segurava. Agora a atividade tem de ser uma que a pessoa lê (a política da
-- `activity` confere a casa).

DROP POLICY ack_insert ON activity_acknowledgement;
CREATE POLICY ack_insert ON activity_acknowledgement FOR INSERT TO rede_app
  WITH CHECK (user_id = app_current_user()
              AND EXISTS (SELECT 1 FROM activity a WHERE a.id = activity_acknowledgement.activity_id));

DROP POLICY exec_insert ON activity_execution;
CREATE POLICY exec_insert ON activity_execution FOR INSERT TO rede_app
  WITH CHECK (user_id = app_current_user()
              AND EXISTS (SELECT 1 FROM activity a WHERE a.id = activity_execution.activity_id));
