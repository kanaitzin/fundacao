-- AS DOSES DENTRO DA RECEITA (fase 229).
--
-- A conta das doses que vão com a criança (1050, refeita na 1658) contava os
-- dias da saída inteira e não olhava o começo nem o fim da receita: o
-- antibiótico que termina no meio da saída ia com doses para depois do fim do
-- tratamento, e a receita que começa no último dia ia com as doses de todos os
-- dias. A grade da casa (`app_generate_doses`) sempre olhou as duas datas.
--
-- Agora cada horário conta só os dias da saída em que a receita vale, e a
-- receita sem nenhuma dose no período não entra na folha.

CREATE OR REPLACE FUNCTION app_medicamentos_para_levar(p_family_stay uuid)
RETURNS TABLE (prescription_id uuid, medicamento text, dose text, via text,
               orientacoes text, horarios text, doses integer,
               em_estoque numeric, so_enfermagem boolean) AS $$
  WITH f AS (
    SELECT fs.*, (fs.started_at AT TIME ZONE app_fuso())::date AS d_ini,
           (fs.expected_return_at AT TIME ZONE app_fuso())::date AS d_fim
      FROM family_stay fs
     WHERE fs.id = p_family_stay
       AND app_house_in_scope(fs.house_id)
  )
  SELECT p.id, p.medication, p.dose, p.route, p.instructions,
         string_agg(to_char(s.time_of_day, 'HH24:MI'), ', ' ORDER BY s.time_of_day),
         sum(n.dias)::integer,
         (SELECT st.quantity FROM medication_stock st
           WHERE st.house_id = p.house_id AND st.medication = p.medication
             AND (st.person_id = p.person_id OR st.person_id IS NULL)
           ORDER BY (st.person_id IS NULL) LIMIT 1),
         coalesce(p.nurse_only, false)
    FROM f
    JOIN prescription p ON p.person_id = f.person_id AND p.status = 'ativa'
    JOIN medication_schedule s ON s.prescription_id = p.id
    CROSS JOIN LATERAL (
      SELECT count(*) AS dias
        FROM generate_series(greatest(f.d_ini, p.starts_on),
                             least(f.d_fim, coalesce(p.ends_on, f.d_fim)),
                             interval '1 day') AS d
       WHERE EXTRACT(dow FROM d)::smallint = ANY (s.weekdays)
    ) n
   GROUP BY p.id, p.medication, p.dose, p.route, p.instructions,
            p.house_id, p.person_id, p.nurse_only
  HAVING sum(n.dias) > 0
   ORDER BY p.medication
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_medicamentos_para_levar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_medicamentos_para_levar(uuid) TO rede_app;
