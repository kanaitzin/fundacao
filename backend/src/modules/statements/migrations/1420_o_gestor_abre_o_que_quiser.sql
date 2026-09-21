-- =============================================================================
-- 1420 — O GESTOR GERAL PASSA A ESCOLHER **QUAL** RELATO RESTRITO ABRIR.
--
-- A DECISÃO, de 21/09/2026: *"gestor abrir o que quiser"*.
--
-- Era a metade que faltava do §10.6. A resposta de 20/09 — **só a contagem** —
-- virou a fase 128: o perfil da criança passou a dizer *"existem N relatos em
-- área restrita"*, e nada mais. Aí apareceu uma pergunta que a própria resposta
-- abriu: **com só a contagem, ele não tem por onde escolher.** Os dois caminhos
-- eram um botão que abrisse os N de uma vez, ou N botões opacos em que ele abre
-- um, lê, e para quando achar o que procurava.
--
-- A Fundação escolheu o segundo, e ele é o que expõe menos: **cada abertura é um
-- ato, com a sua própria finalidade escrita e o seu próprio registro.** Um botão
-- que abrisse os três de uma vez faria uma finalidade valer por três narrativas
-- — e quem lesse a auditoria depois não saberia dizer qual delas ele precisava.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA FUNÇÃO DEVOLVE, E O QUE ELA SE RECUSA A DEVOLVER.
--
-- Devolve **um número de ordem e um identificador**. Nada mais: nem data, nem
-- autor, nem contexto, nem a primeira linha. O identificador não conta nada
-- sobre a criança; é o endereço da porta, e a porta continua sendo a
-- `app_read_statement`, que exige finalidade de quinze caracteres e **registra
-- antes de devolver o conteúdo**.
--
-- **A ORDEM É PELO IDENTIFICADOR, e não pela data** — e isto é a parte pensada.
-- Ordenar por data faria o "relato 1" ser sempre o mais antigo, e aí a lista
-- opaca deixaria de ser opaca: ele saberia a cronologia dos relatos sobre a
-- criança sem abrir nenhum, e cronologia já é narrativa. O `id` é aleatório
-- (`gen_random_uuid`), então a ordem não diz nada.
--
-- **Só o Gestor Geral.** Para a equipe técnica e a coordenação esta função não
-- existe: elas já leem o relato pela política normal, e oferecer-lhes uma lista
-- de "abrir excepcionalmente" seria transformar leitura de rotina em ato
-- excepcional — o contrário do que o §26.2 protege.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_relatos_restritos_para_abrir(p_person uuid)
RETURNS TABLE (out_ordem integer, out_id uuid) AS $$
DECLARE v_role role_code;
BEGIN
  v_role := app_current_role();
  /*
   * Quem NÃO é Gestor Geral recebe lista VAZIA, e não um erro. A tela pergunta
   * "há algo que eu possa abrir?" para todo cargo que abre o perfil; responder
   * com exceção faria a tela ter de saber o cargo antes de perguntar, e cargo
   * conferido na tela é cargo conferido no lugar errado (§4.2).
   */
  IF v_role <> 'gestor_geral' THEN RETURN; END IF;

  /* Fora da instituição não se lista nada — a mesma fronteira que a
     `app_read_statement` confere antes de abrir. */
  IF NOT EXISTS (
    SELECT 1 FROM person p
     JOIN house_stay hs ON hs.person_id = p.id AND hs.status = 'ativa'
     JOIN house h ON h.id = hs.house_id
     JOIN app_user u ON u.id = app_current_user()
    WHERE p.id = p_person AND h.institution_id = u.institution_id)
  THEN RETURN;
  END IF;

  RETURN QUERY
    SELECT (row_number() OVER (ORDER BY s.id))::integer, s.id
      FROM statement s
     WHERE s.person_id = p_person
       AND s.restricted
       -- O relato que ele mesmo escreveu não é leitura excepcional de ninguém.
       AND s.author_id <> app_current_user()
     ORDER BY s.id;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_relatos_restritos_para_abrir(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_relatos_restritos_para_abrir(uuid) TO rede_app;

COMMENT ON FUNCTION app_relatos_restritos_para_abrir(uuid) IS
  'Os relatos restritos de uma criança que o Gestor Geral pode abrir, como '
  'número de ordem e identificador — nunca data, autor ou trecho (1420). A ordem '
  'é pelo id, que é aleatório: ordenar por data entregaria a cronologia sem '
  'abrir nada, e cronologia já é narrativa. Para outros cargos devolve vazio.';
