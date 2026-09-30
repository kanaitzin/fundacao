-- A ATA GERAL DO DIA, LINHA POR CASA (fase 181, decisão de 30/09, §10 item 2).
--
-- A política das linhas entregava as oito casas à coordenação e à equipe
-- técnica de qualquer casa. A tela só abria a folha inteira para o Líder
-- Noturno Geral, e o Arquivo já entregava só a linha da casa; mas quem tivesse
-- o identificador da folha lia as outras sete pela rota. A Fundação decidiu que
-- no dia corrente vale o mesmo recorte do arquivo: cada casa lê a linha dela.
-- A folha inteira fica com quem responde pelas oito: o Líder Noturno Geral, o
-- Gestor Geral e a Coordenação Geral (esta pelo alcance, que já é das oito).
-- As correções da linha herdam esta política (gnha_select).

DROP POLICY IF EXISTS gnhe_select ON general_night_house_entry;
CREATE POLICY gnhe_select ON general_night_house_entry FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
         OR app_current_role() IN ('lider_noturno_geral', 'gestor_geral'));
