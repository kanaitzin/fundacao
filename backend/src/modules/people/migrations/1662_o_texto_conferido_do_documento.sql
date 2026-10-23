-- O TEXTO CONFERIDO DO DOCUMENTO (fase 234, pedido de 22/10: trazer o que melhora o sistema).
--
-- O ofício do Judiciário, a receita, a guia e o boletim chegam em papel e viram
-- foto ou PDF no dossiê. A leitura do texto acontece no aparelho de quem anexou,
-- sem mandar a imagem para fora, e erra letra e número: por isso o texto só fica
-- guardado depois que a pessoa confere com o papel e corrige. O que fica aqui é o
-- texto CONFERIDO, com quem conferiu e quando, e serve para achar o documento
-- pela busca do dossiê.
--
-- Corrigir é acrescentar uma versão; a anterior continua (nada se apaga). Quem
-- lê o texto é quem lê o documento: a política passa pela do próprio documento,
-- que já esconde a categoria judicial de quem não a alcança. Quem guarda é quem
-- pode anexar documento (a mesma pergunta do `doc_insert`).

CREATE TABLE IF NOT EXISTS document_text (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document(id),
  version     integer NOT NULL CHECK (version >= 1),
  texto       text NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 20000),
  origem      text NOT NULL CHECK (origem IN ('leitura_no_aparelho', 'digitado')),
  created_by  uuid NOT NULL REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);
CREATE INDEX IF NOT EXISTS idx_fk_document_text_document_id ON document_text (document_id);
CREATE INDEX IF NOT EXISTS idx_fk_document_text_created_by ON document_text (created_by);

ALTER TABLE document_text ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON document_text TO rede_app;

DROP POLICY IF EXISTS doctext_select ON document_text;
CREATE POLICY doctext_select ON document_text FOR SELECT TO rede_app
  USING (document_id IN (SELECT d.id FROM document d));

DROP POLICY IF EXISTS doctext_insert ON document_text;
CREATE POLICY doctext_insert ON document_text FOR INSERT TO rede_app
  WITH CHECK (created_by = app_current_user()
              AND (app_can_edit_profile() OR app_can_edit_health())
              AND document_id IN (SELECT d.id FROM document d
                                   WHERE d.person_id IN (SELECT app_pessoas_no_alcance())));
