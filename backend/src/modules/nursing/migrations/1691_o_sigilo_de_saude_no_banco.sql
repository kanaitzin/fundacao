-- O SIGILO DE SAÚDE TAMBÉM NO BANCO (fase 297; o M4 da análise geral de 08/11).
--
-- Desde a 1678, o conteúdo da consulta e do atendimento sigilosos só sai para a Enfermagem,
-- a equipe técnica e a coordenação, mas quem escondia era o servidor (`semOConteudo`) e o
-- CASE de cada consulta. A política de leitura das duas tabelas deixava qualquer pessoa da
-- casa ler `reason`, `outcome` e o resto pelo papel da aplicação: uma consulta nova que
-- esquecesse o CASE, ou uma aplicação comprometida, lia o registro sigiloso inteiro.
--
-- Agora o papel da aplicação só lê, nas duas tabelas, o que diz que o registro existe: a
-- criança, a casa, o tipo, o dia, a situação e quem registrou. O conteúdo se lê pelas visões
-- `health_encounter_legivel` e `health_evolution_legivel`, que devolvem as mesmas linhas da
-- política de leitura (as pessoas no alcance de quem pergunta) e trazem o conteúdo vazio no
-- registro sigiloso para quem não o lê (`app_le_sigilo_de_saude`, a mesma regra da 1678).
--
-- E a escrita: a aplicação não insere nas duas tabelas (as funções `app_submit_evolution` e
-- `app_sign_evolution` fazem isso) e só muda a situação do atendimento na triagem. O resto
-- da escrita direta sai, e com ela a sobrescrita do conteúdo por quem não o lê.
--
-- A data do retorno da consulta (`return_on`) fica entre o que diz que o registro existe:
-- a educadora que leva a criança ao retorno precisa da data, sem saber de quê (1678).

-- 1. As visões. São do dono das tabelas, que não passa pelo RLS: a mesma pergunta da
--    política de leitura vai escrita no WHERE, e o `security_barrier` faz ela valer antes
--    de qualquer condição de quem consulta.
CREATE VIEW health_encounter_legivel WITH (security_barrier) AS
SELECT e.id, e.person_id, e.house_id, e.kind, e.happened_at, e.status, e.return_on,
       e.created_at, e.created_by, e.return_done_in, e.confidential,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.place END AS place,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.specialty END AS specialty,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.professional END AS professional,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.reason END AS reason,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.outcome END AS outcome
  FROM health_encounter e
 WHERE e.person_id IN (SELECT app_pessoas_no_alcance());

CREATE VIEW health_evolution_legivel WITH (security_barrier) AS
SELECT e.id, e.person_id, e.house_id, e.encounter_id, e.kind, e.happened_at, e.accompanied_by,
       e.signed_at, e.offline, e.synced_at, e.client_op_id, e.status, e.created_at,
       e.nurse_signed_by, e.nurse_signed_at, e.coord_signed_by, e.coord_signed_at, e.confidential,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.place END AS place,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.specialty END AS specialty,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.service_professional END AS service_professional,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.reason END AS reason,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.state_departure END AS state_departure,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.state_during END AS state_during,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.state_return END AS state_return,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.procedures END AS procedures,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.exams_requested END AS exams_requested,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.exams_results END AS exams_results,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.prescription_note END AS prescription_note,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.guidance END AS guidance,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.restrictions END AS restrictions,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.return_deadline END AS return_deadline,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.referrals END AS referrals,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.transport_notes END AS transport_notes,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.observations END AS observations,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.companion_name END AS companion_name,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.behavior_before END AS behavior_before,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.behavior_after END AS behavior_after,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.trip_incidents END AS trip_incidents,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.reconsult_on END AS reconsult_on
  FROM health_evolution e
 WHERE e.person_id IN (SELECT app_pessoas_no_alcance());

REVOKE ALL ON health_encounter_legivel, health_evolution_legivel FROM PUBLIC;
GRANT SELECT ON health_encounter_legivel, health_evolution_legivel TO rede_app;
COMMENT ON VIEW health_encounter_legivel IS
  'A consulta como a aplicação a lê (fase 297): as linhas no alcance, e o conteúdo do registro sigiloso só para quem o lê (app_le_sigilo_de_saude).';
COMMENT ON VIEW health_evolution_legivel IS
  'O atendimento como a aplicação o lê (fase 297): as linhas no alcance, e o conteúdo do registro sigiloso só para quem o lê (app_le_sigilo_de_saude).';

-- 2. As tabelas: só o que diz que o registro existe.
REVOKE ALL ON health_encounter, health_evolution FROM rede_app;
GRANT SELECT (id, person_id, house_id, kind, happened_at, status, return_on,
              created_at, created_by, return_done_in, confidential)
   ON health_encounter TO rede_app;
GRANT SELECT (id, person_id, house_id, encounter_id, kind, happened_at, accompanied_by,
              signed_at, offline, synced_at, client_op_id, status, created_at,
              nurse_signed_by, nurse_signed_at, coord_signed_by, coord_signed_at, confidential)
   ON health_evolution TO rede_app;
-- A triagem muda a situação (`UPDATE health_evolution SET status = … WHERE id = … AND status = …`).
GRANT UPDATE (status) ON health_evolution TO rede_app;

-- 3. A triagem da Enfermagem (o complemento, a nota clínica e o pedido de complemento) é
--    conteúdo do atendimento: no registro sigiloso, só para quem o lê. A Enfermagem continua
--    escrevendo a triagem; quem lê, lê pela visão.
CREATE VIEW nursing_triage_legivel WITH (security_barrier) AS
SELECT t.id, t.evolution_id, t.nurse_id, t.action, t.at,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE t.complement END AS complement,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE t.clinical_note END AS clinical_note,
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE t.request_note END AS request_note
  FROM nursing_triage t
  JOIN health_evolution e ON e.id = t.evolution_id
 WHERE e.person_id IN (SELECT app_pessoas_no_alcance());
REVOKE ALL ON nursing_triage_legivel FROM PUBLIC;
GRANT SELECT ON nursing_triage_legivel TO rede_app;
COMMENT ON VIEW nursing_triage_legivel IS
  'A triagem como a aplicação a lê (fase 297): as linhas do atendimento no alcance, e o texto da Enfermagem no registro sigiloso só para quem o lê.';

REVOKE ALL ON nursing_triage FROM rede_app;
GRANT SELECT (id, evolution_id, nurse_id, action, at) ON nursing_triage TO rede_app;
GRANT INSERT (evolution_id, nurse_id, complement, clinical_note, action, request_note) ON nursing_triage TO rede_app;
