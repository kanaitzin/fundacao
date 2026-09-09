-- ============================================================
-- 1000 — O relato de todas as partes
--
-- Pedido da equipe técnica em 09/09: quando acontece um episódio grave na casa
-- — briga, autolesão, contenção, alguém se machucou —, cada educador do turno
-- precisa escrever o que viu. Assim, quando a técnica for conversar com o
-- adolescente, ela já tem o relato de todas as partes e falta só ouvir ele.
--
-- O QUE JÁ EXISTIA. Relato independente por autor, imutável, com narrativa
-- pessoal restrita ao par, e a opção de testemunho "Não presenciei" — o botão
-- fácil que a equipe pediu já estava lá desde a fase 5.
--
-- O QUE FALTAVA: A COBRANÇA. Nada pedia o relato a ninguém. Quem não estivesse
-- olhando a ocorrência simplesmente não escrevia, e a falta aparecia dias
-- depois, quando a técnica fosse montar a conversa — que é tarde.
--
-- TRÊS DECISÕES QUE VALEM ESTAR ESCRITAS:
--
-- 1. QUEM É COBRADO é quem estava ESCALADO na casa naquele dia e turno. Antes
--    da escala existir, isto teria de cair no vínculo com a casa e cobraria
--    relato de quem estava de folga. Se não houver escala montada para o dia,
--    a função DIZ que caiu no vínculo, em vez de fingir que sabe — é a mesma
--    postura da passagem de plantão (0960).
--
-- 2. A COBRANÇA NÃO SE FECHA SOZINHA e não some. Ela é atendida escrevendo —
--    e "Não presenciei" É escrever: fica um relato com autor, horário e a
--    declaração. A diferença entre "não vi nada" e "ninguém perguntou" é toda
--    a diferença quando alguém lê isso seis meses depois.
--
-- 3. QUALQUER PESSOA PODE ACRESCENTAR RELATO DEPOIS, cobrada ou não. A criança
--    às vezes conta dias depois que foi agredida, e aí quem não estava na
--    lista original precisa poder falar. A cobrança é um empurrão, nunca uma
--    lista fechada de quem tem direito a relatar.
--
-- O que este arquivo NÃO faz: classificar gravidade. Quem marca como grave é
-- quem abre a ocorrência. O sistema não decide sozinho o que é sério — regra 3.
-- ============================================================

