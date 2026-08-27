-- ============================================================
-- Módulo `shifts` — Plantão, passagem e ATA (§12)
--
-- O documento real (LIVRO ATA — AI 03 e ATA — LÍDERES NOTURNO) é a fonte da
-- estrutura. As três regras que o sistema precisa tornar impossíveis de
-- burlar, e que por isso vivem no banco e não na tela:
--
--   1. ninguém assina por outro  (§12.1 → política WITH CHECK);
--   2. ATA fechada não é sobrescrita (§12.7 → gatilho + adendo com antes/depois);
--   3. fechar "com pendência" é permitido; falsificar assinatura, não
--      (§12.4 → o fechamento registra quem faltou, em vez de completar).
--
-- Máquina de estados (§24):
--   planejado → aberto → passagens → assinaturas → líder/técnica
--             → fechado | fechado_com_pendencia → adendo/reabertura
-- ============================================================

CREATE TABLE shift (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      uuid NOT NULL REFERENCES house(id),
  on_date       date NOT NULL,                       -- dia de referência (fuso da instituição)
  period        text NOT NULL CHECK (period IN ('diurno','noturno')),
  status        text NOT NULL DEFAULT 'aberto'
                CHECK (status IN ('planejado','aberto','consolidando','fechado','fechado_com_pendencia','reaberto')),
  opened_by     uuid REFERENCES app_user(id),
  opened_at     timestamptz NOT NULL DEFAULT now(),
  closed_by     uuid REFERENCES app_user(id),
  closed_at     timestamptz,
  UNIQUE (house_id, on_date, period)
);
CREATE INDEX idx_shift_house_date ON shift (house_id, on_date DESC);

-- ---------- Passagem individual (§12.1) ----------
CREATE TABLE handover (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id      uuid NOT NULL REFERENCES shift(id),
  house_id      uuid NOT NULL REFERENCES house(id),
  user_id       uuid NOT NULL REFERENCES app_user(id),
  role          role_code NOT NULL,
  -- Aparelho de onde a passagem foi assinada (§12.1). Metadado de auditoria,
  -- não rastreamento de pessoa: é o dispositivo, nunca a localização (§3.3).
  device        text,
  items         jsonb NOT NULL DEFAULT '{}',   -- itens conferidos do roteiro do plantão
  contributions text,                          -- o que este profissional fez/observou
  pending       text,                          -- o que fica para o próximo turno
  guidance      text,                          -- orientações que devem ser lidas na entrada
  signed_at     timestamptz NOT NULL DEFAULT now(),
  happened_at   timestamptz NOT NULL DEFAULT now(),  -- horário REAL, preservado no offline
  late          boolean NOT NULL DEFAULT false,      -- complemento tardio (§12.4)
  offline       boolean NOT NULL DEFAULT false,
  client_op_id  text UNIQUE,
  UNIQUE (shift_id, user_id)                   -- uma passagem por pessoa por plantão
);
CREATE INDEX idx_handover_shift ON handover (shift_id);

