-- =========================================================================
-- A ATA ANTERIOR SEM VARRER A HISTÓRIA — 27/09/2026 (fase 167)
--
-- `app_ata_anterior` calculava a janela do turno (`app_janela_do_turno`)
-- para CADA plantão que a casa já teve, duas vezes, para achar o mais
-- recente. Com dois anos de casa são 1 440 plantões, e a tela que a equipe
-- que entra abre primeiro levava 605 ms.
--
-- A troca usa uma propriedade da regra, e ela está escrita para poder ser
-- conferida: os dois turnos de um dia COMEÇAM dentro desse dia. O diurno
-- começa em `diurno_de`, e a `house_shift_hours` exige `diurno_de > 00:00`;
-- o noturno começa em `diurno_ate`, e ela exige `diurno_ate < 23:59`. Daí:
--
--  * plantão de data posterior ao dia de referência ainda não começou;
--  * plantão de data anterior ao dia de referência já começou, e começou
--    antes de qualquer plantão de data mais nova.
--
-- Então o plantão procurado está entre os de HOJE (no máximo dois) e os da
-- data mais recente antes de hoje (no máximo dois): os quatro mais recentes
-- por data bastam, e a janela é calculada só para eles. O índice
-- `idx_shift_house_date` (casa, data decrescente) entrega os quatro direto.
--
-- Se um dia a regra do horário deixar um turno começar noutro dia, esta
-- função tem de ser revista junto. O `o-turno-anterior.e2e.spec.ts`
-- cobra a resposta nos casos de madrugada, de noite e de casa sem plantão.
-- =========================================================================

CREATE OR REPLACE FUNCTION app_ata_anterior(p_house uuid, p_de timestamptz DEFAULT NULL)
RETURNS TABLE(shift_id uuid, ata_id uuid, on_date date, period text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_ref timestamptz := coalesce(p_de, now());
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT c.id, c.ata_id, c.on_date, c.period, c.status
      FROM (SELECT s.id, a.id AS ata_id, s.on_date, s.period, a.status, s.house_id
              FROM shift s
              JOIN ata a ON a.shift_id = s.id
             WHERE s.house_id = p_house
               AND s.on_date <= (v_ref AT TIME ZONE app_fuso())::date
             ORDER BY s.on_date DESC
             LIMIT 4) c
      CROSS JOIN LATERAL app_janela_do_turno(c.house_id, c.on_date, c.period) j
     -- O instante em que o plantão começou, no fuso da instituição (regra 17:
     -- converte-se o PARÂMETRO, e a comparação é de timestamptz).
     WHERE j.de < v_ref
     -- Ordena pelo INSTANTE de início, e não por (data, turno): no mesmo dia,
     -- o noturno começa depois do diurno.
     ORDER BY j.de DESC
     LIMIT 1;
END $$;
