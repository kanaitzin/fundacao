-- ============================================================
-- 0800 — O DOSSIÊ DO ACOLHIDO: a vaga, o arquivo e o aceite (§6.1)
--
-- A tabela `document` existia desde a fase 0 e nunca teve porta: o perfil
-- LISTAVA documentos e não abria nenhum, e não havia como pôr um lá dentro.
-- O que faltava para o checklist da casa funcionar são três coisas:
--
--   1. a VAGA que o arquivo preenche. Uma pasta com dez arquivos soltos não
--      responde "falta alguma coisa desta criança?" — `checklist_key` liga o
--      documento ao item do dossiê exigido, e é isso que permite dizer
--      "faltam a caderneta de vacinação e o PIA";
--
--   2. o ACEITE, com nome e horário. Anexar não é conferir: um RG borrado, a
--      segunda página do laudo no lugar da primeira, a foto do documento de
--      outra criança — é o erro que só o olho pega. Quem olhou e disse "é este,
--      e está legível" assina esse aceite;
--
--   3. a CONVIVÊNCIA como categoria. Visita familiar, convivência com irmãos e
--      atividade na comunidade não são saúde nem escola, e amontoá-las em
--      "pessoal" faria a lista da casa parar de responder o que o PIA pergunta.
--
-- O arquivo em si continua fora da linha: `document_version.storage_key` é a
-- chave do objeto, e `sha256` é o que prova, depois, que o arquivo aberto é o
-- mesmo que foi aceito.
-- ============================================================

ALTER TYPE doc_category ADD VALUE IF NOT EXISTS 'convivencia';

ALTER TABLE document ADD COLUMN checklist_key text;
COMMENT ON COLUMN document.checklist_key IS
  'A vaga do dossiê exigido que este documento preenche (dossie-exigido.ts). '
  'Nulo = documento avulso, que conta na pasta e não na lista de pendências.';

-- ---------- O aceite ----------
-- Uma coluna, e não uma tabela: o aceite é um por documento, e o que muda
-- depois é VERSÃO NOVA — que nasce sem aceite e precisa ser conferida de novo.
ALTER TABLE document ADD COLUMN accepted_at  timestamptz;
ALTER TABLE document ADD COLUMN accepted_by  uuid REFERENCES app_user(id);
ALTER TABLE document ADD COLUMN accepted_note text;
COMMENT ON COLUMN document.accepted_at IS
  'Preenchido quando uma pessoa OLHOU o arquivo e confirmou que é aquele '
  'documento e que está legível. Anexar não preenche isto.';

-- Aceite é ato pessoal: ninguém aceita em nome de outro. A trava é a mesma da
-- passagem de plantão e da ciência do episódio.
CREATE OR REPLACE FUNCTION tg_document_accept() RETURNS trigger AS $$
BEGIN
  IF NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
     AND NEW.accepted_by IS NOT NULL
     AND NEW.accepted_by <> app_current_user() THEN
    RAISE EXCEPTION 'aceite_e_pessoal';
  END IF;
  -- O aceite não se apaga: desfazer é registrar VERSÃO NOVA e conferir de novo.
  IF OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS NULL THEN
    RAISE EXCEPTION 'aceite_nao_se_apaga';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER document_accept BEFORE UPDATE ON document
  FOR EACH ROW EXECUTE FUNCTION tg_document_accept();

-- `document` só tinha SELECT e INSERT; o aceite precisa de UPDATE, e ele vale
-- para quem já pode escrever no perfil — com o gatilho acima por baixo.
CREATE POLICY doc_update ON document FOR UPDATE TO rede_app
  USING (app_person_in_scope(person_id) AND app_can_open_doc(category))
  WITH CHECK (app_person_in_scope(person_id));
GRANT UPDATE ON document TO rede_app;

-- O objeto ganha as três coisas que a prévia precisa saber antes de abrir:
-- o tipo REAL (conferido pela assinatura do arquivo, não pela extensão), o
-- nome original e o tamanho.
ALTER TABLE document_version ADD COLUMN mime       text;
ALTER TABLE document_version ADD COLUMN file_name  text;
ALTER TABLE document_version ADD COLUMN size_bytes integer;

-- ---------- A vivência ----------
-- `memory_record` existe desde a fase 0 e também nunca teve porta. Ela já
-- carrega `photo_authorized`: a decisão da Fundação, em 01/09/2026, é NÃO
-- BLOQUEAR a foto por falta de autorização — mas o campo continua, e a tela
-- mostra quando ela não está registrada. Ausência é informação.
ALTER TABLE memory_record ADD COLUMN mime text;
ALTER TABLE memory_record ADD COLUMN sha256 text;
ALTER TABLE memory_record ADD COLUMN file_name text;
COMMENT ON COLUMN memory_record.file_name IS
  'Nome NEUTRO do arquivo. Vale a mesma regra do documento: sem CPF, sem '
  'diagnóstico e sem teor judicial em nome de arquivo (regra 3).';

-- A vivência é do álbum da criança e não se reescreve; corrigir é registrar
-- outra. Nada de UPDATE nem DELETE.
CREATE TRIGGER memory_no_change BEFORE UPDATE OR DELETE ON memory_record
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------- O que falta, por criança ----------
-- SECURITY DEFINER porque cruza `document` com a lista exigida e precisa
-- responder também para quem NÃO alcança a categoria judicial — devolvendo,
-- nesse caso, apenas que existe pendência, sem dizer qual documento é.
CREATE OR REPLACE FUNCTION app_dossie_resumo(p_person uuid)
RETURNS TABLE (categoria text, entregues integer, aceitos integer) AS $$
BEGIN
  IF NOT app_person_in_scope(p_person) THEN
    RAISE EXCEPTION 'pessoa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT d.category::text,
           count(*)::int,
           count(*) FILTER (WHERE d.accepted_at IS NOT NULL)::int
      FROM document d
     WHERE d.person_id = p_person
       AND d.checklist_key IS NOT NULL
       AND app_can_open_doc(d.category)
     GROUP BY d.category;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_dossie_resumo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_dossie_resumo(uuid) TO rede_app;
