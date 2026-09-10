-- ============================================================
-- 1050 — O remédio que vai junto
--
-- Pedido do Marcelo em 09/09: quando a criança sai para passar dias com a
-- família (1010), a casa precisa sinalizar à equipe técnica quais remédios e
-- quantas doses ela leva — e isso tem de sair em papel timbrado, porque quem
-- recebe a criança do outro lado precisa da orientação escrita.
--
-- POR QUE ISTO EXISTE. Desde a 1010, quem está com a família sai da grade: a
-- casa não é lembrada da dose das 20h porque não é ela quem vai dar. O efeito
-- colateral é que o remédio deixa de aparecer em qualquer lugar — e uma
-- criança em uso contínuo que passa o fim de semana fora sem a medicação é o
-- pior desfecho possível dessa decisão.
--
-- DUAS COISAS SEPARADAS, DE PROPÓSITO:
--
--  * a FOLHA calcula e mostra. Pode ser gerada quantas vezes for preciso, e
--    não muda nada no sistema;
--  * a SAÍDA registra que os comprimidos deixaram o armário. É um ato, é
--    idempotente por saída, e não pode acontecer duas vezes.
--
-- Se as duas fossem uma coisa só, imprimir a folha de novo — porque o papel
-- amassou, porque a mãe pediu outra via — daria baixa duas vezes no armário.
--
-- O MOVIMENTO NÃO É `consumo`. A casa não deu a dose: os comprimidos saíram
-- com a criança e quem administra é a família. Registrar como consumo faria o
-- histórico dizer que a casa administrou o que ela não viu ninguém tomar.
-- ============================================================

ALTER TABLE medication_stock_movement DROP CONSTRAINT IF EXISTS medication_stock_movement_kind_check;
ALTER TABLE medication_stock_movement ADD CONSTRAINT medication_stock_movement_kind_check
  CHECK (kind IN ('entrada','ajuste','consumo','descarte','saida_com_acolhido'));

-- Uma saída de medicamentos por período fora, e não mais.
CREATE TABLE IF NOT EXISTS family_stay_medication (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_stay_id uuid NOT NULL REFERENCES family_stay(id),
  house_id       uuid NOT NULL REFERENCES house(id),
  registered_by  uuid NOT NULL REFERENCES app_user(id),
  registered_at  timestamptz NOT NULL DEFAULT now(),
  -- O que saiu, congelado no momento da saída. A prescrição pode mudar depois,
  -- e o papel que foi para a mão da família tem de continuar explicável.
  itens          jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_family_stay_medication
  ON family_stay_medication (family_stay_id);

ALTER TABLE family_stay_medication ENABLE ROW LEVEL SECURITY;
CREATE POLICY fsm_select ON family_stay_medication FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
CREATE POLICY fsm_insert ON family_stay_medication FOR INSERT TO rede_app WITH CHECK (false);
GRANT SELECT ON family_stay_medication TO rede_app;

-- ------------------------------------------------------------
-- O que a criança precisa levar.
--
-- Conta as doses previstas entre a saída e o retorno: para cada esquema ativo,
-- os horários que caem nos dias do período. É a mesma conta que a grade faria
-- se a criança estivesse na casa.
--
-- Arredonda PARA CIMA no dia do retorno: se ela volta às 18h e tem dose às
-- 20h, a dose das 20h é da casa — mas mandar um comprimido a mais é barato, e
-- faltar um não é. A folha diz isso por extenso.
-- ------------------------------------------------------------
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
         count(*) FILTER (WHERE true)::integer * 0
           + (SELECT count(*)::integer
                FROM f, generate_series(f.d_ini, f.d_fim, interval '1 day') AS d
                WHERE EXTRACT(dow FROM d)::smallint = ANY (s.weekdays)),
         (SELECT st.quantity FROM medication_stock st
           WHERE st.house_id = p.house_id AND st.medication = p.medication
             AND (st.person_id = p.person_id OR st.person_id IS NULL)
           ORDER BY (st.person_id IS NULL) LIMIT 1),
         coalesce(p.nurse_only, false)
    FROM f
    JOIN prescription p ON p.person_id = f.person_id AND p.status = 'ativa'
    JOIN medication_schedule s ON s.prescription_id = p.id
   GROUP BY p.id, p.medication, p.dose, p.route, p.instructions,
            p.house_id, p.person_id, p.nurse_only, s.weekdays
   ORDER BY p.medication
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_medicamentos_para_levar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_medicamentos_para_levar(uuid) TO rede_app;

-- ------------------------------------------------------------
-- Registrar que os medicamentos saíram — uma vez só.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_registrar_saida_de_medicamentos(
  p_family_stay uuid, p_itens jsonb)
RETURNS TABLE (registrada boolean) AS $$
DECLARE f record; it jsonb; v_stock uuid;
BEGIN
  SELECT * INTO f FROM family_stay WHERE id = p_family_stay;
  IF f IS NULL OR NOT app_house_in_scope(f.house_id) THEN
    RAISE EXCEPTION 'saida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF app_current_role() NOT IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_saida_medicamento' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO family_stay_medication (family_stay_id, house_id, registered_by, itens)
  VALUES (p_family_stay, f.house_id, app_current_user(), p_itens);
  -- O índice único recusa a segunda: imprimir a folha de novo não pode dar
  -- baixa de novo.

  FOR it IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    SELECT st.id INTO v_stock
      FROM medication_stock st
     WHERE st.house_id = f.house_id
       AND st.medication = (it->>'medicamento')
       AND (st.person_id = f.person_id OR st.person_id IS NULL)
     ORDER BY (st.person_id IS NULL) LIMIT 1;

    IF v_stock IS NOT NULL THEN
      UPDATE medication_stock
         SET quantity = greatest(quantity - (it->>'doses')::numeric, 0), updated_at = now()
       WHERE id = v_stock;

      INSERT INTO medication_stock_movement (stock_id, kind, quantity, reason, by_user)
      VALUES (v_stock, 'saida_com_acolhido', (it->>'doses')::numeric,
              'Saiu com o acolhido para o período com a família',
              app_current_user());
    END IF;
  END LOOP;

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_registrar_saida_de_medicamentos(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_saida_de_medicamentos(uuid, jsonb) TO rede_app;

CREATE OR REPLACE FUNCTION app_saida_de_medicamentos(p_family_stay uuid)
RETURNS TABLE (itens jsonb, registrado_por text, registrado_em timestamptz) AS $$
  SELECT m.itens, app_user_display_name(m.registered_by), m.registered_at
    FROM family_stay_medication m
   WHERE m.family_stay_id = p_family_stay
     AND m.house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_saida_de_medicamentos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_saida_de_medicamentos(uuid) TO rede_app;
