-- ============================================================
-- 0980 — Desmarcar UMA vez, e o caminho até o lugar
--
-- Duas coisas que a agenda não sabia fazer, e que a casa faz toda semana.
--
-- 1. DESMARCAR UMA OCORRÊNCIA.
--    O acompanhamento da Ana com a psicóloga é toda quarta. Numa quarta a
--    psicóloga desmarcou. Hoje o sistema só sabe cancelar o COMPROMISSO
--    INTEIRO — e cancelar a série porque uma semana caiu apaga um combinado
--    que continua valendo.
--
--    A exceção é por DATA, guarda o motivo e o autor, e **não some da tela**:
--    a agenda continua mostrando a quarta-feira, marcada como desmarcada, com
--    o motivo ao lado. Sumir seria pior do que não ter desmarcado — quem abre
--    a agenda da semana precisa saber que o atendimento estava previsto e não
--    aconteceu, senão a ausência vira esquecimento no mês seguinte.
--
--    Desfazer a exceção é possível e também fica registrado. Nada se apaga.
--
-- 2. A HORA DE SAIR, A HORA DE CHEGAR, E O ENDEREÇO.
--    `time_of_day` sempre foi a hora do compromisso — a consulta às 14h. Quem
--    leva a criança precisa de outra: a hora de SAIR da casa. Entre as duas
--    cabe o trânsito de Porto Alegre, e é essa a hora que o educador olha.
--    O endereço vinha em `place`, que é o nome do lugar ("UBS Bom Jesus"), e
--    nome de lugar não se digita no aplicativo do ônibus.
-- ============================================================

-- ---------- 2. O caminho ----------
ALTER TABLE commitment ADD COLUMN IF NOT EXISTS leave_time time;
ALTER TABLE commitment ADD COLUMN IF NOT EXISTS address   text;

COMMENT ON COLUMN commitment.leave_time IS
  'Hora de SAIR da casa. time_of_day é a hora de ESTAR no local.';
COMMENT ON COLUMN commitment.address IS
  'Endereço para chegar. place é o nome do lugar.';

-- Sair depois de ter de chegar é engano de digitação, e o engano custa a
-- consulta. Recusamos — mas só quando as duas existem.
ALTER TABLE commitment DROP CONSTRAINT IF EXISTS ck_commitment_saida_antes;
ALTER TABLE commitment ADD CONSTRAINT ck_commitment_saida_antes
  CHECK (leave_time IS NULL OR leave_time <= time_of_day);

-- ---------- 1. A exceção de uma data ----------
CREATE TABLE IF NOT EXISTS commitment_exception (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id uuid NOT NULL REFERENCES commitment(id) ON DELETE CASCADE,
  house_id      uuid NOT NULL REFERENCES house(id),
  on_date       date NOT NULL,
  reason        text NOT NULL CHECK (length(btrim(reason)) >= 5),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL REFERENCES app_user(id),
  -- Desfazer não apaga a linha: encerra-a, com autor e horário.
  undone_at     timestamptz,
  undone_by     uuid REFERENCES app_user(id)
);

-- Uma exceção VIGENTE por data. Desfeita e remarcada de novo é linha nova, e
-- as duas ficam no histórico.
CREATE UNIQUE INDEX IF NOT EXISTS ux_commitment_exception_vigente
  ON commitment_exception (commitment_id, on_date) WHERE undone_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_commitment_exception_casa
  ON commitment_exception (house_id, on_date);

ALTER TABLE commitment_exception ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_select ON commitment_exception FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
-- Escrita só pelas funções abaixo, que conferem cargo e escopo.
CREATE POLICY ce_insert ON commitment_exception FOR INSERT TO rede_app
  WITH CHECK (false);

GRANT SELECT ON commitment_exception TO rede_app;

-- ============================================================
-- Desmarcar uma data
--
-- Quem: equipe técnica e coordenação — foi a decisão do Marcelo em 09/09.
-- O líder e a enfermagem cancelam a SÉRIE (app_cancel_commitment) mas não
-- desmarcam uma semana: desmarcar um atendimento é reorganizar o plano da
-- criança, e isso é da técnica.
-- ============================================================
CREATE OR REPLACE FUNCTION app_desmarcar_ocorrencia(
  p_commitment uuid, p_data date, p_motivo text)
