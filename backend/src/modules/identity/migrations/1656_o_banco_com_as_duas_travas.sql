-- O BANCO COM AS DUAS TRAVAS (fase 219, pedido de 14/10: "deixar nossos bancos
-- de dados mais robustos e fortes").
--
-- Medido no catálogo, e conferido no banco, não lembrado:
--
--  1. VINTE E UMA POLÍTICAS DE ATUALIZAÇÃO com `WITH CHECK (true)`: a linha que
--     se pode alterar é conferida (USING), a linha que sai da alteração não.
--     Levar um registro para OUTRA CASA já era recusado: o UPDATE que lê
--     colunas no WHERE passa a linha nova pela política de LEITURA, e ela é da
--     casa. Trocar o AUTOR, não: a operação feita sem sinal é legível pela casa
--     inteira, e trocar o `user_id` dela pelo de um colega passava (uma linha
--     alterada, conferido à mão com a política antiga). O mesmo valia para o
--     resumo de saúde emitido (`issued_by`). Agora a linha que sai da
--     alteração cumpre a mesma regra da que entrou, em toda política, sem
--     depender da leitura.
--  2. CINCO POLÍTICAS DE INSERÇÃO abertas. Nenhuma alcançável pela tela hoje
--     (o conflito volta pelo RETURNING, o complemento de ATA nasce de um
--     SELECT que já passa pelo RLS, as outras só por função do banco), e por
--     isso mesmo frágeis: a próxima rota que gravasse sem RETURNING passaria.
--  3. DOZE TABELAS em que a aplicação tinha permissão de UPDATE e nenhuma
--     política deixava linha passar: um UPDATE ali responderia sem erro e sem
--     mudar nada. Nenhum código o faz; a permissão sai, e o que é só de
--     acrescentar passa a sê-lo também pela permissão.
--
-- E os ÍNDICES das chaves estrangeiras que as políticas e as telas usam para
-- filtrar (a criança, a casa, o episódio): 73 colunas eram varridas inteiras.
-- Com uma casa de vinte crianças isso é invisível; com dez anos de chamada,
-- não. Ficam de fora as que apontam para o usuário, a instituição e o
-- vocabulário de testemunho, que não se filtram por elas.

-- ------------------------------------------------- 1. a segunda trava no UPDATE
ALTER POLICY act_update ON activity
  WITH CHECK (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
ALTER POLICY cc_update ON collective_check
  WITH CHECK (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
ALTER POLICY sub_update ON substitution_request
  WITH CHECK (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
ALTER POLICY ben_update ON benefit_record
  WITH CHECK (app_can_see_benefits(person_id));
ALTER POLICY cred_update ON person_credential
  WITH CHECK (app_can_see_credentials(person_id));
ALTER POLICY episode_update ON care_episode
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance()) AND app_can_edit_profile());
ALTER POLICY enc_update ON health_encounter
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance()) AND app_can_edit_health());
ALTER POLICY pd_update ON profile_detail
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance()) AND app_can_edit_profile());
ALTER POLICY presc_update ON prescription
  WITH CHECK (app_can_prescribe() AND person_id IN (SELECT app_pessoas_no_alcance()));
ALTER POLICY evo_update ON health_evolution
  WITH CHECK (app_current_role() IN ('enfermagem', 'gestor_geral'));
ALTER POLICY summary_update ON health_summary_issue
  WITH CHECK (issued_by = app_current_user());
ALTER POLICY oo_update ON offline_operation
  WITH CHECK (user_id = app_current_user());
ALTER POLICY ri_update ON routine_item
  WITH CHECK (app_can_edit_profile() AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
ALTER POLICY rv_update ON routine_version
  WITH CHECK (app_can_edit_profile() AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
ALTER POLICY sc_update ON sync_conflict
  WITH CHECK (app_can_edit_profile() AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
ALTER POLICY tr_update ON transfer_request
  WITH CHECK (app_can_edit_profile()
              AND (to_house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
                   OR from_house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))));
-- O relatório: a conferência do USING tem "ainda não aprovado"; a linha que sai
-- da aprovação está aprovada, e por isso a trava aqui é só o cargo e a casa.
ALTER POLICY rep_update ON report_document
  WITH CHECK (app_current_role() IN ('equipe_tecnica', 'coordenador', 'gestor_geral')
              AND (house_id IS NULL OR house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))));
