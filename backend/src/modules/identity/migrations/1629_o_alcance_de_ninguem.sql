-- O ALCANCE DE NINGUÉM (fase 173).
--
-- A simulação de noventa dias da ARM1 achou o botão Gerar pendências dos
-- acompanhamentos mandando o corpo vazio, sem a casa. A função conferia
-- `NOT app_house_in_scope(p_house)` e seguia: com a casa nula, a resposta
-- não era falso, era NULL (`NULL IN (...)`), e `IF NOT NULL` não entra. A
-- guarda deixava passar, nada era criado, e a tela dizia que a automação
-- tinha criado as pendências.
--
-- Setenta e seis funções do banco usam a mesma guarda. A pergunta "esta casa
-- está no seu alcance?" sobre casa nenhuma tem uma resposta só: não. O mesmo
-- para a pessoa, onde o gestor recebia SIM para pessoa nenhuma.
--
-- As duas são as versões vigentes (1591 e 0770), copiadas; só a primeira
-- linha de cada uma entrou.

CREATE OR REPLACE FUNCTION app_house_in_scope(target uuid) RETURNS boolean AS $$
  SELECT CASE
    WHEN target IS NULL THEN false
    -- A PORTARIA NÃO ALCANÇA A CASA (fase 160): ela tem vínculo com a casa, e
    -- sem esta linha herdaria a leitura de perfis, saúde, relatos e ATA — tudo
    -- o que se apoia nesta função. Ela enxerga só pelas funções da portaria.
    WHEN app_current_role() = 'portaria' THEN false
    WHEN app_current_role() IN ('gestor_geral','enfermagem','lider_noturno_geral','admin_tecnico')
      THEN EXISTS (
        SELECT 1 FROM house h
        JOIN app_user u ON u.id = app_current_user()
        WHERE h.id = target AND h.institution_id = u.institution_id)
    ELSE target IN (SELECT app_user_house_ids())
  END
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION app_person_in_scope(p uuid) RETURNS boolean AS $$
  SELECT CASE
    WHEN p IS NULL THEN false
    WHEN app_person_house(p) IS NOT NULL THEN app_house_in_scope(app_person_house(p))
    WHEN app_current_role() = 'gestor_geral' THEN true
    WHEN app_current_role() IN ('equipe_tecnica','coordenador') THEN EXISTS (
      SELECT 1 FROM house_stay s
      WHERE s.person_id = p AND app_house_in_scope(s.house_id))
    ELSE false
  END
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
