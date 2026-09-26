-- A REGRA NOVA DA ATA NAS FUNÇÕES DO COMPROMISSO (fase 157).
--
-- Até aqui estas funções tinham a janela 07h–19h escrita à mão. A regra
-- decidida pela Fundação em 25/09 — diurna 08:00–20:00, noturna 20:01–07:59,
-- da data em que começou — mora em `app_janela_do_turno` e `app_periodo_da_hora`
-- (identity/1573), e é a elas que estas funções passam a perguntar. Só a
-- expressão da janela mudou; o resto de cada função é a versão vigente, copiada.

CREATE OR REPLACE FUNCTION app_staff_for_commitment(
  p_house uuid, p_dia date, p_time time)
RETURNS TABLE (user_id uuid, nome text, cargo text, na_escala boolean, ha_escala boolean) AS $$
  WITH lancada AS (
    SELECT EXISTS (
      SELECT 1 FROM shift_assignment a
       WHERE a.house_id = p_house AND a.on_date = p_dia AND a.revoked_at IS NULL
    ) AS sim
  )
  SELECT * FROM (
    SELECT u.id, u.full_name, u.role::text,
           EXISTS (
             SELECT 1 FROM shift_assignment e
              WHERE e.user_id = u.id
                AND e.house_id = p_house
                AND e.on_date = p_dia
                AND e.revoked_at IS NULL
                /*
                 * O HORÁRIO: o que a escala gravou, ou a janela do turno.
                 *
                 * `start_time` e `end_time` são opcionais na `shift_assignment`
                 * (0950) — quem lança pode dizer só "diurno". Quando estão lá,
                 * valem eles, porque a casa foi específica de propósito; quando
                 * não, vale a janela do turno: diurno 08:00–20:00, noturno 20:01–07:59 (1573).
                 *
                 * 19h é a fronteira porque é a do plantão noturno, que pertence
                 * ao dia em que COMEÇOU (§12.1) — a mesma que a 0960 usava para
                 * classificar a escala semanal.
                 */
                AND CASE
                      WHEN e.start_time IS NOT NULL AND e.end_time IS NOT NULL THEN
                        CASE WHEN e.end_time > e.start_time
                             THEN p_time >= e.start_time AND p_time < e.end_time
                             ELSE p_time >= e.start_time OR p_time < e.end_time
                        END
                      WHEN e.period = 'noturno' THEN
                        app_periodo_da_hora(p_time) = 'noturno'
                      ELSE
                        app_periodo_da_hora(p_time) = 'diurno'
                    END
           ) AS na_escala,
           (SELECT sim FROM lancada) AS ha_escala
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
$$ LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_staff_for_commitment(uuid, date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_staff_for_commitment(uuid, date, time) TO rede_app;
