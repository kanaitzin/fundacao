-- =============================================================================
-- 0840 — REUNIÃO DE EQUIPE E COMBINADOS (§9.4)
--
-- O que a casa faz hoje: a equipe técnica e a coordenação se reúnem, decidem
-- coisas — "a Alice sai da escola às 15h30 nas terças", "ninguém entra no
-- quarto do Bruno sem bater", "a partir de agora a saída para a fono é com a
-- educadora do turno da tarde" — e isso vive em três lugares: a ata de papel
-- da reunião, o grupo de mensagens e a memória de quem estava lá.
--
-- Quem entra de férias volta sem saber. Quem é contratado em março nunca fica
-- sabendo do que foi combinado em fevereiro. E a educadora do turno da noite,
-- que quase nunca está na reunião, é justamente quem mais precisa do
-- combinado às 23h.
--
-- Três decisões que estas tabelas carregam:
--
--  * ESCREVE QUEM DECIDE, LÊ QUEM CUIDA. Registrar a reunião é da equipe
--    técnica e da coordenação; ler é de todo mundo com alcance na casa,
--    inclusive o educador e a cozinha. Um combinado que a equipe do turno não
--    pode ler não é um combinado — é um recado que ninguém recebeu;
--  * O COMBINADO NÃO SE APAGA NEM SE REESCREVE. Ele nasce com um texto, e esse
--    texto é imutável. O que muda é a SITUAÇÃO dele — cumprido, revogado,
--    substituído — e cada mudança vira uma linha com autor, data e motivo. Sem
--    isso, "mas ficou combinado que..." vira discussão de memória, que é
--    exatamente o que o registro existe para encerrar;
--  * REVOGAR EXIGE MOTIVO. Um combinado desaparecer em silêncio é pior do que
--    ele nunca ter existido: a equipe continua cumprindo o que foi desfeito.
-- =============================================================================

-- ---------- A reunião ----------
CREATE TABLE team_meeting (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      uuid NOT NULL REFERENCES house(id),
  -- Dia da reunião. Pode ser anterior ao registro: reunião de sexta lançada na
  -- segunda continua sendo de sexta.
  happened_on   date NOT NULL,
  kind          text NOT NULL DEFAULT 'equipe'
                CHECK (kind IN ('equipe','tecnica','extraordinaria','capacitacao','supervisao')),
  title         text NOT NULL CHECK (length(btrim(title)) >= 4),
  -- Quem estava. Texto livre de propósito: nem todo participante é usuário do
  -- sistema (supervisão externa, estagiária, alguém da rede).
  attendees     text,
  agenda        text,
  notes         text,
  recorded_by   uuid NOT NULL REFERENCES app_user(id),
  recorded_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meeting_casa ON team_meeting (house_id, happened_on DESC);
CREATE TRIGGER meeting_no_change BEFORE UPDATE OR DELETE ON team_meeting
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------- O combinado ----------
CREATE TABLE team_agreement (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    uuid REFERENCES team_meeting(id),
  house_id      uuid NOT NULL REFERENCES house(id),
  -- O texto é imutável. Corrigir um combinado é registrar outro, dizendo que
  -- substitui o anterior — que é como a equipe realmente muda de acordo.
  body          text NOT NULL CHECK (length(btrim(body)) >= 10),
  -- Quem faz acontecer, quando aplicável. Texto: pode ser "o turno da noite".
  responsible   text,
  due_on        date,
  status        text NOT NULL DEFAULT 'vigente'
                CHECK (status IN ('vigente','cumprido','revogado','substituido')),
  status_reason text,
  status_by     uuid REFERENCES app_user(id),
  status_at     timestamptz,
  replaces_id   uuid REFERENCES team_agreement(id),
  created_by    uuid NOT NULL REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Situação diferente de vigente SEM motivo escrito é o silêncio que a regra
  -- proíbe: a equipe continuaria cumprindo o que alguém desfez sem dizer.
  CONSTRAINT ck_agreement_motivo CHECK (
    status = 'vigente' OR length(btrim(coalesce(status_reason, ''))) >= 5)
);
CREATE INDEX idx_agreement_casa ON team_agreement (house_id, created_at DESC);
CREATE INDEX idx_agreement_vigente ON team_agreement (house_id)
  WHERE status = 'vigente';

-- ---------- O histórico da situação ----------
-- O texto do combinado não muda; a situação dele muda, e cada mudança fica.
CREATE TABLE agreement_change (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id  uuid NOT NULL REFERENCES team_agreement(id),
  house_id      uuid NOT NULL REFERENCES house(id),
  before_status text NOT NULL,
  after_status  text NOT NULL,
  reason        text NOT NULL,
  changed_by    uuid NOT NULL REFERENCES app_user(id),
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agchange ON agreement_change (agreement_id, at DESC);
CREATE TRIGGER agchange_no_change BEFORE UPDATE OR DELETE ON agreement_change
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- O corpo do combinado é imutável mesmo quando a linha é atualizada: o UPDATE
-- só existe para a SITUAÇÃO. Sem este gatilho, "corrigir a redação" apagaria o
-- que a equipe leu e cumpriu durante semanas.
CREATE OR REPLACE FUNCTION tg_agreement_texto_imutavel() RETURNS trigger AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body
     OR NEW.meeting_id IS DISTINCT FROM OLD.meeting_id
     OR NEW.house_id IS DISTINCT FROM OLD.house_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'combinado_nao_se_reescreve';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER agreement_texto_imutavel BEFORE UPDATE ON team_agreement
  FOR EACH ROW EXECUTE FUNCTION tg_agreement_texto_imutavel();
CREATE TRIGGER agreement_no_delete BEFORE DELETE ON team_agreement
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ============================================================
-- Alcance
--
-- LER é de todo mundo que alcança a casa — é o ponto inteiro deste módulo.
-- ESCREVER é da equipe técnica e da coordenação, que é quem conduz a reunião.
-- ============================================================
ALTER TABLE team_meeting ENABLE ROW LEVEL SECURITY;
CREATE POLICY meeting_select ON team_meeting FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));
CREATE POLICY meeting_insert ON team_meeting FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id)
              AND recorded_by = app_current_user()
              AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));

