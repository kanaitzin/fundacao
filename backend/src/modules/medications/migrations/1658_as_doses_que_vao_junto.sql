-- AS DOSES QUE VÃO COM A CRIANÇA (fase 228).
--
-- A conta da 1050 agrupava os horários pelos dias da semana e multiplicava a
-- quantidade de horários por zero: um remédio de duas vezes ao dia, em três
-- dias com a família, saía com três doses, e não seis. E o remédio com
-- horários em dias diferentes da semana saía em duas linhas.
--
-- Agora cada horário conta os dias da saída em que ele vale, e o remédio sai
-- numa linha só, com a soma. Os dias continuam os de calendário, do dia em que
-- a criança sai ao dia em que volta, os dois inteiros: a casa manda a dose do
-- dia do retorno.

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
  ),
  dias AS (
    SELECT EXTRACT(dow FROM d)::smallint AS dow
      FROM f, generate_series(f.d_ini, f.d_fim, interval '1 day') AS d
  )
  SELECT p.id, p.medication, p.dose, p.route, p.instructions,
         string_agg(to_char(s.time_of_day, 'HH24:MI'), ', ' ORDER BY s.time_of_day),
         sum((SELECT count(*) FROM dias WHERE dias.dow = ANY (s.weekdays)))::integer,
         (SELECT st.quantity FROM medication_stock st
           WHERE st.house_id = p.house_id AND st.medication = p.medication
             AND (st.person_id = p.person_id OR st.person_id IS NULL)
           ORDER BY (st.person_id IS NULL) LIMIT 1),
         coalesce(p.nurse_only, false)
    FROM f
    JOIN prescription p ON p.person_id = f.person_id AND p.status = 'ativa'
    JOIN medication_schedule s ON s.prescription_id = p.id
   GROUP BY p.id, p.medication, p.dose, p.route, p.instructions,
            p.house_id, p.person_id, p.nurse_only
   ORDER BY p.medication
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_medicamentos_para_levar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_medicamentos_para_levar(uuid) TO rede_app;
