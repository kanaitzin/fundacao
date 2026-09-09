-- ============================================================
-- 1010 — Acolhido em experiência familiar
--
-- Pedido do Marcelo em 09/09: a criança sai para passar dias com a família de
-- origem ou com o padrinho. Ela precisa sair da chamada, da grade e da rotina
-- durante esses dias — sem sair da casa.
--
-- O NOME veio do papel de vocês: "acolhido em experiência familiar" é uma das
-- seções do LIVRO ATA que a Casa 03 já preenche, e é diferente de visita
-- domiciliar. Aqui a criança está fora por um período, e a casa continua
-- responsável.
--
-- A MECÂNICA É A DA INTERNAÇÃO (0890), de propósito: a criança some da linha do
-- dia e da grade, **a vaga continua ocupada**, e ela volta sozinha no retorno.
-- Uma segunda maneira de afastar alguém do dia seria uma segunda maneira de
-- errar.
--
-- QUATRO DECISÕES QUE VALEM ESTAR ESCRITAS:
--
-- 1. NÃO HÁ AUTORIZAÇÃO JUDICIAL AMARRADA. Quem autoriza é o Juízo, em papel,
--    e o sistema não tem como conferir isso. Decisão do Marcelo: o acolhimento
--    REGISTRA que a criança vai, e o registro fica no perfil dela. Inventar um
--    campo "autorizado" que ninguém pode verificar seria pior do que não ter:
--    ele pareceria uma conferência.
--
-- 2. CONTATO COM APROXIMAÇÃO RESTRITA É BARRADO. Não avisado — barrado. A casa
--    não entrega criança a quem não pode se aproximar dela, e um sistema que
--    oferecesse essa opção "com justificativa" estaria oferecendo a saída
--    errada às 23h de uma sexta.
--
-- 3. O AVISO DE RETORNO É AVISO, NUNCA CLASSIFICAÇÃO. O sistema diz "previsto
--    para as 18h, retorno ainda não registrado" e lembra uma hora antes. Ele
--    NÃO chama isso de evasão, de fuga nem de descumprimento: "não voltou às
--    18h" e "evadiu" são coisas diferentes até alguém apurar, e quem escreve o
--    que houve é a pessoa (regra 3 — nada de decisão automática sobre risco).
--
-- 4. O RETORNO PEDE FATO, NÃO RÓTULO. O campo de observação existe porque a
--    equipe precisa saber como a criança voltou — mas a ajuda pede o que foi
--    observado, não uma avaliação dela. "Chegou sem falar e foi direto para o
--    quarto" e "voltou agressiva" descrevem coisas diferentes: a primeira pode
--    mudar, a segunda gruda (§8.14).
-- ============================================================

CREATE TABLE IF NOT EXISTS family_stay (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES person(id),
  house_id     uuid NOT NULL REFERENCES house(id),
  -- Para quem ela foi. Aponta para o contato JÁ CADASTRADO: digitar o nome à
  -- mão permitiria escrever qualquer um, inclusive quem está restrito.
  contact_id   uuid NOT NULL REFERENCES person_contact(id),
  purpose      text,
  started_at   timestamptz NOT NULL,
  -- Quando é para voltar. É isto que o aviso lê.
  expected_return_at timestamptz NOT NULL,
  returned_at  timestamptz,
  return_note  text,
  status       text NOT NULL DEFAULT 'em_andamento'
               CHECK (status IN ('em_andamento','encerrada')),
  opened_by    uuid NOT NULL REFERENCES app_user(id),
  opened_at    timestamptz NOT NULL DEFAULT now(),
  closed_by    uuid REFERENCES app_user(id),
  closed_at    timestamptz,
  CHECK (expected_return_at > started_at),
  CHECK (status = 'em_andamento' OR returned_at IS NOT NULL)
);

-- Uma saída aberta por criança, como na internação: duas ao mesmo tempo não são
-- caso raro, são erro de digitação que ninguém vê até o retorno não fechar nada.
CREATE UNIQUE INDEX IF NOT EXISTS uq_convivencia_aberta
  ON family_stay (person_id) WHERE status = 'em_andamento';