ALTER POLICY estatuto_update ON house_statute
  WITH CHECK ((house_id IS NOT NULL AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
               AND app_current_role() IN ('coordenador', 'gestor_geral'))
              OR (house_id IS NULL AND app_current_role() = 'gestor_geral'
                  AND institution_id = app_minha_instituicao()));
ALTER POLICY gnhe_update ON general_night_house_entry
  WITH CHECK ((EXISTS (SELECT 1 FROM general_night_ata g
                        WHERE g.id = general_night_house_entry.general_ata_id
                          AND g.leader_id = app_current_user() AND g.status = 'rascunho'))
              OR (app_current_role() IN ('lider_diurno', 'equipe_tecnica', 'coordenador')
                  AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))));

-- ------------------------------------------------- 2. a trava no INSERT
ALTER POLICY sc_insert ON sync_conflict
  WITH CHECK (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
ALTER POLICY esc_insert ON escalation
  WITH CHECK (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
ALTER POLICY addendum_insert ON ata_addendum
  WITH CHECK (EXISTS (SELECT 1 FROM ata a WHERE a.id = ata_addendum.ata_id
                        AND a.house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))));
ALTER POLICY dv_insert ON document_version
  WITH CHECK (EXISTS (SELECT 1 FROM document d WHERE d.id = document_version.document_id));
ALTER POLICY gnhe_write ON general_night_house_entry
  WITH CHECK (house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
              OR app_current_role() IN ('lider_noturno_geral', 'gestor_geral'));

-- ------------------------------------------------- 3. a permissão que sobrava
REVOKE UPDATE ON activity_acknowledgement, activity_execution, archive_item, document_version,
  escalation, house, medication_schedule, medication_stock_movement, memory_record,
  nursing_triage, user_house_assignment, work_schedule FROM rede_app;

