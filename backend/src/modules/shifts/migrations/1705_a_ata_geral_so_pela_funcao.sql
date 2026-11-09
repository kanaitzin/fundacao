-- A ATA GERAL DA NOITE SÓ PELA FUNÇÃO (fase 298; o que a revisão de segurança achou).
--
-- Abrir e fechar a ATA geral da noite são funções (`app_open_general_night_ata`,
-- `app_close_general_night_ata`), que conferem as pendências. O UPDATE direto deixava o líder
-- fechá-la em silêncio, pulando a descrição da pendência. A aplicação não escreve direto.

REVOKE INSERT, UPDATE ON general_night_ata FROM rede_app;
DROP POLICY gna_insert ON general_night_ata;
DROP POLICY gna_update ON general_night_ata;
