-- AS REFEIÇÕES DA CASA, E O ÚLTIMO DIA DO PERÍODO (fase 162).
--
-- 1. O DEFEITO, achado ao ler esta função para escrever as métricas de
--    refeição: `k.reference_at BETWEEN j.de AND j.ate` compara um INSTANTE com
--    DATAS. A data vira meia-noite do COMEÇO do dia, e tudo o que aconteceu no
--    último dia do período ficava de fora — o relatório "de 01 a 26" contava as
--    chamadas até 25. E a meia-noite era a do fuso da sessão, não a de Porto
--    Alegre. Seis vezes em `app_periodo_da_casa`, uma em
--    `app_periodo_da_casa_alimentacao` (a pergunta foi ao catálogo, e só essas
--    duas comparam instante com data). As versões vigentes, copiadas do
--    catálogo; só a comparação mudou — e o dia da refeição devolvido pela
--    segunda passou a ser o de Porto Alegre.
--
-- 2. AS REFEIÇÕES DA CASA, por refeição (café, almoço, janta…), num período:
--    quantas chamadas, quantos registros, quantos comeram, parcial, recusa,
--    ausência e dieta adaptada. Da CASA — nenhuma criança, nenhum nome (decisão
--    de 26/09: nenhuma comparação entre crianças). Recusa é direito da criança e
--    informação de cuidado, e a tela diz isso ao lado do número.