CREATE TRIGGER handover_no_change BEFORE UPDATE OR DELETE ON handover
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------- Recebimento pelo turno que entra (§12.3) ----------
CREATE TABLE handover_receipt (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id      uuid NOT NULL REFERENCES shift(id),   -- plantão RECEBIDO
  house_id      uuid NOT NULL REFERENCES house(id),
  user_id       uuid NOT NULL REFERENCES app_user(id),
  opened_handover boolean NOT NULL DEFAULT true,
  read_guidance boolean NOT NULL DEFAULT false,
  took_pending  boolean NOT NULL DEFAULT false,
  note          text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  offline       boolean NOT NULL DEFAULT false,
  client_op_id  text UNIQUE,
  UNIQUE (shift_id, user_id)
);
CREATE TRIGGER receipt_no_change BEFORE UPDATE OR DELETE ON handover_receipt
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------- ATA da casa (§12.5) ----------
CREATE TABLE ata (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id      uuid NOT NULL UNIQUE REFERENCES shift(id),
  house_id      uuid NOT NULL REFERENCES house(id),
  on_date       date NOT NULL,
  period        text NOT NULL CHECK (period IN ('diurno','noturno')),
  -- Conteúdo estruturado do LIVRO ATA. jsonb porque as seções são muitas e
  -- fixas em VOCABULÁRIO, não em quantidade: acrescentar uma seção é dado,
  -- não migração — e nenhuma seção antiga se perde.
  content       jsonb NOT NULL DEFAULT '{}',
  pendencies    text,
  status        text NOT NULL DEFAULT 'rascunho'
                CHECK (status IN ('rascunho','fechada','fechada_com_pendencia','reaberta')),
  version       integer NOT NULL DEFAULT 1,
  missing_signatures integer NOT NULL DEFAULT 0,
  closed_by     uuid REFERENCES app_user(id),
  closed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ata_house_date ON ata (house_id, on_date DESC);

-- §12.7: ATA fechada não é sobrescrita. O gatilho vale inclusive contra um
-- comando de sistema com defeito — é a última linha, não a primeira.
CREATE OR REPLACE FUNCTION ata_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ata_nao_e_apagada'; END IF;
  IF OLD.status IN ('fechada','fechada_com_pendencia')
     AND NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'ata_fechada_nao_reescreve';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ata_guard_trg BEFORE UPDATE OR DELETE ON ata
  FOR EACH ROW EXECUTE FUNCTION ata_guard();

-- Adendo/versão com motivo e antes/depois (§12.7, §26.2 #20)
CREATE TABLE ata_addendum (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id        uuid NOT NULL REFERENCES ata(id),
  kind          text NOT NULL CHECK (kind IN ('reabertura','correcao','complemento_tardio')),
  reason        text NOT NULL,
  before_state  jsonb,
  after_state   jsonb,
  author_id     uuid NOT NULL REFERENCES app_user(id),
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ata_addendum ON ata_addendum (ata_id, at);
CREATE TRIGGER ata_addendum_no_change BEFORE UPDATE OR DELETE ON ata_addendum
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------- Episódio: "um acolhido apresentou problema" (§12.5) ----------
-- Registrado UMA vez e ligado a perfil, linha do tempo, ocorrência e ATA.
-- A classificação descreve o FATO; não existe classificação da pessoa.
CREATE TABLE ata_episode (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id         uuid NOT NULL REFERENCES ata(id),
  house_id       uuid NOT NULL REFERENCES house(id),
  person_id      uuid NOT NULL REFERENCES person(id),
  classification text NOT NULL CHECK (classification IN
    ('desorganizacao','briga_conflito','contencao','saida_nao_autorizada','saude','medicamento','outro')),
  factual        text NOT NULL,
  incident_id    uuid,          -- sem FK: `incidents` pode não existir (partição removível)
  happened_at    timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL REFERENCES app_user(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_episode_person ON ata_episode (person_id, happened_at DESC);
CREATE INDEX idx_episode_ata ON ata_episode (ata_id);
CREATE TRIGGER episode_no_change BEFORE UPDATE OR DELETE ON ata_episode
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Ciência do líder, com comentário próprio — o relato original nunca muda.
CREATE TABLE ata_episode_ack (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id  uuid NOT NULL REFERENCES ata_episode(id),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  comment     text,
  at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (episode_id, user_id)
);
CREATE TRIGGER episode_ack_no_change BEFORE UPDATE OR DELETE ON ata_episode_ack
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------- ATA Geral Noturna (§12.6) ----------
CREATE TABLE general_night_ata (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institution(id),
  on_date         date NOT NULL,
  leader_id       uuid NOT NULL REFERENCES app_user(id),
  status          text NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho','fechada','fechada_com_pendencia')),
  pendencies      text,
  signed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, on_date)
);

-- Uma linha POR CASA, criada junto com a ATA Geral. É assim que "casa sem
-- chamado" continua aparecendo: a ausência de demanda é um registro, não um
-- silêncio (§12.6).
CREATE TABLE general_night_house_entry (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  general_ata_id      uuid NOT NULL REFERENCES general_night_ata(id),
  house_id            uuid NOT NULL REFERENCES house(id),
  had_contact         boolean NOT NULL DEFAULT false,
  contact_at          timestamptz,
  arrived_at          timestamptz,
  left_at             timestamptz,
  reason              text,
  people_involved     text,
  action_taken        text,
  category            text CHECK (category IS NULL OR category IN
    ('ocorrencia','saude','medicamento','saida_nao_autorizada','falta_de_pessoal','outro_apoio')),
  pendencies          text,
  house_ata_confirmed boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (general_ata_id, house_id)
);

-- ============================================================
-- Políticas
-- ============================================================
ALTER TABLE shift ENABLE ROW LEVEL SECURITY;
CREATE POLICY shift_select ON shift FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY shift_insert ON shift FOR INSERT TO rede_app WITH CHECK (app_house_in_scope(house_id));
CREATE POLICY shift_update ON shift FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id)) WITH CHECK (app_house_in_scope(house_id));
GRANT SELECT, INSERT, UPDATE ON shift TO rede_app;

ALTER TABLE handover ENABLE ROW LEVEL SECURITY;
-- A passagem é documento operacional do turno: a equipe da casa lê. O que é
-- narrativa pessoal não mora aqui — mora em `statement`, com outra política.
CREATE POLICY handover_select ON handover FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));
-- §26.2 #18 — cada educador assina SÓ a própria passagem. Está aqui, no banco:
-- não há rota, papel ou tela capaz de gravar uma assinatura alheia.
CREATE POLICY handover_insert ON handover FOR INSERT TO rede_app
  WITH CHECK (user_id = app_current_user() AND app_house_in_scope(house_id));