RETURNS TABLE (desmarcada boolean, atividade_cancelada boolean) AS $$
DECLARE c record; v_ativ boolean := false;
BEGIN
  SELECT * INTO c FROM commitment WHERE id = p_commitment;
  IF c IS NULL THEN
    RAISE EXCEPTION 'compromisso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(c.house_id)
     OR app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_desmarcar' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 5 THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'check_violation';
  END IF;
  -- Desmarcar ontem não desfaz o que já foi vivido. O que passou se corrige
  -- na atividade, com o autor de quem corrigiu.
  IF p_data < app_hoje() THEN
    RAISE EXCEPTION 'data_no_passado' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO commitment_exception (commitment_id, house_id, on_date, reason, created_by)
  VALUES (p_commitment, c.house_id, p_data, btrim(p_motivo), app_current_user())
  ON CONFLICT DO NOTHING;

  -- Se o dia já foi materializado, a atividade sai da lista do turno como
  -- CANCELADA — nunca apagada, e nunca se já foi confirmada: o que aconteceu
  -- aconteceu.
  UPDATE activity
     SET state = 'cancelada_externamente',
         exception_note = 'Desmarcado: ' || btrim(p_motivo)
   WHERE commitment_id = p_commitment
     AND state = 'agendada'
     AND (scheduled_at AT TIME ZONE app_fuso())::date = p_data;
  GET DIAGNOSTICS v_ativ = ROW_COUNT;

  RETURN QUERY SELECT true, v_ativ;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_desmarcar_ocorrencia(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_desmarcar_ocorrencia(uuid, date, text) TO rede_app;

-- ============================================================
-- Desfazer o desmarque — a psicóloga remarcou para a mesma quarta.
-- ============================================================
CREATE OR REPLACE FUNCTION app_remarcar_ocorrencia(p_commitment uuid, p_data date)
RETURNS TABLE (remarcada boolean) AS $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM commitment WHERE id = p_commitment;
  IF c IS NULL THEN
    RAISE EXCEPTION 'compromisso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(c.house_id)
     OR app_current_role() NOT IN ('equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_desmarcar' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE commitment_exception
     SET undone_at = now(), undone_by = app_current_user()
   WHERE commitment_id = p_commitment AND on_date = p_data AND undone_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_estava_desmarcado' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE activity
     SET state = 'agendada', exception_note = NULL
   WHERE commitment_id = p_commitment
     AND state = 'cancelada_externamente'
     AND (scheduled_at AT TIME ZONE app_fuso())::date = p_data;

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_remarcar_ocorrencia(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_remarcar_ocorrencia(uuid, date) TO rede_app;

-- ============================================================
-- A agenda passa a devolver o desmarcado — VISÍVEL, não ausente.
-- ============================================================
DROP FUNCTION IF EXISTS app_commitment_agenda(uuid, date, date);
CREATE FUNCTION app_commitment_agenda(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (commitment_id uuid, em date, hora time, duracao integer,
               tipo text, titulo text, local text, person_id uuid,
               coletivo boolean, recorrencia text, indeterminado boolean,
               hora_saida time, endereco text,
               desmarcada boolean, motivo_desmarque text) AS $$
  SELECT c.id, d::date, c.time_of_day, c.duration_min, c.kind, c.title, c.place,
         c.person_id, c.person_id IS NULL, c.recurrence, c.end_date IS NULL,
         c.leave_time, c.address,
         x.id IS NOT NULL, x.reason
    FROM commitment c
    CROSS JOIN LATERAL generate_series(
      greatest(c.start_date, p_de),
      least(coalesce(c.end_date, p_ate), p_ate),
      interval '1 day') AS d
    LEFT JOIN commitment_exception x
           ON x.commitment_id = c.id AND x.on_date = d::date AND x.undone_at IS NULL
   WHERE c.active
     AND c.house_id = p_house
     AND app_house_in_scope(p_house)
     AND CASE c.recurrence
           WHEN 'unica'     THEN d::date = c.start_date
           WHEN 'diaria'    THEN true
           WHEN 'semanal'   THEN EXTRACT(dow FROM d)::smallint = ANY (c.weekdays)
           WHEN 'quinzenal' THEN EXTRACT(dow FROM d)::smallint = ANY (c.weekdays)
                                 AND (floor((d::date - c.start_date) / 7)::int % 2) = 0
           WHEN 'mensal'    THEN EXTRACT(day FROM d) = EXTRACT(day FROM c.start_date)
           ELSE false
         END
   ORDER BY d, coalesce(c.leave_time, c.time_of_day)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_commitment_agenda(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_commitment_agenda(uuid, date, date) TO rede_app;

-- ============================================================
-- A materialização do dia PULA o que está desmarcado.
--
-- Só esta parte muda: o resto da função continua como estava. A agenda mostra
-- a ocorrência desmarcada; a lista do turno não a cria, porque ninguém tem de
-- levar a Ana a lugar nenhum naquela quarta.
-- ============================================================
CREATE OR REPLACE FUNCTION app_generate_commitments(p_house uuid, p_date date DEFAULT NULL)
RETURNS TABLE (criadas integer) AS $$
DECLARE
  v_dia date := coalesce(p_date, app_hoje());
  v_n integer := 0;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH previstas AS (
    SELECT * FROM app_commitment_agenda(p_house, v_dia, v_dia)
     WHERE NOT desmarcada
  ), novas AS (
    INSERT INTO activity (house_id, person_id, commitment_id, kind, title,
                          scheduled_at, ends_at, requires_ack, instructions,
                          state, created_by)
    SELECT p_house, p.person_id, p.commitment_id, p.tipo, p.titulo,
           (p.em + p.hora) AT TIME ZONE app_fuso(),
           CASE WHEN p.duracao IS NOT NULL
                THEN (p.em + p.hora + make_interval(mins => p.duracao))
                     AT TIME ZONE app_fuso() END,
           c.requires_ack, c.instructions, 'agendada', c.created_by
      FROM previstas p
      JOIN commitment c ON c.id = p.commitment_id
    ON CONFLICT DO NOTHING
    RETURNING id, commitment_id
  ), atribuidas AS (
    -- Vem da 0580 e PRECISA continuar aqui: o compromisso com responsável
    -- nomeado atribui a atividade a ele. Reescrever esta função a partir da
    -- 0570 teria apagado isto sem que nada quebrasse.
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
