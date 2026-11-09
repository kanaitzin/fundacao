-- A VISÃO DO ATENDIMENTO SEM AS DUAS COLUNAS MORTAS (fase 297).
--
-- `trip_incidents` e `reconsult_on` estão MORTAS desde a 1460 (repetem `transport_notes` e
-- `return_deadline`), e a conferência das colunas mortas reprovou a 1691 por lê-las na visão.
-- A visão nasce de novo sem elas: ninguém as escreve, e agora ninguém as lê.

DROP VIEW health_evolution_legivel;
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
       CASE WHEN e.confidential AND NOT (SELECT app_le_sigilo_de_saude()) THEN NULL ELSE e.behavior_after END AS behavior_after
  FROM health_evolution e
 WHERE e.person_id IN (SELECT app_pessoas_no_alcance());

REVOKE ALL ON health_evolution_legivel FROM PUBLIC;
GRANT SELECT ON health_evolution_legivel TO rede_app;
COMMENT ON VIEW health_evolution_legivel IS
  'O atendimento como a aplicação o lê (fase 297): as linhas no alcance, e o conteúdo do registro sigiloso só para quem o lê (app_le_sigilo_de_saude).';
