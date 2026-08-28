-- ============================================================
-- 0610 — ESCALA AUSENTE NÃO É "FORA DA ESCALA" (§7)
--
-- Na tela de marcar compromisso, a lista de quem pode ser responsável saía
-- assim, com os oito nomes da casa:
--
--     Carla Coordenadora (fora da escala deste horário)
--     Gustavo Gestor     (fora da escala deste horário)
--     Joana Lima         (fora da escala deste horário)
--     ... e assim por diante
--
-- Não porque todos estivessem de folga: porque a casa ainda não tem NENHUMA
-- escala cadastrada. Um aviso que aparece em todo nome deixa de ser aviso —
-- e, pior, ensina a equipe a ignorá-lo justamente antes do dia em que ele
-- vai apontar a pessoa errada de verdade.
--
-- A função passa a dizer também se existe escala para aquele dia. Com isso a
-- tela separa duas frases que são coisas diferentes: "esta pessoa não está
-- de serviço neste horário" e "esta casa ainda não registrou a escala".
-- A segunda é um item de preparação do piloto, não um alerta operacional.
--
-- `na_escala` continua com o mesmo significado; o que muda é haver como
-- saber quando ele não significa nada.
-- ============================================================

DROP FUNCTION IF EXISTS app_staff_for_commitment(uuid, smallint, time);

CREATE OR REPLACE FUNCTION app_staff_for_commitment(
  p_house uuid, p_weekday smallint, p_time time)
RETURNS TABLE (user_id uuid, nome text, cargo text, na_escala boolean, ha_escala boolean) AS $$
  WITH escala_do_dia AS (
    SELECT EXISTS (
      SELECT 1 FROM work_schedule w
       WHERE (w.house_id = p_house OR w.house_id IS NULL)
         AND w.weekday = p_weekday
         AND w.valid_from <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
         AND (w.valid_to IS NULL OR w.valid_to >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
    ) AS sim
  )
  SELECT * FROM (
    SELECT u.id, u.full_name, u.role::text,
           EXISTS (
             SELECT 1 FROM work_schedule w
              WHERE w.user_id = u.id
                AND (w.house_id = p_house OR w.house_id IS NULL)
                AND w.weekday = p_weekday
                AND w.valid_from <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
                AND (w.valid_to IS NULL OR w.valid_to >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
                -- Plantão que cruza a meia-noite conta as duas pontas.
                AND (CASE WHEN w.end_time > w.start_time
                          THEN p_time >= w.start_time AND p_time < w.end_time
                          ELSE p_time >= w.start_time OR p_time < w.end_time
                     END)
           ) AS na_escala,
           (SELECT sim FROM escala_do_dia) AS ha_escala
      FROM app_user u
     WHERE u.active
       AND app_house_in_scope(p_house)
       AND (
         -- Equipe com vínculo vigente nesta casa…
         EXISTS (SELECT 1 FROM user_house_assignment a
                  WHERE a.user_id = u.id AND a.house_id = p_house
                    AND a.valid_from <= now() AND (a.valid_to IS NULL OR a.valid_to > now()))
         -- …ou função transversal, que alcança as oito por definição (§5.13).
         OR u.role IN ('enfermagem','lider_noturno_geral','gestor_geral')
       )
       AND u.role <> 'cozinha'   -- a cozinha não acompanha saída nem atividade
  ) equipe
  -- Quem está na escala do horário aparece primeiro; os demais continuam
  -- disponíveis, porque escala muda e troca de plantão existe.
  ORDER BY equipe.na_escala DESC, equipe.full_name
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_staff_for_commitment(uuid, smallint, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_staff_for_commitment(uuid, smallint, time) TO rede_app;
