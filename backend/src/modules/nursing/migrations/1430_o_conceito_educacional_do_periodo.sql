-- =============================================================================
-- 1430 — O CONCEITO EDUCACIONAL DO PERÍODO.
--
-- A DECISÃO, em duas rodadas. Em 20/09/2026 a Fundação respondeu COMO a métrica
-- *"quantas crianças tiveram boas notas"* pode existir: **um conceito geral por
-- período, por bimestre, com espaço para o porquê** — e não boletim com notas
-- por disciplina (*"são 20 crianças, quatro vezes por ano, em oito casas, e a
-- métrica que ninguém consegue digitar não existe"*), nem aprovado/reprovado por
-- disciplina, que só fala uma vez por ano, tarde para a casa agir.
--
-- Em 21/09/2026 veio a outra metade, que era minha pergunta: **quem digita.** A
-- resposta: *"quem digita o conceito é a equipe técnica, coordenador e educador
-- líder"*. É o mesmo trio que monta a escala (0950, fase 123), e pela mesma
-- razão prática: são os três que estão na casa quando alguém precisa escrever.
--
-- ---------------------------------------------------------------------------
-- O QUE ISTO NÃO É, e é a parte que mais importa.
--
-- **Não é nota colada no nome da criança.** É estado do ACOMPANHAMENTO num
-- período, e é por isso que o motivo é obrigatório: um conceito sozinho, sem o
-- porquê, atravessa meses e vira característica da pessoa — é o mesmo argumento
-- que recusou a pontuação de comportamento (§7) e que fez a exceção da chamada
-- exigir o fato escrito em vez do rótulo.
--
-- **Não é média, nem escala de 0 a 10, nem estrela.** Três estados, e eles
-- descrevem o que a casa faz a seguir: quem acompanha sem apoio, quem acompanha
-- COM apoio, e quem não está acompanhando — que é o único que pede providência.
--
-- *O CONJUNTO DOS TRÊS É ESCOLHA MINHA, e está escrito aqui para não passar por
-- decisão da Fundação.* Ela disse "um conceito geral, com espaço para o porquê";
-- os três nomes abaixo são a minha leitura do que é contável e digitável em vinte
-- crianças, quatro vezes por ano. Trocar, acrescentar ou renomear é uma linha
-- nesta migração e uma no mapa de rótulos.
--
-- **O BIMESTRE É ESCRITO, não deduzido da data.** O conceito do 3º bimestre pode
-- ser digitado em novembro, quando a escola entregou o retorno atrasado — e
-- deduzir o bimestre da data de digitação gravaria o 4º. É o mesmo erro que a
-- fase 127 corrigiu na chamada: a pergunta é POR PERÍODO, não "por agora".
--
-- **NADA SE SOBRESCREVE.** Corrigir não altera a linha: insere outra, que
-- aponta para a anterior. As duas ficam legíveis, e quem lê vê que houve
-- correção e por quem — é o que a ATA e o acompanhamento já fazem.
-- =============================================================================

CREATE TABLE IF NOT EXISTS education_concept (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES person(id),
  house_id     uuid NOT NULL REFERENCES house(id),
  -- O ano e o bimestre são ESCRITOS por quem digita (ver o comentário acima).
  ano          integer NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
  bimestre     integer NOT NULL CHECK (bimestre BETWEEN 1 AND 4),
  conceito     text NOT NULL CHECK (conceito IN (
                 'acompanha',              -- está acompanhando o ano
                 'acompanha_com_apoio',    -- acompanha, com apoio em curso
                 'nao_acompanha')),        -- não está acompanhando: pede providência
  -- O porquê, obrigatório. Conceito sem motivo é rótulo que atravessa meses.
  motivo       text NOT NULL CHECK (length(btrim(motivo)) >= 10),
  /* A correção não apaga: a linha nova aponta para a que ela substitui, e a
     antiga continua legível com o nome de quem a escreveu. */
  substitui_id uuid REFERENCES education_concept(id),
  substituido_em timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL REFERENCES app_user(id)
);

/* Um conceito VIGENTE por criança e período. O índice é parcial porque as
   versões substituídas continuam na tabela — é elas que provam que houve
   correção. */
CREATE UNIQUE INDEX IF NOT EXISTS uq_conceito_vigente
  ON education_concept (person_id, ano, bimestre) WHERE substituido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_conceito_casa
  ON education_concept (house_id, ano, bimestre);

ALTER TABLE education_concept ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON education_concept TO rede_app;

/*
 * QUEM LÊ é quem alcança a criança — o educador de plantão inclusive. Ele
 * acompanha a tarefa de casa; esconder dele o conceito faria a casa ter uma
 * informação sobre a escola que justamente quem senta ao lado da criança não vê.
 * Quem ESCREVE é o trio da decisão, e isso mora na função, não na policy: a
 * escrita passa por comando de sistema, e a tabela não recebe `INSERT` direto.
 */
CREATE POLICY ec_select ON education_concept FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id));

-- ---------------------------------------------------------------------------
-- O COMANDO. Escreve, e corrige sem apagar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_registrar_conceito_educacional(
  p_person uuid, p_ano integer, p_bimestre integer,
  p_conceito text, p_motivo text)
RETURNS TABLE (out_id uuid, out_substituiu uuid) AS $$
DECLARE v_house uuid; v_anterior uuid; v_id uuid;
BEGIN
  /* alcance:conceito_educacional — a decisão de 21/09/2026, por extenso. */
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','lider_diurno') THEN
    RAISE EXCEPTION 'somente_tecnica_coordenacao_ou_lider'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT hs.house_id INTO v_house FROM house_stay hs
   WHERE hs.person_id = p_person AND hs.status = 'ativa' LIMIT 1;
  IF v_house IS NULL OR NOT app_house_in_scope(v_house) THEN
    RAISE EXCEPTION 'acolhido_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF length(btrim(coalesce(p_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'motivo_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  /*
   * O BIMESTRE NO FUTURO NÃO EXISTE. Escrever o conceito do 4º bimestre em
   * março é escrever sobre o que não aconteceu — e o painel contaria.
   */
  IF (p_ano * 10 + p_bimestre) >
     (EXTRACT(YEAR FROM app_hoje())::integer * 10
      + LEAST(4, GREATEST(1, ceil(EXTRACT(MONTH FROM app_hoje())::numeric / 3)::integer)))
  THEN
    RAISE EXCEPTION 'bimestre_no_futuro' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO v_anterior FROM education_concept
   WHERE person_id = p_person AND ano = p_ano AND bimestre = p_bimestre
     AND substituido_em IS NULL
   FOR UPDATE;

  IF v_anterior IS NOT NULL THEN
    UPDATE education_concept SET substituido_em = now() WHERE id = v_anterior;
  END IF;

  INSERT INTO education_concept
    (person_id, house_id, ano, bimestre, conceito, motivo, substitui_id, created_by)
  VALUES (p_person, v_house, p_ano, p_bimestre, p_conceito, btrim(p_motivo),
          v_anterior, app_current_user())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_anterior;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_registrar_conceito_educacional(uuid, integer, integer, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_conceito_educacional(uuid, integer, integer, text, text)
  TO rede_app;

COMMENT ON TABLE education_concept IS
  'O conceito educacional por bimestre (1430): estado do ACOMPANHAMENTO num '
  'período, com o motivo obrigatório ao lado — nunca nota colada no nome da '
  'criança. Escrevem a equipe técnica, a coordenação e o Líder Diurno (decisão '
  'de 21/09/2026); lê quem alcança a criança. Corrigir insere versão nova e '
  'mantém a anterior legível.';
