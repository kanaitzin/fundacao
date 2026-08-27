-- ============================================================
-- Módulo `medications` — Prescrição, grade, administração e estoque (§11)
--
-- "O sistema apoia execução segura, mas NÃO prescreve nem decide
-- clinicamente" (§11). Tudo aqui parte de uma prescrição humana, cadastrada e
-- assinada pela Enfermagem.
--
-- Três regras que o esquema torna impossíveis de burlar:
--   1. cada dose é confirmada por QUEM A ADMINISTROU, em conta individual —
--      ninguém confirma por outro (§11.2);
--   2. não existe marcação em lote: uma linha por dose, uma confirmação por vez;
--   3. dose vencida sem registro fica "aguardando confirmação", NUNCA
--      "não administrado" (§11.3) — o sistema constata ausência de registro,
--      não afirma omissão.
-- ============================================================

CREATE TYPE prescription_kind AS ENUM
  ('uso_continuo','tratamento','quando_necessario','episodio_agudo');

CREATE TABLE prescription (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id      uuid NOT NULL REFERENCES person(id),
  house_id       uuid NOT NULL REFERENCES house(id),   -- casa no momento da prescrição
  kind           prescription_kind NOT NULL,
  medication     text NOT NULL,
  purpose        text,                                 -- finalidade
  dose           text NOT NULL,
  route          text NOT NULL,                        -- oral, subcutânea…
  instructions   text,
  -- Condição de uso ou suspensão, escrita pelo profissional (§11.1).
  use_condition  text,
  prescriber     text,                                 -- profissional/serviço
  prescribed_on  date,
  starts_on      date NOT NULL DEFAULT current_date,
  ends_on        date,                                 -- tratamento com fim
  -- Uma receita nova NÃO altera a grade antes da revisão da Enfermagem (§7.2).
  status         text NOT NULL DEFAULT 'rascunho'
                 CHECK (status IN ('rascunho','ativa','suspensa','encerrada')),
  signed_by      uuid REFERENCES app_user(id),         -- Enfermagem que conferiu e assinou
  signed_at      timestamptz,
  suspended_reason text,
  document_id    uuid REFERENCES document(id),         -- receita anexada
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES app_user(id),
  version        integer NOT NULL DEFAULT 1
);
CREATE INDEX idx_presc_person ON prescription (person_id) WHERE status = 'ativa';
CREATE INDEX idx_presc_house ON prescription (house_id) WHERE status = 'ativa';

-- Horários previstos de uma prescrição de horário fixo
CREATE TABLE medication_schedule (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescription(id),
  time_of_day    time NOT NULL,
  weekdays       smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prescription_id, time_of_day)
);

CREATE TYPE administration_state AS ENUM (
  'aguardando_confirmacao',     -- previsto; ainda sem registro
  'administrado_no_horario',
  'administrado_com_atraso',
  'recusado',
  'nao_administrado',           -- só por decisão HUMANA registrada
  'indisponivel',
  'suspenso_conforme_orientacao',
  'acolhido_ausente',
  'incidente'
);

