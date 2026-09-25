-- A CIÊNCIA DE QUEM É DE OUTRA CASA (fase 156).
--
-- A CIÊNCIA NO EPISÓDIO DA ATA conferia só `user_id = eu`. A chave estrangeira
-- não confere alcance (146): a coordenação da Casa 04 gravava ciência — COM
-- COMENTÁRIO ESCRITO — num episódio da ATA da Casa 03 que ela nem lê, e quem é
-- da Casa 03 lia o comentário. Medido na sondagem da fase 156.
DROP POLICY IF EXISTS ack_insert ON ata_episode_ack;
CREATE POLICY ack_insert ON ata_episode_ack FOR INSERT TO rede_app
  WITH CHECK (user_id = app_current_user()
              AND EXISTS (SELECT 1 FROM ata_episode e
                           WHERE e.id = episode_id AND app_house_in_scope(e.house_id)));
