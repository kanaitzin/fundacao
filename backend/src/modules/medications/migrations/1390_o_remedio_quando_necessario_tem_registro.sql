-- =============================================================================
-- 1390 — A MEDICAÇÃO "QUANDO NECESSÁRIO" PASSA A TER REGISTRO.
--
-- O DEFEITO, medido em 21/09/2026 pelo catálogo e pelas rotas.
--
-- A prescrição tem `kind = 'quando_necessario'` desde a 0200, com a
-- `use_condition` escrita ("se a febre passar de 38°C") — e ela é lida, sai na
-- tela de Saúde e sai na folha da parede, marcada `s/n`.
--
-- O que não existia: **jeito de registrar que ela foi dada.**
--
--   * `app_generate_doses` junta `medication_schedule`, e uma prescrição
--     "quando necessário" NÃO TEM HORÁRIO — então ela não gera dose nenhuma;
--   * a única porta de registro é `POST /medications/doses/:id/confirm`, que
--     confirma uma dose QUE JÁ EXISTE;
--   * as colunas `prn_reason` e `prn_outcome` foram criadas na 0200 para
--     exatamente isto, com o comentário *"«Quando necessário» (§11.5): exige
--     orientação anterior válida e motivo"* — e ficaram sem um `INSERT` e sem
--     um `SELECT` em todo o repositório.
--
-- O EFEITO NA CASA, e é por isso que esta fase existe: o remédio "se
-- necessário" é justamente o que o educador dá às 2h da manhã, sozinho, quando
-- a criança acorda com febre. **Ele era dado e não ficava em lugar nenhum** — a
-- Enfermagem chegava às 9h sem saber que houve; o armário mostrava a caixa
-- chegando e nenhuma saindo (porque o gatilho de baixa só dispara na
-- confirmação de uma dose que não nascia); e a decisão que o §9 diz que a
-- Enfermagem toma com este registro — *"se aquilo vira prescrição"* — era tomada
-- sem dado.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA MIGRAÇÃO **NÃO** INVENTA.
--
-- As guardas são as mesmas da confirmação de dose (`app_confirm_dose`), e não
-- outras: casa no alcance, `app_can_administer` para o período, e a exceção
-- `nurse_only` por medicamento — que é a decisão de 08/09 do Marcelo (0930),
-- *"a tela deixa de autorizar pessoas e passa a marcar medicamentos"*. Um
-- caminho novo de registro de dose com guardas próprias seria a porta por onde
-- a exceção da Enfermagem deixaria de valer.
--
-- `scheduled_at` = o momento em que foi dada. A coluna é `NOT NULL` e uma dose
-- "quando necessário" não tem hora marcada: **para ela, o horário previsto é o
-- momento em que foi preciso.** Por isso o estado é `administrado_no_horario` e
-- nunca `administrado_com_atraso` — dose sem hora marcada não pode atrasar.
--
-- O MOTIVO É OBRIGATÓRIO, com dez caracteres no mínimo. É o mesmo piso do
-- relato (0300) e da nota do plantão, e ele existe porque *"febre"* não diz à
-- Enfermagem das 9h o que ela precisa saber para decidir. A `use_condition` diz
-- QUANDO se pode dar; o motivo diz **o que aconteceu naquela noite**.
--
-- O DESFECHO SE ESCREVE DEPOIS, e isso é desenho, não comodidade: *"o que
-- aconteceu depois"* não se sabe na hora de dar o remédio — é preciso esperar
-- para ver se a febre cedeu. Ele nasce nulo e é preenchido quando se souber.
-- **Sem prazo e sem pendência**, aplicando a correção que a Fundação fez em
-- 16/09 sobre o relato da convivência: *"acho mais fácil não dar um prazo […]
-- dessa forma não haverá uma pressão"*. Cobrança com prazo sobre quem cuidou da
-- criança de madrugada tem uma só forma de ser baixada, e não é a boa.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. REGISTRAR que a dose "quando necessário" foi dada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_registrar_quando_necessario(
  p_prescription uuid, p_motivo text, p_quando timestamptz, p_nota text)
RETURNS TABLE (out_id uuid) AS $$
DECLARE
  v_pr prescription%ROWTYPE;
  v_quando timestamptz; v_period text; v_pode boolean; v_motivo_recusa text;
  v_id uuid;
