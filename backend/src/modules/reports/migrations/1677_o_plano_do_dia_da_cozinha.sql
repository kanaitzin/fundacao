-- O PLANO DO DIA DA COZINHA (fase 286, primeira avaliação humana de 05/11, módulo 13:
-- a Cozinha em resumo por refeição; decidido em 06/11: o plano do dia no alto e os
-- números do período em cartões por refeição).
--
-- Quem cozinha precisa saber, antes de cozinhar: quais refeições a casa serve hoje e
-- em que hora (as chamadas de alimentação da casa, fase 211), quantas crianças estão
-- em casa (as internadas e as que estão com a família não comem aqui; a regra mora no
-- `app_ausente_da_casa`, 1470), o que não servir a quem está em casa (as restrições
-- ativas, sem o motivo clínico, como a folha da 1030), e, se a chamada da refeição já
-- foi feita hoje (com alguma criança marcada; aberta e vazia ainda não diz nada), como foi. Nenhum número de uma criança: as restrições vão por nome,
-- como na folha que a cozinha já recebe, e o resto é da casa.
--
-- Mora em `reports`, que já lê as chamadas e as pessoas (como o `app_refeicoes_da_casa`,
-- 1611): a cozinha não passa a depender das chamadas. Os lanches e as cestas pedidos para o
-- dia vêm junto, pelo `app_pedidos_da_cozinha` (1030).
--
-- SECURITY DEFINER para ler as tabelas por uma porta só, e por isso confere o
-- alcance antes de tudo: casa de fora devolve NULL, e o serviço responde 404.

CREATE OR REPLACE FUNCTION app_plano_da_cozinha(p_house uuid, p_dia date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_em_casa uuid[]; v_fora integer; v_refeicoes jsonb; v_restricoes jsonb; v_pedidos jsonb;
BEGIN
  IF p_house IS NULL OR NOT app_house_in_scope(p_house) THEN RETURN NULL; END IF;

  SELECT coalesce(array_agg(s.person_id) FILTER (WHERE NOT app_ausente_da_casa(s.person_id, p_dia)), '{}'),
         count(*) FILTER (WHERE app_ausente_da_casa(s.person_id, p_dia))::int
    INTO v_em_casa, v_fora
    FROM house_stay s
   WHERE s.house_id = p_house AND s.status = 'ativa';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'titulo', m.title, 'hora', to_char(m.at_time, 'HH24:MI'),
           'pessoasDeCostume', m.people_count, 'cor', m.color,
           'chamada', (
             SELECT jsonb_build_object(
                      'feita', true,
                      'comeram', count(r.id) FILTER (WHERE r.option_code IN ('normal','dieta_adaptada','parcial')),
                      'parcial', count(r.id) FILTER (WHERE r.option_code = 'parcial'),
                      'recusou', count(r.id) FILTER (WHERE r.option_code = 'recusou'),
                      'ausente', count(r.id) FILTER (WHERE r.option_code = 'ausente_externa'),
                      'dietaAdaptada', count(r.id) FILTER (WHERE r.option_code = 'dieta_adaptada'))
               FROM collective_check k
               LEFT JOIN check_result r ON r.check_id = k.id
              WHERE k.house_id = p_house AND k.kind = 'alimentacao'
                AND (k.reference_at AT TIME ZONE app_fuso())::date = p_dia
                AND lower(btrim(k.title)) = lower(btrim(m.title))
             HAVING count(r.id) > 0)
         ) ORDER BY m.at_time, m.title), '[]'::jsonb)
    INTO v_refeicoes
    FROM house_check_model m
   WHERE m.house_id = p_house AND m.kind = 'alimentacao' AND m.ended_at IS NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'nome', coalesce(nullif(p.social_name, ''), p.full_name),
           'restricao', f.restriction, 'substituicao', f.substitution, 'orientacao', f.guidance)
         ORDER BY coalesce(nullif(p.social_name, ''), p.full_name), f.restriction), '[]'::jsonb)
    INTO v_restricoes
    FROM food_restriction f
    JOIN person p ON p.id = f.person_id
   WHERE f.active AND f.person_id = ANY (v_em_casa);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'tipo', k.kind, 'paraQuem', k.para_quem, 'quantidade', k.quantidade,
           'finalidade', k.finalidade, 'entregarA', k.entregar_a) ORDER BY k.pedido_em), '[]'::jsonb)
    INTO v_pedidos
    FROM app_pedidos_da_cozinha(p_house, p_dia, p_dia) k
   WHERE k.status = 'aberto';

  RETURN jsonb_build_object(
    'dia', p_dia,
    'emCasa', coalesce(array_length(v_em_casa, 1), 0),
    'fora', v_fora,
    'refeicoes', v_refeicoes,
    'restricoes', v_restricoes,
    'pedidos', v_pedidos);
END $$;
REVOKE ALL ON FUNCTION app_plano_da_cozinha(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_plano_da_cozinha(uuid, date) TO rede_app;
COMMENT ON FUNCTION app_plano_da_cozinha(uuid, date) IS
  'O plano do dia da cozinha (fase 286): as refeições da casa com a hora, quantas crianças estão em casa e quantas fora, as restrições de quem está em casa (sem o motivo clínico), a chamada de cada refeição já feita no dia e os lanches e cestas pedidos para ele. Casa fora do alcance devolve NULL.';
