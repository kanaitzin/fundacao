-- ============================================================
-- Módulo `statements` — Relatos independentes (§12.2 e §13.4)
--
-- Existe como partição própria por uma razão de proteção, não de organização:
-- a regra "par não lê a narrativa pessoal do colega" precisa valer IGUAL na
-- passagem de plantão e na ocorrência. Escrita duas vezes, um dia divergiria.
-- Aqui ela é escrita uma vez, no banco, e os dois domínios a herdam.
--
-- Três garantias:
--   1. o original é imutável — complemento é registro NOVO, nunca reescrita;
--   2. o par não vê a narrativa pessoal; a equipe técnica vê lado a lado;
--   3. o Gestor Geral só abre uma narrativa restrita com finalidade declarada,
--      e o ato fica na auditoria (§26.2 #29).
-- ============================================================

-- Opções de testemunho (§12.2). São as MESMAS na ocorrência (§13.4).
CREATE TABLE witness_option (
  code      text PRIMARY KEY,
  label     text NOT NULL,
  ordem     smallint NOT NULL,
  -- Quando true, o relato fica pendente de complemento e aparece assim para
  -- a equipe técnica: quem escreveu avisou que ainda tem o que dizer.
  pendente  boolean NOT NULL DEFAULT false
);
INSERT INTO witness_option (code, label, ordem, pendente) VALUES
  ('presenciei_integralmente', 'Presenciei integralmente',  1, false),
  ('presenciei_parcialmente',  'Presenciei parcialmente',   2, false),
  ('nao_presenciei',           'Não presenciei',            3, false),
  ('soube_depois',             'Soube depois',              4, false),
  ('intervim',                 'Intervim',                  5, false),
  ('sem_informacao_adicional', 'Sem informação adicional',  6, false),
  ('preciso_complementar',     'Preciso complementar',      7, true);

CREATE TABLE statement (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      uuid NOT NULL REFERENCES house(id),
  -- Contexto genérico de propósito: 'passagem', 'ocorrencia' e o que vier.
  -- Sem chave estrangeira para os módulos de domínio — é isso que permite
  -- remover `shifts` ou `incidents` sem levar os relatos junto.
  context       text NOT NULL,
  entity        text NOT NULL,
  entity_id     uuid NOT NULL,
  person_id     uuid REFERENCES person(id),   -- sobre quem, quando se aplica
  author_id     uuid NOT NULL REFERENCES app_user(id),
  witness       text NOT NULL REFERENCES witness_option(code),
  body          text NOT NULL,
  -- Narrativa pessoal: o padrão é restrito. Abrir é escolha explícita de quem
  -- escreve, nunca da tela (§12.2).
  restricted    boolean NOT NULL DEFAULT true,
  supplements_id uuid REFERENCES statement(id),  -- complemento do próprio autor
  happened_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  offline       boolean NOT NULL DEFAULT false,
  client_op_id  text UNIQUE
);
CREATE INDEX idx_statement_entity ON statement (entity, entity_id);
CREATE INDEX idx_statement_author ON statement (author_id, created_at DESC);
CREATE INDEX idx_statement_person ON statement (person_id) WHERE person_id IS NOT NULL;

-- Original imutável: nem o dono reescreve o que já registrou (§12.2).
CREATE TRIGGER statement_no_change BEFORE UPDATE OR DELETE ON statement
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

ALTER TABLE statement ENABLE ROW LEVEL SECURITY;

-- Quem lê o quê:
--  * o autor lê o que escreveu, sempre;
--  * equipe técnica e coordenação leem TUDO da casa — é a leitura "lado a
--    lado" que o §12.2 exige para comparar versões sem apagar nenhuma;
--  * os demais (colegas, líderes, gestor) leem apenas o relato NÃO restrito.
CREATE POLICY st_select ON statement FOR SELECT TO rede_app USING (
  author_id = app_current_user()
  OR (app_current_role() IN ('equipe_tecnica','coordenador') AND app_house_in_scope(house_id))
  OR (NOT restricted AND app_house_in_scope(house_id))
);

-- Ninguém escreve relato em nome de outro. A regra do plantão ("cada um
-- assina o seu") começa aqui, na frase que se atribui a alguém.
CREATE POLICY st_insert ON statement FOR INSERT TO rede_app WITH CHECK (
  author_id = app_current_user() AND app_house_in_scope(house_id)
);

GRANT SELECT, INSERT ON statement TO rede_app;
GRANT SELECT ON witness_option TO rede_app;
ALTER TABLE witness_option ENABLE ROW LEVEL SECURITY;
CREATE POLICY wo_select ON witness_option FOR SELECT TO rede_app USING (true);

-- ---------- Leitura justificada (§26.2 #29) ----------
-- O Gestor Geral tem alcance às oito casas, mas narrativa pessoal não é dado
-- de gestão. Em vez de abrir a política — o que tornaria a leitura invisível —
-- a leitura excepcional é um COMANDO: exige finalidade escrita, registra na
-- auditoria antes de devolver o conteúdo, e só então devolve.
--
-- Consequência desejada: não existe caminho de leitura restrita sem rastro.
CREATE OR REPLACE FUNCTION app_read_statement(p_id uuid, p_purpose text)
RETURNS TABLE (id uuid, body text, witness text, author_id uuid,
               happened_at timestamptz, house_id uuid) AS $$
DECLARE v_role role_code; v_me uuid; v_house uuid; v_restricted boolean;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  IF v_me IS NULL THEN RAISE EXCEPTION 'sem_identidade'; END IF;
  IF coalesce(length(btrim(p_purpose)), 0) < 15 THEN
    RAISE EXCEPTION 'finalidade_insuficiente';
  END IF;

  SELECT s.house_id, s.restricted INTO v_house, v_restricted
  FROM statement s WHERE s.id = p_id;
  IF v_house IS NULL THEN RAISE EXCEPTION 'relato_inexistente'; END IF;

  -- Acesso excepcional é do Gestor Geral. Equipe técnica e coordenação já
  -- leem pela política comum; educador e líder não leem nem por aqui.
  IF v_role <> 'gestor_geral' THEN RAISE EXCEPTION 'acesso_excepcional_negado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM house h JOIN app_user u ON u.id = v_me
                 WHERE h.id = v_house AND h.institution_id = u.institution_id) THEN
    RAISE EXCEPTION 'fora_da_instituicao';
  END IF;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, purpose, detail)
  VALUES (v_house, v_me, 'statement.read_exceptional', 'statement', p_id, btrim(p_purpose),
          jsonb_build_object('restrito', v_restricted));

  RETURN QUERY
    SELECT s.id, s.body, s.witness, s.author_id, s.happened_at, s.house_id
    FROM statement s WHERE s.id = p_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_read_statement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_read_statement(uuid, text) TO rede_app;
