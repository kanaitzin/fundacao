-- ============================================================
-- Módulo `nursing` — Enfermagem, Evolução de Saúde e Resumo (§7)
--
-- O fluxo que este esquema sustenta (§7.2):
--   1. um educador acompanha consulta/exame/urgência/internação;
--   2. preenche a EVOLUÇÃO DE SAÚDE — online ou offline;
--   3. o envio cria uma PENDÊNCIA para a Enfermagem;
--   4. a Enfermagem tria, complementa, confere e ASSINA;
--   5. só então uma receita nova pode alterar a grade de medicamentos.
--
-- A coordenação acompanha e cobra a pendência, mas NÃO substitui a assinatura
-- de saúde. Isso está no esquema, não só na tela: só a Enfermagem assina.
-- ============================================================

CREATE TYPE encounter_kind AS ENUM
  ('consulta','exame','urgencia','emergencia','internacao','retorno','terapia');

-- Atendimento de saúde: a linha histórica única do §7.3
CREATE TABLE health_encounter (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES person(id),
  house_id      uuid NOT NULL REFERENCES house(id),
  kind          encounter_kind NOT NULL,
  happened_at   timestamptz NOT NULL,
  place         text,                         -- serviço/unidade de saúde
  specialty     text,
  professional  text,
  reason        text,
  outcome       text,
  -- Internação em andamento, retorno marcado etc.
  status        text NOT NULL DEFAULT 'concluido'
                CHECK (status IN ('em_andamento','concluido','retorno_pendente')),
  return_on     date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES app_user(id)
);
CREATE INDEX idx_enc_person ON health_encounter (person_id, happened_at DESC);
CREATE INDEX idx_enc_pend ON health_encounter (house_id)
  WHERE status IN ('em_andamento','retorno_pendente');

-- Evolução de Saúde preenchida pelo ACOMPANHANTE (§7.2)
CREATE TABLE health_evolution (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       uuid NOT NULL REFERENCES person(id),
  house_id        uuid NOT NULL REFERENCES house(id),
  encounter_id    uuid REFERENCES health_encounter(id),
  kind            encounter_kind NOT NULL,
  happened_at     timestamptz NOT NULL,        -- horário REAL do atendimento
  place           text,
  specialty       text,
  service_professional text,
  reason          text,
  -- Estado observado em três momentos (§7.2)
  state_departure text,
  state_during    text,
  state_return    text,
  procedures      text,
  exams_requested text,
  exams_results   text,
  prescription_note text,                      -- receita/atestado recebido
  guidance        text,
  restrictions    text,
  return_deadline date,
  referrals       text,
  transport_notes text,                        -- intercorrências do deslocamento
  observations    text,
  -- Assinatura do acompanhante: quem esteve lá assina o que viu.
  accompanied_by  uuid NOT NULL REFERENCES app_user(id),
  signed_at       timestamptz NOT NULL DEFAULT now(),
  offline         boolean NOT NULL DEFAULT false,
  synced_at       timestamptz,
  client_op_id    text,
  -- Fluxo de triagem
  status          text NOT NULL DEFAULT 'aguardando_triagem'
                  CHECK (status IN ('aguardando_triagem','complemento_solicitado','assinada')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_evo_client_op ON health_evolution (client_op_id) WHERE client_op_id IS NOT NULL;
CREATE INDEX idx_evo_pend ON health_evolution (status) WHERE status <> 'assinada';
CREATE INDEX idx_evo_person ON health_evolution (person_id, happened_at DESC);

-- Triagem da Enfermagem: complemento + conferência + assinatura (§7.2)
CREATE TABLE nursing_triage (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evolution_id   uuid NOT NULL REFERENCES health_evolution(id),
  nurse_id       uuid NOT NULL REFERENCES app_user(id),
  complement     text,                         -- o que a Enfermagem acrescenta
  clinical_note  text,
  action         text NOT NULL CHECK (action IN ('assinada','complemento_solicitado')),
  request_note   text,                         -- o que falta, quando devolve
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_triage_evo ON nursing_triage (evolution_id);

-- Emissão do Resumo de Saúde (§7.4): o documento em si é gerado sob demanda;
-- aqui fica o REGISTRO de cada emissão, com finalidade — é o que a auditoria
-- precisa saber.
CREATE TABLE health_summary_issue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES person(id),
  house_id      uuid NOT NULL REFERENCES house(id),
  purpose       text NOT NULL,                 -- consulta, exame, urgência, internação…
  issued_by     uuid NOT NULL REFERENCES app_user(id),
  issued_at     timestamptz NOT NULL DEFAULT now(),
  offline_copy  boolean NOT NULL DEFAULT false,
  last_sync_at  timestamptz,                   -- versão offline indica a última sincronização
  downloaded_at timestamptz
);
CREATE INDEX idx_summary_person ON health_summary_issue (person_id, issued_at DESC);

-- ============================================================
-- Escopo
-- ============================================================
-- A Enfermagem tem escopo transversal de SAÚDE nas 8 casas (§5.8) — e apenas
-- de saúde: nada de bancário, judicial ou narrativa pessoal. `app_person_in_scope`
-- já entrega esse perímetro; as políticas abaixo não o ampliam.

ALTER TABLE health_encounter ENABLE ROW LEVEL SECURITY;
CREATE POLICY enc_select ON health_encounter FOR SELECT TO rede_app USING (app_person_in_scope(person_id));
CREATE POLICY enc_insert ON health_encounter FOR INSERT TO rede_app
  WITH CHECK (app_person_in_scope(person_id) AND app_can_edit_health());
CREATE POLICY enc_update ON health_encounter FOR UPDATE TO rede_app
  USING (app_person_in_scope(person_id) AND app_can_edit_health()) WITH CHECK (true);

ALTER TABLE health_evolution ENABLE ROW LEVEL SECURITY;
CREATE POLICY evo_select ON health_evolution FOR SELECT TO rede_app USING (app_person_in_scope(person_id));
-- Quem acompanhou é quem assina a evolução: registro em nome próprio (§7.2).
CREATE POLICY evo_insert ON health_evolution FOR INSERT TO rede_app
  WITH CHECK (app_person_in_scope(person_id) AND accompanied_by = app_current_user());
-- Depois de enviada, a evolução do acompanhante NÃO é reescrita: a Enfermagem
-- complementa em registro próprio (nursing_triage). Só o status muda.
CREATE POLICY evo_update ON health_evolution FOR UPDATE TO rede_app
  USING (app_current_role() IN ('enfermagem','gestor_geral')) WITH CHECK (true);

ALTER TABLE nursing_triage ENABLE ROW LEVEL SECURITY;
CREATE POLICY triage_select ON nursing_triage FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM health_evolution e WHERE e.id = evolution_id));
-- SOMENTE a Enfermagem tria e assina. A coordenação cobra, mas não substitui.
CREATE POLICY triage_insert ON nursing_triage FOR INSERT TO rede_app
  WITH CHECK (app_current_role() IN ('enfermagem','gestor_geral')
              AND nurse_id = app_current_user());