GRANT SELECT, INSERT ON handover TO rede_app;

ALTER TABLE handover_receipt ENABLE ROW LEVEL SECURITY;
CREATE POLICY receipt_select ON handover_receipt FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));
-- §26.2 #21 — todos do próximo turno confirmam, individualmente.
CREATE POLICY receipt_insert ON handover_receipt FOR INSERT TO rede_app
  WITH CHECK (user_id = app_current_user() AND app_house_in_scope(house_id));
GRANT SELECT, INSERT ON handover_receipt TO rede_app;

ALTER TABLE ata ENABLE ROW LEVEL SECURITY;
CREATE POLICY ata_select ON ata FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY ata_insert ON ata FOR INSERT TO rede_app WITH CHECK (app_house_in_scope(house_id));
-- Rascunho e reaberta são editáveis; fechada não entra na cláusula USING.
CREATE POLICY ata_update ON ata FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id) AND status IN ('rascunho','reaberta'))
  WITH CHECK (app_house_in_scope(house_id));
GRANT SELECT, INSERT, UPDATE ON ata TO rede_app;

ALTER TABLE ata_addendum ENABLE ROW LEVEL SECURITY;
CREATE POLICY addendum_select ON ata_addendum FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM ata a WHERE a.id = ata_id AND app_house_in_scope(a.house_id)));
CREATE POLICY addendum_insert ON ata_addendum FOR INSERT TO rede_app WITH CHECK (true);
GRANT SELECT, INSERT ON ata_addendum TO rede_app;

ALTER TABLE ata_episode ENABLE ROW LEVEL SECURITY;
CREATE POLICY episode_select ON ata_episode FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY episode_insert ON ata_episode FOR INSERT TO rede_app
  WITH CHECK (created_by = app_current_user() AND app_house_in_scope(house_id)
              AND EXISTS (SELECT 1 FROM house_stay s
                          WHERE s.person_id = ata_episode.person_id
                            AND s.house_id = ata_episode.house_id AND s.status = 'ativa'));
GRANT SELECT, INSERT ON ata_episode TO rede_app;

ALTER TABLE ata_episode_ack ENABLE ROW LEVEL SECURITY;
CREATE POLICY ack_select ON ata_episode_ack FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM ata_episode e WHERE e.id = episode_id AND app_house_in_scope(e.house_id)));
-- Ciência é ato pessoal: o líder dá a sua, e só a sua.
CREATE POLICY ack_insert ON ata_episode_ack FOR INSERT TO rede_app
  WITH CHECK (user_id = app_current_user());
GRANT SELECT, INSERT ON ata_episode_ack TO rede_app;

ALTER TABLE general_night_ata ENABLE ROW LEVEL SECURITY;
CREATE POLICY gna_select ON general_night_ata FOR SELECT TO rede_app
  USING (app_current_role() IN ('lider_noturno_geral','equipe_tecnica','coordenador','gestor_geral','admin_tecnico'));
CREATE POLICY gna_insert ON general_night_ata FOR INSERT TO rede_app
  WITH CHECK (app_current_role() = 'lider_noturno_geral' AND leader_id = app_current_user());
CREATE POLICY gna_update ON general_night_ata FOR UPDATE TO rede_app
  USING (leader_id = app_current_user() AND status = 'rascunho')
  WITH CHECK (leader_id = app_current_user());
GRANT SELECT, INSERT, UPDATE ON general_night_ata TO rede_app;

ALTER TABLE general_night_house_entry ENABLE ROW LEVEL SECURITY;
CREATE POLICY gnhe_select ON general_night_house_entry FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id)
         OR app_current_role() IN ('lider_noturno_geral','equipe_tecnica','coordenador','gestor_geral'));
