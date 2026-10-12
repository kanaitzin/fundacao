-- A EQUIPE DAS OITO SEM ESPERAR (fase 205).
--
-- A simulação das oito casas com vinte pessoas cada, por seis meses, mediu a
-- lista da Equipe da Coordenação Geral em quase um segundo (913 ms; era 582 na
-- fase 177, com nove pessoas por casa). O plano mostrou duas perguntas feitas
-- pessoa por pessoa que não precisavam ser:
--
--   1. "Último acesso": o máximo das sessões de cada pessoa, sessão por sessão.
--      Seis meses deram 12.500 sessões; o índice era só por pessoa, e cada
--      pessoa lia as suas sessenta. Com o índice por pessoa E data, o máximo é
--      uma leitura só.
--   2. "Posso editar esta pessoa?": o cargo de quem pergunta, relido em cada
--      linha. Agora a lista dos cargos que quem pergunta administra é lida uma
--      vez, antes, e cada linha só confere se o cargo dela está na lista.
--
-- O que a função devolve e quem ela deixa ver não mudam: as mesmas colunas, a
-- mesma conferência de casa (`app_house_in_scope`, `app_casa_da_conta_no_alcance`).

CREATE INDEX IF NOT EXISTS idx_session_user_quando ON user_session (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION app_staff_list()
 RETURNS TABLE(id uuid, full_name text, email text, role text, active boolean, house_code text,
               house_id uuid, last_login timestamp with time zone, must_change_password boolean,
               editavel boolean, line_color text, todas_as_casas boolean)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH quem AS (
    SELECT app_current_role() AS papel,
           (SELECT institution_id FROM app_user WHERE id = app_current_user()) AS instituicao
  ), administra AS (
    SELECT coalesce(array_agg(g.grantable_role), '{}') AS cargos
      FROM staff_role_grant g, quem WHERE g.creator_role = quem.papel
  )
  SELECT u.id, u.full_name, u.email, u.role::text, u.active,
         app_house_label(a.house_id), a.house_id,
         (SELECT s.created_at FROM user_session s WHERE s.user_id = u.id
           ORDER BY s.created_at DESC LIMIT 1),
         u.must_change_password,
         u.role = ANY (administra.cargos),
         u.line_color, u.todas_as_casas
  FROM app_user u
  CROSS JOIN quem
  CROSS JOIN administra
  LEFT JOIN user_house_assignment a ON a.user_id = u.id AND a.valid_to IS NULL
  CROSS JOIN LATERAL app_casa_da_conta_no_alcance(u.id) h
  WHERE u.institution_id = quem.instituicao
    AND quem.papel IN ('coordenador','gestor_geral','equipe_tecnica')
    AND (
      (a.house_id IS NOT NULL AND app_house_in_scope(a.house_id))
      OR (a.house_id IS NULL AND (
            (h.tem_casa AND h.casa IS NOT NULL)
            OR (NOT h.tem_casa AND u.role = ANY (administra.cargos))))
    )
  ORDER BY u.full_name
$function$;
REVOKE ALL ON FUNCTION app_staff_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_staff_list() TO rede_app;
