-- ============================================================
-- REPETIR A ESCALA DO MÊS ANTERIOR, COMO RASCUNHO (fase 165).
--
-- Pedido de 25/09: *"Repetir escala do mês anterior. Essa função deve copiar a
-- escala anterior para o novo mês como rascunho editável. Não publique
-- automaticamente sem revisão."*
--
-- Três decisões de 27/09 moram aqui:
--
--  * o rascunho mora em TABELA PRÓPRIA, e não numa marca em `shift_assignment`.
--    Nove funções leem a escala (a cobrança da passagem, os relatos da
--    ocorrência, a agenda, as métricas…), e uma marca exigiria que as nove
--    lembrassem de ignorá-la. Separado, o rascunho não é cobrado de ninguém
--    porque ninguém o lê por engano;
--  * **só quem monta a escala vê o rascunho** (coordenação, equipe técnica,
--    Líder Diurno e gestão). A equipe vê a escala depois de publicada;
--  * **cada dia do mês novo copia o mesmo dia da semana, quatro semanas
--    antes** (oito, se quatro caírem dentro do próprio mês novo). Quem faz
--    segunda e quarta continua na segunda e quarta, e a 12x36 continua
--    alternando certo, porque 28 é par.
--
-- Nada se apaga: tirar alguém do rascunho marca a linha como retirada, e
-- descartar o rascunho inteiro marca o rascunho, com quem e por quê.
-- ============================================================

CREATE TABLE shift_draft (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id        uuid NOT NULL REFERENCES house(id),
  -- O primeiro dia do mês que o rascunho monta.
  month           date NOT NULL CHECK (extract(day FROM month) = 1),
  created_by      uuid NOT NULL REFERENCES app_user(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  published_by    uuid REFERENCES app_user(id),
  published_at    timestamptz,
  discarded_by    uuid REFERENCES app_user(id),
  discarded_at    timestamptz,
  discard_reason  text,
  CHECK (published_at IS NULL OR discarded_at IS NULL)
);
-- Um rascunho aberto por casa e mês: dois rascunhos do mesmo mês seriam duas
-- versões da mesma escala, e a publicação de um apagaria o trabalho do outro.
CREATE UNIQUE INDEX uq_rascunho_aberto ON shift_draft (house_id, month)
  WHERE published_at IS NULL AND discarded_at IS NULL;

CREATE TABLE shift_draft_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id        uuid NOT NULL REFERENCES shift_draft(id),
  user_id         uuid NOT NULL REFERENCES app_user(id),
  on_date         date NOT NULL,
  period          text NOT NULL CHECK (period IN ('diurno','noturno')),
  start_time      time,
  end_time        time,
  note            text,
  -- De onde a linha veio: o plantão copiado. Nulo quando foi incluída à mão.
  source_assignment_id uuid REFERENCES shift_assignment(id),
  added_by        uuid NOT NULL REFERENCES app_user(id),
  added_at        timestamptz NOT NULL DEFAULT now(),
  removed_by      uuid REFERENCES app_user(id),
  removed_at      timestamptz
);
CREATE UNIQUE INDEX uq_rascunho_item_vivo ON shift_draft_item (draft_id, user_id, on_date, period)
  WHERE removed_at IS NULL;
CREATE INDEX idx_rascunho_item ON shift_draft_item (draft_id, on_date);

