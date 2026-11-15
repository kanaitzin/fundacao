-- O RANKING DAS CASAS E DA EQUIPE (fase 323, pedido e decidido pelo dono em 14/11).
--
-- *As casas por organização documental, pelo cuidado e pelo uso do sistema, por casa e
-- por pessoa dentro de cada casa, e o dinheiro que cada casa gastou.* Para a
-- Coordenação Geral e o Gestor Geral. A proibição de ranking protege as crianças: o
-- número da casa soma o cuidado das crianças dela e nunca mostra uma.
--
-- As duas funções devolvem SÓ CONTAGENS. A porcentagem, a nota e a ordem saem do
-- `reports/ranking.regra.ts`, a mesma conta no servidor e no protótipo.
--
-- O que é de hoje e o que é do período:
--   * o dossiê, o PIA, a reavaliação, a receita e a vacinação são a situação de HOJE das
--     crianças acolhidas agora na casa (é o que a casa tem em mãos);
--   * as ATAs, as doses, as chamadas, a frequência, os atendimentos, as visitas, o gasto
--     e os registros são do PERÍODO, até agora.
--
-- A lista do dossiê completo é a dos obrigatórios do `people/dossie-exigido.ts`; a suíte
-- `o-ranking-das-casas` confere que as duas dizem a mesma.

CREATE OR REPLACE FUNCTION app_ve_o_ranking()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce((
    SELECT u.active AND (u.role::text = 'gestor_geral'
                         OR (u.role::text = 'coordenador' AND u.todas_as_casas))
      FROM app_user u WHERE u.id = app_current_user()), false)
$$;
REVOKE ALL ON FUNCTION app_ve_o_ranking() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_ve_o_ranking() TO rede_app;