-- ------------------------------------------------------------
-- A cobrança.
--
-- Mora em `statements` e não em `incidents`: ela guarda entity/entity_id
-- genéricos, como o próprio relato, e é isso que permite remover o módulo de
-- ocorrências sem levar as cobranças junto.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS statement_request (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id    uuid NOT NULL REFERENCES house(id),
  context     text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES app_user(id),
  -- A pergunta que a pessoa lê. Objetiva, do jeito que o Marcelo descreveu:
  -- "houve contenção hoje — você viu?"
  prompt      text NOT NULL,
  -- 'escala' ou 'vinculo': de onde saiu a lista. Quem lê precisa saber se o
  -- sistema sabia quem estava na casa ou apenas quem trabalha nela.
  origem      text NOT NULL CHECK (origem IN ('escala','vinculo')),
  opened_at   timestamptz NOT NULL DEFAULT now(),
  opened_by   uuid NOT NULL REFERENCES app_user(id),
  -- Atendida quando a pessoa escreve. Aponta para o relato, inclusive quando
  -- ele diz "Não presenciei": declarar é responder.
  answered_at timestamptz,
  statement_id uuid REFERENCES statement(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_statement_request
  ON statement_request (entity, entity_id, user_id);
CREATE INDEX IF NOT EXISTS ix_statement_request_pendente
  ON statement_request (user_id) WHERE answered_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_statement_request_casa
  ON statement_request (house_id, entity, entity_id);

ALTER TABLE statement_request ENABLE ROW LEVEL SECURITY;

/*
 * QUEM VÊ AS COBRANÇAS.
 *
 * A própria pessoa vê a sua — precisa, é o que a faz escrever.
 *
 * E a VISÃO GERAL, de quem ainda não respondeu, é da equipe técnica, do líder
 * educador e da coordenação. Decisão do Marcelo em 09/09: o líder passou a
 * enxergar, porque é ele quem organiza o turno para as pessoas conseguirem
 * responder antes de a conta sobrar toda para ele.
 *
 * Um educador NÃO vê a cobrança de outro. Saber quem ainda não escreveu é
 * organização de turno na mão de quem organiza; entre pares, viraria cobrança
 * de colega — e o relato tem de nascer do que a pessoa viu, não da pressão de
 * ser o último a não ter escrito.
 *
 * O papel é conferido ANTES do escopo por linha, e com CASE: o OR do SQL não
 * garante ordem, e o Postgres avaliaria a casa por linha antes de descobrir
 * que o cargo já alcançava tudo (regra 16).
 */
CREATE POLICY sr_select ON statement_request FOR SELECT TO rede_app
  USING (
    CASE
      WHEN user_id = app_current_user() THEN true
      WHEN app_current_role() IN ('equipe_tecnica','coordenador','lider_diurno',
                                  'lider_noturno_geral','gestor_geral')
        THEN house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
      ELSE false
    END
  );
-- Escrita só pelas funções abaixo.
CREATE POLICY sr_insert ON statement_request FOR INSERT TO rede_app WITH CHECK (false);
GRANT SELECT ON statement_request TO rede_app;

-- ------------------------------------------------------------
-- Abrir a cobrança.
--
-- Genérica de propósito: recebe entity/entity_id e o texto da pergunta. Quem
-- decide QUE isto é grave é o módulo de ocorrências, com a categoria que a
-- pessoa escolheu — nunca esta função.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_cobrar_relatos(
  p_house uuid, p_context text, p_entity text, p_entity_id uuid,
  p_prompt text, p_quando timestamptz DEFAULT now())
RETURNS TABLE (cobrados integer, origem text) AS $$
DECLARE
  v_dia date := (p_quando AT TIME ZONE app_fuso())::date;
  v_origem text;
  v_n integer := 0;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A escala do dia, se houver. Os dois turnos: o episódio das 6h50 pega o
  -- noturno que ainda está lá e o diurno que acabou de chegar.
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM shift_assignment s
     WHERE s.house_id = p_house AND s.on_date = v_dia AND s.revoked_at IS NULL
  ) THEN 'escala' ELSE 'vinculo' END INTO v_origem;

  WITH candidatos AS (
    SELECT DISTINCT s.user_id
      FROM shift_assignment s
     WHERE v_origem = 'escala'
       AND s.house_id = p_house AND s.on_date = v_dia AND s.revoked_at IS NULL
    UNION
    /*
     * Sem escala montada, cai no vínculo — e a coluna `origem` DIZ isso. Sem
     * essa distinção, a lista de "quem falta" pareceria a mesma coisa nos dois
     * casos, e ela não é: uma sabe quem estava na casa, a outra chuta.
     */
    SELECT a.user_id
      FROM user_house_assignment a
      JOIN app_user u ON u.id = a.user_id
     WHERE v_origem = 'vinculo'
       AND a.house_id = p_house AND a.valid_to IS NULL AND u.active
       AND u.role IN ('educador','lider_diurno','lider_noturno_geral')
  ), novas AS (
    INSERT INTO statement_request
      (house_id, context, entity, entity_id, user_id, prompt, origem, opened_by)
    SELECT p_house, p_context, p_entity, p_entity_id, c.user_id,
           btrim(p_prompt), v_origem, app_current_user()
      FROM candidatos c
     WHERE c.user_id IS NOT NULL
    -- Reabrir a mesma ocorrência não duplica a cobrança de quem já respondeu.
    ON CONFLICT (entity, entity_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_n FROM novas;

  RETURN QUERY SELECT v_n, v_origem;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_cobrar_relatos(uuid, text, text, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cobrar_relatos(uuid, text, text, uuid, text, timestamptz) TO rede_app;

-- ------------------------------------------------------------
-- Escrever atende a cobrança — inclusive quando o que se escreve é
-- "Não presenciei".
--
-- Gatilho e não chamada no serviço: o relato entra por mais de um caminho
-- (tela, fila offline), e a cobrança precisa fechar em todos. Fechar no
-- serviço deixaria a cobrança aberta justamente para quem escreveu sem sinal.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_atende_cobranca() RETURNS trigger AS $$
BEGIN
  UPDATE statement_request
     SET answered_at = coalesce(answered_at, now()),
         statement_id = coalesce(statement_id, NEW.id)
   WHERE entity = NEW.entity AND entity_id = NEW.entity_id
     AND user_id = NEW.author_id AND answered_at IS NULL;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS statement_atende_cobranca ON statement;
CREATE TRIGGER statement_atende_cobranca
  AFTER INSERT ON statement
  FOR EACH ROW EXECUTE FUNCTION trg_atende_cobranca();

-- ------------------------------------------------------------
-- O que ESTA pessoa precisa responder.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_minhas_cobrancas()
RETURNS TABLE (id uuid, house_id uuid, context text, entity text, entity_id uuid,
               prompt text, opened_at timestamptz) AS $$
  SELECT r.id, r.house_id, r.context, r.entity, r.entity_id, r.prompt, r.opened_at
    FROM statement_request r
   WHERE r.user_id = app_current_user() AND r.answered_at IS NULL
   ORDER BY r.opened_at DESC
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_minhas_cobrancas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_minhas_cobrancas() TO rede_app;

-- ------------------------------------------------------------
-- Quem já respondeu e quem falta, numa ocorrência.
--
-- Devolve NOME e ESTADO — nunca o texto do relato de ninguém: a política do
-- par continua valendo, e quem organiza o turno precisa saber quem falta, não
-- o que os outros escreveram.
--
-- O nome sai por `app_user_display_name`, nunca por junção com `app_user`, que
-- tem RLS de linha: o JOIN sumiria com a linha e o LEFT JOIN com o nome, e as
-- duas falhas são silenciosas (regra 10).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_cobrancas_da_ocorrencia(p_entity text, p_entity_id uuid)
RETURNS TABLE (user_id uuid, quem text, respondeu boolean,
               quando timestamptz, origem text) AS $$
  SELECT r.user_id, app_user_display_name(r.user_id),
         r.answered_at IS NOT NULL, r.answered_at, r.origem
    FROM statement_request r
   WHERE r.entity = p_entity AND r.entity_id = p_entity_id
     AND app_current_role() IN ('equipe_tecnica','coordenador','lider_diurno',
                                'lider_noturno_geral','gestor_geral')
     AND r.house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
   ORDER BY (r.answered_at IS NOT NULL), app_user_display_name(r.user_id)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_cobrancas_da_ocorrencia(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cobrancas_da_ocorrencia(text, uuid) TO rede_app;
