-- A FOTO QUE NÃO SE APAGA (fase 274, pedido de 05/11).
--
-- A foto de identificação da criança e a foto 3×4 do familiar se trocavam por
-- cima: o arquivo de antes ficava no disco, mas o banco esquecia qual era, e
-- ninguém sabia quem trocou nem o que havia antes. E não havia como tirar uma
-- foto posta por engano.
--
-- Agora cada troca e cada retirada guardam a foto de antes, quem a tinha posto
-- e quando, quem trocou ou tirou, e, na retirada, o motivo. Pôr, trocar e tirar
-- é da equipe técnica e da coordenação (decisão de 05/11 da pessoa da Fundação);
-- o servidor confere, e a política confere de novo.

CREATE TABLE IF NOT EXISTS photo_change (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id      uuid NOT NULL REFERENCES person(id),
  -- Nulo quando é a foto da própria criança; preenchido quando é a do familiar.
  contact_id     uuid REFERENCES person_contact(id),
  action         text NOT NULL CHECK (action IN ('trocada', 'retirada')),
  previous_key   text NOT NULL,
  previous_mime  text,
  previous_at    timestamptz,
  previous_by    uuid REFERENCES app_user(id),
  changed_by     uuid NOT NULL REFERENCES app_user(id),
  changed_at     timestamptz NOT NULL DEFAULT now(),
  reason         text,
  CHECK (action <> 'retirada' OR length(btrim(coalesce(reason, ''))) >= 5)
);
CREATE INDEX IF NOT EXISTS idx_photo_change_person ON photo_change (person_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_photo_change_contact ON photo_change (contact_id);
CREATE INDEX IF NOT EXISTS idx_photo_change_previous_by ON photo_change (previous_by);
CREATE INDEX IF NOT EXISTS idx_photo_change_changed_by ON photo_change (changed_by);

ALTER TABLE photo_change ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON photo_change TO rede_app;

DROP POLICY IF EXISTS photo_change_select ON photo_change;
CREATE POLICY photo_change_select ON photo_change FOR SELECT TO rede_app
  USING (person_id IN (SELECT app_pessoas_no_alcance()));

DROP POLICY IF EXISTS photo_change_insert ON photo_change;
CREATE POLICY photo_change_insert ON photo_change FOR INSERT TO rede_app
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance())
              AND app_current_role() IN ('equipe_tecnica', 'coordenador')
              AND changed_by = app_current_user());

COMMENT ON TABLE photo_change IS
  'A foto de antes, a cada troca ou retirada da foto da criança ou do familiar (fase 274). Nada se apaga: o arquivo fica, e aqui fica de quem era, quem trocou ou tirou, quando e por quê.';
