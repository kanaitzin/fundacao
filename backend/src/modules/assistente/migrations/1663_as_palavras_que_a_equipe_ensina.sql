-- AS PALAVRAS QUE A EQUIPE ENSINA À ACOLHE+AI (fase 244; ideia de 24/10, pedida
-- pela Fundação com o "faça tudo").
--
-- O banco de palavras da casa (fase 238) mora no código, e palavra nova só
-- entrava por quem programa. Aqui a equipe ensina: quem conversa propõe a
-- palavra e o que ela quer dizer, e a coordenação da casa, a Coordenação Geral
-- ou o Gestor Geral aprova ou recusa, com o motivo. Só a palavra aprovada passa
-- a valer para a Acolhe+AI de todos; ela nunca aprende sozinha o que vai repetir
-- para os outros.
--
-- Nada se apaga e nada se reescreve: a proposta fica, e cada decisão é uma linha
-- nova (aprovada, recusada, retirada). A palavra aprovada pode ser retirada
-- depois, com o motivo. Quem lê a proposta é quem propôs, quem decide e a TI; a
-- palavra aprovada, todos, porque é ela que a assistente de todos entende.

CREATE TABLE assistant_word (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  uuid NOT NULL REFERENCES app_user(id),
  house_id   uuid REFERENCES house(id),
  says       text NOT NULL CHECK (length(btrim(says)) BETWEEN 2 AND 60),
  means      text NOT NULL CHECK (length(btrim(means)) BETWEEN 2 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_word_autor ON assistant_word (author_id);
CREATE INDEX assistant_word_casa ON assistant_word (house_id, created_at DESC);

CREATE TABLE assistant_word_decision (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id    uuid NOT NULL REFERENCES assistant_word(id),
  decided_by uuid NOT NULL REFERENCES app_user(id),
  decision   text NOT NULL CHECK (decision IN ('aprovada', 'recusada', 'retirada')),
  reason     text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 400),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision = 'aprovada' OR reason IS NOT NULL)
);
CREATE INDEX assistant_word_decision_palavra ON assistant_word_decision (word_id, created_at DESC);
CREATE INDEX assistant_word_decision_quem ON assistant_word_decision (decided_by);

ALTER TABLE assistant_word ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_word_decision ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON assistant_word TO rede_app;
GRANT SELECT, INSERT ON assistant_word_decision TO rede_app;

-- A situação de uma palavra é a última decisão sobre ela. Lida como dona da
-- tabela, para a palavra aprovada valer para quem não lê as decisões.
CREATE OR REPLACE FUNCTION app_palavra_aprovada(p_word uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE((SELECT d.decision = 'aprovada' FROM assistant_word_decision d
                    WHERE d.word_id = p_word ORDER BY d.created_at DESC, d.id DESC LIMIT 1), false)
$$;
REVOKE ALL ON FUNCTION app_palavra_aprovada(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_palavra_aprovada(uuid) TO rede_app;

-- Quem decide: a coordenação (da casa da palavra, ou a Coordenação Geral) e o
-- Gestor Geral.
CREATE OR REPLACE FUNCTION app_decide_palavra(p_house uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT app_current_role() = 'gestor_geral'
      OR (app_current_role() = 'coordenador'
          AND (p_house = ANY (ARRAY(SELECT app_casas_no_alcance()))
               OR EXISTS (SELECT 1 FROM app_user u WHERE u.id = app_current_user() AND u.todas_as_casas)))
$$;

CREATE POLICY assistant_word_insert ON assistant_word FOR INSERT TO rede_app
  WITH CHECK (author_id = app_current_user()
              AND (house_id IS NULL OR house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))));

CREATE POLICY assistant_word_select ON assistant_word FOR SELECT TO rede_app
  USING (author_id = app_current_user()
         OR app_current_role() = 'admin_tecnico'
         OR app_decide_palavra(house_id)
         OR app_palavra_aprovada(id));

CREATE POLICY assistant_word_decision_insert ON assistant_word_decision FOR INSERT TO rede_app
  WITH CHECK (decided_by = app_current_user()
              AND EXISTS (SELECT 1 FROM assistant_word w WHERE w.id = word_id AND app_decide_palavra(w.house_id)));

CREATE POLICY assistant_word_decision_select ON assistant_word_decision FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM assistant_word w WHERE w.id = word_id
                  AND (w.author_id = app_current_user() OR app_current_role() = 'admin_tecnico'
                       OR app_decide_palavra(w.house_id))));

-- A ordem das decisões: aprovar ou recusar a palavra que ainda espera, e
-- retirar só a que está aprovada. Recusada e retirada não voltam: quem quiser,
-- propõe de novo.
CREATE OR REPLACE FUNCTION app_ordem_da_decisao_da_palavra()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ultima text;
BEGIN
  SELECT d.decision INTO v_ultima FROM assistant_word_decision d
   WHERE d.word_id = NEW.word_id ORDER BY d.created_at DESC, d.id DESC LIMIT 1;
  IF NEW.decision IN ('aprovada', 'recusada') AND v_ultima IS NOT NULL THEN
    RAISE EXCEPTION 'Esta palavra já foi decidida.' USING ERRCODE = 'unique_violation';
  END IF;
  IF NEW.decision = 'retirada' AND v_ultima IS DISTINCT FROM 'aprovada' THEN
    RAISE EXCEPTION 'Só se retira palavra aprovada.' USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER assistant_word_decision_ordem BEFORE INSERT ON assistant_word_decision
  FOR EACH ROW EXECUTE FUNCTION app_ordem_da_decisao_da_palavra();