-- Uma linha por DOSE prevista no dia. É o registro que o educador confirma.
CREATE TABLE medication_administration (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescription(id),
  person_id       uuid NOT NULL REFERENCES person(id),
  house_id        uuid NOT NULL REFERENCES house(id),
  scheduled_at    timestamptz NOT NULL,
  state           administration_state NOT NULL DEFAULT 'aguardando_confirmacao',
  -- Quem CONFIRMOU é quem administrou. Nulo enquanto ninguém confirmou.
  administered_by uuid REFERENCES app_user(id),
  administered_at timestamptz,                  -- horário real
  recorded_at     timestamptz,
  synced_at       timestamptz,
  offline         boolean NOT NULL DEFAULT false,
  device          text,
  institutional_device boolean NOT NULL DEFAULT false,
  note            text,                         -- obrigatória em recusa/atraso/incidente
  -- "Quando necessário" (§11.5): exige orientação anterior válida e motivo.
  prn_reason      text,
  prn_outcome     text,
  client_op_id    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_adm_dose ON medication_administration (prescription_id, scheduled_at);
CREATE UNIQUE INDEX uq_adm_client_op ON medication_administration (client_op_id)
  WHERE client_op_id IS NOT NULL;
CREATE INDEX idx_adm_house_day ON medication_administration (house_id, scheduled_at);
CREATE INDEX idx_adm_pend ON medication_administration (state)
  WHERE state = 'aguardando_confirmacao';

-- Estoque: SOMENTE quantidade e validade (§11.6). Não há compras.
CREATE TABLE medication_stock (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       uuid NOT NULL REFERENCES house(id),
  person_id      uuid REFERENCES person(id),     -- estoque individual quando aplicável
  medication     text NOT NULL,
  quantity       numeric(10,2) NOT NULL DEFAULT 0,
  unit           text NOT NULL DEFAULT 'unidade',
  expires_on     date,
  low_flag       boolean NOT NULL DEFAULT false, -- sinalizado MANUALMENTE (§11.6)
  low_flagged_by uuid REFERENCES app_user(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (house_id, medication, person_id)
);

CREATE TABLE medication_stock_movement (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id     uuid NOT NULL REFERENCES medication_stock(id),
  kind         text NOT NULL CHECK (kind IN ('entrada','ajuste','consumo','descarte')),
  quantity     numeric(10,2) NOT NULL,
  reason       text,
  at           timestamptz NOT NULL DEFAULT now(),
  by_user      uuid REFERENCES app_user(id)
);

-- ---------- Protocolo de administração (pendência institucional 33.4.1) ----------
-- "Quem administra medicamentos na prática em cada período" AINDA NÃO foi
-- decidido pela instituição. Em vez de inventar uma regra invisível, o
-- protocolo é CONFIGURAÇÃO por casa e período: a instituição decide, o sistema
-- obedece — e o padrão é o mais protetivo (somente Enfermagem).
CREATE TABLE medication_protocol (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      uuid NOT NULL REFERENCES house(id),
  period        text NOT NULL CHECK (period IN ('diurno','noturno','integral')),
  -- quem pode confirmar dose neste período
  allows_nursing        boolean NOT NULL DEFAULT true,
  allows_authorized_educator boolean NOT NULL DEFAULT false,
  note          text,
  decided_by    uuid REFERENCES app_user(id),
  decided_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (house_id, period)
);
COMMENT ON TABLE medication_protocol IS
  'Pendência institucional 33.4.1 tratada como configuração. Padrão protetivo: somente Enfermagem.';

-- Educador autorizado nominalmente pelo protocolo (§11.2)
CREATE TABLE medication_authorization (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user(id),
  house_id     uuid NOT NULL REFERENCES house(id),
  valid_from   date NOT NULL DEFAULT current_date,
  valid_to     date,
  authorized_by uuid REFERENCES app_user(id),
  note         text,
  UNIQUE (user_id, house_id, valid_from)
);

-- ============================================================
-- Escopo
-- ============================================================
-- Enfermagem tem escopo transversal de SAÚDE nas 8 casas (§5.8); a casa vê os
-- próprios acolhidos. `app_person_in_scope` já resolve as duas coisas.

CREATE OR REPLACE FUNCTION app_can_prescribe() RETURNS boolean AS $$
  SELECT app_current_role() IN ('enfermagem','gestor_geral')
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE prescription ENABLE ROW LEVEL SECURITY;
CREATE POLICY presc_select ON prescription FOR SELECT TO rede_app USING (app_person_in_scope(person_id));
-- Só a Enfermagem cadastra e assina esquema de medicamentos (§11.1).
CREATE POLICY presc_insert ON prescription FOR INSERT TO rede_app WITH CHECK (app_can_prescribe());
CREATE POLICY presc_update ON prescription FOR UPDATE TO rede_app
  USING (app_can_prescribe() AND app_person_in_scope(person_id)) WITH CHECK (true);

ALTER TABLE medication_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY sched_select ON medication_schedule FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM prescription p WHERE p.id = prescription_id));
CREATE POLICY sched_write ON medication_schedule FOR INSERT TO rede_app WITH CHECK (app_can_prescribe());

ALTER TABLE medication_administration ENABLE ROW LEVEL SECURITY;
CREATE POLICY adm_select ON medication_administration FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id));
-- A confirmação é ATO PESSOAL: só se registra em nome próprio. Esta política é
-- a tradução literal de "ninguém confirma por outro" (§11.2).
CREATE POLICY adm_update ON medication_administration FOR UPDATE TO rede_app
  USING (app_person_in_scope(person_id))
  WITH CHECK (administered_by IS NULL OR administered_by = app_current_user());
