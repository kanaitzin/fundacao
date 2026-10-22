-- OS ANEXOS DA LINHA DA ATA (fase 233, pedido de 22/10).
--
-- "Podendo enviar até 10 anexos por mensagem." A linha da ATA é a mensagem do
-- plantão: o que a equipe escrevia no grupo, com a foto do curativo, do
-- bilhete da escola ou do recado da família. Até aqui a linha não levava
-- anexo, e a foto continuava indo pelo celular de alguém.
--
-- O anexo nasce com a linha e é imutável como ela: não há UPDATE nem DELETE
-- para o aplicativo. Quem lê o anexo é quem lê a linha, e a política diz isso
-- pela própria linha (a linha restrita esconde os anexos dela).

CREATE TABLE IF NOT EXISTS ata_note_attachment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     uuid NOT NULL REFERENCES ata_note(id),
  house_id    uuid NOT NULL REFERENCES house(id),
  storage_key text NOT NULL,
  sha256      text NOT NULL,
  mime        text NOT NULL,
  file_name   text NOT NULL,
  size_bytes  integer NOT NULL CHECK (size_bytes > 0),
  position    smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  created_by  uuid NOT NULL REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, position)
);
CREATE INDEX IF NOT EXISTS idx_fk_ata_note_attachment_note_id ON ata_note_attachment (note_id);
CREATE INDEX IF NOT EXISTS idx_fk_ata_note_attachment_house_id ON ata_note_attachment (house_id);
CREATE INDEX IF NOT EXISTS idx_fk_ata_note_attachment_created_by ON ata_note_attachment (created_by);

ALTER TABLE ata_note_attachment ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON ata_note_attachment TO rede_app;

-- Quem lê a linha lê os anexos dela: a subconsulta passa pela política da
-- própria `ata_note`, com a restrita e a liberação de leitura dentro.
DROP POLICY IF EXISTS ana_select ON ata_note_attachment;
CREATE POLICY ana_select ON ata_note_attachment FOR SELECT TO rede_app
  USING (note_id IN (SELECT n.id FROM ata_note n));

-- O anexo é de quem escreveu a linha, na casa da linha.
DROP POLICY IF EXISTS ana_insert ON ata_note_attachment;
CREATE POLICY ana_insert ON ata_note_attachment FOR INSERT TO rede_app
  WITH CHECK (created_by = app_current_user()
              AND house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
              AND note_id IN (SELECT n.id FROM ata_note n
                               WHERE n.author_id = app_current_user()
                                 AND n.house_id = ata_note_attachment.house_id));
