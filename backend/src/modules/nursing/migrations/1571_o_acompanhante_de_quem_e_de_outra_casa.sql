-- O ACOMPANHANTE DE QUEM É DE OUTRA CASA (fase 156).
--
-- O ACOMPANHANTE DA INTERNAÇÃO conferia só o cargo. O serviço fecha o período
-- de quem acompanhava e abre o do novo, sem ler a internação antes: a equipe
-- técnica ou a coordenação de OUTRA casa trocava quem acompanha uma criança
-- internada da Casa 03 — e a lista "quem estava com ela no dia 12?" passava a
-- responder com alguém que a casa não escolheu.
DROP POLICY IF EXISTS intacomp_insert ON hospitalization_companion;
CREATE POLICY intacomp_insert ON hospitalization_companion FOR INSERT TO rede_app
  WITH CHECK (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
              AND EXISTS (SELECT 1 FROM hospitalization h
                           WHERE h.id = hospitalization_id AND app_house_in_scope(h.house_id)));
DROP POLICY IF EXISTS intacomp_update ON hospitalization_companion;
CREATE POLICY intacomp_update ON hospitalization_companion FOR UPDATE TO rede_app
  USING (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
         AND EXISTS (SELECT 1 FROM hospitalization h
                      WHERE h.id = hospitalization_id AND app_house_in_scope(h.house_id)));