CREATE POLICY adm_insert ON medication_administration FOR INSERT TO rede_app
  WITH CHECK (app_person_in_scope(person_id));

ALTER TABLE medication_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_select ON medication_stock FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY stock_write ON medication_stock FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id)
              AND app_current_role() IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral'));
CREATE POLICY stock_update ON medication_stock FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id)
         AND app_current_role() IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral'))
  WITH CHECK (true);

ALTER TABLE medication_stock_movement ENABLE ROW LEVEL SECURITY;
CREATE POLICY mov_select ON medication_stock_movement FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM medication_stock s WHERE s.id = stock_id));
CREATE POLICY mov_insert ON medication_stock_movement FOR INSERT TO rede_app WITH CHECK (true);

ALTER TABLE medication_protocol ENABLE ROW LEVEL SECURITY;
CREATE POLICY prot_select ON medication_protocol FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY prot_write ON medication_protocol FOR INSERT TO rede_app
  WITH CHECK (app_current_role() IN ('coordenador','gestor_geral'));
CREATE POLICY prot_update ON medication_protocol FOR UPDATE TO rede_app
  USING (app_current_role() IN ('coordenador','gestor_geral')) WITH CHECK (true);

ALTER TABLE medication_authorization ENABLE ROW LEVEL SECURITY;
CREATE POLICY mauth_select ON medication_authorization FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY mauth_write ON medication_authorization FOR INSERT TO rede_app
  WITH CHECK (app_current_role() IN ('coordenador','gestor_geral'));

GRANT SELECT, INSERT, UPDATE ON prescription, medication_schedule, medication_administration,
  medication_stock, medication_stock_movement, medication_protocol, medication_authorization TO rede_app;
REVOKE DELETE ON prescription, medication_schedule, medication_administration,
  medication_stock, medication_stock_movement, medication_protocol, medication_authorization FROM rede_app;

-- ============================================================
-- Quem pode confirmar uma dose, aqui e agora
-- ============================================================
-- Reúne num só lugar: o cargo, o protocolo vigente da casa e a autorização
-- nominal. Devolve motivo quando nega, porque um educador barrado no meio do
-- plantão precisa saber POR QUÊ — e não descobrir depois que a dose ficou sem
-- registro.
CREATE OR REPLACE FUNCTION app_can_administer(p_house uuid, p_period text)
RETURNS TABLE (pode boolean, motivo text) AS $$
DECLARE v_role role_code; v_prot medication_protocol%ROWTYPE;
BEGIN
  v_role := app_current_role();

  IF v_role = 'enfermagem' THEN
    RETURN QUERY SELECT true, NULL::text; RETURN;
  END IF;

  IF v_role NOT IN ('educador','lider_diurno') THEN
    RETURN QUERY SELECT false, 'Somente a Enfermagem e educadores autorizados pelo protocolo confirmam doses.'::text;
    RETURN;
  END IF;

  SELECT * INTO v_prot FROM medication_protocol
   WHERE house_id = p_house AND period IN (p_period, 'integral')
   ORDER BY CASE WHEN period = p_period THEN 0 ELSE 1 END LIMIT 1;

  IF v_prot.id IS NULL OR NOT v_prot.allows_authorized_educator THEN
    RETURN QUERY SELECT false,
      'O protocolo desta casa não autoriza educadores a confirmar doses neste período. Acione a Enfermagem.'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM medication_authorization a
    WHERE a.user_id = app_current_user() AND a.house_id = p_house
      AND a.valid_from <= current_date AND (a.valid_to IS NULL OR a.valid_to >= current_date)) THEN
    RETURN QUERY SELECT false,
      'Você não consta como educador autorizado no protocolo vigente desta casa.'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_can_administer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_can_administer(uuid, text) TO rede_app;

