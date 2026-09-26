-- O ARMÁRIO DIZ A VERDADE, E A NOTA FISCAL PRESTA CONTAS (fase 161).
--
-- PROMPT MESTRE de 25/09, e três decisões do humano em 26/09:
--
--  1. SALDO NEGATIVO, COM AVISO. A dose confirmada tirava 1 com
--     `greatest(quantidade - 1, 0)`: com o armário em zero, o saldo ficava em 0
--     e o movimento `consumo` era gravado mesmo assim (gatilho da 1260). Duas
--     contas que discordavam sem ninguém saber — o "negativo calado". Agora o
--     saldo desce abaixo de zero e a tela diz "saiu mais do que havia
--     registrado — conferir o armário" até alguém fazer a contagem. A DOSE
--     NUNCA É BLOQUEADA: o cuidado não depende de a casa ter cadastrado a caixa.
--  2. A NOTA FISCAL É SEPARADA DO ARMÁRIO. Ela presta contas (CNPJ, itens com
--     valor unitário, lote e validade); a entrada no armário continua sendo
--     lançada à parte, por quem guarda a caixa.
--  3. NOTA REPETIDA É RECUSADA: mesmo CNPJ e mesmo número, na mesma casa. A
--     segunda dobraria o gasto da prestação de contas.
--
-- E o que o inventário achou ao olhar as políticas: `mov_insert` era
-- `WITH CHECK (true)` e `stock_update` também. A chave estrangeira NÃO confere
-- alcance (lição da 146): qualquer conta do sistema, por uma consulta direta,
-- escreveria movimento no armário de OUTRA casa. As duas passam a conferir.

-- ---------------------------------------------------------------- o movimento
ALTER TABLE medication_stock_movement DROP CONSTRAINT IF EXISTS medication_stock_movement_kind_check;
ALTER TABLE medication_stock_movement ADD CONSTRAINT medication_stock_movement_kind_check
  CHECK (kind IN ('entrada','ajuste','consumo','descarte','saida_com_acolhido','perda','devolucao'));
-- De onde veio, que lote, que validade — só na entrada, e só se quem lança sabe.
ALTER TABLE medication_stock_movement
  ADD COLUMN IF NOT EXISTS lot text,
  ADD COLUMN IF NOT EXISTS lot_expires_on date,
  ADD COLUMN IF NOT EXISTS origin text;
