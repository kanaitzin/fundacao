-- ============================================================
-- Módulo `incidents` — Ocorrências especiais e proteção (§13)
--
-- Premissa que atravessa tudo aqui: "o registro nunca deve atrasar proteção
-- imediata, atendimento de saúde ou protocolo institucional" (§13.1). Por isso
-- a abertura pede o mínimo — categoria, quando e o fato — e todo o resto entra
-- depois. Um formulário longo na hora errada é um formulário não preenchido.
--
-- Máquina de estados (§24):
--   aberta → proteção → relatos → acompanhamento → encerramento operacional
--          → revisão técnica crítica → fechada → reaberta/adendo
--
-- O sistema NÃO avalia se a medida foi adequada, não classifica gravidade
-- sozinho e não conclui nada sobre a criança (§3.3). Ele guarda o que houve,
-- com autoria, e chama gente.
-- ============================================================

CREATE TABLE incident (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       uuid NOT NULL REFERENCES house(id),
  category       text NOT NULL CHECK (category IN (
    'violencia_ou_suspeita','conflito_agressao','saida_nao_autorizada','erro_medicamento',
    'emergencia_saude','contencao','desorganizacao_relevante','dano_recusa_critica','outro')),
  happened_at    timestamptz NOT NULL,
  activity_ref   text,                      -- atividade em curso quando ocorreu
  objective_fact text NOT NULL,             -- o que aconteceu, sem juízo
  people_present text,
  immediate_measures text,
  health_related     boolean NOT NULL DEFAULT false,
  medication_related boolean NOT NULL DEFAULT false,
  contacts       text,                      -- contatos feitos (família, rede, serviços)
  pendencies     text,
  responsible_id uuid REFERENCES app_user(id),
  deadline       date,
  -- 'equipe': operacional, visível ao plantão. 'restrito': conteúdo sensível,
  -- equipe técnica e coordenação. O padrão acompanha a categoria (§13.3).
  access_level   text NOT NULL DEFAULT 'equipe' CHECK (access_level IN ('equipe','restrito')),
  status         text NOT NULL DEFAULT 'aberta' CHECK (status IN (
    'aberta','em_acompanhamento','encerrada_operacional','aguardando_revisao_tecnica','fechada','reaberta')),
  -- Categorias que NÃO podem ser encerradas sem validação técnica (§13.5).
  requires_technical_review boolean NOT NULL DEFAULT false,
  opened_by      uuid NOT NULL REFERENCES app_user(id),
  opened_at      timestamptz NOT NULL DEFAULT now(),
  operational_closed_by uuid REFERENCES app_user(id),
  operational_closed_at timestamptz,
  reviewed_by    uuid REFERENCES app_user(id),
  reviewed_at    timestamptz,
  closed_at      timestamptz,
  offline        boolean NOT NULL DEFAULT false,
  client_op_id   text UNIQUE
);
CREATE INDEX idx_incident_house ON incident (house_id, happened_at DESC);
CREATE INDEX idx_incident_status ON incident (status) WHERE status <> 'fechada';

-- A revisão técnica obrigatória é derivada da categoria, no banco. Não é a
-- tela que decide, e não há rota capaz de marcar "não precisa".
CREATE OR REPLACE FUNCTION incident_defaults() RETURNS trigger AS $$
BEGIN
  NEW.requires_technical_review :=
    NEW.category IN ('violencia_ou_suspeita','erro_medicamento','contencao','emergencia_saude')
    OR NEW.medication_related;
  IF NEW.category IN ('violencia_ou_suspeita','contencao') THEN
    NEW.access_level := 'restrito';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER incident_defaults_trg BEFORE INSERT ON incident
  FOR EACH ROW EXECUTE FUNCTION incident_defaults();

-- Ocorrência não é apagada nem tem o fato reescrito (§3.3, §13.4).
CREATE OR REPLACE FUNCTION incident_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ocorrencia_nao_e_apagada'; END IF;
  IF NEW.objective_fact IS DISTINCT FROM OLD.objective_fact
     OR NEW.happened_at IS DISTINCT FROM OLD.happened_at
     OR NEW.opened_by IS DISTINCT FROM OLD.opened_by THEN
    RAISE EXCEPTION 'fato_original_nao_se_reescreve';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER incident_guard_trg BEFORE UPDATE OR DELETE ON incident
  FOR EACH ROW EXECUTE FUNCTION incident_guard();

