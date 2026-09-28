-- A DOSE DE QUEM NÃO ESTÁ NA CASA (fase 173).
--
-- A simulação de noventa dias da ARM1 mandou a Yasmin passar um fim de semana
-- com a avó. A grade do remédio tirou as doses dela da tela, como manda a 1010:
-- com a família, ninguém da casa dá o remédio. Mas quatro outros lugares
-- continuaram contando essas doses como sem resposta: o aviso de dose
-- atrasada (que repetiu as mesmas três doses todos os dias, por setenta dias),
-- a passagem do turno (que pedia à educadora uma frase sobre uma dose que a
-- tela escondeu), o painel da Enfermagem e o relatório do período.
--
-- A pergunta é a mesma da grade e mora no mesmo lugar: `app_ausente_da_casa`.
-- Só a dose SEM RESPOSTA de quem estava fora deixa de ser cobrada; a que foi
-- dada continua contando, e nada é apagado nem marcado.

-- Versão vigente (1574), copiada do catálogo; só o filtro entrou.

CREATE OR REPLACE FUNCTION public.app_doses_do_turno(p_shift uuid)
 RETURNS TABLE(dose_id uuid, acolhido text, medicamento text, previsto timestamp with time zone, estado administration_state, confirmou text, so_enfermagem boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_s shift%ROWTYPE; v_de timestamptz; v_ate timestamptz;
BEGIN
  SELECT * INTO v_s FROM shift s WHERE s.id = p_shift;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'plantao_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app_house_in_scope(v_s.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A janela da ATA, pela regra de 25/09 (1573): 08:00–20:00 e 20:01–07:59.
  SELECT j.de, j.ate INTO v_de, v_ate FROM app_janela_do_turno(v_s.house_id, v_s.on_date, v_s.period) j;

  RETURN QUERY
    -- rls-join-ok: `medication_administration` e `prescription` respondem às
    -- políticas de casa e de pessoa, e `person` à dela — as três filtram a
    -- linha inteira. O nome de QUEM CONFIRMOU sai por app_user_display_name, e
    -- nunca por junção com app_user, que tem RLS de linha (regra 10): com
    -- JOIN sumiria a dose, com LEFT JOIN sumiria o nome de quem a deu.
    SELECT a.id, person_display_name(pe), pr.medication, a.scheduled_at, a.state,
           app_user_display_name(a.administered_by), coalesce(pr.nurse_only, false)
      FROM medication_administration a
      JOIN prescription pr ON pr.id = a.prescription_id
      JOIN person pe ON pe.id = a.person_id
     WHERE a.house_id = v_s.house_id
       AND a.scheduled_at >= v_de
       AND a.scheduled_at <  v_ate
       /* A dose sem resposta de quem não está na casa não é do turno (fase 173). */
       AND NOT (a.state = 'aguardando_confirmacao'
                AND app_ausente_da_casa(a.person_id, (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date))
     ORDER BY a.scheduled_at;
END $function$;