CREATE POLICY gnhe_write ON general_night_house_entry FOR INSERT TO rede_app WITH CHECK (true);
CREATE POLICY gnhe_update ON general_night_house_entry FOR UPDATE TO rede_app
  USING (EXISTS (SELECT 1 FROM general_night_ata g
                 WHERE g.id = general_ata_id AND g.leader_id = app_current_user() AND g.status = 'rascunho'))
  WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON general_night_house_entry TO rede_app;

-- ============================================================
-- Comandos de sistema
-- ============================================================

-- Abrir o plantão cria também o rascunho da ATA: uma ATA por plantão (§12.4),
-- garantida pela chave única, não pela disciplina de quem clica.
CREATE OR REPLACE FUNCTION app_open_shift(p_house uuid, p_date date, p_period text)
RETURNS TABLE (out_shift_id uuid, out_ata_id uuid, out_created boolean) AS $$
DECLARE v_me uuid; v_role role_code; v_shift uuid; v_ata uuid; v_new boolean := false;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  IF v_me IS NULL THEN RAISE EXCEPTION 'sem_identidade'; END IF;
  IF NOT app_house_in_scope(p_house) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF v_role NOT IN ('educador','lider_diurno','lider_noturno_geral','equipe_tecnica','coordenador') THEN
    RAISE EXCEPTION 'cargo_nao_abre_plantao';
  END IF;

  SELECT s.id INTO v_shift FROM shift s
   WHERE s.house_id = p_house AND s.on_date = p_date AND s.period = p_period;

  IF v_shift IS NULL THEN
    INSERT INTO shift (house_id, on_date, period, opened_by)
    VALUES (p_house, p_date, p_period, v_me) RETURNING id INTO v_shift;
    INSERT INTO ata (shift_id, house_id, on_date, period)
    VALUES (v_shift, p_house, p_date, p_period) RETURNING id INTO v_ata;
    v_new := true;
  ELSE
    SELECT a.id INTO v_ata FROM ata a WHERE a.shift_id = v_shift;
  END IF;

  RETURN QUERY SELECT v_shift, v_ata, v_new;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_open_shift(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_open_shift(uuid, date, text) TO rede_app;

-- Quem, do escalado, ainda não assinou. É a base do fechamento honesto:
-- em vez de completar a ATA, o sistema NOMEIA a falta.
CREATE OR REPLACE FUNCTION app_missing_handovers(p_shift uuid)
RETURNS TABLE (user_id uuid, full_name text, role text) AS $$
  SELECT u.id, u.full_name, u.role::text
  FROM shift s
  JOIN user_house_assignment a ON a.house_id = s.house_id AND a.valid_to IS NULL
  JOIN app_user u ON u.id = a.user_id AND u.active
  WHERE s.id = p_shift
    AND u.role IN ('educador','lider_diurno')
    AND NOT EXISTS (SELECT 1 FROM handover h WHERE h.shift_id = p_shift AND h.user_id = u.id)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_missing_handovers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_missing_handovers(uuid) TO rede_app;

-- Fechamento da ATA (§12.4, §26.2 #19).
-- Por que é comando e não UPDATE comum: o fechamento precisa, no mesmo ato,
-- verificar o cargo contra o TURNO, contar as assinaturas que faltam, decidir
-- entre 'fechada' e 'fechada_com_pendencia' e travar o plantão. Espalhado em
-- vários UPDATEs, qualquer rota nova poderia pular uma etapa.
CREATE OR REPLACE FUNCTION app_close_ata(p_ata uuid, p_pendencies text)
RETURNS TABLE (out_status text, out_missing integer) AS $$
DECLARE v_me uuid; v_role role_code; v_ata ata%ROWTYPE; v_missing integer; v_status text;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_ata FROM ata WHERE id = p_ata;
  IF v_ata.id IS NULL THEN RAISE EXCEPTION 'ata_inexistente'; END IF;
  IF NOT app_house_in_scope(v_ata.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF v_ata.status IN ('fechada','fechada_com_pendencia') THEN RAISE EXCEPTION 'ata_ja_fechada'; END IF;

  -- Quem confirma o fechamento, por turno (§12.4).
  IF v_ata.period = 'diurno' THEN
    IF v_role NOT IN ('lider_diurno','equipe_tecnica','coordenador') THEN
      RAISE EXCEPTION 'cargo_nao_fecha_ata:diurno';
    END IF;
  ELSE
    IF v_role NOT IN ('lider_noturno_geral','equipe_tecnica','coordenador') THEN
      RAISE EXCEPTION 'cargo_nao_fecha_ata:noturno';
    END IF;
  END IF;

  SELECT count(*)::int INTO v_missing FROM app_missing_handovers(v_ata.shift_id);
  v_status := CASE WHEN v_missing > 0 THEN 'fechada_com_pendencia' ELSE 'fechada' END;

  UPDATE ata SET status = v_status, closed_by = v_me, closed_at = now(),
                 missing_signatures = v_missing,
                 pendencies = coalesce(p_pendencies, pendencies)
   WHERE id = p_ata;
  UPDATE shift SET status = CASE WHEN v_missing > 0 THEN 'fechado_com_pendencia' ELSE 'fechado' END,
                   closed_by = v_me, closed_at = now()
   WHERE id = v_ata.shift_id;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_ata.house_id, v_me, 'ata.close', 'ata', p_ata,
          jsonb_build_object('status', v_status, 'assinaturas_faltantes', v_missing));

  RETURN QUERY SELECT v_status, v_missing;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_close_ata(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_close_ata(uuid, text) TO rede_app;

-- Reabertura (§12.7, §26.2 #20): só equipe técnica/coordenação, com motivo,
-- e o estado anterior fica gravado ANTES de qualquer alteração.
CREATE OR REPLACE FUNCTION app_reopen_ata(p_ata uuid, p_reason text)
RETURNS TABLE (out_version integer) AS $$
DECLARE v_me uuid; v_role role_code; v_ata ata%ROWTYPE;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  IF v_role NOT IN ('equipe_tecnica','coordenador') THEN
    RAISE EXCEPTION 'cargo_nao_reabre_ata';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 15 THEN RAISE EXCEPTION 'motivo_insuficiente'; END IF;

  SELECT * INTO v_ata FROM ata WHERE id = p_ata;
  IF v_ata.id IS NULL THEN RAISE EXCEPTION 'ata_inexistente'; END IF;
  IF NOT app_house_in_scope(v_ata.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF v_ata.status NOT IN ('fechada','fechada_com_pendencia') THEN RAISE EXCEPTION 'ata_nao_esta_fechada'; END IF;

  INSERT INTO ata_addendum (ata_id, kind, reason, before_state, after_state, author_id)
  VALUES (p_ata, 'reabertura', btrim(p_reason),
          jsonb_build_object('status', v_ata.status, 'versao', v_ata.version, 'conteudo', v_ata.content),
          NULL, v_me);

  UPDATE ata SET status = 'reaberta', version = v_ata.version + 1 WHERE id = p_ata;
  UPDATE shift SET status = 'reaberto' WHERE id = v_ata.shift_id;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose, detail)
  VALUES (v_ata.house_id, v_me, 'ata.reopen', 'ata', p_ata, btrim(p_reason),
          jsonb_build_object('versao_anterior', v_ata.version));

  RETURN QUERY SELECT v_ata.version + 1;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_reopen_ata(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_reopen_ata(uuid, text) TO rede_app;

-- Correção depois da reabertura: grava antes/depois e fecha de novo.
CREATE OR REPLACE FUNCTION app_amend_ata(p_ata uuid, p_reason text, p_content jsonb)
RETURNS TABLE (out_version integer, out_status text) AS $$
DECLARE v_me uuid; v_role role_code; v_ata ata%ROWTYPE; v_status text;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  IF v_role NOT IN ('equipe_tecnica','coordenador') THEN RAISE EXCEPTION 'cargo_nao_corrige_ata'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 15 THEN RAISE EXCEPTION 'motivo_insuficiente'; END IF;

  SELECT * INTO v_ata FROM ata WHERE id = p_ata;
  IF v_ata.id IS NULL THEN RAISE EXCEPTION 'ata_inexistente'; END IF;
  IF v_ata.status <> 'reaberta' THEN RAISE EXCEPTION 'ata_nao_reaberta'; END IF;

  v_status := CASE WHEN v_ata.missing_signatures > 0 THEN 'fechada_com_pendencia' ELSE 'fechada' END;

  INSERT INTO ata_addendum (ata_id, kind, reason, before_state, after_state, author_id)
  VALUES (p_ata, 'correcao', btrim(p_reason),
          jsonb_build_object('conteudo', v_ata.content),
          jsonb_build_object('conteudo', p_content), v_me);

  UPDATE ata SET content = p_content, status = v_status, closed_by = v_me, closed_at = now()
   WHERE id = p_ata;
  UPDATE shift SET status = CASE WHEN v_ata.missing_signatures > 0
                                 THEN 'fechado_com_pendencia' ELSE 'fechado' END
   WHERE id = v_ata.shift_id;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose)
  VALUES (v_ata.house_id, v_me, 'ata.amend', 'ata', p_ata, btrim(p_reason));

  RETURN QUERY SELECT v_ata.version, v_status;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_amend_ata(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_amend_ata(uuid, text, jsonb) TO rede_app;

-- ---------- ATA Geral Noturna ----------
-- Abrir já cria a linha de TODAS as casas ativas. É por construção que as oito
-- aparecem — inclusive as que não tiveram chamado (§12.6).
CREATE OR REPLACE FUNCTION app_open_general_night_ata(p_date date)
RETURNS TABLE (out_id uuid, out_houses integer) AS $$
DECLARE v_me uuid; v_inst uuid; v_id uuid; v_n integer;
BEGIN
  v_me := app_current_user();
  IF app_current_role() <> 'lider_noturno_geral' THEN
    RAISE EXCEPTION 'apenas_lider_noturno_geral';
  END IF;
  SELECT institution_id INTO v_inst FROM app_user WHERE id = v_me;

  SELECT id INTO v_id FROM general_night_ata WHERE institution_id = v_inst AND on_date = p_date;
  IF v_id IS NULL THEN
    INSERT INTO general_night_ata (institution_id, on_date, leader_id)
    VALUES (v_inst, p_date, v_me) RETURNING id INTO v_id;
    INSERT INTO general_night_house_entry (general_ata_id, house_id)
    SELECT v_id, h.id FROM house h WHERE h.institution_id = v_inst AND h.active;
  END IF;

  SELECT count(*)::int INTO v_n FROM general_night_house_entry WHERE general_ata_id = v_id;
  RETURN QUERY SELECT v_id, v_n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_open_general_night_ata(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_open_general_night_ata(date) TO rede_app;

-- Fechamento da ATA Geral (§12.6, §26.2 #36).
-- O líder assina a SUA ata e confirma a situação das oito casas. Em nenhum
-- ponto ele assina passagem de educador: a confirmação diz "a ATA daquela casa
-- está fechada", não "eu assino por eles".
CREATE OR REPLACE FUNCTION app_close_general_night_ata(p_id uuid, p_pendencies text)
RETURNS TABLE (out_status text, out_confirmed integer, out_total integer, out_open text[]) AS $$
DECLARE v_me uuid; v_g general_night_ata%ROWTYPE; v_total integer; v_conf integer;
        v_open text[]; v_status text;
BEGIN
  v_me := app_current_user();
  SELECT * INTO v_g FROM general_night_ata WHERE id = p_id;
  IF v_g.id IS NULL THEN RAISE EXCEPTION 'ata_geral_inexistente'; END IF;
  IF v_g.leader_id <> v_me THEN RAISE EXCEPTION 'apenas_o_autor_assina'; END IF;
  IF v_g.status <> 'rascunho' THEN RAISE EXCEPTION 'ata_geral_ja_fechada'; END IF;

  SELECT count(*)::int,
         count(*) FILTER (WHERE e.house_ata_confirmed)::int,
         array_agg(h.code ORDER BY h.code) FILTER (WHERE NOT e.house_ata_confirmed)
    INTO v_total, v_conf, v_open
  FROM general_night_house_entry e JOIN house h ON h.id = e.house_id
  WHERE e.general_ata_id = p_id;

  -- Faltar confirmação não impede fechar: impede fechar EM SILÊNCIO.
  v_status := CASE WHEN v_conf = v_total THEN 'fechada' ELSE 'fechada_com_pendencia' END;
  IF v_status = 'fechada_com_pendencia' AND coalesce(length(btrim(p_pendencies)),0) < 10 THEN
    RAISE EXCEPTION 'pendencia_exige_descricao';
  END IF;

  UPDATE general_night_ata
     SET status = v_status, pendencies = p_pendencies, signed_at = now()
   WHERE id = p_id;

  INSERT INTO audit_event (institution_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_g.institution_id, v_me, 'ata_geral.close', 'general_night_ata', p_id,
          jsonb_build_object('confirmadas', v_conf, 'total', v_total, 'status', v_status));

  RETURN QUERY SELECT v_status, v_conf, v_total, coalesce(v_open, ARRAY[]::text[]);
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_close_general_night_ata(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_close_general_night_ata(uuid, text) TO rede_app;
