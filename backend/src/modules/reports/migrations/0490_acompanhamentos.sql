-- ============================================================
-- Rede Acolher — Migração 049: acompanhamentos, relatórios e aprovações (§14)
--
-- Fase 6. Três regras estruturam tudo o que vem abaixo, e nenhuma delas é
-- sobre formato de documento:
--
--  1. **a automação cria a pendência, nunca escreve a avaliação** (§14.1).
--     Toda semana e todo mês nascem pendências para cada acolhido ativo. O
--     texto é humano. Um sistema que preenchesse sozinho "convivência: boa"
--     estaria inventando o que ninguém observou;
--
--  2. **fonte não entra sozinha no relatório** (§14.4). O sistema reúne o que
--     é elegível — atividades, ocorrências, evoluções — mostra origem, autor,
--     data e classificação, e espera a escolha. A referência ao original fica
--     guardada: quem ler o relatório daqui a dois anos consegue voltar ao fato;
--
--  3. **aprovado é retrato imutável** (§14.2, §14.6). Mudar depois não
--     sobrescreve: cria versão nova, que precisa de nova aprovação. O que foi
--     à audiência continua sendo o que foi à audiência.
--
-- E uma ausência deliberada: NÃO existe envio automático ao Judiciário, ao
-- Conselho Tutelar ou ao MP (§14.6). O sistema gera; a entrega é humana e
-- fica registrada como ato de alguém.
-- ============================================================

-- ---------- Acompanhamento semanal e mensal ----------
CREATE TABLE followup (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES person(id),
  house_id      uuid NOT NULL REFERENCES house(id),
  episode_id    uuid NOT NULL REFERENCES care_episode(id),
  kind          text NOT NULL CHECK (kind IN ('semanal','mensal')),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  status        text NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','rascunho','em_aprovacao','aprovado','substituido')),
  -- Eixos obrigatórios (§14.3). Texto humano; o sistema não preenche nenhum.
  axis_health      text,
  axis_school      text,
  axis_coexistence text,
  axis_family      text,
  -- Versionamento: aprovar congela; corrigir cria a versão seguinte.
  version       integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES followup(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES app_user(id),
  written_by    uuid REFERENCES app_user(id),
  submitted_at  timestamptz,
  approved_by   uuid REFERENCES app_user(id),
  approved_at   timestamptz,
  approval_note text,
  CHECK (period_end >= period_start)
);
CREATE INDEX idx_followup_pend ON followup (house_id, kind, status)
  WHERE status IN ('pendente','rascunho','em_aprovacao');
CREATE INDEX idx_followup_person ON followup (person_id, period_start DESC);
-- Uma pendência por acolhido, tipo e período — a geração é idempotente.
CREATE UNIQUE INDEX uq_followup_periodo
  ON followup (person_id, kind, period_start) WHERE status <> 'substituido';

-- ---------- Fontes escolhidas (§14.4) ----------
-- Guarda a REFERÊNCIA, não a cópia: o original continua sendo o original, e o
-- relatório sabe voltar até ele.
CREATE TABLE followup_source (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id  uuid NOT NULL REFERENCES followup(id),
  entity       text NOT NULL,          -- 'activity','incident','health_evolution','check'…
  entity_id    uuid NOT NULL,
  origem       text NOT NULL,          -- módulo/tela de origem, em linguagem de gente
  autor        text,                   -- quem registrou o original
  registrado_em timestamptz,
  classificacao text,                  -- 'operacional' | 'restrito' — visível na escolha
  escolhido_por uuid NOT NULL REFERENCES app_user(id),
  escolhido_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (followup_id, entity, entity_id)
);

ALTER TABLE followup ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_source ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON followup TO rede_app;
GRANT SELECT, INSERT ON followup_source TO rede_app;

-- Acompanhamento é documento técnico: equipe técnica, coordenação e Gestor
-- Geral. O educador contribui com o registro do dia, não com o acompanhamento.
CREATE POLICY fu_select ON followup FOR SELECT TO rede_app
  USING (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
         AND app_house_in_scope(house_id));

CREATE POLICY fu_update ON followup FOR UPDATE TO rede_app
  USING (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
         AND app_house_in_scope(house_id)
         AND status <> 'aprovado')          -- aprovado não se edita: cria-se versão
  WITH CHECK (app_house_in_scope(house_id));

CREATE POLICY fus_select ON followup_source FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM followup f WHERE f.id = followup_id));
CREATE POLICY fus_insert ON followup_source FOR INSERT TO rede_app
  WITH CHECK (escolhido_por = app_current_user()
              AND EXISTS (SELECT 1 FROM followup f
                          WHERE f.id = followup_id AND f.status <> 'aprovado'));

