-- ---------------------------------------------------------------------------
-- §8.4 — a âncora do "vencendo em 7 dias" (decidido em 31/08/2026)
--
-- A 0650 consertou o fuso e, no mesmo movimento, ancorou a janela de
-- vencimento em `p_date`. Era coerente com a tela — o painel é de um dia — e
-- errado para o que o aviso serve.
--
-- O painel de OUTRO dia é o que a Enfermagem abre para revisar a véspera. Com
-- a janela em `p_date`, revisar segunda-feira na sexta escondia a receita que
-- vence no sábado: ela está fora dos 7 dias contados a partir de segunda. O
-- alerta some justamente para quem foi conferir.
--
-- A receita vence numa data, e essa data não muda conforme a tela que a pessoa
-- está olhando. A janela parte de HOJE, sempre, em `app_hoje()` (§9 do prompt:
-- migração nova não usa `current_date`). `p_date` continua mandando em tudo o
-- mais do painel — doses previstas do dia, e só.
--
-- A tela avisa, em uma linha, quando o dia mostrado não é hoje: o número não
-- mente, mas quem lê precisa saber de onde ele parte.
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
    -- Âncora em HOJE, não no dia mostrado.
    (SELECT min(pr.ends_on) FROM prescription pr
      WHERE pr.person_id = p.id AND pr.status = 'ativa'
        AND pr.ends_on IS NOT NULL AND pr.ends_on <= app_hoje() + 7)
  FROM person p
  JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa' AND s.house_id = p_house
  WHERE app_house_in_scope(p_house)
  ORDER BY coalesce(nullif(p.social_name,''), p.full_name)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_nursing_panel(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_nursing_panel(uuid, date) TO rede_app;