CREATE TABLE incident_person (
  incident_id uuid NOT NULL REFERENCES incident(id),
  person_id   uuid NOT NULL REFERENCES person(id),
  PRIMARY KEY (incident_id, person_id)
);

-- ---------- Conteúdo protegido (§13.3) ----------
-- Fala espontânea e sinais observados no corpo de uma criança não são dado
-- operacional de plantão. Ficam em tabela separada — não por organização, mas
-- porque assim a política pode ser outra, mais estreita, sem depender de a
-- tela lembrar de esconder o campo.
CREATE TABLE incident_protected (
  incident_id        uuid PRIMARY KEY REFERENCES incident(id),
  house_id           uuid NOT NULL REFERENCES house(id),
  spontaneous_speech text,     -- transcrição do que a criança disse, sem interpretação
  observed_signs     text,     -- sinais/lesões observados, descritivos
  author_id          uuid NOT NULL REFERENCES app_user(id),
  health_related     boolean NOT NULL DEFAULT false,
  at                 timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER incident_protected_no_change BEFORE UPDATE OR DELETE ON incident_protected
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------- Contenção (§13.3) ----------
CREATE TABLE incident_restraint (
  incident_id        uuid PRIMARY KEY REFERENCES incident(id),
  antecedents        text NOT NULL,
  place              text NOT NULL,
  people_present     text NOT NULL,
  previous_attempts  text NOT NULL,   -- o que foi tentado antes
  method             text NOT NULL,
  duration_minutes   integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  possible_injury    text,
  health_evaluation  text,
  later_action       text,
  followup_by        uuid REFERENCES app_user(id),
  recorded_by        uuid NOT NULL REFERENCES app_user(id),
  at                 timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER restraint_no_change BEFORE UPDATE OR DELETE ON incident_restraint
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------- Síntese técnica (§13.4) ----------
-- Escrita por cima de nada: é um registro NOVO, ao lado dos relatos originais.
CREATE TABLE incident_synthesis (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incident(id),
  house_id    uuid NOT NULL REFERENCES house(id),
  body        text NOT NULL,
  author_id   uuid NOT NULL REFERENCES app_user(id),
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER synthesis_no_change BEFORE UPDATE OR DELETE ON incident_synthesis
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------- Comunicação externa (§13.6) ----------
-- NÃO EXISTE ENVIO. Não há coluna, rota, fila ou integração que despache isto
-- para fora. O sistema registra, gera o documento, guarda a aprovação e
-- registra que um humano entregou — nada mais (§3.3, §26.2 #23).
CREATE TABLE external_communication (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       uuid NOT NULL REFERENCES house(id),
  incident_id    uuid REFERENCES incident(id),
  person_id      uuid REFERENCES person(id),
  organ          text NOT NULL CHECK (organ IN (
    'judiciario','conselho_tutelar','ministerio_publico','saude','escola','rede','outro')),
  -- Destinatário FUNCIONAL (o cargo/setor), não a pessoa. §13.6.
  recipient_role text NOT NULL,
  channel        text NOT NULL CHECK (channel IN ('oficio','email_institucional','presencial','telefone','sistema_externo')),
  occurred_at    timestamptz,
  summary        text NOT NULL,
  documents      jsonb NOT NULL DEFAULT '[]',
  guidance       text,
  followup       text,
  responsible_id uuid NOT NULL REFERENCES app_user(id),
  status         text NOT NULL DEFAULT 'rascunho'
                 CHECK (status IN ('rascunho','em_revisao','aprovado','entregue_manualmente')),
  approved_by    uuid REFERENCES app_user(id),
  approved_at    timestamptz,
  delivered_by   uuid REFERENCES app_user(id),
  delivered_at   timestamptz,
  delivery_note  text,
  created_by     uuid NOT NULL REFERENCES app_user(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Entrega só existe com humano identificado. A ausência de automatismo é
  -- uma restrição do esquema, não uma promessa do código.
  CONSTRAINT entrega_tem_responsavel_humano
    CHECK ((delivered_at IS NULL AND delivered_by IS NULL)
           OR (delivered_at IS NOT NULL AND delivered_by IS NOT NULL))
);
CREATE INDEX idx_extcom_incident ON external_communication (incident_id);

CREATE OR REPLACE FUNCTION extcom_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'comunicacao_nao_e_apagada'; END IF;
  -- Só se aprova o que foi revisado; só se entrega o que foi aprovado.
  IF NEW.status = 'aprovado' AND OLD.status NOT IN ('rascunho','em_revisao') THEN
    RAISE EXCEPTION 'transicao_invalida:aprovacao';
  END IF;
  IF NEW.status = 'entregue_manualmente' AND OLD.status <> 'aprovado' THEN
    RAISE EXCEPTION 'entrega_sem_aprovacao';
  END IF;
  IF OLD.status IN ('aprovado','entregue_manualmente')
     AND NEW.summary IS DISTINCT FROM OLD.summary THEN
    RAISE EXCEPTION 'conteudo_aprovado_nao_se_reescreve';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER extcom_guard_trg BEFORE UPDATE OR DELETE ON external_communication
  FOR EACH ROW EXECUTE FUNCTION extcom_guard();

-- ---------- Anexos (§13.7) ----------
CREATE TABLE incident_attachment (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id    uuid NOT NULL REFERENCES incident(id),
  house_id       uuid NOT NULL REFERENCES house(id),
  kind           text NOT NULL CHECK (kind IN (
    'documento_medico','comunicacao_oficial','foto_autorizada','documento_escolar','documento_tecnico')),
  -- Nome de exibição neutro. CPF, diagnóstico e conteúdo judicial NUNCA
  -- aparecem em nome de arquivo (§3.3) — a validação está no serviço e o
  -- nome original não é armazenado.
  display_name   text NOT NULL,
  justification  text,          -- obrigatória para foto (§13.7)
  restricted     boolean NOT NULL DEFAULT true,
  storage_ref    text NOT NULL, -- referência cifrada; leitura só por comando
  checksum       text,
  author_id      uuid NOT NULL REFERENCES app_user(id),
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachment_incident ON incident_attachment (incident_id);
CREATE TRIGGER attachment_no_change BEFORE UPDATE OR DELETE ON incident_attachment
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ============================================================
-- Políticas
-- ============================================================
ALTER TABLE incident ENABLE ROW LEVEL SECURITY;
-- Quem vê a ocorrência:
--  * nível 'equipe': todo o plantão da casa — é o que permite proteger;
--  * nível 'restrito': autor, líder responsável, equipe técnica e coordenação;
--  * Enfermagem entra nas de saúde/medicamento, por finalidade clínica (§5.8).
--
-- Por que o LÍDER entra também nas restritas: o §13.2 manda avisá-lo na
-- abertura e o §13.5 lhe dá o encerramento da etapa operacional. Avisar alguém
-- sobre algo que ele não pode abrir transforma o aviso em ruído — e ruído é o
-- que faz a equipe parar de olhar. A proteção do conteúdo sensível não está
-- aqui: está em `incident_protected` (fala espontânea, sinais observados) e em
-- `statement` (narrativas), cada um com política própria e mais estreita.
-- Mudou de LUGAR, não de força: o líder encerra a etapa operacional sem
-- navegar pelas narrativas restritas, que é exatamente o que o §13.5 pede.
CREATE POLICY incident_select ON incident FOR SELECT TO rede_app USING (
  app_house_in_scope(house_id) AND (
    access_level = 'equipe'
    OR opened_by = app_current_user()
    OR app_current_role() IN ('lider_diurno','lider_noturno_geral','equipe_tecnica','coordenador')
    OR (app_current_role() = 'enfermagem' AND (health_related OR medication_related))
  )
);
CREATE POLICY incident_insert ON incident FOR INSERT TO rede_app
  WITH CHECK (opened_by = app_current_user() AND app_house_in_scope(house_id)
              AND app_current_role() IN ('educador','lider_diurno','lider_noturno_geral','equipe_tecnica','coordenador','enfermagem'));
CREATE POLICY incident_update ON incident FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id) AND status <> 'fechada')
  WITH CHECK (app_house_in_scope(house_id));
GRANT SELECT, INSERT, UPDATE ON incident TO rede_app;

ALTER TABLE incident_person ENABLE ROW LEVEL SECURITY;
CREATE POLICY ip_select ON incident_person FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM incident i WHERE i.id = incident_id));
CREATE POLICY ip_insert ON incident_person FOR INSERT TO rede_app
  WITH CHECK (EXISTS (SELECT 1 FROM incident i
                      JOIN house_stay s ON s.person_id = incident_person.person_id
                                       AND s.house_id = i.house_id AND s.status = 'ativa'
                      WHERE i.id = incident_person.incident_id));
GRANT SELECT, INSERT ON incident_person TO rede_app;

ALTER TABLE incident_protected ENABLE ROW LEVEL SECURITY;
-- Mais estreita que a da ocorrência, de propósito.
CREATE POLICY iprot_select ON incident_protected FOR SELECT TO rede_app USING (
  app_house_in_scope(house_id) AND (
    author_id = app_current_user()
    OR app_current_role() IN ('equipe_tecnica','coordenador')
    OR (app_current_role() = 'enfermagem' AND health_related)
  )
);
CREATE POLICY iprot_insert ON incident_protected FOR INSERT TO rede_app
  WITH CHECK (author_id = app_current_user() AND app_house_in_scope(house_id));
GRANT SELECT, INSERT ON incident_protected TO rede_app;

ALTER TABLE incident_restraint ENABLE ROW LEVEL SECURITY;
CREATE POLICY irest_select ON incident_restraint FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM incident i WHERE i.id = incident_id));
CREATE POLICY irest_insert ON incident_restraint FOR INSERT TO rede_app
  WITH CHECK (recorded_by = app_current_user());
