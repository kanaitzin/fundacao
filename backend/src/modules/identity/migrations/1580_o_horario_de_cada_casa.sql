-- O HORÁRIO DE CADA CASA (fase 159).
--
-- PEDIDO DA FUNDAÇÃO, 26/09/2026: *"deixe o coordenador, educador líder, equipe
-- técnica mudar de qual horário a qual horário fica o turno da manhã e da
-- noite […] quando alterarem, o dia seguinte já sai no novo horário […] fica
-- mais fácil para organizar na realidade de cada casa."*
--
-- A 1573 pôs a regra da ATA num lugar só, com o padrão decidido em 25/09
-- (diurna 08:00–20:00, noturna 20:01–07:59). Esta migração faz esse lugar só
-- perguntar PELA CASA: cada casa pode ter o seu horário, e quem não configurou
-- nada continua no padrão.
--
-- COMO A CASA DIZ O HORÁRIO: "o diurno vai das HH:MM às HH:MM". O noturno é o
-- RESTO do dia — começa um minuto depois do fim do diurno e vai até o minuto
-- antes do diurno seguinte. Dizer só o diurno é o que impede buraco e
-- sobreposição: não existe hora que não seja de turno nenhum, nem hora que
-- seja dos dois.
--
-- QUANDO VALE: A PARTIR DO DIA SEGUINTE, nunca antes. A ATA que já passou
-- guarda a janela que tinha — mudar o horário hoje não reescreve a noite de
-- ontem, que é a regra de nunca sobrescrever registro fechado. E a noite de
-- HOJE termina no início do diurno de AMANHÃ, já no horário novo: se a casa
-- antecipa o diurno de 08:00 para 07:00, a noturna de hoje acaba às 06:59, e
-- nenhum minuto fica sem turno.
--
-- QUEM MUDA: coordenação, Líder Diurno e equipe técnica DA CASA — os três
-- cargos que o pedido nomeou, e os mesmos que montam a escala. O Gestor Geral
-- não foi nomeado e não entra; se a Fundação quiser, é uma linha.
--
-- NADA SE APAGA: cada mudança é uma linha nova, com quem mudou, quando e o
-- motivo (opcional). Duas mudanças no mesmo dia para o mesmo "amanhã": vale a
-- mais recente, e a outra fica no histórico.

CREATE TABLE IF NOT EXISTS house_shift_hours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id    uuid NOT NULL REFERENCES house(id),
  -- O diurno, por minuto: de `diurno_de` até `diurno_ate`, os dois inclusive.
  diurno_de   time NOT NULL,
  diurno_ate  time NOT NULL,
  -- A partir de que DIA vale. Sempre o dia seguinte ao da mudança.
  valid_from  date NOT NULL,
  reason      text,
  set_by      uuid NOT NULL REFERENCES app_user(id),
  set_at      timestamptz NOT NULL DEFAULT now(),
  -- Minuto cheio: a pessoa lê o relógio por minuto, e a fronteira também.
  CHECK (date_trunc('minute', diurno_de::interval) = diurno_de::interval),
  CHECK (date_trunc('minute', diurno_ate::interval) = diurno_ate::interval),
  -- Os dois turnos existem: o diurno não começa à meia-noite nem vai até
  -- 23:59 (o noturno precisa de pelo menos um minuto antes e depois).
  CHECK (diurno_de > TIME '00:00' AND diurno_de < diurno_ate AND diurno_ate < TIME '23:59')
);
CREATE INDEX IF NOT EXISTS idx_horario_da_casa
  ON house_shift_hours (house_id, valid_from DESC, set_at DESC);

ALTER TABLE house_shift_hours ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON house_shift_hours TO rede_app;
DROP POLICY IF EXISTS hsh_select ON house_shift_hours;
CREATE POLICY hsh_select ON house_shift_hours FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));
-- Sem política de escrita: só o comando abaixo grava, e nada apaga.