-- ------------------------------------------------- 4. os índices das chaves
CREATE INDEX IF NOT EXISTS idx_fk_activity_assignment_activity_id ON activity_assignment (activity_id);
CREATE INDEX IF NOT EXISTS idx_fk_activity_execution_bulk_id ON activity_execution (bulk_id);
CREATE INDEX IF NOT EXISTS idx_fk_admission_record_house_id ON admission_record (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_agreement_change_house_id ON agreement_change (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_ata_episode_house_id ON ata_episode (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_ata_note_house_id ON ata_note (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_benefit_record_person_id ON benefit_record (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_check_result_amendment_person_id ON check_result_amendment (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_check_result_bulk_id ON check_result (bulk_id);
CREATE INDEX IF NOT EXISTS idx_fk_check_result_person_id ON check_result (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_contact_visit_change_person_id ON contact_visit_change (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_document_person_id ON document (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_education_concept_substitui_id ON education_concept (substitui_id);
CREATE INDEX IF NOT EXISTS idx_fk_education_evolution_house_id ON education_evolution (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_education_support_house_id ON education_support (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_escalation_house_id ON escalation (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_export_log_house_id ON export_log (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_export_log_report_id ON export_log (report_id);
CREATE INDEX IF NOT EXISTS idx_fk_external_communication_house_id ON external_communication (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_external_communication_person_id ON external_communication (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_family_stay_contact_id ON family_stay (contact_id);
CREATE INDEX IF NOT EXISTS idx_fk_family_stay_medication_house_id ON family_stay_medication (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_followup_episode_id ON followup (episode_id);
CREATE INDEX IF NOT EXISTS idx_fk_followup_return_house_id ON followup_return (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_followup_supersedes_id ON followup (supersedes_id);
CREATE INDEX IF NOT EXISTS idx_fk_general_night_house_amendment_house_id ON general_night_house_amendment (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_general_night_house_entry_house_id ON general_night_house_entry (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_handover_house_id ON handover (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_handover_note_handover_id ON handover_note (handover_id);
CREATE INDEX IF NOT EXISTS idx_fk_handover_note_house_id ON handover_note (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_handover_receipt_house_id ON handover_receipt (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_health_evolution_encounter_id ON health_evolution (encounter_id);
CREATE INDEX IF NOT EXISTS idx_fk_health_evolution_house_id ON health_evolution (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_health_summary_issue_house_id ON health_summary_issue (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_house_check_model_replaces ON house_check_model (replaces);
CREATE INDEX IF NOT EXISTS idx_fk_house_statute_replaces_id ON house_statute (replaces_id);
CREATE INDEX IF NOT EXISTS idx_fk_house_stay_episode_id ON house_stay (episode_id);
CREATE INDEX IF NOT EXISTS idx_fk_incident_attachment_house_id ON incident_attachment (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_incident_person_person_id ON incident_person (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_incident_protected_house_id ON incident_protected (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_incident_synthesis_house_id ON incident_synthesis (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_incident_synthesis_incident_id ON incident_synthesis (incident_id);
CREATE INDEX IF NOT EXISTS idx_fk_kitchen_request_change_house_id ON kitchen_request_change (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_kitchen_request_person_id ON kitchen_request (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_medication_authorization_house_id ON medication_authorization (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_medication_purchase_item_house_id ON medication_purchase_item (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_medication_stock_person_id ON medication_stock (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_meeting_agenda_item_meeting_id ON meeting_agenda_item (meeting_id);
CREATE INDEX IF NOT EXISTS idx_fk_memory_photo_person_house_id ON memory_photo_person (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_memory_record_person_id ON memory_record (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_notification_house_id ON notification (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_notification_push_subscription_id ON notification_push (subscription_id);
CREATE INDEX IF NOT EXISTS idx_fk_offline_operation_house_id ON offline_operation (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_person_contact_change_person_id ON person_contact_change (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_prescription_document_house_id ON prescription_document (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_prescription_document_id ON prescription (document_id);
CREATE INDEX IF NOT EXISTS idx_fk_prescription_restriction_change_house_id ON prescription_restriction_change (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_report_document_supersedes_id ON report_document (supersedes_id);
CREATE INDEX IF NOT EXISTS idx_fk_routine_item_house_id ON routine_item (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_shift_assignment_replaces_assignment_id ON shift_assignment (replaces_assignment_id);
CREATE INDEX IF NOT EXISTS idx_fk_shift_draft_item_source_assignment_id ON shift_draft_item (source_assignment_id);
CREATE INDEX IF NOT EXISTS idx_fk_statement_house_id ON statement (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_statement_request_statement_id ON statement_request (statement_id);
CREATE INDEX IF NOT EXISTS idx_fk_statement_supplements_id ON statement (supplements_id);
CREATE INDEX IF NOT EXISTS idx_fk_substitution_request_activity_id ON substitution_request (activity_id);
CREATE INDEX IF NOT EXISTS idx_fk_team_agreement_meeting_id ON team_agreement (meeting_id);
CREATE INDEX IF NOT EXISTS idx_fk_team_agreement_replaces_id ON team_agreement (replaces_id);
CREATE INDEX IF NOT EXISTS idx_fk_technical_session_attachment_person_id ON technical_session_attachment (person_id);
CREATE INDEX IF NOT EXISTS idx_fk_transfer_message_author_house_id ON transfer_message (author_house_id);
CREATE INDEX IF NOT EXISTS idx_fk_transfer_request_episode_id ON transfer_request (episode_id);
CREATE INDEX IF NOT EXISTS idx_fk_transfer_request_from_house_id ON transfer_request (from_house_id);
CREATE INDEX IF NOT EXISTS idx_fk_visit_correction_visit_id ON visit_correction (visit_id);
CREATE INDEX IF NOT EXISTS idx_fk_work_schedule_house_id ON work_schedule (house_id);