ALTER TABLE health_summary_issue ENABLE ROW LEVEL SECURITY;
CREATE POLICY summary_select ON health_summary_issue FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id));
CREATE POLICY summary_insert ON health_summary_issue FOR INSERT TO rede_app
  WITH CHECK (app_person_in_scope(person_id) AND issued_by = app_current_user());
CREATE POLICY summary_update ON health_summary_issue FOR UPDATE TO rede_app
  USING (issued_by = app_current_user()) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON health_encounter, health_evolution, nursing_triage,
  health_summary_issue TO rede_app;
REVOKE DELETE ON health_encounter, health_evolution, nursing_triage,
  health_summary_issue FROM rede_app;

-- ============================================================
-- Painel da Enfermagem (§7.1)
-- ============================================================
-- Lista TODOS os acolhidos de uma casa, "inclusive os que não têm medicamento
-- previsto no dia". Isso é literal no requisito e importa: a ausência de
-- medicação é informação, não motivo para sumir da tela.
--
-- Os indicadores são operacionais — próxima dose, pendências, exames — e nunca
-- viram diagnóstico ou prioridade clínica automática (§7.1).
CREATE OR REPLACE FUNCTION app_nursing_panel(p_house uuid, p_date date)
RETURNS TABLE (
  person_id uuid, nome text, nome_civil text, idade integer,
  alergias text, restricoes text, condicoes text,
  doses_previstas integer, proxima_dose timestamptz, ultima_dose timestamptz,
  pendentes integer, evolucoes_pendentes integer,
  internacao boolean, retorno_pendente date, receita_vencendo date
) AS $$
  SELECT
    p.id,
    coalesce(nullif(p.social_name,''), p.full_name),
    p.full_name,
    date_part('year', age(p.birth_date))::int,
    (SELECT string_agg(h.description, ' · ') FROM health_condition h
      WHERE h.person_id = p.id AND h.active AND h.kind = 'alergia'),
    (SELECT string_agg(f.restriction, ' · ') FROM food_restriction f
      WHERE f.person_id = p.id AND f.active),
    (SELECT string_agg(h.description, ' · ') FROM health_condition h
      WHERE h.person_id = p.id AND h.active AND h.kind = 'condicao'),
    (SELECT count(*)::int FROM medication_administration a
      WHERE a.person_id = p.id
        AND (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = p_date),
    (SELECT min(a.scheduled_at) FROM medication_administration a
      WHERE a.person_id = p.id AND a.state = 'aguardando_confirmacao'
        AND a.scheduled_at >= now()),
    (SELECT max(a.administered_at) FROM medication_administration a
      WHERE a.person_id = p.id AND a.administered_at IS NOT NULL),
    (SELECT count(*)::int FROM medication_administration a
      WHERE a.person_id = p.id AND a.state = 'aguardando_confirmacao'
        AND a.scheduled_at < now()),
    (SELECT count(*)::int FROM health_evolution e
      WHERE e.person_id = p.id AND e.status <> 'assinada'),
    EXISTS (SELECT 1 FROM health_encounter e
             WHERE e.person_id = p.id AND e.kind = 'internacao' AND e.status = 'em_andamento'),
    (SELECT min(e.return_on) FROM health_encounter e
      WHERE e.person_id = p.id AND e.status = 'retorno_pendente' AND e.return_on IS NOT NULL),
    (SELECT min(pr.ends_on) FROM prescription pr
      WHERE pr.person_id = p.id AND pr.status = 'ativa'
        AND pr.ends_on IS NOT NULL AND pr.ends_on <= current_date + 7)
  FROM person p
  JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa' AND s.house_id = p_house
  WHERE app_house_in_scope(p_house)
  ORDER BY coalesce(nullif(p.social_name,''), p.full_name)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_nursing_panel(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_nursing_panel(uuid, date) TO rede_app;

-- ============================================================
-- Envio da Evolução como comando de sistema
-- ============================================================
-- A Evolução do acompanhante e o registro do atendimento na linha histórica
-- (§7.3) nascem juntos: quem esteve na consulta descreve o que viu, e o
-- atendimento passa a existir no histórico.
--
-- Mas escrever em `health_encounter` é ato de saúde — reservado à Enfermagem e
-- à equipe técnica. O educador não tem essa permissão, e não deve ganhá-la:
-- ele não edita o histórico de saúde, ele RELATA o que acompanhou.
--
-- Então a criação dos dois vira um comando único, que verifica por dentro
-- apenas o que precisa ser verdade: a pessoa está no escopo de quem relata, e
-- quem assina a evolução é quem a está enviando.
CREATE OR REPLACE FUNCTION app_submit_evolution(
  p_person uuid, p_house uuid, p_kind text, p_happened timestamptz,
  p_place text, p_specialty text, p_professional text, p_reason text,
  p_state_departure text, p_state_during text, p_state_return text,
  p_procedures text, p_exams_req text, p_exams_res text, p_prescription text,
  p_guidance text, p_restrictions text, p_return_on date, p_referrals text,
  p_transport text, p_observations text, p_offline boolean, p_client_op text
) RETURNS TABLE (out_evolution_id uuid, out_encounter_id uuid) AS $$
DECLARE v_evo uuid; v_enc uuid;
BEGIN
  IF NOT app_person_in_scope(p_person) THEN
    RAISE EXCEPTION 'acolhido_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO health_encounter (person_id, house_id, kind, happened_at, place, specialty,
                                professional, reason, status, return_on, created_by)
  VALUES (p_person, p_house, p_kind::encounter_kind, p_happened, p_place, p_specialty,
          p_professional, p_reason,
          CASE WHEN p_return_on IS NOT NULL THEN 'retorno_pendente' ELSE 'concluido' END,
          p_return_on, app_current_user())
  RETURNING id INTO v_enc;

  INSERT INTO health_evolution (person_id, house_id, encounter_id, kind, happened_at, place,
    specialty, service_professional, reason, state_departure, state_during, state_return,
    procedures, exams_requested, exams_results, prescription_note, guidance, restrictions,
    return_deadline, referrals, transport_notes, observations,
    accompanied_by, offline, synced_at, client_op_id)
  VALUES (p_person, p_house, v_enc, p_kind::encounter_kind, p_happened, p_place,
    p_specialty, p_professional, p_reason, p_state_departure, p_state_during, p_state_return,
    p_procedures, p_exams_req, p_exams_res, p_prescription, p_guidance, p_restrictions,
    p_return_on, p_referrals, p_transport, p_observations,
    app_current_user(), coalesce(p_offline,false),
    CASE WHEN p_offline THEN now() END, p_client_op)
  RETURNING id INTO v_evo;

  RETURN QUERY SELECT v_evo, v_enc;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_submit_evolution(uuid,uuid,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text,text,date,text,text,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_submit_evolution(uuid,uuid,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text,text,date,text,text,text,boolean,text) TO rede_app;
