-- O CONTATO CORRIGIDO (fase 215, pedido de 14/10).
--
-- O cadastro de quem aparece pela criança tinha acrescentar e encerrar, e
-- nada no meio: o telefone da mãe que mudou, o vínculo escrito errado, a
-- madrinha que agora tem CPF. A saída era encerrar e cadastrar de novo, e o
-- contato novo perdia a marca de visita, a foto e o histórico.
--
-- Corrigir é da equipe técnica e da coordenação, como cadastrar. O que
-- constava antes não some: cada correção guarda o antes, o depois, quem e por
-- quê. A aproximação restrita não se corrige por aqui: ela é decisão, e tem o
-- motivo próprio no cadastro.

CREATE TABLE IF NOT EXISTS person_contact_change (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid NOT NULL REFERENCES person_contact(id),
  person_id   uuid NOT NULL REFERENCES person(id),
  changed_by  uuid NOT NULL REFERENCES app_user(id),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  reason      text NOT NULL CHECK (length(btrim(reason)) >= 5),
  -- Só os campos que mudaram, com o valor de antes e o de depois.
  before      jsonb NOT NULL,
  after       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contact_change ON person_contact_change (contact_id, changed_at);

ALTER TABLE person_contact_change ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON person_contact_change TO rede_app;

DROP POLICY IF EXISTS pcc_select ON person_contact_change;
CREATE POLICY pcc_select ON person_contact_change FOR SELECT TO rede_app
  USING (person_id IN (SELECT app_pessoas_no_alcance()));

DROP POLICY IF EXISTS pcc_insert ON person_contact_change;
CREATE POLICY pcc_insert ON person_contact_change FOR INSERT TO rede_app
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance())
              AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
              AND changed_by = app_current_user());