GRANT SELECT, INSERT ON incident_restraint TO rede_app;

ALTER TABLE incident_synthesis ENABLE ROW LEVEL SECURITY;
CREATE POLICY isyn_select ON incident_synthesis FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id)
         AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));
CREATE POLICY isyn_insert ON incident_synthesis FOR INSERT TO rede_app
  WITH CHECK (author_id = app_current_user()
              AND app_current_role() IN ('equipe_tecnica','coordenador'));
GRANT SELECT, INSERT ON incident_synthesis TO rede_app;

ALTER TABLE external_communication ENABLE ROW LEVEL SECURITY;
CREATE POLICY ec_select ON external_communication FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id)
         AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));
CREATE POLICY ec_insert ON external_communication FOR INSERT TO rede_app
  WITH CHECK (created_by = app_current_user() AND app_house_in_scope(house_id)
              AND app_current_role() IN ('equipe_tecnica','coordenador'));
CREATE POLICY ec_update ON external_communication FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id)
         AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'))
  WITH CHECK (app_house_in_scope(house_id));
GRANT SELECT, INSERT, UPDATE ON external_communication TO rede_app;

ALTER TABLE incident_attachment ENABLE ROW LEVEL SECURITY;
-- Todo mundo do escopo enxerga QUE existe anexo; ninguém abre por aqui.
CREATE POLICY att_select ON incident_attachment FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));
CREATE POLICY att_insert ON incident_attachment FOR INSERT TO rede_app
  WITH CHECK (author_id = app_current_user() AND app_house_in_scope(house_id));

