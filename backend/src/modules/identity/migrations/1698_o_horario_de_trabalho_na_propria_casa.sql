-- O HORÁRIO DE TRABALHO NA PRÓPRIA CASA (fase 298; o M5 da análise geral de 08/11).
--
-- A política conferia só o cargo: a coordenação da Casa 04 gravava horário de trabalho na
-- Casa 03. Agora a casa tem de estar no alcance de quem grava (o Gestor Geral alcança as oito).

DROP POLICY ws_write ON work_schedule;
CREATE POLICY ws_write ON work_schedule FOR INSERT TO rede_app
  WITH CHECK (app_current_role() IN ('gestor_geral', 'coordenador')
              AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