-- Lidas e escritas só pelas funções abaixo, que conferem cargo e casa.
ALTER TABLE shift_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_draft_item ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------
-- A conferência comum: quem monta a escala, e na casa dele.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_pode_montar_escala(p_house uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF app_current_role() NOT IN ('lider_diurno','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'escala: quem monta a escala da casa é a coordenação, a equipe técnica ou o Líder Diurno dela.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;
REVOKE ALL ON FUNCTION app_pode_montar_escala(uuid) FROM PUBLIC;

-- ------------------------------------------------------------------
-- 1. Repetir: cria o rascunho do mês copiando o mesmo dia da semana.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_repetir_escala(p_house uuid, p_mes date)
RETURNS TABLE (rascunho_id uuid, copiados int, fora_por_inativo text[])
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_mes date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_id uuid; v_n int;
  v_inativos text[];
BEGIN
  PERFORM app_pode_montar_escala(p_house);
  IF v_mes < date_trunc('month', app_hoje())::date THEN
    RAISE EXCEPTION 'escala: o rascunho é para o mês atual ou os próximos; mês que já passou não se remonta.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM shift_draft d WHERE d.house_id = p_house AND d.month = v_mes
               AND d.published_at IS NULL AND d.discarded_at IS NULL) THEN
    RAISE EXCEPTION 'escala: já existe um rascunho aberto para este mês. Publique ou descarte o anterior.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO shift_draft (house_id, month, created_by)
  VALUES (p_house, v_mes, app_current_user()) RETURNING id INTO v_id;

  /* Quem saiu da Fundação não é copiado: ele aparece na resposta, pelo nome,
     para quem monta saber que aquele lugar ficou vazio. */
  WITH origem AS (
    SELECT d::date AS dia,
           CASE WHEN d::date - 28 < v_mes THEN d::date - 28 ELSE d::date - 56 END AS de
      FROM generate_series(v_mes, v_fim, interval '1 day') d
  )
  SELECT array_agg(DISTINCT app_user_display_name(a.user_id))
    INTO v_inativos
    FROM origem o
    JOIN shift_assignment a ON a.house_id = p_house AND a.on_date = o.de
                           AND a.revoked_at IS NULL
    JOIN app_user u ON u.id = a.user_id
   WHERE NOT u.active;

  WITH origem AS (
    SELECT d::date AS dia,
           CASE WHEN d::date - 28 < v_mes THEN d::date - 28 ELSE d::date - 56 END AS de
      FROM generate_series(v_mes, v_fim, interval '1 day') d
  )
  INSERT INTO shift_draft_item (draft_id, user_id, on_date, period, start_time, end_time,
                                note, source_assignment_id, added_by)
  SELECT v_id, a.user_id, o.dia, a.period, a.start_time, a.end_time, a.note, a.id,
         app_current_user()
    FROM origem o
    JOIN shift_assignment a ON a.house_id = p_house AND a.on_date = o.de
                           AND a.revoked_at IS NULL
    JOIN app_user u ON u.id = a.user_id AND u.active
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN QUERY SELECT v_id, v_n, coalesce(v_inativos, ARRAY[]::text[]);
END $$;
REVOKE ALL ON FUNCTION app_repetir_escala(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_repetir_escala(uuid, date) TO rede_app;

-- ------------------------------------------------------------------
-- 2. Ler o rascunho, com os conflitos de cada linha.
-- ------------------------------------------------------------------
/*
 * Os conflitos que o pedido nomeia, conferidos no momento da leitura (e de
 * novo na publicação), porque a escala das outras casas muda enquanto o
 * rascunho espera:
 *   * `inativo`   — a pessoa foi desativada depois da cópia;
 *   * `outra_casa`— ela já está escalada noutra casa no mesmo dia e turno;
 *   * `ja_escalada` — ela já está na escala publicada desta casa naquele turno
 *                   (a publicação pula a linha, e diz).
 * A função é SECURITY DEFINER para enxergar a outra casa; ela devolve só o
 * código da casa, e nunca quem mais está lá.
 */
CREATE OR REPLACE FUNCTION app_rascunho_da_escala(p_house uuid, p_mes date)
RETURNS TABLE (
  rascunho_id uuid, criado_por text, criado_em timestamptz,
  item_id uuid, user_id uuid, quem text, cargo text, on_date date, period text,
  start_time time, end_time time, note text, incluido_a_mao boolean,
  conflito text, conflito_casa text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_d shift_draft%ROWTYPE;
BEGIN
  PERFORM app_pode_montar_escala(p_house);
  SELECT * INTO v_d FROM shift_draft d
   WHERE d.house_id = p_house AND d.month = date_trunc('month', p_mes)::date
     AND d.published_at IS NULL AND d.discarded_at IS NULL;
  IF v_d.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT v_d.id, app_user_display_name(v_d.created_by), v_d.created_at,
           i.id, i.user_id, app_user_display_name(i.user_id), u.role::text,
           i.on_date, i.period, i.start_time, i.end_time, i.note,
           i.source_assignment_id IS NULL,
           CASE
             WHEN NOT u.active THEN 'inativo'
             WHEN oc.code IS NOT NULL THEN 'outra_casa'
             WHEN ja.id IS NOT NULL THEN 'ja_escalada'
           END,
           oc.code
      FROM shift_draft_item i
      JOIN app_user u ON u.id = i.user_id
      LEFT JOIN LATERAL (
        SELECT h.code FROM shift_assignment o JOIN house h ON h.id = o.house_id
         WHERE o.user_id = i.user_id AND o.on_date = i.on_date AND o.period = i.period
           AND o.house_id <> p_house AND o.revoked_at IS NULL LIMIT 1) oc ON true
      LEFT JOIN shift_assignment ja
             ON ja.house_id = p_house AND ja.user_id = i.user_id AND ja.on_date = i.on_date
            AND ja.period = i.period AND ja.revoked_at IS NULL
     WHERE i.draft_id = v_d.id AND i.removed_at IS NULL
     ORDER BY i.on_date, (i.period = 'noturno'), app_user_display_name(i.user_id);
END $$;
REVOKE ALL ON FUNCTION app_rascunho_da_escala(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_rascunho_da_escala(uuid, date) TO rede_app;

-- ------------------------------------------------------------------
-- 3. Editar: incluir e retirar linhas.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rascunho_incluir(
  p_rascunho uuid, p_user uuid, p_dia date, p_periodo text,
  p_inicio time, p_fim time, p_nota text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_d shift_draft%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO v_d FROM shift_draft WHERE id = p_rascunho;
  IF v_d.id IS NULL THEN
    RAISE EXCEPTION 'rascunho_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM app_pode_montar_escala(v_d.house_id);
  IF v_d.published_at IS NOT NULL OR v_d.discarded_at IS NOT NULL THEN
    RAISE EXCEPTION 'escala: este rascunho já foi publicado ou descartado.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_periodo NOT IN ('diurno','noturno') THEN
    RAISE EXCEPTION 'escala: o turno é diurno ou noturno.' USING ERRCODE = 'check_violation';
  END IF;
  IF date_trunc('month', p_dia)::date <> v_d.month THEN
    RAISE EXCEPTION 'escala: o dia precisa ser do mês deste rascunho.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = p_user AND u.active) THEN
    RAISE EXCEPTION 'escala: esta pessoa não está ativa no sistema.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO shift_draft_item (draft_id, user_id, on_date, period, start_time, end_time, note, added_by)
  VALUES (p_rascunho, p_user, p_dia, p_periodo, p_inicio, p_fim,
          nullif(btrim(coalesce(p_nota, '')), ''), app_current_user())
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'escala: esta pessoa já está neste turno no rascunho.' USING ERRCODE = 'check_violation';
END $$;
REVOKE ALL ON FUNCTION app_rascunho_incluir(uuid, uuid, date, text, time, time, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_rascunho_incluir(uuid, uuid, date, text, time, time, text) TO rede_app;

CREATE OR REPLACE FUNCTION app_rascunho_retirar(p_item uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_d shift_draft%ROWTYPE;
BEGIN
  SELECT d.* INTO v_d FROM shift_draft d JOIN shift_draft_item i ON i.draft_id = d.id
   WHERE i.id = p_item AND i.removed_at IS NULL;
  IF v_d.id IS NULL THEN
    RAISE EXCEPTION 'rascunho_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM app_pode_montar_escala(v_d.house_id);
  IF v_d.published_at IS NOT NULL OR v_d.discarded_at IS NOT NULL THEN
    RAISE EXCEPTION 'escala: este rascunho já foi publicado ou descartado.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE shift_draft_item SET removed_at = now(), removed_by = app_current_user() WHERE id = p_item;
  RETURN v_d.house_id;
END $$;
REVOKE ALL ON FUNCTION app_rascunho_retirar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_rascunho_retirar(uuid) TO rede_app;

-- ------------------------------------------------------------------
-- 4. Publicar e descartar.
-- ------------------------------------------------------------------
/*
 * Publicar leva cada linha viva para a escala de verdade. O que não pode ir
 * NÃO vai, e volta contado: quem foi desativado depois da cópia, e quem já
 * estava escalado naquele turno. A pessoa escalada noutra casa no mesmo turno
 * VAI, porque a escala informa e não impede (§12.1); o conflito foi mostrado
 * na revisão, e a decisão de publicar assim é de quem publica.
 */
CREATE OR REPLACE FUNCTION app_publicar_rascunho(p_rascunho uuid)
RETURNS TABLE (publicados int, fora_por_inativo int, ja_escalados int, house_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_d shift_draft%ROWTYPE; v_pub int := 0; v_inat int := 0; v_ja int := 0; r record;
BEGIN
  SELECT * INTO v_d FROM shift_draft WHERE id = p_rascunho FOR UPDATE;
  IF v_d.id IS NULL THEN
    RAISE EXCEPTION 'rascunho_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM app_pode_montar_escala(v_d.house_id);
  IF v_d.published_at IS NOT NULL OR v_d.discarded_at IS NOT NULL THEN
    RAISE EXCEPTION 'escala: este rascunho já foi publicado ou descartado.' USING ERRCODE = 'check_violation';
  END IF;

  FOR r IN SELECT i.*, u.active FROM shift_draft_item i JOIN app_user u ON u.id = i.user_id
            WHERE i.draft_id = p_rascunho AND i.removed_at IS NULL LOOP
    IF NOT r.active THEN v_inat := v_inat + 1; CONTINUE; END IF;
    BEGIN
      INSERT INTO shift_assignment (house_id, user_id, on_date, period, start_time, end_time,
                                    note, created_by)
      VALUES (v_d.house_id, r.user_id, r.on_date, r.period, r.start_time, r.end_time,
              r.note, app_current_user());
      v_pub := v_pub + 1;
    EXCEPTION WHEN unique_violation THEN
      v_ja := v_ja + 1;
    END;
  END LOOP;

  UPDATE shift_draft SET published_at = now(), published_by = app_current_user()
   WHERE id = p_rascunho;
  RETURN QUERY SELECT v_pub, v_inat, v_ja, v_d.house_id;
END $$;
REVOKE ALL ON FUNCTION app_publicar_rascunho(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_publicar_rascunho(uuid) TO rede_app;

CREATE OR REPLACE FUNCTION app_descartar_rascunho(p_rascunho uuid, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_d shift_draft%ROWTYPE;
BEGIN
  SELECT * INTO v_d FROM shift_draft WHERE id = p_rascunho FOR UPDATE;
  IF v_d.id IS NULL THEN
    RAISE EXCEPTION 'rascunho_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM app_pode_montar_escala(v_d.house_id);
  IF v_d.published_at IS NOT NULL OR v_d.discarded_at IS NOT NULL THEN
    RAISE EXCEPTION 'escala: este rascunho já foi publicado ou descartado.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN
    RAISE EXCEPTION 'escala: escreva por que o rascunho foi descartado.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE shift_draft SET discarded_at = now(), discarded_by = app_current_user(),
                         discard_reason = btrim(p_motivo)
   WHERE id = p_rascunho;
  RETURN v_d.house_id;
END $$;
REVOKE ALL ON FUNCTION app_descartar_rascunho(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_descartar_rascunho(uuid, text) TO rede_app;