-- ------------------------------------------------------------
-- O horário que vale para uma casa num dia.
-- ------------------------------------------------------------
-- SECURITY DEFINER porque a regra do turno é chamada por dentro de outras
-- funções e por quem registra uma dose ou abre um plantão — o horário da casa
-- não é dado sensível, e a resposta de "que turno é agora" não pode depender
-- de quem pergunta.
CREATE OR REPLACE FUNCTION app_horario_da_casa(p_house uuid, p_dia date)
RETURNS TABLE (diurno_de time, diurno_ate time, vigente_desde date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(h.diurno_de, app_inicio_do_diurno()),
         coalesce(h.diurno_ate, app_inicio_do_noturno() - interval '1 minute'),
         h.valid_from
    FROM (SELECT 1) um
    LEFT JOIN LATERAL (
      SELECT x.diurno_de, x.diurno_ate, x.valid_from FROM house_shift_hours x
       WHERE x.house_id = p_house AND x.valid_from <= p_dia
       ORDER BY x.valid_from DESC, x.set_at DESC LIMIT 1) h ON true
$$;
REVOKE ALL ON FUNCTION app_horario_da_casa(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_horario_da_casa(uuid, date) TO rede_app;

-- O PADRÃO DA FUNDAÇÃO continua em `app_inicio_do_diurno()` e
-- `app_inicio_do_noturno()` (1573), sem argumento: é o horário de quem não
-- configurou nada. As versões COM casa e dia são as que as regras usam.
CREATE OR REPLACE FUNCTION app_inicio_do_diurno(p_house uuid, p_dia date) RETURNS time
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT h.diurno_de FROM app_horario_da_casa(p_house, p_dia) h $$;

CREATE OR REPLACE FUNCTION app_inicio_do_noturno(p_house uuid, p_dia date) RETURNS time
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT (h.diurno_ate + interval '1 minute')::time FROM app_horario_da_casa(p_house, p_dia) h $$;

-- ------------------------------------------------------------
-- A regra da 1573, agora pela casa. As versões sem casa SAEM: uma função que
-- esquecesse de passar a casa responderia o padrão em silêncio, e a casa que
-- mudou o horário teria uma tela dizendo uma coisa e a ATA outra. Sem a versão
-- velha, o esquecimento vira erro — e `a-ata-das-oito-as-oito.e2e.spec.ts`
-- pergunta ao catálogo se sobrou alguma chamada sem a casa.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS app_periodo_da_hora(time);
DROP FUNCTION IF EXISTS app_turno_de(timestamptz);
DROP FUNCTION IF EXISTS app_janela_do_turno(date, text);

-- O turno de uma hora do relógio, numa casa, num dia.
CREATE OR REPLACE FUNCTION app_periodo_da_hora(p_house uuid, p_dia date, p_hora time)
RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE WHEN p_hora >= app_inicio_do_diurno(p_house, p_dia)
               AND p_hora <  app_inicio_do_noturno(p_house, p_dia)
              THEN 'diurno' ELSE 'noturno' END
$$;

-- De que ATA é um INSTANTE, numa casa.
CREATE OR REPLACE FUNCTION app_turno_de(p_house uuid, p_instante timestamptz)
RETURNS TABLE (dia date, periodo text)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH l AS (SELECT (p_instante AT TIME ZONE app_fuso()) AS t)
  SELECT CASE WHEN t::time < app_inicio_do_diurno(p_house, t::date) THEN t::date - 1
              ELSE t::date END,
         CASE WHEN t::time < app_inicio_do_diurno(p_house, t::date) THEN 'noturno'
              WHEN t::time < app_inicio_do_noturno(p_house, t::date) THEN 'diurno'
              ELSE 'noturno' END
    FROM l
$$;

-- A janela de uma ATA da casa, em instantes: [de, ate). A noturna do dia D
-- acaba no início do diurno do dia D+1, com o horário que vale em D+1.
CREATE OR REPLACE FUNCTION app_janela_do_turno(p_house uuid, p_dia date, p_periodo text)
RETURNS TABLE (de timestamptz, ate timestamptz)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE WHEN p_periodo = 'diurno'
              THEN (p_dia + app_inicio_do_diurno(p_house, p_dia)) AT TIME ZONE app_fuso()
              ELSE (p_dia + app_inicio_do_noturno(p_house, p_dia)) AT TIME ZONE app_fuso() END,
         CASE WHEN p_periodo = 'diurno'
              THEN (p_dia + app_inicio_do_noturno(p_house, p_dia)) AT TIME ZONE app_fuso()
              ELSE ((p_dia + 1) + app_inicio_do_diurno(p_house, p_dia + 1)) AT TIME ZONE app_fuso() END
$$;

GRANT EXECUTE ON FUNCTION app_inicio_do_diurno(uuid, date), app_inicio_do_noturno(uuid, date),
  app_periodo_da_hora(uuid, date, time), app_turno_de(uuid, timestamptz),
  app_janela_do_turno(uuid, date, text) TO rede_app;

-- ------------------------------------------------------------
-- O comando de mudar.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_definir_horario_da_casa(
  p_house uuid, p_de time, p_ate time, p_motivo text)
RETURNS TABLE (vigente_desde date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_me uuid; v_role role_code; v_desde date;
BEGIN
  v_me := app_current_user();
  v_role := app_current_role();
  IF v_role NOT IN ('coordenador', 'lider_diurno', 'equipe_tecnica') THEN
    RAISE EXCEPTION 'sem_permissao_horario' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL
     OR date_trunc('minute', p_de::interval) <> p_de::interval
     OR date_trunc('minute', p_ate::interval) <> p_ate::interval
     OR NOT (p_de > TIME '00:00' AND p_de < p_ate AND p_ate < TIME '23:59') THEN
    RAISE EXCEPTION 'horario_invalido';
  END IF;

  -- A PARTIR DE AMANHÃ, no dia da instituição (`app_hoje`, nunca current_date).
  v_desde := app_hoje() + 1;
  INSERT INTO house_shift_hours (house_id, diurno_de, diurno_ate, valid_from, reason, set_by)
  VALUES (p_house, p_de, p_ate, v_desde, nullif(btrim(coalesce(p_motivo, '')), ''), v_me);

  INSERT INTO audit_event (actor_id, house_id, action, entity, entity_id, detail)
  VALUES (v_me, p_house, 'house.shift_hours', 'house', p_house,
          jsonb_build_object('diurno_de', to_char(p_de, 'HH24:MI'),
                             'diurno_ate', to_char(p_ate, 'HH24:MI'),
                             'vigente_desde', v_desde));
  RETURN QUERY SELECT v_desde;
END $$;
REVOKE ALL ON FUNCTION app_definir_horario_da_casa(uuid, time, time, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_definir_horario_da_casa(uuid, time, time, text) TO rede_app;
