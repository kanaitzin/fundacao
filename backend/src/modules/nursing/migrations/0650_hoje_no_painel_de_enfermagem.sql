-- ---------------------------------------------------------------------------
-- Defeito 10 (enfermagem) — o aviso de prescrição vencendo usava o dia do
-- servidor, e o painel é de um dia escolhido.
--
-- Duas coisas erradas na mesma linha. `current_date + 7` em servidor UTC
-- adianta a janela depois das 21h; e, ao abrir o painel de OUTRO dia — o que
-- a Enfermagem faz para revisar a véspera —, a janela continuava ancorada em
-- hoje. O painel recebe `p_date`: é dele que "os próximos 7 dias" partem.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_nursing_panel(p_house uuid, p_date date)
RETURNS TABLE (
  person_id uuid, nome text, nome_civil text, idade integer,
  alergias text, restricoes text, condicoes text,
  doses_previstas integer, proxima_dose timestamptz, ultima_dose timestamptz,
  pendentes integer, evolucoes_pendentes integer,
  internacao boolean, retorno_pendente date, receita_vencendo date
) AS $$
  SELECT
    p.id,
    coalesce(nullif(p.social_name,''), p.full_name),
    p.full_name,
    date_part('year', age(p.birth_date))::int,
    (SELECT string_agg(h.description, ' · ') FROM health_condition h
      WHERE h.person_id = p.id AND h.active AND h.kind = 'alergia'),
    (SELECT string_agg(f.restriction, ' · ') FROM food_restriction f
      WHERE f.person_id = p.id AND f.active),
    (SELECT string_agg(h.description, ' · ') FROM health_condition h
      WHERE h.person_id = p.id AND h.active AND h.kind = 'condicao'),
    (SELECT count(*)::int FROM medication_administration a
      WHERE a.person_id = p.id
        AND (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = p_date),
    (SELECT min(a.scheduled_at) FROM medication_administration a
      WHERE a.person_id = p.id AND a.state = 'aguardando_confirmacao'
        AND a.scheduled_at >= now()),
    (SELECT max(a.administered_at) FROM medication_administration a
      WHERE a.person_id = p.id AND a.administered_at IS NOT NULL),
    (SELECT count(*)::int FROM medication_administration a
      WHERE a.person_id = p.id AND a.state = 'aguardando_confirmacao'
        AND a.scheduled_at < now()),
    (SELECT count(*)::int FROM health_evolution e
      WHERE e.person_id = p.id AND e.status <> 'assinada'),
    EXISTS (SELECT 1 FROM health_encounter e
             WHERE e.person_id = p.id AND e.kind = 'internacao' AND e.status = 'em_andamento'),
    (SELECT min(e.return_on) FROM health_encounter e
      WHERE e.person_id = p.id AND e.status = 'retorno_pendente' AND e.return_on IS NOT NULL),
    (SELECT min(pr.ends_on) FROM prescription pr
      WHERE pr.person_id = p.id AND pr.status = 'ativa'
        AND pr.ends_on IS NOT NULL AND pr.ends_on <= p_date + 7)
  FROM person p
  JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa' AND s.house_id = p_house
  WHERE app_house_in_scope(p_house)
  ORDER BY coalesce(nullif(p.social_name,''), p.full_name)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_nursing_panel(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_nursing_panel(uuid, date) TO rede_app;
