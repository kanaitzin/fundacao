-- ============================================================
-- Módulo `activities` — Atividades do dia, ciência, execução e exceções
--
-- Uma atividade é uma ocorrência CONCRETA no dia: nasce da rotina (§8.1) ou
-- é criada como urgente e pontual pelo líder do plantão (§8.2).
--
-- Princípios que o esquema sustenta:
--  * ciência NÃO é conclusão (§8.2) — são campos e momentos distintos;
--  * exceção exige justificativa neutra (§8.4);
--  * vencida sem confirmação permanece "sem confirmação", nunca
--    "não realizada" (§8.5, §11.3) — quem decide é a equipe, não o relógio;
--  * complemento não sobrescreve: tarefa coletiva acumula autoria (§8.2).
-- ============================================================

CREATE TYPE activity_state AS ENUM (
  'agendada',
  'aguardando_ciencia',
  'ciente',
  'em_andamento',
  'concluida_no_horario',
  'concluida_com_atraso',
  'reagendada',
  'cancelada_externamente',
  'recusada_pelo_acolhido',
  'nao_realizada_saude',
  'nao_realizada_ausencia_profissional',
  'nao_realizada_transporte',
  'nao_realizada_decisao_institucional',
  'nao_aplicavel',
  'sem_confirmacao',
  'aguardando_substituicao'
);

CREATE TABLE activity (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       uuid NOT NULL REFERENCES house(id),
  person_id      uuid REFERENCES person(id),      -- null = coletiva da casa
  routine_item_id uuid,                           -- origem, quando veio da rotina
  kind           text NOT NULL,                   -- espelha routine_kind (texto p/ desacoplar)
  title          text NOT NULL,
  scheduled_at   timestamptz NOT NULL,
  ends_at        timestamptz,
  state          activity_state NOT NULL DEFAULT 'agendada',
  requires_ack   boolean NOT NULL DEFAULT false,
  urgent         boolean NOT NULL DEFAULT false,  -- criada no plantão pelo líder
  urgent_reason  text,                            -- obrigatória quando urgent
  instructions   text,
  -- Justificativa da exceção: neutra, factual, sem rótulo (§3.2)
  exception_note text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES app_user(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1,
  CHECK (NOT urgent OR urgent_reason IS NOT NULL)
);
CREATE INDEX idx_activity_house_day ON activity (house_id, scheduled_at);
CREATE INDEX idx_activity_person ON activity (person_id) WHERE person_id IS NOT NULL;
CREATE INDEX idx_activity_pend ON activity (state) WHERE state IN ('agendada','aguardando_ciencia','ciente','sem_confirmacao');

-- Atribuição: a educador específico ou à equipe do plantão (§8.2)
CREATE TABLE activity_assignment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id  uuid NOT NULL REFERENCES activity(id),
  user_id      uuid REFERENCES app_user(id),      -- null = equipe do plantão
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  assigned_by  uuid REFERENCES app_user(id)
);

-- Ciência — "Estou ciente" é registro próprio, com autor e horário (§8.2)
CREATE TABLE activity_acknowledgement (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id  uuid NOT NULL REFERENCES activity(id),
  user_id      uuid NOT NULL REFERENCES app_user(id),
  at           timestamptz NOT NULL DEFAULT now(),
  device       text,
  offline      boolean NOT NULL DEFAULT false,
  UNIQUE (activity_id, user_id)                   -- ninguém toma ciência duas vezes
);

-- Execução — quem fez, quando de fato, e o que registrou.
-- Complementos entram como NOVAS linhas; nada é sobrescrito (§8.2).
CREATE TABLE activity_execution (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id    uuid NOT NULL REFERENCES activity(id),
  user_id        uuid NOT NULL REFERENCES app_user(id),
  resulting_state activity_state NOT NULL,
  note           text,
  -- Horários (§17.3): o real do evento nunca é trocado pelo da sincronização
  happened_at    timestamptz NOT NULL DEFAULT now(),
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  synced_at      timestamptz,
  offline        boolean NOT NULL DEFAULT false,
  device         text,
  client_op_id   text                              -- idempotência offline (§17.4)
);
CREATE UNIQUE INDEX uq_execution_client_op ON activity_execution (client_op_id)
  WHERE client_op_id IS NOT NULL;
CREATE INDEX idx_execution_activity ON activity_execution (activity_id);

-- Pedido de substituição (§8.3): cadeia completa, sem WhatsApp
CREATE TABLE substitution_request (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id    uuid NOT NULL REFERENCES activity(id),
  house_id       uuid NOT NULL REFERENCES house(id),
  requested_by   uuid NOT NULL REFERENCES app_user(id),
  reason         text NOT NULL,
  status         text NOT NULL DEFAULT 'solicitada'
                 CHECK (status IN ('solicitada','atribuida','recusada','cancelada')),
  authorized_by  uuid REFERENCES app_user(id),
  substitute_id  uuid REFERENCES app_user(id),
  decided_at     timestamptz,
  decision_note  text,
  acknowledged_at timestamptz,                     -- ciência do substituto
  requested_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sub_house ON substitution_request (house_id) WHERE status = 'solicitada';

-- ---------- Escopo ----------
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY act_select ON activity FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY act_insert ON activity FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id));       -- quem pode criar o quê é decidido no serviço
CREATE POLICY act_update ON activity FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id)) WITH CHECK (true);

