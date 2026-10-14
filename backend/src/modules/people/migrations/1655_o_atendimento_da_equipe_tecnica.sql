-- O ATENDIMENTO DA EQUIPE TÉCNICA (fase 218, pedido de 14/10).
--
-- "Se a psicopedagoga ou a psicóloga está fazendo um atendimento, e algum
-- desenho tem alguma coisa, ela pode tirar foto, digitalizar ou anexar o
-- arquivo, e hospedar no perfil daquela criança como um acompanhamento."
--
-- O atendimento é da criança: a área, o dia, o que foi trabalhado, quem
-- atendeu, e os arquivos (o desenho fotografado, a folha da atividade, o
-- relatório digitalizado). Quem registra é a equipe técnica e a coordenação;
-- quem lê, as duas e a gestão. O plantão não lê: o que a criança desenhou numa
-- sessão de psicologia não muda o que se faz no turno.
--
-- Nada se reescreve: não há UPDATE nem DELETE para o aplicativo. O atendimento
-- registrado errado se completa com outro, e os dois ficam.

CREATE TABLE IF NOT EXISTS technical_session (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES person(id),
  area        text NOT NULL CHECK (area IN ('psicologia','psicopedagogia','servico_social','pedagogia','outra')),
  area_other  text,
  happened_on date NOT NULL,
  summary     text NOT NULL CHECK (length(btrim(summary)) >= 10),
  created_by  uuid NOT NULL REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (area <> 'outra' OR length(btrim(coalesce(area_other, ''))) >= 3)
);
CREATE INDEX IF NOT EXISTS idx_technical_session_person ON technical_session (person_id, happened_on DESC);

CREATE TABLE IF NOT EXISTS technical_session_attachment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES technical_session(id),
  person_id   uuid NOT NULL REFERENCES person(id),
  storage_key text NOT NULL,
  sha256      text NOT NULL,
  mime        text NOT NULL,
  file_name   text NOT NULL,
  size_bytes  integer NOT NULL,
  caption     text,
  created_by  uuid NOT NULL REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_technical_session_attachment ON technical_session_attachment (session_id);

ALTER TABLE technical_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_session_attachment ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON technical_session, technical_session_attachment TO rede_app;

DROP POLICY IF EXISTS ts_select ON technical_session;
CREATE POLICY ts_select ON technical_session FOR SELECT TO rede_app
  USING (person_id IN (SELECT app_pessoas_no_alcance())
         AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));

DROP POLICY IF EXISTS ts_insert ON technical_session;
CREATE POLICY ts_insert ON technical_session FOR INSERT TO rede_app
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance())
              AND app_current_role() IN ('equipe_tecnica','coordenador')
              AND created_by = app_current_user()
              AND happened_on <= app_hoje());

DROP POLICY IF EXISTS tsa_select ON technical_session_attachment;
CREATE POLICY tsa_select ON technical_session_attachment FOR SELECT TO rede_app
  USING (person_id IN (SELECT app_pessoas_no_alcance())
         AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));

-- O arquivo é do atendimento DESTA criança, e de quem o registrou.
DROP POLICY IF EXISTS tsa_insert ON technical_session_attachment;
CREATE POLICY tsa_insert ON technical_session_attachment FOR INSERT TO rede_app
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance())
              AND app_current_role() IN ('equipe_tecnica','coordenador')
              AND created_by = app_current_user()
              AND session_id IN (SELECT s.id FROM technical_session s
                                  WHERE s.person_id = technical_session_attachment.person_id
                                    AND s.created_by = app_current_user()));

-- O nome da área, para quem lê o atendimento de fora do módulo (a lista de
-- fontes do acompanhamento). A mesma lista do `atendimento-tecnico.regra.ts`,
-- e há teste que obriga as duas a concordar.
CREATE OR REPLACE FUNCTION app_rotulo_da_area_do_atendimento(p_area text, p_outra text)
RETURNS text AS $$
  SELECT CASE p_area
    WHEN 'psicologia' THEN 'Psicologia'
    WHEN 'psicopedagogia' THEN 'Psicopedagogia'
    WHEN 'servico_social' THEN 'Serviço social'
    WHEN 'pedagogia' THEN 'Pedagogia'
    WHEN 'outra' THEN coalesce(nullif(btrim(p_outra), ''), 'Outra área')
    ELSE p_area
  END
$$ LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp;