-- ============================================================
-- Geração das doses do dia
-- ============================================================
-- Idempotente: rodar duas vezes não duplica dose — o que importa quando a
-- internet oscila e a tela é recarregada no meio do plantão.
CREATE OR REPLACE FUNCTION app_generate_doses(p_house uuid, p_date date)
RETURNS TABLE (criadas integer) AS $$
DECLARE v_n integer := 0; v_dow smallint;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_dow := extract(dow from p_date);

  WITH novas AS (
    INSERT INTO medication_administration (prescription_id, person_id, house_id, scheduled_at)
    SELECT pr.id, pr.person_id, s.house_id,
           (p_date + ms.time_of_day) AT TIME ZONE 'America/Sao_Paulo'
    FROM prescription pr
    JOIN medication_schedule ms ON ms.prescription_id = pr.id
    JOIN house_stay s ON s.person_id = pr.person_id AND s.status = 'ativa'
    WHERE s.house_id = p_house
      AND pr.status = 'ativa'                       -- só prescrição assinada
      AND pr.starts_on <= p_date
      AND (pr.ends_on IS NULL OR pr.ends_on >= p_date)
      AND v_dow = ANY (ms.weekdays)
      AND NOT EXISTS (
        SELECT 1 FROM medication_administration a
        WHERE a.prescription_id = pr.id
          AND a.scheduled_at = (p_date + ms.time_of_day) AT TIME ZONE 'America/Sao_Paulo')
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM novas;
  RETURN QUERY SELECT v_n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_generate_doses(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_generate_doses(uuid, date) TO rede_app;

-- ============================================================
-- Confirmação da dose — o ato mais sensível do sistema
-- ============================================================
-- Comando de sistema porque precisa, numa transação só: verificar o protocolo,
-- gravar a confirmação em nome de QUEM ADMINISTROU e baixar o estoque.
-- A verificação de quem pode acontece DENTRO, para que nenhuma rota consiga
-- pulá-la.
CREATE OR REPLACE FUNCTION app_confirm_dose(
  p_admin_id uuid, p_state text, p_note text, p_happened_at timestamptz,
  p_offline boolean, p_device text, p_institutional boolean, p_client_op text
) RETURNS TABLE (out_id uuid, out_state text) AS $$
DECLARE
  v_adm medication_administration%ROWTYPE;
  v_period text; v_pode boolean; v_motivo text; v_med text;
BEGIN
  SELECT * INTO v_adm FROM medication_administration WHERE id = p_admin_id;
  IF v_adm.id IS NULL THEN
    RAISE EXCEPTION 'dose_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_adm.administered_by IS NOT NULL THEN
    RAISE EXCEPTION 'dose_ja_confirmada' USING ERRCODE = 'unique_violation';
  END IF;

  -- Período pelo horário previsto, no fuso da instituição.
  v_period := CASE
    WHEN (v_adm.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::time
         BETWEEN '07:00' AND '18:59' THEN 'diurno' ELSE 'noturno' END;

  SELECT c.pode, c.motivo INTO v_pode, v_motivo FROM app_can_administer(v_adm.house_id, v_period) c;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'protocolo: %', v_motivo USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Offline, só o aparelho institucional designado confirma (§11.7).
  IF p_offline AND NOT coalesce(p_institutional, false) THEN
    RAISE EXCEPTION 'aparelho_nao_institucional' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE medication_administration
     SET state = p_state::administration_state,
         administered_by = app_current_user(),
         administered_at = coalesce(p_happened_at, now()),
         recorded_at = now(),
         synced_at = CASE WHEN p_offline THEN now() END,
         offline = coalesce(p_offline, false),
         device = p_device,
         institutional_device = coalesce(p_institutional, false),
         note = p_note,
         client_op_id = p_client_op
   WHERE id = p_admin_id;

  -- Baixa de estoque apenas quando a dose foi de fato administrada.
  IF p_state LIKE 'administrado%' THEN
    SELECT pr.medication INTO v_med FROM prescription pr WHERE pr.id = v_adm.prescription_id;
    UPDATE medication_stock st SET quantity = greatest(quantity - 1, 0), updated_at = now()
     WHERE st.house_id = v_adm.house_id AND st.medication = v_med
       AND (st.person_id IS NULL OR st.person_id = v_adm.person_id);
  END IF;

  RETURN QUERY SELECT p_admin_id, p_state;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_confirm_dose(uuid,text,text,timestamptz,boolean,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_confirm_dose(uuid,text,text,timestamptz,boolean,text,boolean,text) TO rede_app;
