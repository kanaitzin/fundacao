-- A TRANSFERÊNCIA E A SAÍDA SEM BRECHA (fase 298; o que a revisão de segurança achou na 1696).
--
--  1. O PEDIDO DE TRANSFERÊNCIA se reescrevia inteiro: a aplicação tinha UPDATE em todas as
--     colunas, e a política aceitava qualquer uma das pontas no alcance. A casa de destino
--     reabria um pedido recusado (`status = 'solicitada'`) e aceitava, levando a criança sem o
--     pedido atual da origem. A aplicação só escreve a nota da decisão; o resto é das funções
--     de aceite, recusa e cancelamento. E o pedido nasce só para a criança que está na casa de
--     origem, no episódio dela.
--  2. A ESTADIA E O EPISÓDIO ENCERRADOS se reativavam direto (`status = 'ativa'`), pulando a
--     readmissão, sem episódio novo nem auditoria. A aplicação só encerra; reabrir é da
--     `app_readmit_person`.

REVOKE UPDATE ON transfer_request FROM rede_app;
GRANT UPDATE (decision_note) ON transfer_request TO rede_app;
DROP POLICY tr_insert ON transfer_request;
CREATE POLICY tr_insert ON transfer_request FOR INSERT TO rede_app
  WITH CHECK (app_can_edit_profile()
              AND from_house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
              AND EXISTS (SELECT 1 FROM house_stay s
                           WHERE s.person_id = transfer_request.person_id
                             AND s.house_id = transfer_request.from_house_id
                             AND s.episode_id = transfer_request.episode_id
                             AND s.status = 'ativa'));

DROP POLICY stay_update ON house_stay;
CREATE POLICY stay_update ON house_stay FOR UPDATE TO rede_app
  USING (app_can_edit_profile() AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance())))
  WITH CHECK (app_can_edit_profile() AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
              AND status = 'encerrada');

DROP POLICY episode_update ON care_episode;
CREATE POLICY episode_update ON care_episode FOR UPDATE TO rede_app
  USING (person_id IN (SELECT app_pessoas_no_alcance()) AND app_can_edit_profile())
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance()) AND app_can_edit_profile()
              AND status = 'encerrado');
