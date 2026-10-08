-- A ACOLHE+AI (fase 192; pedido e decisões de 08/10).
--
-- A assistente não tem tabela de conversa: o que a pessoa pergunta e o que ela
-- responde vivem na tela de quem conversa, e o servidor só repassa ao modelo.
-- Guardar conversa seria guardar de novo, fora do lugar e sem dono, o que já
-- está registrado onde deve. O uso fica na auditoria, só com metadado.
--
-- O que ela guarda é a SUGESTÃO DE MELHORIA que a equipe deixa com ela, com o
-- nome de quem sugeriu (ninguém no sistema é anônimo). Quem lê, decidido em
-- 08/10: a coordenação da casa (as da casa dela), a Coordenação Geral, o Gestor
-- Geral e a TI (as de todas). Quem sugeriu lê as suas. Nada se apaga.

CREATE TABLE assistant_suggestion (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  uuid NOT NULL REFERENCES app_user(id),
  house_id   uuid REFERENCES house(id),
  body       text NOT NULL CHECK (length(btrim(body)) BETWEEN 10 AND 4000),
  screen     text CHECK (screen IS NULL OR length(screen) <= 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_suggestion_casa ON assistant_suggestion (house_id, created_at DESC);

ALTER TABLE assistant_suggestion ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON assistant_suggestion TO rede_app;

-- Escreve só em nome próprio, e só na casa que alcança (ou sem casa).
CREATE POLICY assistant_suggestion_insert ON assistant_suggestion FOR INSERT TO rede_app
  WITH CHECK (author_id = app_current_user()
              AND (house_id IS NULL OR house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))));

CREATE POLICY assistant_suggestion_select ON assistant_suggestion FOR SELECT TO rede_app
  USING (
    author_id = app_current_user()
    OR app_current_role() IN ('gestor_geral', 'admin_tecnico')
    OR (app_current_role() = 'coordenador'
        AND (house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
             OR (house_id IS NULL AND EXISTS (
                   SELECT 1 FROM app_user u WHERE u.id = app_current_user() AND u.todas_as_casas))))
  );
