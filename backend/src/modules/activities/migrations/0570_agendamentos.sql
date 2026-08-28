-- ============================================================
-- Rede Acolher — Migração 057: agendamentos da linha do tempo
--
-- Pedido da Fundação (28/08/2026): o Líder Diurno, a equipe técnica e a
-- coordenação precisam marcar na linha do tempo — uma atividade para um
-- acolhido ou para a casa inteira, com data e hora certas, semanas à frente,
-- e com prazo que pode ser INDETERMINADO quando o tratamento não tem data
-- para acabar. É o que a Enfermagem já faz com a prescrição contínua.
--
-- Duas decisões de desenho que valem a explicação:
--
-- **1. Compromisso e ocorrência são coisas diferentes.**
-- O compromisso é a regra ("fono toda terça às 14h, por tempo
-- indeterminado"). A ocorrência é o dia — a linha da agenda que alguém
-- confirma ou justifica. Guardar só a regra e PROJETAR o futuro evita criar
-- milhares de linhas para um tratamento sem data de fim; materializar apenas
-- o dia corrente mantém a confirmação, a exceção e o offline funcionando como
-- já funcionam.
--
-- Consequência prática: mudar o horário da fono não reescreve o passado. Os
-- dias já vividos continuam com o horário que tiveram, e a mudança vale da
-- data em diante.
--
-- **2. Prazo indeterminado exige uma frase.**
-- Marcar "todos os dias, sem data de fim" é o que um tratamento contínuo pede
-- — e é também a forma mais fácil de a agenda encher de compromisso que
-- ninguém revisa mais. Então o sem-prazo é permitido e pede o motivo, que
-- aparece na tela de quem for revisar depois. Não é burocracia: é a diferença
-- entre "indeterminado porque o laudo é contínuo" e "indeterminado porque
-- ninguém sabia o que colocar".
-- ============================================================

CREATE TABLE commitment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id     uuid NOT NULL REFERENCES house(id),
  -- Nulo = compromisso COLETIVO, da casa inteira.
  person_id    uuid REFERENCES person(id),
  kind         text NOT NULL CHECK (kind IN (
                 'atividade','saude','escola','curso','visita','tratamento',
                 'documentacao','lazer','outro')),
  title        text NOT NULL,
  place        text,
  instructions text,
  -- Quando acontece
  start_date   date NOT NULL,
  time_of_day  time NOT NULL,
  duration_min integer CHECK (duration_min IS NULL OR duration_min BETWEEN 5 AND 720),
  recurrence   text NOT NULL DEFAULT 'unica'
               CHECK (recurrence IN ('unica','diaria','semanal','quinzenal','mensal')),
  weekdays     smallint[] NOT NULL DEFAULT '{}',   -- 0=domingo … 6=sábado
  -- Até quando: data OU indeterminado com motivo.
  end_date     date,
  open_ended_reason text,
  requires_ack boolean NOT NULL DEFAULT true,
  -- Vida do compromisso
  active       boolean NOT NULL DEFAULT true,
  canceled_at  timestamptz,
  canceled_by  uuid REFERENCES app_user(id),
  cancel_reason text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL REFERENCES app_user(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES app_user(id),

  -- Uma vez é uma vez: começa e termina no mesmo dia.
  CONSTRAINT ck_commitment_unica
    CHECK (recurrence <> 'unica' OR end_date = start_date),
  -- Semanal e quinzenal precisam saber em que dias.
  CONSTRAINT ck_commitment_semanal
    CHECK (recurrence NOT IN ('semanal','quinzenal') OR array_length(weekdays, 1) >= 1),
  -- Sem data de fim, com motivo escrito.
  CONSTRAINT ck_commitment_indeterminado
    CHECK (end_date IS NOT NULL OR coalesce(length(btrim(open_ended_reason)), 0) >= 10),
  CONSTRAINT ck_commitment_periodo
    CHECK (end_date IS NULL OR end_date >= start_date),
  -- Cancelar exige motivo: some da agenda, não do histórico.
  CONSTRAINT ck_commitment_cancelamento
    CHECK (active OR coalesce(length(btrim(cancel_reason)), 0) >= 5)
);
CREATE INDEX idx_commitment_casa ON commitment (house_id, start_date) WHERE active;
CREATE INDEX idx_commitment_pessoa ON commitment (person_id) WHERE active AND person_id IS NOT NULL;

-- A ocorrência do dia continua sendo `activity`: mesma tela, mesma
-- confirmação, mesmo offline. O vínculo permite não duplicar.
ALTER TABLE activity ADD COLUMN IF NOT EXISTS commitment_id uuid REFERENCES commitment(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_compromisso_dia
  ON activity (commitment_id, ((scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date))
  WHERE commitment_id IS NOT NULL;

ALTER TABLE commitment ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON commitment TO rede_app;

-- Quem cuida enxerga a agenda da casa; quem marca é um grupo menor.
CREATE POLICY comm_select ON commitment FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));

CREATE POLICY comm_insert ON commitment FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id)
              AND created_by = app_current_user()
              AND app_current_role() IN ('lider_diurno','equipe_tecnica','coordenador',
                                         'gestor_geral','enfermagem'));

