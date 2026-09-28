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

-- Versão vigente (0750), copiada do catálogo; só o filtro entrou, nas duas contas.

CREATE OR REPLACE FUNCTION public.app_nursing_panel(p_house uuid, p_date date)
 RETURNS TABLE(person_id uuid, nome text, nome_civil text, idade integer, alergias text, restricoes text, condicoes text, doses_previstas integer, proxima_dose timestamp with time zone, ultima_dose timestamp with time zone, pendentes integer, evolucoes_pendentes integer, internacao boolean, retorno_pendente date, receita_vencendo date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
        AND a.scheduled_at >= now()
        AND NOT app_ausente_da_casa(a.person_id, (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date)),
    (SELECT max(a.administered_at) FROM medication_administration a
      WHERE a.person_id = p.id AND a.administered_at IS NOT NULL),
    (SELECT count(*)::int FROM medication_administration a
      WHERE a.person_id = p.id AND a.state = 'aguardando_confirmacao'
        AND a.scheduled_at < now()
        AND NOT app_ausente_da_casa(a.person_id, (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date)),
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
$function$;
