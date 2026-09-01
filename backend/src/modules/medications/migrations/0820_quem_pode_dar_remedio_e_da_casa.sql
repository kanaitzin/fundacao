-- =============================================================================
-- 0820 — QUEM PODE DAR REMÉDIO É DECISÃO DE CADA CASA (§11.3)
--
-- Defeito encontrado ao escrever o teste da autorização nominal: as três
-- políticas de escrita do protocolo e da autorização conferiam o CARGO e
-- esqueciam a CASA.
--
--     WITH CHECK (app_current_role() IN ('coordenador','gestor_geral'))
--
-- Coordenador é cargo de UMA casa. Com esta regra, a coordenação da Casa 03
-- podia escrever o protocolo da Casa 04 e autorizar nominalmente um educador
-- da Casa 04 a dar medicamento lá — sem passar por ninguém da Casa 04, e sem
-- que nada na tela de lá mudasse de aviso. É exatamente o "acesso a outra casa
-- fora das exceções funcionais" que a regra 3 proíbe, e cai no lugar mais caro
-- possível: quem encosta no remédio da criança.
--
-- `app_house_in_scope` já é a resposta certa em todo o resto do sistema; aqui
-- ela simplesmente não tinha sido chamada. A gestão geral continua alcançando
-- todas as casas, porque é o que a função devolve para ela.
--
-- `prot_update` também trocava o `WITH CHECK (true)` por nada: dava para
-- ATUALIZAR uma linha da própria casa apontando-a para outra.
-- =============================================================================

DROP POLICY IF EXISTS prot_write ON medication_protocol;
CREATE POLICY prot_write ON medication_protocol FOR INSERT TO rede_app
  WITH CHECK (app_current_role() IN ('coordenador','gestor_geral')
              AND app_house_in_scope(house_id));

DROP POLICY IF EXISTS prot_update ON medication_protocol;
CREATE POLICY prot_update ON medication_protocol FOR UPDATE TO rede_app
  USING (app_current_role() IN ('coordenador','gestor_geral')
         AND app_house_in_scope(house_id))
  WITH CHECK (app_house_in_scope(house_id));

DROP POLICY IF EXISTS mauth_write ON medication_authorization;
CREATE POLICY mauth_write ON medication_authorization FOR INSERT TO rede_app
  WITH CHECK (app_current_role() IN ('coordenador','gestor_geral')
              AND app_house_in_scope(house_id));

-- A autorização nominal é EDITADA quando ganha ou perde prazo (o `ON CONFLICT
-- ... DO UPDATE` de `authorizeEducator`). Sem política de UPDATE, esse caminho
-- falhava calado — a segunda autorização da mesma pessoa não mudava o prazo.
DROP POLICY IF EXISTS mauth_update ON medication_authorization;
CREATE POLICY mauth_update ON medication_authorization FOR UPDATE TO rede_app
  USING (app_current_role() IN ('coordenador','gestor_geral')
         AND app_house_in_scope(house_id))
  WITH CHECK (app_house_in_scope(house_id));

-- -----------------------------------------------------------------------------
-- E o mesmo defeito de fuso que já foi caçado em outros lugares, neste canto:
--
--     valid_from date NOT NULL DEFAULT current_date
--
-- `current_date` é o dia do BANCO, em UTC. Depois das 21h de Porto Alegre já é
-- o dia seguinte lá dentro. A coordenadora autorizava a educadora às 21h30, a
-- linha nascia com `valid_from` de AMANHÃ, e `app_can_administer` — que compara
-- com `app_hoje()`, o dia da instituição — respondia "você não consta como
-- educador autorizado" durante todo o turno da noite. A tela mostrava a
-- autorização escrita e o sistema recusava a dose: a pior combinação possível.
--
-- Regra 9: `app_hoje()`, nunca `current_date`.
-- -----------------------------------------------------------------------------
ALTER TABLE medication_authorization ALTER COLUMN valid_from SET DEFAULT app_hoje();
