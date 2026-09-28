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

-- Versão vigente (1290), copiada do catálogo; só o filtro entrou, nas doses.

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
        AND (m.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate
        AND NOT (m.state = 'aguardando_confirmacao'
                 AND app_ausente_da_casa(m.person_id, (m.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date))),
    (SELECT count(*)::int FROM medication_administration m
      WHERE m.house_id = p_house
        AND m.state IN ('administrado_no_horario','administrado_com_atraso')
        AND (m.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM medication_administration m
      WHERE m.house_id = p_house AND m.state = 'aguardando_confirmacao'
        AND (m.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN j.de AND j.ate
        AND NOT app_ausente_da_casa(m.person_id, (m.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date)),
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
