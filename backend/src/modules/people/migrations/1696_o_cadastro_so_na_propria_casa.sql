-- O CADASTRO SÓ NA PRÓPRIA CASA (fase 298; o M5 da análise geral de 08/11).
--
-- As políticas de gravação da estadia, do episódio, do perfil e da pessoa conferiam o cargo e
-- não a casa da linha nova. Provado como o papel da aplicação: a coordenação da Casa 04 levava
-- a estadia de uma criança da Casa 04 para a Casa 03 (`UPDATE house_stay SET house_id`), e
-- podia abrir episódio e escrever o perfil de criança que não alcança. A aplicação não escreve
-- nada disso direto: a admissão, a chegada, a transferência e o perfil são funções do banco
-- (`app_admit_person`, `app_accept_transfer`, `app_atualizar_detalhe_perfil` e as outras), e o
-- servidor só encerra a estadia e o episódio na saída e troca a foto. A permissão fica do
-- tamanho disso, e a linha nova confere a casa.

REVOKE INSERT, UPDATE ON house_stay FROM rede_app;
GRANT UPDATE (status, ended_at, end_reason) ON house_stay TO rede_app;
DROP POLICY stay_update ON house_stay;
CREATE POLICY stay_update ON house_stay FOR UPDATE TO rede_app
  USING (app_can_edit_profile() AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance())))
  WITH CHECK (app_can_edit_profile() AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));

REVOKE INSERT, UPDATE ON care_episode FROM rede_app;
GRANT UPDATE (status, ended_at, end_reason) ON care_episode TO rede_app;
DROP POLICY episode_insert ON care_episode;

REVOKE INSERT, UPDATE ON profile_detail FROM rede_app;
DROP POLICY pd_insert ON profile_detail;
DROP POLICY pd_update ON profile_detail;

REVOKE INSERT, UPDATE ON person FROM rede_app;
GRANT UPDATE (photo_key, photo_mime, photo_at, photo_by) ON person TO rede_app;
DROP POLICY person_insert ON person;
DROP POLICY person_update ON person;
CREATE POLICY person_update ON person FOR UPDATE TO rede_app
  USING (id IN (SELECT app_pessoas_no_alcance()) AND app_can_edit_profile())
  WITH CHECK (id IN (SELECT app_pessoas_no_alcance()) AND app_can_edit_profile());
