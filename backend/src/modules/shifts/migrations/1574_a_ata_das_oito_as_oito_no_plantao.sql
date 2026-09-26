-- A REGRA NOVA DA ATA NAS FUNÇÕES DO PLANTÃO (fase 157).
--
-- Até aqui estas funções tinham a janela 07h–19h escrita à mão. A regra
-- decidida pela Fundação em 25/09 — diurna 08:00–20:00, noturna 20:01–07:59,
-- da data em que começou — mora em `app_janela_do_turno` e `app_periodo_da_hora`
-- (identity/1573), e é a elas que estas funções passam a perguntar. Só a
-- expressão da janela mudou; o resto de cada função é a versão vigente, copiada.

CREATE OR REPLACE FUNCTION app_doses_do_turno(p_shift uuid)
RETURNS TABLE (
  dose_id uuid, acolhido text, medicamento text, previsto timestamptz,
  estado administration_state, confirmou text, so_enfermagem boolean
) AS $$
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
  SELECT j.de, j.ate INTO v_de, v_ate FROM app_janela_do_turno(v_s.on_date, v_s.period) j;

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
     ORDER BY a.scheduled_at;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_doses_do_turno(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_doses_do_turno(uuid) TO rede_app;

CREATE OR REPLACE FUNCTION app_convivencias_do_turno(p_shift uuid)
RETURNS TABLE (
  id uuid, person_id uuid, acolhido text, com_quem text, vinculo text,
  situacao text, saiu_em timestamptz, retorno_previsto timestamptz,
  voltou_em timestamptz, recebida_por text, como_chegou text, trouxe text,
  atrasado boolean
) AS $$
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
  SELECT j.de, j.ate INTO v_de, v_ate FROM app_janela_do_turno(v_s.on_date, v_s.period) j;

  RETURN QUERY
    -- rls-join-ok: `family_stay` responde à fs_select (casa no alcance) e
    -- `person` à política dela; `person_contact` pertence à pessoa. As três
    -- filtram a linha inteira, e nenhuma delas guarda nome de usuário.
    SELECT f.id, f.person_id,
           coalesce(nullif(p.social_name, ''), p.full_name),
           c.name, c.bond,
           /*
            * A SITUAÇÃO É SOBRE O QUE ACONTECEU NESTE TURNO, e não sobre a
            * criança. Três valores, e a ordem de teste importa: uma saída que
            * começou E terminou dentro do mesmo turno é 'voltou' — o que o
            * turno seguinte precisa saber é que ela está de volta, não que
            * ela saiu.
            */
           CASE
             WHEN f.returned_at IS NOT NULL AND f.returned_at >= v_de
                                            AND f.returned_at < v_ate THEN 'voltou'
             WHEN f.started_at >= v_de AND f.started_at < v_ate      THEN 'saiu'
             ELSE 'fora'
           END,
           f.started_at, f.expected_return_at, f.returned_at,
           app_user_display_name(f.closed_by),
           f.return_note, f.brought_back,
           /* Do RELÓGIO, nunca da criança: a hora passou e o retorno não foi
              registrado. Só faz sentido em quem continua fora. */
           f.returned_at IS NULL AND now() >= f.expected_return_at
      FROM family_stay f
      JOIN person p ON p.id = f.person_id
      JOIN person_contact c ON c.id = f.contact_id
     WHERE f.house_id = v_s.house_id
       AND (
         /* Voltou neste turno. */
         (f.returned_at >= v_de AND f.returned_at < v_ate)
         /* Ou saiu neste turno. */
         OR (f.started_at >= v_de AND f.started_at < v_ate)
         /* Ou atravessa o turno inteiro — saiu antes e não voltou até o fim.
            É o caso dos dias do meio, e o que o turno seguinte mais usa. */
         OR (f.started_at < v_de
             AND (f.returned_at IS NULL OR f.returned_at >= v_ate))
       )
     /* Quem voltou primeiro: é o que a passagem tem de contar. Depois quem
        saiu, e por fim quem segue fora, que é referência e não novidade. */
     ORDER BY CASE
                WHEN f.returned_at IS NOT NULL AND f.returned_at >= v_de
                                               AND f.returned_at < v_ate THEN 0
                WHEN f.started_at >= v_de AND f.started_at < v_ate       THEN 1
                ELSE 2
              END,
              coalesce(f.returned_at, f.started_at);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_convivencias_do_turno(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_convivencias_do_turno(uuid) TO rede_app;

CREATE OR REPLACE FUNCTION app_ata_anterior(p_house uuid, p_de timestamptz DEFAULT NULL)
RETURNS TABLE (shift_id uuid, ata_id uuid, on_date date, period text, status text) AS $$
DECLARE v_ref timestamptz := coalesce(p_de, now());
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT s.id, a.id, s.on_date, s.period, a.status
      FROM shift s
      JOIN ata a ON a.shift_id = s.id
     WHERE s.house_id = p_house
       -- O instante em que o plantão começou, no fuso da instituição (regra 17:
       -- converte-se o PARÂMETRO, e a comparação é de timestamptz).
       AND (SELECT j.de FROM app_janela_do_turno(s.on_date, s.period) j) < v_ref
     -- Ordena pelo INSTANTE de início, e não por (data, turno): no mesmo dia,
     -- o noturno começa depois do diurno, e uma ordenação por texto do turno
     -- devolveria o plantão errado toda noite.
     ORDER BY (SELECT j.de FROM app_janela_do_turno(s.on_date, s.period) j) DESC
     LIMIT 1;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_ata_anterior(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_ata_anterior(uuid, timestamptz) TO rede_app;
