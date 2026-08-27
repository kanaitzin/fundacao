-- ============================================================
-- Módulo `sync` — Fila offline, idempotência e conflitos (§17)
--
-- A internet oscila e o plantão não para. Este módulo recebe operações que
-- aconteceram OFFLINE e as aplica preservando o essencial:
--
--  * o horário REAL do evento nunca é trocado pelo da reconexão (§17.3);
--  * reenvio da mesma operação não duplica nada (§17.4 — idempotência);
--  * conflito NÃO é resolvido automaticamente: todas as versões são
--    preservadas e a equipe técnica decide (§9, §17.4). O sistema sinaliza,
--    não escolhe a verdade.
-- ============================================================

CREATE TABLE offline_operation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_op_id  text NOT NULL,                 -- gerado no aparelho; chave da idempotência
  user_id       uuid NOT NULL REFERENCES app_user(id),
  house_id      uuid REFERENCES house(id),
  kind          text NOT NULL,                 -- 'activity.record', 'check.mark', …
  payload       jsonb NOT NULL,
  happened_at   timestamptz NOT NULL,          -- horário REAL, informado pelo aparelho
  queued_at     timestamptz NOT NULL,          -- quando entrou na fila local
  received_at   timestamptz NOT NULL DEFAULT now(),
  applied_at    timestamptz,
  status        text NOT NULL DEFAULT 'recebida'
                CHECK (status IN ('recebida','aplicada','duplicada','conflito','rejeitada')),
  device        text,
  institutional_device boolean NOT NULL DEFAULT false,
  error         text,
  UNIQUE (client_op_id)
);
CREATE INDEX idx_offop_status ON offline_operation (status, received_at);

-- Conflitos: guardam AS DUAS versões e ficam aguardando decisão humana.
CREATE TABLE sync_conflict (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       uuid NOT NULL REFERENCES house(id),
  entity         text NOT NULL,
  entity_id      uuid,
  kind           text NOT NULL,        -- 'duplicidade', 'estado_divergente', 'horario_impossivel'
  description    text NOT NULL,
  version_a      jsonb NOT NULL,
  version_b      jsonb NOT NULL,
  status         text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','resolvido')),
  resolved_by    uuid REFERENCES app_user(id),
  resolved_at    timestamptz,
  resolution     text,                 -- o que a equipe decidiu, e por quê
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conflict_open ON sync_conflict (house_id) WHERE status = 'aberto';

ALTER TABLE offline_operation ENABLE ROW LEVEL SECURITY;
CREATE POLICY oo_select ON offline_operation FOR SELECT TO rede_app
  USING (user_id = app_current_user() OR (house_id IS NOT NULL AND app_house_in_scope(house_id)));
CREATE POLICY oo_insert ON offline_operation FOR INSERT TO rede_app
  WITH CHECK (user_id = app_current_user());
CREATE POLICY oo_update ON offline_operation FOR UPDATE TO rede_app
  USING (user_id = app_current_user()) WITH CHECK (true);

ALTER TABLE sync_conflict ENABLE ROW LEVEL SECURITY;
CREATE POLICY sc_select ON sync_conflict FOR SELECT TO rede_app USING (app_house_in_scope(house_id));
CREATE POLICY sc_insert ON sync_conflict FOR INSERT TO rede_app WITH CHECK (true);
-- Resolver conflito é ato da equipe técnica/coordenação (§17.4)
CREATE POLICY sc_update ON sync_conflict FOR UPDATE TO rede_app
  USING (app_can_edit_profile() AND app_house_in_scope(house_id)) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON offline_operation, sync_conflict TO rede_app;
REVOKE DELETE ON offline_operation, sync_conflict FROM rede_app;
