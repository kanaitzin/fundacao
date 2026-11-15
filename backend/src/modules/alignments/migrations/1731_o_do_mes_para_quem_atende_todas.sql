-- O FUNCIONÁRIO DO MÊS DA CASA TAMBÉM PARA QUEM ATENDE TODAS AS CASAS (conferência de 15/11).
--
-- Usando o sistema como a Enfermagem: a 1728 deixava ler o funcionário do mês da casa só a quem
-- tem vínculo com ela, o Gestor Geral e a Coordenação Geral. A Enfermagem e o Líder Noturno
-- Geral, que atendem todas as casas sem vínculo com nenhuma, recebiam erro no cartão da casa
-- dos Encontros. Agora lê também quem alcança a casa; a cozinha e a portaria, que a
-- `app_house_in_scope` não alcança, continuam lendo pelo vínculo.

CREATE OR REPLACE FUNCTION app_le_o_do_mes(p_house uuid, p_inst uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce((
    SELECT me.active AND me.institution_id = p_inst
       AND (p_house IS NULL
            OR me.role::text = 'gestor_geral'
            OR me.todas_as_casas
            OR coalesce(app_house_in_scope(p_house), false)
            OR EXISTS (SELECT 1 FROM user_house_assignment a
                        WHERE a.user_id = me.id AND a.house_id = p_house
                          AND a.valid_from <= app_hoje()
                          AND (a.valid_to IS NULL OR a.valid_to >= app_hoje())))
      FROM app_user me WHERE me.id = app_current_user()), false)
$$;
