-- A PORTARIA SÓ VÊ A PORTARIA (fase 160).
--
-- `app_house_in_scope` dá a casa INTEIRA a qualquer cargo com vínculo, e quase
-- toda política do banco se apoia nela — perfis, saúde, relatos, ATA. Um cargo
-- de acesso mínimo não pode herdar isso só por ter vínculo. Para a portaria a
-- resposta é NÃO, aqui e no conjunto (`app_casas_no_alcance`), e o que ela vê
-- vem das funções da portaria (people/1592), que conferem o vínculo dela com a
-- casa sem abrir nada além da lista de visitantes.
--
-- As duas funções são as versões vigentes (0010 e 0920), copiadas; só a linha
-- da portaria entrou. E `search_path` declarado, como toda SECURITY DEFINER.

CREATE OR REPLACE FUNCTION app_house_in_scope(target uuid) RETURNS boolean AS $$
  SELECT CASE
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

CREATE OR REPLACE FUNCTION app_casas_no_alcance() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT unnest(
    CASE
      WHEN app_current_role() = 'portaria' THEN ARRAY[]::uuid[]
      WHEN app_current_role() IN ('gestor_geral','enfermagem','lider_noturno_geral','admin_tecnico')
        THEN ARRAY(SELECT h.id FROM house h
                     JOIN app_user u ON u.id = app_current_user()
                    WHERE h.institution_id = u.institution_id)
      ELSE ARRAY(SELECT app_user_house_ids())
    END)
$$;

-- Quem cria a conta da portaria: coordenação, equipe técnica e gestão — os
-- mesmos que respondem por quem entra na casa.
INSERT INTO staff_role_grant (creator_role, grantable_role)
SELECT c, 'portaria'::role_code FROM unnest(ARRAY['coordenador','equipe_tecnica','gestor_geral']::role_code[]) c
 WHERE NOT EXISTS (SELECT 1 FROM staff_role_grant g WHERE g.creator_role = c AND g.grantable_role = 'portaria');