ALTER TABLE activity_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY aa_all ON activity_assignment FOR ALL TO rede_app
  USING (EXISTS (SELECT 1 FROM activity a WHERE a.id = activity_id))
  WITH CHECK (EXISTS (SELECT 1 FROM activity a WHERE a.id = activity_id));

ALTER TABLE activity_acknowledgement ENABLE ROW LEVEL SECURITY;
CREATE POLICY ack_select ON activity_acknowledgement FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM activity a WHERE a.id = activity_id));
-- Ciência é ato pessoal e intransferível: só se registra em nome próprio (§8.2)
CREATE POLICY ack_insert ON activity_acknowledgement FOR INSERT TO rede_app
  WITH CHECK (user_id = app_current_user());

ALTER TABLE activity_execution ENABLE ROW LEVEL SECURITY;
CREATE POLICY exec_select ON activity_execution FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM activity a WHERE a.id = activity_id));
-- Execução também é assinada por quem executou; ninguém registra por outro.
CREATE POLICY exec_insert ON activity_execution FOR INSERT TO rede_app
  WITH CHECK (user_id = app_current_user());

ALTER TABLE substitution_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY sub_select ON substitution_request FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY sub_insert ON substitution_request FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id) AND requested_by = app_current_user());
CREATE POLICY sub_update ON substitution_request FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id)) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON activity, activity_assignment, activity_acknowledgement,
  activity_execution, substitution_request TO rede_app;
REVOKE DELETE ON activity, activity_assignment, activity_acknowledgement,
  activity_execution, substitution_request FROM rede_app;

-- ---------- Geração do dia a partir da rotina vigente ----------
-- Cria as atividades do dia sem duplicar as já criadas (idempotente): rodar
-- duas vezes é inofensivo, o que importa numa operação com internet instável.
--
-- Uma atividade individual NUNCA é omitida da visão coletiva (§9): ela nasce
-- com person_id e aparece na linha do tempo da casa como qualquer outra.
CREATE OR REPLACE FUNCTION app_generate_day(p_house uuid, p_date date)
RETURNS TABLE (criadas integer, ja_existiam integer) AS $$
DECLARE v_criadas integer := 0; v_exist integer := 0; v_dow smallint;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_dow := extract(dow from p_date);

  SELECT count(*) INTO v_exist FROM activity
   WHERE house_id = p_house AND scheduled_at::date = p_date AND routine_item_id IS NOT NULL;

  WITH vigente AS (
    SELECT id FROM routine_version WHERE house_id = p_house AND valid_to IS NULL
  ), novos AS (
    INSERT INTO activity (house_id, person_id, routine_item_id, kind, title,
                          scheduled_at, ends_at, requires_ack, instructions,
                          state, created_by)
    SELECT ri.house_id,
           ri.person_id,
           ri.id,
           ri.kind::text,
           ri.title,
           (p_date + ri.start_time) AT TIME ZONE 'America/Sao_Paulo',
           CASE WHEN ri.end_time IS NOT NULL
                THEN (p_date + ri.end_time) AT TIME ZONE 'America/Sao_Paulo' END,
           ri.requires_ack,
           ri.instructions,
           CASE WHEN ri.requires_ack THEN 'aguardando_ciencia'::activity_state
                ELSE 'agendada'::activity_state END,
           app_current_user()
    FROM routine_item ri
    JOIN vigente v ON v.id = ri.version_id
    WHERE ri.house_id = p_house
      AND v_dow = ANY (ri.weekdays)
      -- não recria o que já existe para o dia
      AND NOT EXISTS (
        SELECT 1 FROM activity a
        WHERE a.routine_item_id = ri.id AND a.scheduled_at::date = p_date)
      -- atividade individual só nasce se o acolhido está ativo na casa hoje
      AND (ri.person_id IS NULL OR EXISTS (
        SELECT 1 FROM house_stay s
        WHERE s.person_id = ri.person_id AND s.house_id = p_house AND s.status = 'ativa'))
    RETURNING 1
  )
  SELECT count(*) INTO v_criadas FROM novos;

  RETURN QUERY SELECT v_criadas, v_exist;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_generate_day(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_generate_day(uuid, date) TO rede_app;

-- ---------- Vencidas sem confirmação (§8.5) ----------
-- Marca como "sem confirmação" — NUNCA como "não realizada". A diferença é o
-- ponto inteiro: o sistema constata ausência de registro, não afirma omissão.
CREATE OR REPLACE FUNCTION app_mark_unconfirmed(p_house uuid, p_minutes integer DEFAULT 60)
RETURNS integer AS $$
DECLARE n integer;
BEGIN
  UPDATE activity SET state = 'sem_confirmacao', updated_at = now()
   WHERE house_id = p_house
     AND state IN ('agendada','aguardando_ciencia','ciente')
     AND scheduled_at < now() - (p_minutes || ' minutes')::interval;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_mark_unconfirmed(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_mark_unconfirmed(uuid, integer) TO rede_app;
