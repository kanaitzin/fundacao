-- O ENCERRADO NÃO SE REESCREVE -- (fase 298; o que a revisão do banco achou depois da 1702.)
--
-- Depois da 1702, a estadia e o episódio só se encerravam, mas a coordenação ainda reescrevia
-- o fim e o motivo de uma estadia ou episódio JÁ encerrados (nada se sobrescreve, regra 5).
-- Agora só a linha aberta se encerra. A política de inserir estadia, sem permissão desde a 1696,
-- sai; e a ficha de entrada (`admission_record`), que a aplicação nunca atualiza, perde o UPDATE.

DROP POLICY stay_update ON house_stay;
CREATE POLICY stay_update ON house_stay FOR UPDATE TO rede_app
  USING (app_can_edit_profile() AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance())) AND status = 'ativa')
  WITH CHECK (app_can_edit_profile() AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
              AND status = 'encerrada');
DROP POLICY IF EXISTS stay_insert ON house_stay;

DROP POLICY episode_update ON care_episode;
CREATE POLICY episode_update ON care_episode FOR UPDATE TO rede_app
  USING (person_id IN (SELECT app_pessoas_no_alcance()) AND app_can_edit_profile() AND status = 'ativo')
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance()) AND app_can_edit_profile()
              AND status = 'encerrado');

REVOKE UPDATE ON admission_record FROM rede_app;