BEGIN
  SELECT * INTO v_pr FROM prescription WHERE id = p_prescription;
  IF v_pr.id IS NULL THEN
    RAISE EXCEPTION 'prescricao_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(v_pr.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_pr.kind <> 'quando_necessario' THEN
    RAISE EXCEPTION 'nao_e_quando_necessario' USING ERRCODE = 'check_violation';
  END IF;
  /*
   * A orientação tem de estar VÁLIDA — assinada e vigente. Registrar dose
   * "quando necessário" de uma prescrição suspensa é registrar que se deu um
   * remédio que a Enfermagem havia mandado parar.
   */
  IF v_pr.status <> 'ativa' OR v_pr.signed_by IS NULL THEN
    RAISE EXCEPTION 'prescricao_sem_orientacao_valida' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'motivo_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  v_quando := coalesce(p_quando, now());
  /* Nunca no futuro: dose que "será dada" não é dose dada. */
  IF v_quando > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'quando_no_futuro' USING ERRCODE = 'check_violation';
  END IF;

  -- O período é o do MOMENTO em que foi dada, e é ele que o protocolo da casa
  -- confere — a mesma conta da `app_confirm_dose`.
  v_period := CASE
    WHEN (v_quando AT TIME ZONE 'America/Sao_Paulo')::time >= TIME '07:00'
     AND (v_quando AT TIME ZONE 'America/Sao_Paulo')::time <  TIME '19:00'
    THEN 'diurno' ELSE 'noturno' END;

  SELECT c.pode, c.motivo INTO v_pode, v_motivo_recusa
    FROM app_can_administer(v_pr.house_id, v_period) c;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'protocolo: %', v_motivo_recusa USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A exceção por medicamento (0930) vale aqui igual: injetável às 22h continua
  -- injetável, e "quando necessário" não é atalho para contorná-la.
  IF coalesce(v_pr.nurse_only, false) AND app_current_role() <> 'enfermagem' THEN
    RAISE EXCEPTION 'protocolo: % está marcado como exclusivo da Enfermagem: %. Acione a Enfermagem e registre a dose com ela.',
      v_pr.medication, coalesce(v_pr.nurse_only_reason, 'sem motivo registrado')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO medication_administration
    (prescription_id, person_id, house_id, scheduled_at, state,
     administered_by, administered_at, recorded_at, note, prn_reason)
  VALUES (v_pr.id, v_pr.person_id, v_pr.house_id, v_quando,
          'administrado_no_horario', app_current_user(), v_quando, now(),
          nullif(btrim(coalesce(p_nota, '')), ''), btrim(p_motivo))
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_registrar_quando_necessario(uuid, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_quando_necessario(uuid, text, timestamptz, text) TO rede_app;

COMMENT ON FUNCTION app_registrar_quando_necessario(uuid, text, timestamptz, text) IS
  'Registra que uma dose "quando necessário" foi dada, com o motivo. Mesmas '
  'guardas da confirmação de dose, inclusive a exceção nurse_only (0930).';

-- ---------------------------------------------------------------------------
-- 2. O DESFECHO, escrito depois — e uma vez.
--
-- Escrito UMA vez porque nada se sobrescreve (§5.1): a linha nasce nula e
-- recebe o que se soube. Se a casa precisar registrar mais de uma observação
-- sobre a mesma dose — a febre que cedeu e voltou —, isso é uma TABELA e é
-- decisão da Fundação; uma coluna que se reescreve perderia a primeira
-- observação, que é justamente a que a Enfermagem compara.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_desfecho_quando_necessario(
  p_admin uuid, p_desfecho text)
RETURNS TABLE (out_id uuid) AS $$
DECLARE v_adm medication_administration%ROWTYPE;
BEGIN
  SELECT * INTO v_adm FROM medication_administration WHERE id = p_admin FOR UPDATE;
  IF v_adm.id IS NULL OR NOT app_house_in_scope(v_adm.house_id) THEN
    RAISE EXCEPTION 'dose_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_adm.prn_reason IS NULL THEN
    RAISE EXCEPTION 'nao_e_quando_necessario' USING ERRCODE = 'check_violation';
  END IF;
  IF v_adm.prn_outcome IS NOT NULL THEN
    RAISE EXCEPTION 'desfecho_ja_registrado' USING ERRCODE = 'unique_violation';
  END IF;
  IF length(btrim(coalesce(p_desfecho, ''))) < 10 THEN
    RAISE EXCEPTION 'desfecho_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE medication_administration
     SET prn_outcome = btrim(p_desfecho)
   WHERE id = p_admin;

  RETURN QUERY SELECT p_admin;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_desfecho_quando_necessario(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_desfecho_quando_necessario(uuid, text) TO rede_app;

COMMENT ON COLUMN medication_administration.prn_reason IS
  'Por que a dose "quando necessário" foi dada NAQUELE momento. Obrigatório, e '
  'escrito por quem deu (1390). A use_condition da prescrição diz quando se PODE '
  'dar; isto diz o que aconteceu.';
COMMENT ON COLUMN medication_administration.prn_outcome IS
  'O que aconteceu depois. Nasce nulo e se escreve quando se souber — sem prazo e '
  'sem pendência (1390), pela mesma razão que o relato da convivência não tem: '
  'cobrança com prazo sobre quem cuidou de madrugada tem uma só forma de ser '
  'baixada. Escrito UMA vez; mais de uma observação é tabela, e é decisão.';

-- ---------------------------------------------------------------------------
-- 3. O índice, e por que ele é por PRESCRIÇÃO e não por pessoa.
--
-- A pergunta da Enfermagem é *"quantas vezes esta criança precisou DESTE
-- remédio, e por quê"* — é dela que sai a decisão de virar prescrição fixa. Por
-- pessoa já há índice; por prescrição, não havia.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_adm_quando_necessario
  ON medication_administration (prescription_id, administered_at DESC)
  WHERE prn_reason IS NOT NULL;