CREATE OR REPLACE FUNCTION public.app_periodo_da_casa(p_house uuid, p_de date, p_ate date)
 RETURNS TABLE(acolhidos integer, capacidade integer, entradas integer, saidas integer, chamadas integer, chamadas_confirmadas integer, chamadas_abertas integer, refeicoes_conferidas integer, refeicoes_com_excecao integer, criancas_com_excecao integer, ocorrencias integer, ocorrencias_restritas integer, desorganizacao integer, atas integer, atas_fechadas integer, atas_com_pendencia integer, atas_abertas integer, passagens integer, passagens_sem_recibo integer, doses integer, doses_confirmadas integer, doses_sem_resposta integer, doses_anterior integer, internacoes integer, idas_a_familia integer, marcos integer, evolucoes_educacionais integer, evolucoes_de_saude integer, memorias integer, reunioes integer, lanches integer, cestas integer, acompanhamentos_aprovados integer, acompanhamentos_abertos integer, notas_restritas integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH janela AS (
    SELECT p_de AS de, p_ate AS ate,
           -- O período anterior de IGUAL DURAÇÃO, colado neste. Uma semana se
           -- compara com a semana antes dela, e seis meses com os seis meses
           -- antes deles — nunca com "o mês passado" fixo.
           p_de - (p_ate - p_de + 1) AS de_ant,
           p_de - 1 AS ate_ant
  )
  SELECT
    (SELECT count(*)::int FROM house_stay s
      WHERE s.house_id = p_house AND s.status = 'ativa'),
    (SELECT hh.capacity FROM house hh WHERE hh.id = p_house),
    (SELECT count(*)::int FROM house_stay s
      WHERE s.house_id = p_house
        AND (s.started_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM house_stay s
      WHERE s.house_id = p_house AND s.ended_at IS NOT NULL
        AND (s.ended_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),

    (SELECT count(*)::int FROM collective_check k
      WHERE k.house_id = p_house AND (k.reference_at AT TIME ZONE app_fuso())::date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM collective_check k
      WHERE k.house_id = p_house AND k.status = 'confirmada'
        AND (k.reference_at AT TIME ZONE app_fuso())::date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM collective_check k
      WHERE k.house_id = p_house AND k.status = 'aberta'
        AND (k.reference_at AT TIME ZONE app_fuso())::date BETWEEN j.de AND j.ate),

    (SELECT count(*)::int FROM check_result r
       JOIN collective_check k ON k.id = r.check_id
      WHERE k.house_id = p_house AND k.kind = 'alimentacao'
        AND (k.reference_at AT TIME ZONE app_fuso())::date BETWEEN j.de AND j.ate),
    -- As exceções da refeição, pelo vocabulário do próprio módulo de chamada
    -- (`OPCOES.alimentacao`): parcial, recusou, desconforto e outro. `ausente`
    -- e `dieta adaptada` não são exceção de quem não come — a primeira é
    -- agenda, a segunda é cuidado que já foi decidido.
    (SELECT count(*)::int FROM check_result r
       JOIN collective_check k ON k.id = r.check_id
      WHERE k.house_id = p_house AND k.kind = 'alimentacao'
        AND (k.reference_at AT TIME ZONE app_fuso())::date BETWEEN j.de AND j.ate
        AND r.option_code IN ('parcial','recusou','desconforto','outro')),
    -- Crianças DISTINTAS, e não quantas vezes cada uma: responde "é a casa
    -- inteira ou são duas?" sem virar contagem por criança.
    (SELECT count(DISTINCT r.person_id)::int FROM check_result r
       JOIN collective_check k ON k.id = r.check_id
      WHERE k.house_id = p_house AND k.kind = 'alimentacao'
        AND (k.reference_at AT TIME ZONE app_fuso())::date BETWEEN j.de AND j.ate
        AND r.option_code IN ('parcial','recusou','desconforto','outro')),

    (SELECT count(*)::int FROM incident i
      WHERE i.house_id = p_house
        AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM incident i
      WHERE i.house_id = p_house AND i.access_level = 'restrito'
        AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),
    -- "Desorganização" é a palavra dele, e existe como categoria de ocorrência
    -- desde o §13.1. Não foi inventada aqui.
    (SELECT count(*)::int FROM incident i
      WHERE i.house_id = p_house AND i.category = 'desorganizacao_relevante'
        AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),

    (SELECT count(*)::int FROM ata a
      WHERE a.house_id = p_house AND a.on_date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM ata a
      WHERE a.house_id = p_house AND a.status = 'fechada'
        AND a.on_date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM ata a
      WHERE a.house_id = p_house AND a.status = 'fechada_com_pendencia'
        AND a.on_date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM ata a
      WHERE a.house_id = p_house AND a.status IN ('rascunho','reaberta')
        AND a.on_date BETWEEN j.de AND j.ate),

    (SELECT count(*)::int FROM handover ho
      WHERE ho.house_id = p_house
        AND (ho.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),
    -- Passagem escrita que ninguém recebeu. É o buraco entre dois turnos, e é
    -- disso que "desorganização" costuma ser feita.
    (SELECT count(*)::int FROM handover ho
      WHERE ho.house_id = p_house
        AND (ho.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate
        AND NOT EXISTS (SELECT 1 FROM handover_receipt hr
                         WHERE hr.shift_id = ho.shift_id AND hr.house_id = ho.house_id)),

    (SELECT count(*)::int FROM medication_administration m
      WHERE m.house_id = p_house
        AND (m.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM medication_administration m
      WHERE m.house_id = p_house
        AND m.state IN ('administrado_no_horario','administrado_com_atraso')
        AND (m.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM medication_administration m
      WHERE m.house_id = p_house AND m.state = 'aguardando_confirmacao'
        AND (m.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),
    -- *"Aumento de medicamentos"*, com as palavras dele. Os dois números saem
    -- lado a lado e ninguém divide um pelo outro: a conta é do leitor, e ele
    -- sabe o que mudou na casa naquelas semanas.
    (SELECT count(*)::int FROM medication_administration m
      WHERE m.house_id = p_house
        AND (m.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de_ant AND j.ate_ant),

    (SELECT count(*)::int FROM hospitalization i
      WHERE i.house_id = p_house
        AND (i.started_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM family_stay f
      WHERE f.house_id = p_house
        AND (f.started_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),

    (SELECT count(*)::int FROM life_milestone lm
      WHERE lm.house_id = p_house AND lm.happened_on BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM education_evolution e
      WHERE e.house_id = p_house AND e.on_date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM health_evolution he
      WHERE he.house_id = p_house
        AND (he.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),
    -- A memória não tem casa: ela é da criança. Entra pela vivência dela nesta
    -- casa, que é o recorte certo — a formatura da Alice é da Casa 03 porque a
    -- Alice mora na Casa 03.
    (SELECT count(*)::int FROM memory_record mr
      WHERE mr.happened_on BETWEEN j.de AND j.ate
        AND EXISTS (SELECT 1 FROM house_stay s
                     WHERE s.person_id = mr.person_id AND s.house_id = p_house)),

    (SELECT count(*)::int FROM team_meeting t
      WHERE t.house_id = p_house AND t.happened_on BETWEEN j.de AND j.ate),
    (SELECT coalesce(sum(kr.quantity), 0)::int FROM kitchen_request kr
      WHERE kr.house_id = p_house AND kr.kind = 'lanche' AND kr.status = 'aberto'
        AND kr.on_date BETWEEN j.de AND j.ate),
    (SELECT coalesce(sum(kr.quantity), 0)::int FROM kitchen_request kr
      WHERE kr.house_id = p_house AND kr.kind = 'cesta_basica' AND kr.status = 'aberto'
        AND kr.on_date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM followup f
      WHERE f.house_id = p_house AND f.status = 'aprovado'
        AND f.period_end BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM followup f
      WHERE f.house_id = p_house AND f.status <> 'aprovado'
        AND f.period_end BETWEEN j.de AND j.ate),

    (SELECT count(*)::int FROM ata_note an
       JOIN ata a ON a.id = an.ata_id
      WHERE an.house_id = p_house AND an.restricted
        AND a.on_date BETWEEN j.de AND j.ate)

    FROM janela j
   WHERE app_house_in_scope(p_house)
     AND app_current_role() IN ('lider_diurno','equipe_tecnica','coordenador','gestor_geral');
$function$;

CREATE OR REPLACE FUNCTION public.app_periodo_da_casa_alimentacao(p_house uuid, p_de date, p_ate date)
 RETURNS TABLE(person_id uuid, quem text, quando date, refeicao text, opcao text, nota text, por text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT r.person_id,
         coalesce(nullif(p.social_name, ''), p.full_name),
         (k.reference_at AT TIME ZONE app_fuso())::date, coalesce(nullif(k.title, ''), 'Refeição'),
         r.option_code, r.note,
         app_user_display_name(r.recorded_by)
    FROM check_result r
    JOIN collective_check k ON k.id = r.check_id
    JOIN person p ON p.id = r.person_id
   WHERE k.house_id = p_house
     AND app_house_in_scope(p_house)
     AND app_current_role() IN ('lider_diurno','equipe_tecnica','coordenador','gestor_geral')
     AND k.kind = 'alimentacao'
     AND (k.reference_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND p_ate
     AND r.option_code IN ('parcial','recusou','desconforto','outro')
   ORDER BY k.reference_at, k.id
   LIMIT 500;
$function$;

CREATE OR REPLACE FUNCTION app_refeicoes_da_casa(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (refeicao text, chamadas integer, registros integer, comeram integer,
               parcial integer, recusou integer, ausente integer, dieta_adaptada integer,
               outros integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(nullif(btrim(k.title), ''), 'Refeição'),
         count(DISTINCT k.id)::int,
         count(r.id)::int,
         count(r.id) FILTER (WHERE r.option_code IN ('normal','dieta_adaptada','parcial'))::int,
         count(r.id) FILTER (WHERE r.option_code = 'parcial')::int,
         count(r.id) FILTER (WHERE r.option_code = 'recusou')::int,
         count(r.id) FILTER (WHERE r.option_code = 'ausente_externa')::int,
         count(r.id) FILTER (WHERE r.option_code = 'dieta_adaptada')::int,
         count(r.id) FILTER (WHERE r.option_code IN ('desconforto','outro','nao_aplicavel'))::int
    FROM collective_check k
    LEFT JOIN check_result r ON r.check_id = k.id
   WHERE k.house_id = p_house
     AND app_house_in_scope(p_house)
     AND k.kind = 'alimentacao'
     AND (k.reference_at AT TIME ZONE app_fuso())::date BETWEEN p_de AND p_ate
   GROUP BY 1
   ORDER BY 1
$$;
REVOKE ALL ON FUNCTION app_refeicoes_da_casa(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_refeicoes_da_casa(uuid, date, date) TO rede_app;