ALTER TABLE team_agreement ENABLE ROW LEVEL SECURITY;
CREATE POLICY agreement_select ON team_agreement FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));
CREATE POLICY agreement_insert ON team_agreement FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id)
              AND created_by = app_current_user()
              AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));
CREATE POLICY agreement_update ON team_agreement FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id)
         AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'))
  WITH CHECK (app_house_in_scope(house_id));

ALTER TABLE agreement_change ENABLE ROW LEVEL SECURITY;
CREATE POLICY agchange_select ON agreement_change FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));
CREATE POLICY agchange_insert ON agreement_change FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id) AND changed_by = app_current_user());

GRANT SELECT, INSERT ON team_meeting, agreement_change TO rede_app;
GRANT SELECT, INSERT, UPDATE ON team_agreement TO rede_app;
REVOKE DELETE ON team_meeting, team_agreement, agreement_change FROM rede_app;

-- ============================================================
-- Mudar a situação de um combinado é UM ato: a linha muda e o histórico nasce
-- junto, na mesma transação. Separado, o dia em que a segunda escrita falhasse
-- deixaria um combinado revogado sem ninguém para responder por quê.
-- ============================================================
CREATE OR REPLACE FUNCTION app_mudar_combinado(
  p_agreement uuid, p_status text, p_motivo text, p_substituto uuid DEFAULT NULL
) RETURNS TABLE (id uuid, status text) AS $$
DECLARE v_ag team_agreement%ROWTYPE;
BEGIN
  SELECT * INTO v_ag FROM team_agreement WHERE team_agreement.id = p_agreement;
  IF v_ag.id IS NULL THEN
    RAISE EXCEPTION 'combinado_nao_encontrado';
  END IF;
  -- Escopo PRIMEIRO, antes de qualquer leitura útil (regra 8).
  IF NOT app_house_in_scope(v_ag.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_para_mudar_combinado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('cumprido','revogado','substituido') THEN
    RAISE EXCEPTION 'situacao_invalida';
  END IF;
  IF v_ag.status <> 'vigente' THEN
    RAISE EXCEPTION 'combinado_ja_encerrado';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;

  INSERT INTO agreement_change (agreement_id, house_id, before_status, after_status,
                                reason, changed_by)
  VALUES (p_agreement, v_ag.house_id, v_ag.status, p_status, btrim(p_motivo),
          app_current_user());

  UPDATE team_agreement SET status = p_status, status_reason = btrim(p_motivo),
         status_by = app_current_user(), status_at = now()
   WHERE team_agreement.id = p_agreement;

  IF p_substituto IS NOT NULL THEN
    UPDATE team_agreement SET replaces_id = p_agreement
     WHERE team_agreement.id = p_substituto;
  END IF;

  RETURN QUERY SELECT p_agreement, p_status;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_mudar_combinado(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_mudar_combinado(uuid, text, text, uuid) TO rede_app;

COMMENT ON TABLE team_agreement IS
  'Combinados da equipe (§9.4). O texto é imutável; a situação muda com motivo '
  'escrito e histórico próprio. Lido por todo mundo com alcance na casa.';