CREATE OR REPLACE FUNCTION app_ranking_das_casas(p_de date, p_ate date)
RETURNS TABLE (
  house_id uuid, code text, name text,
  acolhidos int, equipe int,
  pia_em_dia int, reavaliacao_em_dia int,
  com_receita int, receita_em_dia int, vacina_em_dia int, dossie_completo int,
  atas int, atas_sem_pendencia int,
  doses int, doses_no_horario int,
  chamadas int, chamadas_confirmadas int,
  frequencia_esperada int, frequencia_marcada int,
  atendimentos int, visitas int,
  registros int, pessoas_que_registraram int,
  notas_centavos bigint, notas_sem_valor int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_inst uuid;
  v_ate  date := least(p_ate, app_hoje());
BEGIN
  IF NOT app_ve_o_ranking() THEN
    RAISE EXCEPTION 'ranking_fora_do_alcance' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT u.institution_id INTO v_inst FROM app_user u WHERE u.id = app_current_user();

  RETURN QUERY
  WITH casa AS (
    SELECT h.id, h.code, h.name FROM house h WHERE h.institution_id = v_inst
  ), criancas AS (
    SELECT s.house_id, s.person_id FROM house_stay s
     WHERE s.status = 'ativa' AND s.house_id IN (SELECT id FROM casa)
  ), doc AS (
    SELECT d.person_id, d.checklist_key,
           max(coalesce(d.valid_until, 'infinity'::date)) AS ate,
           max(coalesce(d.issued_on, (d.created_at AT TIME ZONE app_fuso())::date)) AS emitido
      FROM document d
     WHERE d.person_id IN (SELECT person_id FROM criancas) AND d.checklist_key IS NOT NULL
     GROUP BY d.person_id, d.checklist_key
  ), desde AS (
    SELECT e.person_id,
           max(coalesce(a.admitted_on, (e.started_at AT TIME ZONE app_fuso())::date)) AS desde
      FROM care_episode e
      LEFT JOIN admission_record a ON a.episode_id = e.id
     WHERE e.status = 'ativo' AND e.person_id IN (SELECT person_id FROM criancas)
     GROUP BY e.person_id
  ), registro AS (
    SELECT n.house_id, n.author_id AS por FROM ata_note n
     WHERE (n.created_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT m.house_id, m.administered_by FROM medication_administration m
     WHERE m.administered_by IS NOT NULL
       AND (m.administered_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT k.house_id, k.confirmed_by FROM collective_check k
     WHERE k.confirmed_by IS NOT NULL
       AND (k.confirmed_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT f.house_id, f.created_by FROM education_attendance f
     WHERE (f.created_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT s.house_id, t.created_by FROM technical_session t
      JOIN house_stay s ON s.person_id = t.person_id
       AND (s.started_at AT TIME ZONE app_fuso())::date <= t.happened_on
       AND (s.ended_at IS NULL OR (s.ended_at AT TIME ZONE app_fuso())::date >= t.happened_on)
     WHERE (t.created_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT v.house_id, v.started_by FROM visit v
     WHERE (v.started_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT o.house_id, o.opened_by FROM incident o
     WHERE (o.opened_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
  ), equipe AS (
    SELECT DISTINCT a.house_id, a.user_id FROM user_house_assignment a
      JOIN app_user u ON u.id = a.user_id AND u.active
     WHERE a.valid_from <= app_hoje() AND (a.valid_to IS NULL OR a.valid_to >= app_hoje())
       AND u.role::text <> 'gestor_geral'
  )
  SELECT h.id, h.code::text, h.name::text,
    (SELECT count(*)::int FROM criancas c WHERE c.house_id = h.id),
    (SELECT count(*)::int FROM equipe q WHERE q.house_id = h.id),

    (SELECT count(*)::int FROM criancas c JOIN doc d ON d.person_id = c.person_id AND d.checklist_key = 'pia'
      WHERE c.house_id = h.id AND d.ate >= app_hoje()),
    -- Reavaliação em dia: a última é de menos de três meses, ou a criança chegou há menos
    -- de três meses (o primeiro prazo ainda corre). O mesmo prazo do `reavaliacao.regra.ts`.
    (SELECT count(*)::int FROM criancas c
       LEFT JOIN desde x ON x.person_id = c.person_id
       LEFT JOIN doc d ON d.person_id = c.person_id AND d.checklist_key = 'relatorio_reavaliacao'
      WHERE c.house_id = h.id
        AND greatest(d.emitido, x.desde) > app_hoje() - interval '3 months'),
    (SELECT count(*)::int FROM criancas c JOIN doc d ON d.person_id = c.person_id AND d.checklist_key = 'receita'
      WHERE c.house_id = h.id),
    (SELECT count(*)::int FROM criancas c JOIN doc d ON d.person_id = c.person_id AND d.checklist_key = 'receita'
      WHERE c.house_id = h.id AND d.ate >= app_hoje()),
    (SELECT count(*)::int FROM criancas c JOIN doc d ON d.person_id = c.person_id
                                                    AND d.checklist_key = 'caderneta_vacinacao'
      WHERE c.house_id = h.id AND d.ate >= app_hoje()),
    (SELECT count(*)::int FROM criancas c
      WHERE c.house_id = h.id
        AND (SELECT count(DISTINCT d.checklist_key) FROM doc d
              WHERE d.person_id = c.person_id
                AND d.checklist_key IN ('certidao_nascimento', 'cpf', 'cartao_sus', 'caderneta_vacinacao',
                                        'declaracao_matricula', 'historico_escolar', 'guia_acolhimento', 'pia')
             ) = 8),

    -- As ATAs dos dias que já terminaram: a de hoje ainda está aberta por natureza.
    (SELECT count(*)::int FROM ata a
      WHERE a.house_id = h.id AND a.on_date BETWEEN p_de AND least(v_ate, app_hoje() - 1)),
    (SELECT count(*)::int FROM ata a
      WHERE a.house_id = h.id AND a.on_date BETWEEN p_de AND least(v_ate, app_hoje() - 1)
        AND a.status = 'fechada'),

    -- As doses que eram da equipe dar: a recusa da criança, a ausência, a suspensão e a
    -- falta do remédio não contam contra a casa.
    (SELECT count(*)::int FROM medication_administration m
      WHERE m.house_id = h.id AND m.scheduled_at < now()
        AND (m.scheduled_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
        AND m.state::text IN ('administrado_no_horario', 'administrado_com_atraso',
                              'nao_administrado', 'aguardando_confirmacao')),
    (SELECT count(*)::int FROM medication_administration m
      WHERE m.house_id = h.id AND m.scheduled_at < now()
        AND (m.scheduled_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
        AND m.state::text = 'administrado_no_horario'),

    (SELECT count(*)::int FROM collective_check k
      WHERE k.house_id = h.id AND k.reference_at < now()
        AND (k.reference_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate),
    (SELECT count(*)::int FROM collective_check k
      WHERE k.house_id = h.id AND k.reference_at < now() AND k.status = 'confirmada'
        AND (k.reference_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate),

    -- A frequência: cada dia de aula do vínculo, no período, contra o dia marcado.
    (SELECT count(*)::int FROM education_link l
       CROSS JOIN LATERAL generate_series(greatest(p_de, l.starts_on),
                                          least(v_ate, coalesce(l.ended_on - 1, v_ate)),
                                          interval '1 day') AS dia
      WHERE l.house_id = h.id AND extract(isodow FROM dia)::smallint = ANY (l.weekdays)),
    (SELECT count(DISTINCT (f.link_id, f.on_date))::int FROM education_attendance f
       JOIN education_link l ON l.id = f.link_id
      WHERE l.house_id = h.id AND f.on_date BETWEEN p_de AND v_ate
        AND f.on_date BETWEEN l.starts_on AND coalesce(l.ended_on - 1, v_ate)
        AND extract(isodow FROM f.on_date)::smallint = ANY (l.weekdays)),

    (SELECT count(*)::int FROM technical_session t
       JOIN house_stay s ON s.person_id = t.person_id AND s.house_id = h.id
        AND (s.started_at AT TIME ZONE app_fuso())::date <= t.happened_on
        AND (s.ended_at IS NULL OR (s.ended_at AT TIME ZONE app_fuso())::date >= t.happened_on)
      WHERE t.happened_on BETWEEN p_de AND v_ate),
    (SELECT count(*)::int FROM visit v
      WHERE v.house_id = h.id AND (v.started_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate),

    -- Os registros da EQUIPE da casa: quem passa por ela (a Coordenação Geral, a Enfermagem
    -- de outra casa) não entra na conta do uso dela.
    (SELECT count(*)::int FROM registro r
       JOIN equipe q ON q.house_id = h.id AND q.user_id = r.por
      WHERE r.house_id = h.id),
    (SELECT count(DISTINCT r.por)::int FROM registro r
       JOIN equipe q ON q.house_id = h.id AND q.user_id = r.por
      WHERE r.house_id = h.id),

    (SELECT coalesce(sum(c.total_cents), 0)::bigint FROM medication_purchase c
      WHERE c.house_id = h.id AND c.bought_on BETWEEN p_de AND v_ate),
    (SELECT count(*)::int FROM medication_purchase c
      WHERE c.house_id = h.id AND c.bought_on BETWEEN p_de AND v_ate AND c.total_cents IS NULL)
  FROM casa h
  ORDER BY h.code;
END $$;
REVOKE ALL ON FUNCTION app_ranking_das_casas(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_ranking_das_casas(date, date) TO rede_app;

/* As pessoas de UMA casa, pelo que registraram nela. Quem está vinculado e não
   registrou aparece com zero: sumir da lista seria a exclusão silenciosa. */
CREATE OR REPLACE FUNCTION app_ranking_das_pessoas(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (user_id uuid, nome text, cargo text, tipo text, quantos int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ate date := least(p_ate, app_hoje());
BEGIN
  IF NOT app_ve_o_ranking() THEN
    RAISE EXCEPTION 'ranking_fora_do_alcance' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT coalesce(app_house_in_scope(p_house), false) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH registro AS (
    SELECT n.author_id AS por, 'ata'::text AS t FROM ata_note n
     WHERE n.house_id = p_house AND (n.created_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT m.administered_by, 'dose' FROM medication_administration m
     WHERE m.house_id = p_house AND m.administered_by IS NOT NULL
       AND (m.administered_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT k.confirmed_by, 'chamada' FROM collective_check k
     WHERE k.house_id = p_house AND k.confirmed_by IS NOT NULL
       AND (k.confirmed_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT f.created_by, 'frequencia' FROM education_attendance f
     WHERE f.house_id = p_house AND (f.created_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT t.created_by, 'atendimento' FROM technical_session t
      JOIN house_stay s ON s.person_id = t.person_id AND s.house_id = p_house
       AND (s.started_at AT TIME ZONE app_fuso())::date <= t.happened_on
       AND (s.ended_at IS NULL OR (s.ended_at AT TIME ZONE app_fuso())::date >= t.happened_on)
     WHERE (t.created_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT v.started_by, 'visita' FROM visit v
     WHERE v.house_id = p_house AND (v.started_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
    UNION ALL
    SELECT o.opened_by, 'ocorrencia' FROM incident o
     WHERE o.house_id = p_house AND (o.opened_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND v_ate
  ), pessoas AS (
    SELECT a.user_id AS id FROM user_house_assignment a
      JOIN app_user u ON u.id = a.user_id AND u.active
     WHERE a.house_id = p_house AND a.valid_from <= app_hoje()
       AND (a.valid_to IS NULL OR a.valid_to >= app_hoje())
       AND u.role::text <> 'gestor_geral'
    UNION
    SELECT r.por FROM registro r WHERE r.por IS NOT NULL
  )
  SELECT p.id, u.full_name::text, u.role::text, r.t, count(r.t)::int
    FROM pessoas p
    JOIN app_user u ON u.id = p.id
    LEFT JOIN registro r ON r.por = p.id
   GROUP BY p.id, u.full_name, u.role, r.t;
END $$;
REVOKE ALL ON FUNCTION app_ranking_das_pessoas(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_ranking_das_pessoas(uuid, date, date) TO rede_app;

COMMENT ON FUNCTION app_ranking_das_casas(date, date) IS
  'As contagens de cada casa para o ranking (fase 323): só para o Gestor Geral e a Coordenação Geral, nunca por criança. A conta das notas mora em reports/ranking.regra.ts.';
COMMENT ON FUNCTION app_ranking_das_pessoas(uuid, date, date) IS
  'O que cada pessoa da equipe registrou numa casa, por tipo (fase 323). Quem não registrou aparece com zero.';