DO $$ BEGIN
  ALTER TABLE medication_stock_movement ADD CONSTRAINT movimento_origem
    CHECK (origin IS NULL OR origin IN ('compra','doacao','farmacia_publica','familia','hospital','outro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS mov_insert ON medication_stock_movement;
CREATE POLICY mov_insert ON medication_stock_movement FOR INSERT TO rede_app
  WITH CHECK (EXISTS (SELECT 1 FROM medication_stock s WHERE s.id = stock_id
                        AND app_house_in_scope(s.house_id)));
DROP POLICY IF EXISTS stock_update ON medication_stock;
CREATE POLICY stock_update ON medication_stock FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id)
         AND app_current_role() IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral'))
  WITH CHECK (app_house_in_scope(house_id));

-- ---------------------------------------------------------------- a nota fiscal
ALTER TABLE medication_purchase ADD COLUMN IF NOT EXISTS supplier_cnpj text;
DO $$ BEGIN
  ALTER TABLE medication_purchase ADD CONSTRAINT compra_cnpj_normalizado
    CHECK (supplier_cnpj IS NULL OR supplier_cnpj ~ '^[0-9]{14}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- A mesma nota duas vezes na mesma casa: o índice é a última trava, e a função
-- abaixo recusa antes, dizendo quando e por quem a primeira entrou.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nota_da_casa
  ON medication_purchase (house_id, supplier_cnpj, upper(btrim(invoice_ref)))
  WHERE supplier_cnpj IS NOT NULL AND invoice_ref IS NOT NULL;

-- Os itens da nota, um por linha. Só cresce, como a nota.
CREATE TABLE IF NOT EXISTS medication_purchase_item (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES medication_purchase(id),
  house_id    uuid NOT NULL REFERENCES house(id),
  medication  text NOT NULL CHECK (length(btrim(medication)) >= 2),
  quantity    numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit        text NOT NULL DEFAULT 'unidade',
  unit_cents  integer CHECK (unit_cents IS NULL OR unit_cents >= 0),
  lot         text,
  expires_on  date
);
CREATE INDEX IF NOT EXISTS idx_item_da_nota ON medication_purchase_item (purchase_id);
ALTER TABLE medication_purchase_item ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON medication_purchase_item TO rede_app;
DROP POLICY IF EXISTS mpi_select ON medication_purchase_item;
CREATE POLICY mpi_select ON medication_purchase_item FOR SELECT TO rede_app
  USING (app_current_role() IN ('enfermagem','equipe_tecnica','lider_diurno','coordenador','gestor_geral')
         AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));

-- O registro da nota. A versão de 13 argumentos SAI: uma tela antiga que a
-- chamasse gravaria nota sem CNPJ e sem itens, e a trava de duplicidade não a
-- veria.
DROP FUNCTION IF EXISTS app_registrar_compra_medicamento(uuid, date, text, text, integer, text, text,
  text, text, text, text, integer, text);
CREATE OR REPLACE FUNCTION app_registrar_nota_de_compra(
  p_house uuid, p_em date, p_itens text, p_fornecedor text, p_cnpj text, p_total_cents integer,
  p_nota text, p_obs text, p_storage text, p_nome text, p_key text, p_mime text,
  p_size integer, p_sha text, p_itens_nf jsonb)
RETURNS TABLE (compra_id uuid, total_dos_itens integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_id uuid; v_ant record; it jsonb; v_soma integer := 0; v_tem_valor boolean := false;
        v_texto text;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app_current_role() NOT IN ('enfermagem','equipe_tecnica','lider_diurno',
                                'coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_compra' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- O texto dos itens continua existindo (é o que as telas antigas mostram);
  -- com itens detalhados, ele é escrito a partir deles.
  v_texto := btrim(coalesce(p_itens, ''));
  IF v_texto = '' AND jsonb_typeof(p_itens_nf) = 'array' AND jsonb_array_length(p_itens_nf) > 0 THEN
    SELECT string_agg(format('%s × %s', x->>'quantidade', x->>'medicamento'), '; ')
      INTO v_texto FROM jsonb_array_elements(p_itens_nf) x;
  END IF;
  IF coalesce(length(v_texto), 0) < 3 THEN
    RAISE EXCEPTION 'itens_obrigatorios' USING ERRCODE = 'check_violation';
  END IF;

  -- A NOTA REPETIDA, recusada com o que a pessoa precisa para conferir.
  IF p_cnpj IS NOT NULL AND nullif(btrim(p_nota), '') IS NOT NULL THEN
    SELECT c.bought_on, c.created_at, app_user_display_name(c.bought_by) AS por INTO v_ant
      FROM medication_purchase c
     WHERE c.house_id = p_house AND c.supplier_cnpj = p_cnpj
       AND upper(btrim(c.invoice_ref)) = upper(btrim(p_nota));
    IF FOUND THEN
      RAISE EXCEPTION 'nota_repetida: esta nota já foi lançada em % por %.',
        to_char(v_ant.created_at AT TIME ZONE app_fuso(), 'DD/MM/YYYY'), coalesce(v_ant.por, 'alguém da equipe')
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  INSERT INTO medication_purchase (house_id, bought_on, items, supplier, supplier_cnpj,
                                   total_cents, invoice_ref, note,
                                   storage_ref, display_name, bought_by,
                                   storage_key, mime, size_bytes, sha256)
  VALUES (p_house, p_em, v_texto, nullif(btrim(p_fornecedor), ''), p_cnpj,
          p_total_cents, nullif(btrim(p_nota), ''), nullif(btrim(p_obs), ''),
          nullif(btrim(coalesce(p_storage, '')), ''), p_nome, app_current_user(),
          p_key, p_mime, p_size, p_sha)
  RETURNING id INTO v_id;

  IF jsonb_typeof(p_itens_nf) = 'array' THEN
    FOR it IN SELECT * FROM jsonb_array_elements(p_itens_nf) LOOP
      INSERT INTO medication_purchase_item (purchase_id, house_id, medication, quantity, unit,
                                            unit_cents, lot, expires_on)
      VALUES (v_id, p_house, btrim(it->>'medicamento'), (it->>'quantidade')::numeric,
              coalesce(nullif(btrim(it->>'unidade'), ''), 'unidade'),
              (it->>'valorUnitarioCentavos')::integer, nullif(btrim(it->>'lote'), ''),
              nullif(it->>'validade', '')::date);
      IF it->>'valorUnitarioCentavos' IS NOT NULL THEN
        v_tem_valor := true;
        v_soma := v_soma + round((it->>'quantidade')::numeric * (it->>'valorUnitarioCentavos')::integer);
      END IF;
    END LOOP;
  END IF;

  -- Sem total informado, o total é a soma dos itens com valor.
  IF p_total_cents IS NULL AND v_tem_valor THEN
    UPDATE medication_purchase SET total_cents = v_soma WHERE id = v_id;
  END IF;

  RETURN QUERY SELECT v_id, CASE WHEN v_tem_valor THEN v_soma END;
END $$;
REVOKE ALL ON FUNCTION app_registrar_nota_de_compra(uuid, date, text, text, text, integer, text, text,
  text, text, text, text, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_nota_de_compra(uuid, date, text, text, text, integer, text, text,
  text, text, text, text, integer, text, jsonb) TO rede_app;

-- A lista do período passa a trazer o CNPJ e os itens.
DROP FUNCTION IF EXISTS app_compras_de_medicamento(uuid, date, date);
CREATE OR REPLACE FUNCTION app_compras_de_medicamento(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (id uuid, em date, itens text, fornecedor text, total_cents integer, nota text,
               observacao text, tem_anexo boolean, nome_do_anexo text, comprado_por text,
               cnpj text, itens_nf jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.id, c.bought_on, c.items, c.supplier, c.total_cents,
         c.invoice_ref, c.note,
         (c.storage_ref IS NOT NULL OR c.mime IS NOT NULL), c.display_name,
         app_user_display_name(c.bought_by), c.supplier_cnpj,
         coalesce((SELECT jsonb_agg(jsonb_build_object(
                     'medicamento', i.medication, 'quantidade', i.quantity, 'unidade', i.unit,
                     'valorUnitarioCentavos', i.unit_cents, 'lote', i.lot, 'validade', i.expires_on)
                     ORDER BY i.medication)
                     FROM medication_purchase_item i WHERE i.purchase_id = c.id), '[]'::jsonb)
    FROM medication_purchase c
   WHERE c.house_id = p_house
     AND app_house_in_scope(p_house)
     AND app_current_role() IN ('enfermagem','equipe_tecnica','lider_diurno',
                                'coordenador','gestor_geral')
     AND c.bought_on BETWEEN p_de AND p_ate
   ORDER BY c.bought_on DESC, c.created_at DESC
$$;
REVOKE ALL ON FUNCTION app_compras_de_medicamento(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_compras_de_medicamento(uuid, date, date) TO rede_app;

-- ---------------------------------------------------------------- o saldo verdadeiro
-- A versão vigente da dose (1583), copiada; só a baixa do estoque mudou.
CREATE OR REPLACE FUNCTION app_confirm_dose(
  p_admin_id uuid, p_state text, p_note text, p_happened_at timestamptz,
  p_offline boolean, p_device text, p_institutional boolean, p_client_op text
) RETURNS TABLE (out_id uuid, out_state text) AS $$
DECLARE
  v_adm medication_administration%ROWTYPE;
  v_period text; v_pode boolean; v_motivo text;
  v_nurse_only boolean; v_nurse_reason text; v_med text; v_nominal boolean;
BEGIN
  SELECT * INTO v_adm FROM medication_administration WHERE id = p_admin_id FOR UPDATE;
  IF v_adm.id IS NULL THEN
    RAISE EXCEPTION 'dose_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_adm.administered_by IS NOT NULL THEN
    RAISE EXCEPTION 'dose_ja_confirmada' USING ERRCODE = 'unique_violation';
  END IF;

  -- O turno da dose pela regra de 25/09 (1573), e no fuso da instituição.
  v_period := (SELECT t.periodo FROM app_turno_de(v_adm.house_id, v_adm.scheduled_at) t);

  SELECT c.pode, c.motivo INTO v_pode, v_motivo
    FROM app_can_administer(v_adm.house_id, v_period) c;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'protocolo: %', v_motivo USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.nurse_only, p.nurse_only_reason, p.medication
    INTO v_nurse_only, v_nurse_reason, v_med
    FROM prescription p WHERE p.id = v_adm.prescription_id;

  IF coalesce(v_nurse_only, false) AND app_current_role() <> 'enfermagem' THEN
    RAISE EXCEPTION 'protocolo: % está marcado como exclusivo da Enfermagem: %. Acione a Enfermagem e registre a dose com ela.',
      v_med, coalesce(v_nurse_reason, 'sem motivo registrado')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF coalesce(p_offline, false) THEN
    RAISE EXCEPTION 'dose_sem_sinal' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE medication_administration
     SET state = p_state::administration_state,
         administered_by = app_current_user(),
         administered_at = coalesce(p_happened_at, now()),
         recorded_at = now(),
         offline = false,
         device = p_device,
         institutional_device = coalesce(p_institutional, false),
         note = p_note,
         client_op_id = coalesce(p_client_op, client_op_id)
   WHERE id = p_admin_id;

  /*
   * BAIXA DE ESTOQUE: UMA linha, nunca duas — o estoque nominal do acolhido
   * tem precedência sobre o comum da casa, porque é dele que a dose saiu.
   *
   * Este trecho vem da 0380 e por pouco não se perdeu aqui: reescrever a
   * função inteira para mudar duas regras deixou de fora a parte em que
   * ninguém estava pensando. Quem pegou foi `regressao-estado.e2e`, que conta
   * o estoque depois de confirmar — e é por isso que a suíte roda antes de
   * qualquer entrega. Vale como aviso para a próxima reescrita: CREATE OR
   * REPLACE substitui o corpo todo, inclusive o que não estava em discussão.
   */
  IF p_state LIKE 'administrado%' THEN
    SELECT EXISTS (
      SELECT 1 FROM medication_stock st
      WHERE st.house_id = v_adm.house_id AND st.medication = v_med
        AND st.person_id = v_adm.person_id) INTO v_nominal;

    -- SALDO VERDADEIRO (fase 161, decisão de 26/09): sem `greatest(..., 0)`.
    -- A dose NUNCA é bloqueada; se o armário estava em zero, o saldo fica
    -- negativo e a tela avisa "saiu mais do que havia — conferir o armário".
    UPDATE medication_stock st SET quantity = quantity - 1, updated_at = now()
     WHERE st.house_id = v_adm.house_id AND st.medication = v_med
       AND (CASE WHEN v_nominal THEN st.person_id = v_adm.person_id
                 ELSE st.person_id IS NULL END);
  END IF;

  RETURN QUERY SELECT p_admin_id, p_state;
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_confirm_dose(uuid,text,text,timestamptz,boolean,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_confirm_dose(uuid,text,text,timestamptz,boolean,text,boolean,text) TO rede_app;

-- A saída com a família (1050, versão do catálogo): a mesma regra do saldo.
CREATE OR REPLACE FUNCTION public.app_registrar_saida_de_medicamentos(p_family_stay uuid, p_itens jsonb)
 RETURNS TABLE(registrada boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
         SET quantity = quantity - (it->>'doses')::numeric, updated_at = now()
       WHERE id = v_stock;

      INSERT INTO medication_stock_movement (stock_id, kind, quantity, reason, by_user)
      VALUES (v_stock, 'saida_com_acolhido', (it->>'doses')::numeric,
              'Saiu com o acolhido para o período com a família',
              app_current_user());
    END IF;
  END LOOP;

  RETURN QUERY SELECT true;
END $function$;
