-- =========================================================================
-- O ANIVERSÁRIO DE 29 DE FEVEREIRO — 27/09/2026 (fase 168)
--
-- `app_aniversarios_proximos` decidia se o 29/02 virava 28 pelo ano CORRENTE,
-- e não pelo ano do aniversário. Dois defeitos, e nenhum aparecia em 2026:
--
--  * num ano bissexto, depois de fevereiro, o próximo aniversário era
--    `make_date(ano + 1, 2, 29)`, que não existe: a lista de aniversários da
--    casa inteira dava erro de março a dezembro de 2028, e o aviso diário
--    parava junto;
--  * num ano comum antes de um bissexto (setembro de 2027), o próximo caía
--    em 28/02/2028, quando 2028 tem o dia 29.
--
-- O cálculo passa a morar em `app_aniversario_no_ano(nascimento, ano)`, que
-- decide pelo ano pedido, e a lista em `app_aniversarios_em(casa, dias,
-- hoje)`, que recebe o dia de referência: é o que deixa a suíte perguntar
-- por março de 2028 sem mexer no relógio. `app_aniversarios_proximos` fica
-- com a mesma assinatura e chama as duas com `app_hoje()`.
--
-- E a conferência que faltava: a função é SECURITY DEFINER e recebe a casa,
-- e não perguntava o alcance (regra do §5). O serviço perguntava antes; agora
-- o banco pergunta também.
-- =========================================================================

CREATE OR REPLACE FUNCTION app_aniversario_no_ano(p_nascimento date, p_ano int)
RETURNS date LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE
    -- 29/02 em ano sem 29/02 é comemorado em 28/02; no ano que tem o dia, no dia.
    WHEN extract(month FROM p_nascimento) = 2 AND extract(day FROM p_nascimento) = 29
         AND extract(day FROM make_date(p_ano, 3, 1) - 1) = 28
      THEN make_date(p_ano, 2, 28)
    ELSE make_date(p_ano, extract(month FROM p_nascimento)::int, extract(day FROM p_nascimento)::int)
  END
$$;

CREATE OR REPLACE FUNCTION app_aniversarios_em(p_house uuid, p_dias integer, p_hoje date)
RETURNS TABLE(person_id uuid, nome text, nascimento date, dia date, idade_que_faz integer,
              faltam integer, ciente_por text, ciente_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  WITH base AS (
    SELECT p.id, coalesce(nullif(p.social_name, ''), p.full_name) AS nome, p.birth_date
      FROM person p
      JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'
     WHERE s.house_id = p_house AND p.birth_date IS NOT NULL
       AND app_house_in_scope(p_house)
  ), com_dia AS (
    SELECT b.*,
           CASE
             WHEN app_aniversario_no_ano(b.birth_date, extract(year FROM p_hoje)::int) >= p_hoje
               THEN app_aniversario_no_ano(b.birth_date, extract(year FROM p_hoje)::int)
             ELSE app_aniversario_no_ano(b.birth_date, extract(year FROM p_hoje)::int + 1)
           END AS proximo
      FROM base b
  )
  SELECT c.id, c.nome, c.birth_date, c.proximo,
         (extract(year FROM c.proximo) - extract(year FROM c.birth_date))::int,
         (c.proximo - p_hoje)::int,
         app_user_display_name(a.acked_by), a.acked_at
    FROM com_dia c
    LEFT JOIN birthday_ack a
           ON a.person_id = c.id AND a.year = extract(year FROM c.proximo)::int
   WHERE c.proximo - p_hoje <= p_dias
   ORDER BY c.proximo, c.nome;
$$;

CREATE OR REPLACE FUNCTION app_aniversarios_proximos(p_house uuid, p_dias integer DEFAULT 7)
RETURNS TABLE(person_id uuid, nome text, nascimento date, dia date, idade_que_faz integer,
              faltam integer, ciente_por text, ciente_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT * FROM app_aniversarios_em(p_house, p_dias, app_hoje())
$$;

REVOKE ALL ON FUNCTION app_aniversarios_em(uuid, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_aniversarios_em(uuid, integer, date) TO rede_app;
GRANT EXECUTE ON FUNCTION app_aniversario_no_ano(date, int) TO rede_app;