CREATE POLICY comm_update ON commitment FOR UPDATE TO rede_app
  USING (app_house_in_scope(house_id)
         AND app_current_role() IN ('lider_diurno','equipe_tecnica','coordenador',
                                    'gestor_geral','enfermagem'))
  WITH CHECK (app_house_in_scope(house_id));

-- Sem DELETE: compromisso encerrado é cancelado com motivo, e o que já
-- aconteceu continua na linha do tempo.

-- ============================================================
-- Projeção: a agenda de um período, sem materializar nada
--
-- Devolve as datas em que cada compromisso cai entre `de` e `ate`. É o que
-- permite marcar a consulta de outubro hoje e vê-la lá, sem criar sessenta
-- linhas de atividade que ninguém pediu.
-- ============================================================
CREATE OR REPLACE FUNCTION app_commitment_agenda(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (commitment_id uuid, em date, hora time, duracao integer,
               tipo text, titulo text, local text, person_id uuid,
               coletivo boolean, recorrencia text, indeterminado boolean) AS $$
  SELECT c.id, d::date, c.time_of_day, c.duration_min, c.kind, c.title, c.place,
         c.person_id, c.person_id IS NULL, c.recurrence, c.end_date IS NULL
    FROM commitment c
    CROSS JOIN LATERAL generate_series(
      greatest(c.start_date, p_de),
      least(coalesce(c.end_date, p_ate), p_ate),
      interval '1 day') AS d
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
   ORDER BY d, c.time_of_day
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_commitment_agenda(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_commitment_agenda(uuid, date, date) TO rede_app;

-- ============================================================
-- Materialização do dia
--
-- Idempotente pelo índice único: rodar duas vezes no mesmo dia não duplica,
-- e a atividade já confirmada não é tocada.
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
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM novas;

  RETURN QUERY SELECT v_n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_generate_commitments(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_generate_commitments(uuid, date) TO rede_app;

-- ============================================================
-- Cancelar um compromisso
--
-- Não apaga: desativa com motivo. O que já aconteceu continua na linha do
-- tempo, e as ocorrências FUTURAS ainda não materializadas simplesmente
-- deixam de ser projetadas.
-- ============================================================
CREATE OR REPLACE FUNCTION app_cancel_commitment(p_commitment uuid, p_motivo text)
RETURNS TABLE (cancelado boolean, futuras_removidas integer) AS $$
DECLARE c record; v_n integer := 0;
BEGIN
  SELECT * INTO c FROM commitment WHERE id = p_commitment FOR UPDATE;
  IF c IS NULL THEN
    RAISE EXCEPTION 'compromisso_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(c.house_id)
     OR app_current_role() NOT IN ('lider_diurno','equipe_tecnica','coordenador',
                                   'gestor_geral','enfermagem') THEN
    RAISE EXCEPTION 'sem_permissao_cancelar' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 5 THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE commitment
     SET active = false, canceled_at = now(), canceled_by = app_current_user(),
         cancel_reason = btrim(p_motivo), updated_at = now(), updated_by = app_current_user()
   WHERE id = p_commitment;

  -- Ocorrências futuras já materializadas e ainda não confirmadas saem da
  -- agenda como CANCELADAS — nunca apagadas, e nunca as de hoje para trás.
  UPDATE activity
     SET state = 'cancelada_externamente',
         exception_note = 'Compromisso cancelado: ' || btrim(p_motivo)
   WHERE commitment_id = p_commitment
     AND state = 'agendada'
     AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date
         > (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN QUERY SELECT true, v_n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_cancel_commitment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cancel_commitment(uuid, text) TO rede_app;