-- Privilégio POR COLUNA: `storage_ref` não é legível pelo papel da aplicação.
-- Nem uma consulta com defeito, nem um `SELECT *` esquecido devolve o caminho
-- do arquivo — só o comando `app_open_attachment`, que registra a leitura.
GRANT SELECT (id, incident_id, house_id, kind, display_name, justification,
              restricted, checksum, author_id, at)
  ON incident_attachment TO rede_app;
GRANT INSERT (id, incident_id, house_id, kind, display_name, justification,
              restricted, storage_ref, checksum, author_id, at)
  ON incident_attachment TO rede_app;

-- ============================================================
-- Comandos de sistema
-- ============================================================

-- Encerramento operacional (§13.5, §26.2 #22).
-- O líder encerra a ETAPA OPERACIONAL — e é só isso que ele encerra. Quando a
-- categoria é crítica, o comando devolve a ocorrência a 'aguardando_revisao_tecnica'
-- em vez de 'fechada'. Não existe parâmetro para pular esse passo.
CREATE OR REPLACE FUNCTION app_close_incident_operational(p_id uuid, p_note text)
RETURNS TABLE (out_status text, out_needs_review boolean) AS $$
DECLARE v_me uuid; v_role role_code; v_i incident%ROWTYPE; v_status text;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_i FROM incident WHERE id = p_id;
  IF v_i.id IS NULL THEN RAISE EXCEPTION 'ocorrencia_inexistente'; END IF;
  IF NOT app_house_in_scope(v_i.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF v_role NOT IN ('lider_diurno','lider_noturno_geral','equipe_tecnica','coordenador') THEN
    RAISE EXCEPTION 'cargo_nao_encerra_ocorrencia';
  END IF;
  IF v_i.status IN ('fechada') THEN RAISE EXCEPTION 'ocorrencia_ja_fechada'; END IF;

  v_status := CASE WHEN v_i.requires_technical_review
                   THEN 'aguardando_revisao_tecnica' ELSE 'encerrada_operacional' END;

  UPDATE incident SET status = v_status, operational_closed_by = v_me,
                      operational_closed_at = now(),
                      pendencies = coalesce(p_note, pendencies)
   WHERE id = p_id;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_i.house_id, v_me, 'incident.close_operational', 'incident', p_id,
          jsonb_build_object('status', v_status, 'categoria', v_i.category));

  RETURN QUERY SELECT v_status, v_i.requires_technical_review;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_close_incident_operational(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_close_incident_operational(uuid, text) TO rede_app;

-- Revisão técnica (§13.5). Quando há saúde ou medicamento envolvido, a
-- Enfermagem também precisa ter se manifestado — a validação clínica não é
-- substituível pela técnica.
CREATE OR REPLACE FUNCTION app_review_incident(p_id uuid, p_decision text, p_note text)
RETURNS TABLE (out_status text) AS $$
DECLARE v_me uuid; v_role role_code; v_i incident%ROWTYPE; v_status text;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_i FROM incident WHERE id = p_id;
  IF v_i.id IS NULL THEN RAISE EXCEPTION 'ocorrencia_inexistente'; END IF;
  IF NOT app_house_in_scope(v_i.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;
  IF p_decision NOT IN ('validar','reabrir') THEN RAISE EXCEPTION 'decisao_invalida'; END IF;

  IF p_decision = 'reabrir' THEN
    IF v_role NOT IN ('equipe_tecnica','coordenador') THEN RAISE EXCEPTION 'cargo_nao_revisa'; END IF;
    UPDATE incident SET status = 'reaberta', reviewed_by = v_me, reviewed_at = now(),
                        closed_at = NULL
     WHERE id = p_id;
    v_status := 'reaberta';
  ELSE
    IF v_role NOT IN ('equipe_tecnica','coordenador') THEN RAISE EXCEPTION 'cargo_nao_revisa'; END IF;
    IF (v_i.health_related OR v_i.medication_related)
       AND NOT EXISTS (SELECT 1 FROM incident_synthesis s
                       WHERE s.incident_id = p_id) THEN
      -- Fechar caso de saúde sem nenhuma síntese registrada seria fechar sem
      -- ninguém ter escrito o que se concluiu.
      RAISE EXCEPTION 'sintese_ausente';
    END IF;
    UPDATE incident SET status = 'fechada', reviewed_by = v_me, reviewed_at = now(),
                        closed_at = now()
     WHERE id = p_id;
    v_status := 'fechada';
  END IF;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose, detail)
  VALUES (v_i.house_id, v_me, 'incident.technical_review', 'incident', p_id, p_note,
          jsonb_build_object('decisao', p_decision, 'status', v_status));

  RETURN QUERY SELECT v_status;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_review_incident(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_review_incident(uuid, text, text) TO rede_app;

-- Abrir anexo restrito (§13.7). O líder vê que existe; abrir é outro ato.
CREATE OR REPLACE FUNCTION app_open_attachment(p_id uuid, p_purpose text)
RETURNS TABLE (out_ref text, out_kind text, out_name text) AS $$
DECLARE v_me uuid; v_role role_code; v_a incident_attachment%ROWTYPE;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  SELECT * INTO v_a FROM incident_attachment WHERE id = p_id;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'anexo_inexistente'; END IF;
  IF NOT app_house_in_scope(v_a.house_id) THEN RAISE EXCEPTION 'fora_de_escopo'; END IF;

  IF v_a.restricted THEN
    IF coalesce(length(btrim(p_purpose)), 0) < 15 THEN RAISE EXCEPTION 'finalidade_insuficiente'; END IF;
    IF NOT (v_role IN ('equipe_tecnica','coordenador')
            OR v_a.author_id = v_me
            OR (v_role = 'enfermagem' AND v_a.kind = 'documento_medico')) THEN
      RAISE EXCEPTION 'anexo_restrito';
    END IF;
  END IF;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose, detail)
  VALUES (v_a.house_id, v_me, 'incident.attachment_open', 'incident_attachment', p_id,
          nullif(btrim(p_purpose), ''), jsonb_build_object('tipo', v_a.kind, 'restrito', v_a.restricted));

  RETURN QUERY SELECT v_a.storage_ref, v_a.kind, v_a.display_name;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_open_attachment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_open_attachment(uuid, text) TO rede_app;
