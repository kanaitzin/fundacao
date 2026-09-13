-- ============================================================
-- 1160 — Os aniversários, avisados antes
--
-- Pedido do Marcelo, anotado num bloco de notas e recuperado em 12/09: que a
-- casa saiba do aniversário com uma semana de antecedência, e três dias antes,
-- e no dia — "pra caso alguém acabe esquecendo, pra não ter que ler papel na
-- parede", e para a casa poder se organizar e fazer a festinha.
--
-- A DATA JÁ EXISTE: é a `birth_date` do perfil, e foi ele quem lembrou disso.
-- Não há cadastro novo, e não pode haver: aniversário digitado de novo, em
-- outro lugar, é a segunda data que diverge da primeira.
--
-- O QUE ESTA TABELA GUARDA É A CIÊNCIA, não o aniversário. Uma linha por
-- criança e por ano, dizendo que alguém da casa viu e se deu por avisado — é o
-- que faz o aviso parar, e é o que responde "a casa sabia?" quando a data
-- passa em branco. Sem isso, ou o sistema avisa todo dia até cansar, ou avisa
-- uma vez e ninguém sabe se alguém leu.
--
-- E O QUE ELA NÃO FAZ, de propósito:
--
--  * não registra se a festa aconteceu, nem como foi. Isso é do álbum da
--    criança (`memory_record`), escrito por quem esteve lá, e nunca uma
--    tarefa a cumprir. Uma coluna "festa realizada: sim/não" viraria em três
--    meses um indicador de casa que faz festa e casa que não faz;
--  * não conta nada por casa, e não compara. Aniversário não é desempenho.
-- ============================================================

CREATE TABLE birthday_ack (
  person_id   uuid NOT NULL REFERENCES person(id),
  -- O ano do aniversário, e não a data: a ciência vale para aquele aniversário.
  year        int  NOT NULL,
  house_id    uuid NOT NULL REFERENCES house(id),
  acked_by    uuid NOT NULL REFERENCES app_user(id),
  acked_at    timestamptz NOT NULL DEFAULT now(),
  note        text,
  PRIMARY KEY (person_id, year)
);
CREATE INDEX idx_aniversario_casa ON birthday_ack (house_id, year);

ALTER TABLE birthday_ack ENABLE ROW LEVEL SECURITY;

-- Ler e escrever: quem trabalha na casa. Dar-se por avisado de um aniversário
-- é do turno — inclusive do educador, que é quem vai estar lá no dia.
CREATE POLICY aniversario_select ON birthday_ack FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));
CREATE POLICY aniversario_insert ON birthday_ack FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id) AND acked_by = app_current_user());

GRANT SELECT, INSERT ON birthday_ack TO rede_app;

/**
 * Quem faz aniversário nos próximos `p_dias` dias, nesta casa.
 *
 * Atravessa a virada do ano: em 28/12, a lista de sete dias inclui quem nasceu
 * em 3 de janeiro. É por isso que a conta é feita sobre o dia-do-ano da
 * próxima ocorrência, e não sobre a data crua.
 *
 * 29 de fevereiro: em ano comum, `make_date` do dia 29 falharia. A criança que
 * nasceu em 29/02 tem o aniversário tratado em 28/02 — a casa comemora em
 * algum dia, e deixar a linha sumir do sistema seria pior do que escolher um.
 */
CREATE OR REPLACE FUNCTION app_aniversarios_proximos(p_house uuid, p_dias int DEFAULT 7)
RETURNS TABLE (
  person_id uuid, nome text, nascimento date, dia date,
  idade_que_faz int, faltam int, ciente_por text, ciente_em timestamptz
) AS $$
  WITH base AS (
    SELECT p.id, coalesce(nullif(p.social_name, ''), p.full_name) AS nome, p.birth_date,
           /* 29/02 só vira 28 em ano COMUM. No ano bissexto o aniversário é no
              próprio 29, e adiantá-lo um dia faria a casa comemorar na véspera
              justamente no ano em que a data existe (ajuste da fase 98). */
           CASE
             WHEN extract(month FROM p.birth_date) = 2 AND extract(day FROM p.birth_date) = 29
                  AND NOT (extract(year FROM app_hoje())::int % 4 = 0
                           AND (extract(year FROM app_hoje())::int % 100 <> 0
                                OR extract(year FROM app_hoje())::int % 400 = 0))
               THEN 28 ELSE extract(day FROM p.birth_date)::int
           END AS d,
           extract(month FROM p.birth_date)::int AS m
      FROM person p
      JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'
     WHERE s.house_id = p_house AND p.birth_date IS NOT NULL
  ), com_dia AS (
    SELECT b.*,
           CASE
             WHEN make_date(extract(year FROM app_hoje())::int, b.m, b.d) >= app_hoje()
               THEN make_date(extract(year FROM app_hoje())::int, b.m, b.d)
             ELSE make_date(extract(year FROM app_hoje())::int + 1, b.m, b.d)
           END AS proximo
      FROM base b
  )
  SELECT c.id, c.nome, c.birth_date, c.proximo,
         (extract(year FROM c.proximo) - extract(year FROM c.birth_date))::int,
         (c.proximo - app_hoje())::int,
         app_user_display_name(a.acked_by), a.acked_at
    FROM com_dia c
    LEFT JOIN birthday_ack a
           ON a.person_id = c.id AND a.year = extract(year FROM c.proximo)::int
   WHERE c.proximo - app_hoje() <= p_dias
   ORDER BY c.proximo, c.nome;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_aniversarios_proximos(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_aniversarios_proximos(uuid, int) TO rede_app;

COMMENT ON TABLE birthday_ack IS
  'Ciência do aniversário, por criança e ano (fase 98). A data vem do perfil; esta tabela só guarda que a casa se deu por avisada, e é o que faz o aviso parar. NÃO registra se houve festa: isso é do álbum da criança.';
