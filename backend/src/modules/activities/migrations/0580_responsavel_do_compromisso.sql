-- ============================================================
-- Rede Acolher — Migração 058: responsável pelo compromisso
--
-- Pedido da Fundação (28/08/2026): ao marcar na linha do tempo, poder já
-- definir QUEM leva — um educador com nome, para que ele se organize para a
-- saída; ou deixar como "quem estiver no plantão daquele horário", que é como
-- a maior parte das coisas acontece.
--
-- As duas formas existem porque as duas são verdadeiras na casa:
--
--  * **pessoa nomeada** serve para o que precisa de preparo — a consulta que
--    exige documento, o passeio que depende de quem dirige, a audiência.
--    Marcar com nome três semanas antes é o que permite alguém se planejar;
--
--  * **plantão do horário** serve para o que qualquer educador de serviço faz
--    — a rotina, o colírio das 7h30, a atividade da casa. Nomear alguém aqui
--    seria fingir uma escala que ainda não existe: quem estiver de plantão
--    naquele dia é quem faz, e o sistema não deve inventar um nome três
--    semanas antes para depois cobrá-lo de quem estava de folga.
--
-- Uma escolha deliberada: nomear alguém que NÃO está na escala daquele
-- horário é permitido, e o sistema avisa em vez de bloquear. A escala muda,
-- gente troca plantão, e a consulta do Kauã pode ter sido combinada
-- justamente com quem vai entrar de folga para levá-lo. Bloquear resolveria
-- um erro de digitação e criaria um impedimento real.
-- ============================================================

ALTER TABLE commitment
  ADD COLUMN IF NOT EXISTS responsible_mode text NOT NULL DEFAULT 'plantao'
    CHECK (responsible_mode IN ('plantao','pessoa')),
  ADD COLUMN IF NOT EXISTS responsible_id uuid REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS responsible_note text;

-- Nomear exige nome; plantão não carrega nome nenhum.
ALTER TABLE commitment DROP CONSTRAINT IF EXISTS ck_commitment_responsavel;
ALTER TABLE commitment ADD CONSTRAINT ck_commitment_responsavel CHECK (
  (responsible_mode = 'pessoa' AND responsible_id IS NOT NULL)
  OR (responsible_mode = 'plantao' AND responsible_id IS NULL)
);

-- ============================================================
-- A materialização passa a levar o responsável junto
--
-- Quando há nome, a ocorrência do dia nasce com a atribuição — é ela que faz
-- a atividade aparecer em "Minhas responsabilidades" de quem foi nomeado.
-- Quando é do plantão, ninguém é nomeado: a atividade fica da casa, e quem
-- estiver de serviço a confirma.
-- ============================================================
CREATE OR REPLACE FUNCTION app_generate_commitments(p_house uuid, p_date date DEFAULT NULL)
RETURNS TABLE (criadas integer) AS $$
DECLARE
  v_dia date := coalesce(p_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_n integer := 0;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH previstas AS (
    SELECT * FROM app_commitment_agenda(p_house, v_dia, v_dia)
  ), novas AS (
    INSERT INTO activity (house_id, person_id, commitment_id, kind, title,
                          scheduled_at, ends_at, requires_ack, instructions,
                          state, created_by)
    SELECT p_house, p.person_id, p.commitment_id, p.tipo, p.titulo,
           (p.em + p.hora) AT TIME ZONE 'America/Sao_Paulo',
           CASE WHEN p.duracao IS NOT NULL
                THEN (p.em + p.hora + make_interval(mins => p.duracao))
                     AT TIME ZONE 'America/Sao_Paulo' END,
           c.requires_ack, c.instructions, 'agendada', c.created_by
      FROM previstas p
      JOIN commitment c ON c.id = p.commitment_id
    ON CONFLICT DO NOTHING
    RETURNING id, commitment_id
  ), atribuidas AS (
    INSERT INTO activity_assignment (activity_id, user_id, assigned_by)
    SELECT n.id, c.responsible_id, c.created_by
      FROM novas n
      JOIN commitment c ON c.id = n.commitment_id
     WHERE c.responsible_mode = 'pessoa' AND c.responsible_id IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM novas;

  RETURN QUERY SELECT v_n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_generate_commitments(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_generate_commitments(uuid, date) TO rede_app;

-- ============================================================
-- Quem pode ser nomeado, e quem está de fato na escala do horário
--
-- Devolve a equipe da casa com um sinal: esta pessoa trabalha nesse dia da
-- semana, nesse horário? O sinal serve para a tela AVISAR — "a Joana não está
-- na escala das terças às 14h" — e não para impedir.
-- ============================================================
CREATE OR REPLACE FUNCTION app_staff_for_commitment(
  p_house uuid, p_weekday smallint, p_time time)
RETURNS TABLE (user_id uuid, nome text, cargo text, na_escala boolean) AS $$
  SELECT * FROM (
    SELECT u.id, u.full_name, u.role::text,
           EXISTS (
             SELECT 1 FROM work_schedule w
              WHERE w.user_id = u.id
                AND (w.house_id = p_house OR w.house_id IS NULL)
                AND w.weekday = p_weekday
                AND w.valid_from <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
                AND (w.valid_to IS NULL OR w.valid_to >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
                -- Plantão que cruza a meia-noite conta as duas pontas.
                AND (CASE WHEN w.end_time > w.start_time
                          THEN p_time >= w.start_time AND p_time < w.end_time
                          ELSE p_time >= w.start_time OR p_time < w.end_time
                     END)
           ) AS na_escala
      FROM app_user u
     WHERE u.active
       AND app_house_in_scope(p_house)
       AND (
         -- Equipe com vínculo vigente nesta casa…
         EXISTS (SELECT 1 FROM user_house_assignment a
                  WHERE a.user_id = u.id AND a.house_id = p_house
                    AND a.valid_from <= now() AND (a.valid_to IS NULL OR a.valid_to > now()))
         -- …ou função transversal, que alcança as oito por definição (§5.13).
         OR u.role IN ('enfermagem','lider_noturno_geral','gestor_geral')
       )
       AND u.role <> 'cozinha'   -- a cozinha não acompanha saída nem atividade
  ) equipe
  -- Quem está na escala do horário aparece primeiro; os demais continuam
  -- disponíveis, porque escala muda e troca de plantão existe.
  ORDER BY equipe.na_escala DESC, equipe.full_name
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_staff_for_commitment(uuid, smallint, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_staff_for_commitment(uuid, smallint, time) TO rede_app;
