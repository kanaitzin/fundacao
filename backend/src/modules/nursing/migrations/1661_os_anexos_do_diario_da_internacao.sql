-- OS ANEXOS DO DIÁRIO DA INTERNAÇÃO (fase 233, pedido de 22/10).
--
-- "Podendo enviar até 10 anexos por mensagem." O hospital entrega a receita da
-- alta, o exame e o atestado no mesmo dia, e o diário levava um arquivo por
-- registro: a equipe escrevia três vezes a mesma visita para guardar os três
-- papéis. Agora o registro leva até dez. Os registros de antes continuam com o
-- anexo nas colunas da própria nota (1622), e a leitura junta os dois.
--
-- Imutável como o registro: sem UPDATE nem DELETE para o aplicativo.

CREATE TABLE IF NOT EXISTS hospitalization_note_attachment (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id            uuid NOT NULL REFERENCES hospitalization_note(id),
  hospitalization_id uuid NOT NULL REFERENCES hospitalization(id),
  storage_key        text NOT NULL,
  sha256             text NOT NULL,
  mime               text NOT NULL,
  file_name          text NOT NULL,
  size_bytes         integer NOT NULL CHECK (size_bytes > 0),
  doc_category       text NOT NULL,
  position           smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  created_by         uuid NOT NULL REFERENCES app_user(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, position)
);
CREATE INDEX IF NOT EXISTS idx_fk_hospitalization_note_attachment_note_id
  ON hospitalization_note_attachment (note_id);
CREATE INDEX IF NOT EXISTS idx_fk_hospitalization_note_attachment_hospitalization_id
  ON hospitalization_note_attachment (hospitalization_id, sha256);
CREATE INDEX IF NOT EXISTS idx_fk_hospitalization_note_attachment_created_by
  ON hospitalization_note_attachment (created_by);

ALTER TABLE hospitalization_note_attachment ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON hospitalization_note_attachment TO rede_app;

-- Quem lê o diário lê os anexos dele: a mesma pergunta da nota (1622).
DROP POLICY IF EXISTS intanx_select ON hospitalization_note_attachment;
CREATE POLICY intanx_select ON hospitalization_note_attachment FOR SELECT TO rede_app
  USING (app_pode_ver_internacao(hospitalization_id));

-- O anexo é do registro de quem escreveu, na mesma internação.
DROP POLICY IF EXISTS intanx_insert ON hospitalization_note_attachment;
CREATE POLICY intanx_insert ON hospitalization_note_attachment FOR INSERT TO rede_app
  WITH CHECK (created_by = app_current_user()
              AND app_pode_ver_internacao(hospitalization_id)
              AND note_id IN (SELECT n.id FROM hospitalization_note n
                               WHERE n.written_by = app_current_user()
                                 AND n.hospitalization_id = hospitalization_note_attachment.hospitalization_id));

-- E a nota também passa a conferir o AUTOR (achado de 22/10): a política de
-- inserção perguntava só se a pessoa alcança a internação, e um registro podia
-- nascer em nome de outra. O serviço sempre mandou quem escreve; agora o banco
-- confere, como nas tabelas que a fase 219 endureceu.
DROP POLICY IF EXISTS intnota_insert ON hospitalization_note;
CREATE POLICY intnota_insert ON hospitalization_note FOR INSERT TO rede_app
  WITH CHECK (app_pode_ver_internacao(hospitalization_id)
              AND written_by = app_current_user());
