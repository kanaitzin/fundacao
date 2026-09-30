-- A MEIA HORA ANTES DO FIM DO PLANTÃO (fase 180, pedido de 09/09, decidido em 30/09).
--
-- Meia hora antes de o turno terminar, quem está na escala e ainda não assinou
-- a passagem recebe um aviso, e o líder do turno recebe um só, com os nomes.
-- Decisão de 30/09: a pessoa E o líder.
--
-- A regra do §10.5 vale desde 09/09: o aviso é do TURNO CORRENTE e não acumula
-- por pessoa. Por isso a marca abaixo é do turno (casa, dia, período), e não de
-- quem foi avisado: não existe aqui uma lista de quem costuma deixar a passagem
-- para o fim, e não deve existir em lugar nenhum. O aviso que a pessoa recebe
-- fica na caixa dela, como qualquer outro.
--
-- Quem deve assinar é o que a escala diz (a mesma pergunta de
-- app_missing_handovers): sem escala lançada, ninguém é cobrado, porque a
-- Fundação decidiu que o sistema não deduz a escala.
--
-- Uma vez por turno: a marca entra na mesma consulta que devolve os nomes, e o
-- relógio que roda de dez em dez minutos só avisa na primeira passada dentro da
-- meia hora, nem se rodar duas vezes ao mesmo tempo. O instante é parâmetro
-- (o padrão é agora) para o teste perguntar pela função num dia qualquer, e não
-- pelo relógio de hoje (a lição da fase 168).

CREATE TABLE shift_fim_aviso (
  -- O identificador do TURNO avisado: é a chave do aviso ao líder, que o
  -- escalonamento só repete uma vez por dia e por registro.
  id         uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  house_id   uuid NOT NULL REFERENCES house(id),
  on_date    date NOT NULL,
  period     text NOT NULL CHECK (period IN ('diurno','noturno')),
  avisado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (house_id, on_date, period)
);
ALTER TABLE shift_fim_aviso ENABLE ROW LEVEL SECURITY;
-- Sem política para o app: só a função abaixo escreve e lê.

CREATE OR REPLACE FUNCTION app_plantao_terminando(p_house uuid, p_minutos integer,
                                                  p_agora timestamptz DEFAULT now())
RETURNS TABLE (out_aviso uuid, out_dia date, out_periodo text, out_fim timestamptz,
               out_pessoa uuid, out_nome text, out_cargo text) AS $$
DECLARE
  v_dia date; v_periodo text; v_fim timestamptz; v_turno uuid; v_aviso uuid;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT t.dia, t.periodo INTO v_dia, v_periodo FROM app_turno_de(p_house, p_agora) t;
  SELECT j.ate INTO v_fim FROM app_janela_do_turno(p_house, v_dia, v_periodo) j;
  IF v_fim IS NULL OR p_agora >= v_fim OR p_agora < v_fim - make_interval(mins => p_minutos) THEN
    RETURN;
  END IF;

  INSERT INTO shift_fim_aviso (house_id, on_date, period)
  VALUES (p_house, v_dia, v_periodo)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_aviso;
  IF v_aviso IS NULL THEN RETURN; END IF;

  SELECT s.id INTO v_turno FROM shift s
   WHERE s.house_id = p_house AND s.on_date = v_dia AND s.period = v_periodo;

  RETURN QUERY
  SELECT DISTINCT v_aviso, v_dia, v_periodo, v_fim, u.id, app_user_display_name(u.id), u.role::text
    FROM shift_assignment a
    JOIN app_user u ON u.id = a.user_id AND u.active
   WHERE a.house_id = p_house AND a.on_date = v_dia AND a.period = v_periodo
     AND a.revoked_at IS NULL
     AND u.role IN ('educador','lider_diurno')
     AND NOT EXISTS (SELECT 1 FROM handover h
                      WHERE h.shift_id = v_turno AND h.user_id = u.id);
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_plantao_terminando(uuid, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_plantao_terminando(uuid, integer, timestamptz) TO rede_app;
