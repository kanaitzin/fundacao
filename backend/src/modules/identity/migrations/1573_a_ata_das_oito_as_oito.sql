-- A ATA DAS OITO ÀS OITO (fase 157).
--
-- DECISÃO DA FUNDAÇÃO, 25/09/2026, e ela substitui a hipótese 7h–19h que o
-- sistema usava desde o começo (pendência institucional #4):
--
--   * ATA DIURNA  — das 08:00 às 20:00 do mesmo dia;
--   * ATA NOTURNA — das 20:01 às 07:59 do dia seguinte, e ela PERTENCE AO DIA
--                   EM QUE COMEÇOU. A madrugada do dia 12 é da ATA Noturna 11.
--
-- Às 08:00 do dia 12 começa a ATA Diurna 12. Não existe "ATA Noturna 12" por
-- causa da madrugada: a noturna 12 começa às 20:01 do dia 12.
--
-- A FRONTEIRA É POR MINUTO, como a pessoa lê o relógio: 20:00 ainda é diurno
-- (inclusive 20:00:59); 20:01 já é noturno; 07:59 ainda é noturno; 08:00 é
-- diurno. Em intervalo meio-aberto: diurno = [08:00, 20:01), noturno =
-- [20:01, 08:00 do dia seguinte).
--
-- UM LUGAR SÓ. Até aqui a janela 07h–19h estava escrita à mão em cinco funções
-- de três partições, no serviço (`tempo.ts`), na tela da passagem e na folha da
-- escala — e trocar a regra era caçar cópias. Agora quem quer saber "de que
-- ATA é este instante" pergunta a `app_turno_de`, e quem quer a janela de uma
-- ATA pergunta a `app_janela_do_turno`. Os dois horários moram em
-- `app_inicio_do_diurno()` e `app_inicio_do_noturno()`: se a Fundação mudar a
-- regra de novo, é aqui, e o `tempo.ts` tem um teste que o obriga a concordar.
--
-- O FUSO é o da instituição (`app_fuso()`), nunca o do servidor nem o do
-- aparelho: o registro feito offline às 02h e sincronizado às 09h pertence à
-- ATA Noturna do dia anterior, porque o instante que conta é o do ACONTECIMENTO.

CREATE OR REPLACE FUNCTION app_inicio_do_diurno() RETURNS time
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT TIME '08:00' $$;

CREATE OR REPLACE FUNCTION app_inicio_do_noturno() RETURNS time
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT TIME '20:01' $$;

-- O turno de uma HORA do relógio (sem data): para o compromisso marcado às
-- 14h, para a dose das 22h. `diurno` se 08:00 <= hora < 20:01.
CREATE OR REPLACE FUNCTION app_periodo_da_hora(p_hora time) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE WHEN p_hora >= app_inicio_do_diurno() AND p_hora < app_inicio_do_noturno()
              THEN 'diurno' ELSE 'noturno' END
$$;

-- De que ATA é um INSTANTE: o dia operacional e o turno.
CREATE OR REPLACE FUNCTION app_turno_de(p_instante timestamptz)
RETURNS TABLE (dia date, periodo text)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH l AS (SELECT (p_instante AT TIME ZONE app_fuso()) AS t)
  SELECT CASE WHEN t::time < app_inicio_do_diurno() THEN t::date - 1 ELSE t::date END,
         app_periodo_da_hora(t::time)
    FROM l
$$;

-- A janela de uma ATA, em instantes: [de, ate).
CREATE OR REPLACE FUNCTION app_janela_do_turno(p_dia date, p_periodo text)
RETURNS TABLE (de timestamptz, ate timestamptz)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE WHEN p_periodo = 'diurno'
              THEN (p_dia + app_inicio_do_diurno()) AT TIME ZONE app_fuso()
              ELSE (p_dia + app_inicio_do_noturno()) AT TIME ZONE app_fuso() END,
         CASE WHEN p_periodo = 'diurno'
              THEN (p_dia + app_inicio_do_noturno()) AT TIME ZONE app_fuso()
              ELSE ((p_dia + 1) + app_inicio_do_diurno()) AT TIME ZONE app_fuso() END
$$;

GRANT EXECUTE ON FUNCTION app_inicio_do_diurno(), app_inicio_do_noturno(),
  app_periodo_da_hora(time), app_turno_de(timestamptz), app_janela_do_turno(date, text)
  TO rede_app;