CREATE INDEX IF NOT EXISTS idx_convivencia_casa
  ON family_stay (house_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_convivencia_retorno
  ON family_stay (house_id, expected_return_at) WHERE status = 'em_andamento';

ALTER TABLE family_stay ENABLE ROW LEVEL SECURITY;

/*
 * QUEM LÊ. Toda a equipe da casa — o educador inclusive.
 *
 * É o mesmo raciocínio da internação: ele não precisa do motivo, mas precisa
 * saber por que a cadeira está vazia, e precisa saber que a criança volta
 * domingo às 18h para não marcá-la ausente no jantar de sábado.
 *
 * O papel vem antes do escopo por linha, com CASE (regra 16).
 */
CREATE POLICY fs_select ON family_stay FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
CREATE POLICY fs_insert ON family_stay FOR INSERT TO rede_app WITH CHECK (false);
GRANT SELECT ON family_stay TO rede_app;

-- ------------------------------------------------------------
-- A criança está fora da casa hoje?
--
-- Função própria e não um "está_ausente" genérico: internação e convivência
-- familiar são fatos diferentes, e juntar as duas num só predicado faria a
-- grade de medicamentos tratar igual quem está no hospital (onde outro
-- profissional dá a dose) e quem está com a mãe (onde ninguém dá, e é por isso
-- que a casa manda o remédio junto).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_em_convivencia_familiar(
  p_person uuid, p_dia date DEFAULT NULL)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_stay f
     WHERE f.person_id = p_person
       AND (f.started_at AT TIME ZONE app_fuso())::date <= coalesce(p_dia, app_hoje())
       /*
        * O DIA DO RETORNO JÁ CONTA COMO DE VOLTA.
        *
        * Se contasse como fora, a criança que chegou às 16h de domingo passaria
        * a noite em casa com a grade vazia, e ninguém seria lembrado do remédio
        * das 20h. Dose que não aparece é dose que não se dá.
        *
        * O custo é conhecido e é o menor dos dois: as doses ANTERIORES à
        * chegada, naquele dia, voltam a aparecer — e vão aparecer como não
        * confirmadas, porque ninguém as deu (ela não estava aqui). Quem fecha o
        * turno escreve o que houve, como já faz com qualquer dose sem resposta.
        * O contrário — silêncio sobre o remédio da noite — não tem conserto no
        * fim do turno.
        */
       AND (f.returned_at IS NULL
            OR (f.returned_at AT TIME ZONE app_fuso())::date > coalesce(p_dia, app_hoje()))
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_em_convivencia_familiar(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_em_convivencia_familiar(uuid, date) TO rede_app;

-- ------------------------------------------------------------
-- Registrar a saída.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_registrar_saida_familiar(
  p_person uuid, p_contact uuid, p_inicio timestamptz,
  p_retorno_previsto timestamptz, p_finalidade text)
/* `saida_id` e não `id`: o parâmetro de saída com o mesmo nome da coluna torna
   `RETURNING family_stay.id` ambíguo, e o Postgres recusa em tempo de execução
   — não de criação. Só aparece na primeira chamada real. */
RETURNS TABLE (saida_id uuid) AS $$
DECLARE v_casa uuid; v_contato record; v_id uuid;
BEGIN
  IF app_current_role() NOT IN ('equipe_tecnica','coordenador','lider_diurno','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_saida_familiar' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.house_id INTO v_casa
    FROM house_stay s WHERE s.person_id = p_person AND s.status = 'ativa';
  IF v_casa IS NULL OR NOT app_house_in_scope(v_casa) THEN
    RAISE EXCEPTION 'pessoa_fora_de_escopo' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_contato FROM person_contact
   WHERE id = p_contact AND person_id = p_person AND active;
  IF v_contato IS NULL THEN
    RAISE EXCEPTION 'contato_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- A recusa que importa. Barrada, não avisada.
  IF v_contato.restricted THEN
    RAISE EXCEPTION 'contato_com_aproximacao_restrita'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_retorno_previsto <= p_inicio THEN
    RAISE EXCEPTION 'retorno_antes_da_saida' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO family_stay (person_id, house_id, contact_id, purpose,
                           started_at, expected_return_at, opened_by)
  VALUES (p_person, v_casa, p_contact, nullif(btrim(p_finalidade), ''),
          p_inicio, p_retorno_previsto, app_current_user())
  RETURNING family_stay.id INTO v_id;

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_registrar_saida_familiar(uuid,uuid,timestamptz,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_saida_familiar(uuid,uuid,timestamptz,timestamptz,text) TO rede_app;

-- ------------------------------------------------------------
-- Registrar o retorno.
--
-- Quem registra é QUEM RECEBE a criança — inclusive o educador de plantão, que
-- é quem está na porta às 18h de domingo. Exigir a técnica aqui deixaria a
-- criança "fora da casa" no sistema durante a noite inteira.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_registrar_retorno_familiar(
  p_id uuid, p_quando timestamptz, p_nota text)
RETURNS TABLE (encerrada boolean) AS $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM family_stay WHERE id = p_id;
  IF f IS NULL OR NOT app_house_in_scope(f.house_id) THEN
    RAISE EXCEPTION 'saida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF f.status = 'encerrada' THEN
    RAISE EXCEPTION 'retorno_ja_registrado' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE family_stay
     SET returned_at = p_quando, return_note = nullif(btrim(p_nota), ''),
         status = 'encerrada', closed_by = app_current_user(), closed_at = now()
   WHERE id = p_id;

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_registrar_retorno_familiar(uuid, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_retorno_familiar(uuid, timestamptz, text) TO rede_app;

-- ------------------------------------------------------------
-- Quem está fora, e quem já devia ter voltado.
--
-- `avisar` fica verdadeiro na última hora antes do previsto — é o "o Eduardo
-- está chegando, fiquem de olho" que o Marcelo pediu. `atrasado` diz que a
-- hora passou e o retorno não foi registrado. Nenhum dos dois é acusação: são
-- as duas frases que a tela mostra, e quem escreve o que houve é a pessoa.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_convivencias_abertas(p_house uuid)
RETURNS TABLE (id uuid, person_id uuid, quem text, com_quem text, vinculo text,
               saiu_em timestamptz, retorno_previsto timestamptz,
               avisar boolean, atrasado boolean, finalidade text) AS $$
  /* O nome pelo qual a criança é chamada, como em toda tela operacional. */
  SELECT f.id, f.person_id, coalesce(nullif(p.social_name,''), p.full_name), c.name, c.bond,
         f.started_at, f.expected_return_at,
         now() >= f.expected_return_at - interval '1 hour' AND now() < f.expected_return_at,
         now() >= f.expected_return_at,
         f.purpose
    FROM family_stay f
    JOIN person p ON p.id = f.person_id
    JOIN person_contact c ON c.id = f.contact_id
   WHERE f.house_id = p_house
     AND app_house_in_scope(p_house)
     AND f.status = 'em_andamento'
   ORDER BY f.expected_return_at
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_convivencias_abertas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_convivencias_abertas(uuid) TO rede_app;