-- Guarda: o que está aprovado é retrato daquele momento.
CREATE OR REPLACE FUNCTION followup_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'aprovado' AND NEW.status <> 'substituido' THEN
    RAISE EXCEPTION 'acompanhamento_aprovado_e_imutavel'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_followup_guard BEFORE UPDATE ON followup
  FOR EACH ROW EXECUTE FUNCTION followup_guard();

-- ============================================================
-- Geração das pendências (§14.1)
--
-- Idempotente pelo índice único: rodar duas vezes no mesmo dia não duplica.
-- Cria pendência para quem está ATIVO na casa hoje — quem saiu ontem não
-- ganha acompanhamento novo, e quem chegou hoje ganha.
-- ============================================================
CREATE OR REPLACE FUNCTION app_generate_followups(p_house uuid, p_date date DEFAULT NULL)
RETURNS TABLE (criadas integer, ja_existiam integer) AS $$
DECLARE
  v_dia date := coalesce(p_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_sem_ini date := date_trunc('week', v_dia)::date;
  v_mes_ini date := date_trunc('month', v_dia)::date;
  v_criadas integer := 0; v_total integer := 0;
BEGIN
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral','admin_tecnico')
     OR NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'sem_permissao_gerar_acompanhamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH ativos AS (
    SELECT s.person_id, s.episode_id FROM house_stay s
     WHERE s.house_id = p_house AND s.status = 'ativa'
  ), novas AS (
    INSERT INTO followup (person_id, house_id, episode_id, kind, period_start, period_end, created_by)
    SELECT a.person_id, p_house, a.episode_id, k.kind, k.ini, k.fim, app_current_user()
      FROM ativos a
      CROSS JOIN (VALUES
        ('semanal', v_sem_ini, (v_sem_ini + 6)),
        ('mensal',  v_mes_ini, (v_mes_ini + interval '1 month - 1 day')::date)
      ) AS k(kind, ini, fim)
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_criadas FROM novas;

  SELECT count(*) INTO v_total FROM house_stay s
   WHERE s.house_id = p_house AND s.status = 'ativa';

  RETURN QUERY SELECT v_criadas, (v_total * 2 - v_criadas);
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_generate_followups(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_generate_followups(uuid, date) TO rede_app;

-- ============================================================
-- Aprovação e nova versão
--
-- Quem redige o mensal não aprova o próprio texto (§14.2): a equipe técnica
-- redige, a coordenação revisa. É a mesma regra que já vale para comunicação
-- externa — e existe porque revisão feita pelo próprio autor não é revisão.
-- ============================================================
CREATE OR REPLACE FUNCTION app_approve_followup(p_followup uuid, p_note text)
RETURNS TABLE (aprovado boolean, versao integer) AS $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM followup WHERE id = p_followup FOR UPDATE;
  IF f IS NULL THEN
    RAISE EXCEPTION 'acompanhamento_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(f.house_id) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app_current_role() NOT IN ('coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'somente_coordenacao_aprova' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF f.status <> 'em_aprovacao' THEN
    RAISE EXCEPTION 'acompanhamento_nao_esta_em_aprovacao' USING ERRCODE = 'check_violation';
  END IF;
  IF f.written_by = app_current_user() THEN
    RAISE EXCEPTION 'autor_nao_aprova_o_proprio_texto' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE followup
     SET status = 'aprovado', approved_by = app_current_user(),
         approved_at = now(), approval_note = nullif(btrim(p_note), '')
   WHERE id = p_followup;

  RETURN QUERY SELECT true, f.version;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_approve_followup(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_approve_followup(uuid, text) TO rede_app;

-- Correção depois de aprovado: nova versão, e a anterior fica como retrato.
CREATE OR REPLACE FUNCTION app_amend_followup(p_followup uuid, p_motivo text)
RETURNS TABLE (novo_id uuid, versao integer) AS $$
DECLARE f record; v_novo uuid;
BEGIN
  SELECT * INTO f FROM followup WHERE id = p_followup FOR UPDATE;
  IF f IS NULL THEN
    RAISE EXCEPTION 'acompanhamento_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(f.house_id)
     OR app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF f.status <> 'aprovado' THEN
    RAISE EXCEPTION 'somente_aprovado_gera_versao' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 15 THEN
    RAISE EXCEPTION 'motivo_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO followup (person_id, house_id, episode_id, kind, period_start, period_end,
                        status, axis_health, axis_school, axis_coexistence, axis_family,
                        version, supersedes_id, created_by, written_by, approval_note)
  VALUES (f.person_id, f.house_id, f.episode_id, f.kind, f.period_start, f.period_end,
          'rascunho', f.axis_health, f.axis_school, f.axis_coexistence, f.axis_family,
          f.version + 1, f.id, app_current_user(), app_current_user(),
          'Correção: ' || btrim(p_motivo))
  RETURNING id INTO v_novo;

  -- A anterior sai do caminho sem sumir: continua legível, marcada como substituída.
  UPDATE followup SET status = 'substituido' WHERE id = p_followup;

  -- As fontes escolhidas acompanham a nova versão: não se reescolhe tudo por
  -- causa de uma correção de texto.
  INSERT INTO followup_source (followup_id, entity, entity_id, origem, autor,
                               registrado_em, classificacao, escolhido_por)
  SELECT v_novo, s.entity, s.entity_id, s.origem, s.autor, s.registrado_em,
         s.classificacao, app_current_user()
    FROM followup_source s WHERE s.followup_id = p_followup;

  RETURN QUERY SELECT v_novo, f.version + 1;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_amend_followup(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_amend_followup(uuid, text) TO rede_app;

-- ============================================================
-- Relatórios gerados (§14.5, §18.4)
-- ============================================================
CREATE TABLE report_document (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      uuid REFERENCES house(id),      -- nulo em relatório institucional
  person_id     uuid REFERENCES person(id),     -- nulo em relatório da casa
  kind          text NOT NULL CHECK (kind IN (
                  'diario','semanal','mensal','periodo','individual','medicamentos',
                  'atividades','ocorrencias','reuniao_tecnica','audiencia','judiciario',
                  'mensal_da_casa','atas_consolidadas','alimentacao','historico',
                  'saude','beneficios')),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  purpose       text NOT NULL,                  -- finalidade: obrigatória, sempre
  format        text NOT NULL DEFAULT 'pdf' CHECK (format IN ('tela','pdf','planilha','documento')),
  body          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- seções montadas, com fonte por trecho
  status        text NOT NULL DEFAULT 'rascunho'
                CHECK (status IN ('rascunho','em_aprovacao','aprovado','substituido')),
  version       integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES report_document(id),
  checksum      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL REFERENCES app_user(id),
  approved_by   uuid REFERENCES app_user(id),
  approved_at   timestamptz,
  CHECK (period_end >= period_start),
  CHECK (house_id IS NOT NULL OR person_id IS NOT NULL)
);
CREATE INDEX idx_report_house ON report_document (house_id, kind, created_at DESC);
CREATE INDEX idx_report_person ON report_document (person_id, created_at DESC);

-- Entrega a órgão externo: registro de ATO HUMANO, nunca fila de envio (§14.6).
-- Não existe integração, endpoint ou job que mande relatório para fora.
CREATE TABLE report_delivery (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES report_document(id),
  destinatario text NOT NULL,                  -- Vara, Conselho Tutelar, MP, serviço de saúde
  meio         text NOT NULL,                  -- protocolo, e-mail institucional, entrega em mãos
  entregue_em  timestamptz NOT NULL,
  protocolo    text,
  registrado_por uuid NOT NULL REFERENCES app_user(id),
  registrado_em  timestamptz NOT NULL DEFAULT now(),
  observacao   text
);
CREATE INDEX idx_delivery_report ON report_delivery (report_id);

-- Toda exportação deixa rastro (§18.4): quem, casa, período, finalidade,
-- formato, filtros e hora.
CREATE TABLE export_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  house_id    uuid REFERENCES house(id),
  report_id   uuid REFERENCES report_document(id),
  kind        text NOT NULL,
  period_start date, period_end date,
  purpose     text NOT NULL,
  format      text NOT NULL,
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_export_user ON export_log (user_id, at DESC);

ALTER TABLE report_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON report_document TO rede_app;
GRANT SELECT, INSERT ON report_delivery TO rede_app;
GRANT SELECT, INSERT ON export_log TO rede_app;

-- Benefícios têm relatório separado e restrito (§14.5, §6.10).
CREATE POLICY rep_select ON report_document FOR SELECT TO rede_app
  USING (
    (house_id IS NULL OR app_house_in_scope(house_id))
    AND (person_id IS NULL OR app_person_in_scope(person_id))
    AND (kind <> 'beneficios' OR app_current_role() IN ('coordenador','gestor_geral'))
    AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral','enfermagem','admin_tecnico')
  );
CREATE POLICY rep_insert ON report_document FOR INSERT TO rede_app
  WITH CHECK (created_by = app_current_user()
              AND (house_id IS NULL OR app_house_in_scope(house_id)));
CREATE POLICY rep_update ON report_document FOR UPDATE TO rede_app
  USING (app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
         AND (house_id IS NULL OR app_house_in_scope(house_id))
         AND status <> 'aprovado')
  WITH CHECK (true);

CREATE POLICY del_select ON report_delivery FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM report_document r WHERE r.id = report_id));
CREATE POLICY del_insert ON report_delivery FOR INSERT TO rede_app
  WITH CHECK (registrado_por = app_current_user()
              AND EXISTS (SELECT 1 FROM report_document r
                          WHERE r.id = report_id AND r.status = 'aprovado'));

CREATE POLICY exp_select ON export_log FOR SELECT TO rede_app
  USING (user_id = app_current_user()
         OR app_current_role() IN ('coordenador','gestor_geral'));
CREATE POLICY exp_insert ON export_log FOR INSERT TO rede_app
  WITH CHECK (user_id = app_current_user());

-- Relatório aprovado é retrato: nem quem aprovou reabre.
CREATE OR REPLACE FUNCTION report_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'aprovado' AND NEW.status <> 'substituido' THEN
    RAISE EXCEPTION 'relatorio_aprovado_e_imutavel'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_report_guard BEFORE UPDATE ON report_document
  FOR EACH ROW EXECUTE FUNCTION report_guard();

-- Aprovação do relatório ao Judiciário: técnica redige, coordenação aprova,
-- gestor consulta a versão aprovada (§14.6).
CREATE OR REPLACE FUNCTION app_approve_report(p_report uuid)
RETURNS TABLE (aprovado boolean, versao integer) AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM report_document WHERE id = p_report FOR UPDATE;
  IF r IS NULL THEN
    RAISE EXCEPTION 'relatorio_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF r.house_id IS NOT NULL AND NOT app_house_in_scope(r.house_id) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app_current_role() NOT IN ('coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'somente_coordenacao_aprova' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status <> 'em_aprovacao' THEN
    RAISE EXCEPTION 'relatorio_nao_esta_em_aprovacao' USING ERRCODE = 'check_violation';
  END IF;
  IF r.created_by = app_current_user() THEN
    RAISE EXCEPTION 'autor_nao_aprova_o_proprio_relatorio' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE report_document
     SET status = 'aprovado', approved_by = app_current_user(), approved_at = now()
   WHERE id = p_report;
  RETURN QUERY SELECT true, r.version;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_approve_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_approve_report(uuid) TO rede_app;
