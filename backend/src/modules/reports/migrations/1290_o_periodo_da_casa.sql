-- ============================================================
-- 1290 — O período da casa, com o período escolhido por quem lê
--
-- RESPOSTA DA FUNDAÇÃO, 15/09/2026, à pergunta R1 do roteiro — *"como a casa
-- quer receber os relatórios obrigatórios?"*:
--
--   *"Acompanhamento semanal é um bom caminho: ver como foi a casa toda
--   aquela semana, tipo uma ata geral de toda semana, tanto manhã quanto
--   noite."*
--
-- E o que ele quer ler lá dentro: *"ocorrências, desorganização, aumento de
-- medicamentos, quem não está comendo o quê, desenvolvimento"*, e — a frase
-- que decide o tom deste relatório — *"as observações que os educadores botam
-- têm que ser ponderadas para ser trazido coisas boas e negativas"*.
--
-- E o período: *"se é um dia, dois, três, uma semana, um mês, seis meses […]
-- esse controle tem que ser livre para eles poderem brincar ali dentro"*.
--
-- ---
--
-- ISTO NÃO É O PAINEL DO GESTOR (1280), E A DIFERENÇA É O QUE ELE É PARA QUE
--
-- O painel das oito casas conta; este relatório CONTA E CITA. Lá o leitor é o
-- chefe de todas as casas e a pergunta é "como estão as oito"; aqui o leitor é
-- quem responde por vinte crianças e a pergunta é "como foi a nossa semana" —
-- e essa não se responde com número nenhum sem o que foi escrito ao lado.
--
-- Por isso são três funções e não uma:
--
--   `app_periodo_da_casa`               — os números do período, e os do
--                                         período anterior de igual duração
--                                         onde a comparação foi pedida;
--   `app_periodo_da_casa_alimentacao`   — *"quem não está comendo o quê"*,
--                                         criança por criança, como foi escrito;
--   `app_periodo_da_casa_linhas`        — o que aconteceu, em texto: ocorrência,
--                                         episódio de ATA, observação do turno,
--                                         conquista, evolução escolar e memória.
--
-- ---
--
-- TEXTO DE ACESSO RESTRITO NÃO ENTRA — E O RELATÓRIO DIZ QUE ELE EXISTE
--
-- Os quatro cargos que abrem este relatório são exatamente o círculo estreito
-- que a Fundação desenhou em 15/09 (*"educador líder, coordenador, equipe
-- técnica e gestor"*), então nada aqui está escondido de quem tem direito.
-- Mesmo assim, a ocorrência de acesso restrito e a nota de ATA restrita entram
-- como CONTAGEM e não como texto.
--
-- A razão não é permissão, é o que este documento vira depois: ele tem folha,
-- e folha se imprime, se anexa em e-mail e se esquece em cima de uma mesa. O
-- relato de uma suspeita de violência não pertence a um resumo semanal que
-- circula; ele pertence à tela da ocorrência, onde cada abertura fica
-- registrada. O número diz "há três ali, vá ver" — que é a única coisa que um
-- resumo precisa dizer sobre elas.
--
-- ---
--
-- O QUE ESTE RELATÓRIO NÃO FAZ, E POR QUÊ
--
--  * **não soma nada por criança.** A seção de alimentação LISTA o que foi
--    escrito, em ordem de data, agrupado por nome — e não conta recusas. Três
--    linhas embaixo de um nome são três fatos; "3" ao lado de um nome é uma
--    ficha, e o §8.7.2 já explicou por que o número viaja e o motivo fica para
--    trás;
--  * **não ordena por quantidade.** Nem crianças, nem educadores, nem turnos.
--    A ordem da seção de alimentação é o NOME, e ela sai ordenada no serviço e
--    não aqui — o banco desta instalação não ordena em português, e foi a
--    Cátia depois da Cida que ensinou isso (fase 117);
--  * **não calcula média nem projeção.** O único número comparado é o de
--    doses, porque *"aumento de medicamentos"* foi pedido com essas palavras —
--    e a comparação é da casa CONSIGO MESMA, no período anterior de igual
--    duração. Nunca com outra casa;
--  * **não deduz nada do silêncio.** Semana sem registro é semana sem
--    registro. A folha carrega essa frase, porque quem lê de fora conclui o
--    contrário.
-- ============================================================

-- ------------------------------------------------------------
-- OS NÚMEROS DO PERÍODO
--
-- Uma linha só. Os `*_anterior` existem apenas onde a comparação foi pedida.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_periodo_da_casa(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (
  -- Quem está
  acolhidos int, capacidade int, entradas int, saidas int,
  -- A rotina conferida
  chamadas int, chamadas_confirmadas int, chamadas_abertas int,
  refeicoes_conferidas int, refeicoes_com_excecao int, criancas_com_excecao int,
  -- O que saiu do esperado
  ocorrencias int, ocorrencias_restritas int, desorganizacao int,
  atas int, atas_fechadas int, atas_com_pendencia int, atas_abertas int,
  passagens int, passagens_sem_recibo int,
  -- Medicamento, e o período anterior de igual duração
  doses int, doses_confirmadas int, doses_sem_resposta int, doses_anterior int,
  -- Cuidado e convivência
  internacoes int, idas_a_familia int,
  -- Desenvolvimento — a parte boa, que ele pediu que viesse junto
  marcos int, evolucoes_educacionais int, evolucoes_de_saude int, memorias int,
  -- O trabalho da equipe com o caso
  reunioes int, lanches int, cestas int,
  acompanhamentos_aprovados int, acompanhamentos_abertos int,
  -- Texto que existe e não entra: a contagem que manda o leitor à tela certa
  notas_restritas int
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
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
      WHERE k.house_id = p_house AND k.reference_at BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM collective_check k
      WHERE k.house_id = p_house AND k.status = 'confirmada'
        AND k.reference_at BETWEEN j.de AND j.ate),
    (SELECT count(*)::int FROM collective_check k
      WHERE k.house_id = p_house AND k.status = 'aberta'
        AND k.reference_at BETWEEN j.de AND j.ate),

    (SELECT count(*)::int FROM check_result r
       JOIN collective_check k ON k.id = r.check_id
      WHERE k.house_id = p_house AND k.kind = 'alimentacao'
        AND k.reference_at BETWEEN j.de AND j.ate),
    -- As exceções da refeição, pelo vocabulário do próprio módulo de chamada
    -- (`OPCOES.alimentacao`): parcial, recusou, desconforto e outro. `ausente`
    -- e `dieta adaptada` não são exceção de quem não come — a primeira é
    -- agenda, a segunda é cuidado que já foi decidido.
    (SELECT count(*)::int FROM check_result r
       JOIN collective_check k ON k.id = r.check_id
      WHERE k.house_id = p_house AND k.kind = 'alimentacao'
        AND k.reference_at BETWEEN j.de AND j.ate
        AND r.option_code IN ('parcial','recusou','desconforto','outro')),
    -- Crianças DISTINTAS, e não quantas vezes cada uma: responde "é a casa
    -- inteira ou são duas?" sem virar contagem por criança.
    (SELECT count(DISTINCT r.person_id)::int FROM check_result r
       JOIN collective_check k ON k.id = r.check_id
      WHERE k.house_id = p_house AND k.kind = 'alimentacao'
        AND k.reference_at BETWEEN j.de AND j.ate
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
$$
-- `SET search_path` por extenso: `CREATE OR REPLACE` apaga o que a 1200 fixou,
-- e o `arquivo-tem-saida.spec` confere no catálogo (lição da fase 102).
SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_periodo_da_casa(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_periodo_da_casa(uuid, date, date) TO rede_app;


-- ------------------------------------------------------------
-- *"QUEM NÃO ESTÁ COMENDO O QUÊ"*
--
-- A pergunta é de cuidado e é boa: uma criança que recusa o jantar três dias
-- seguidos é um sinal de saúde, não um traço de caráter. O que este relatório
-- devolve é o que FOI ESCRITO — a refeição, a opção marcada e a frase que veio
-- ao lado —, e nada mais.
--
-- Sem contagem, sem percentual e sem ordem por quantidade. A ordem é o nome, e
-- ela é aplicada no serviço: `localeCompare('pt-BR')`, porque a intercalação
-- deste banco põe "Cátia" depois de "Cida" e a lista sairia errada na tela de
-- quem lê (fase 117).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_periodo_da_casa_alimentacao(
  p_house uuid, p_de date, p_ate date)
RETURNS TABLE (person_id uuid, quem text, quando date, refeicao text,
               opcao text, nota text, por text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT r.person_id,
         coalesce(nullif(p.social_name, ''), p.full_name),
         k.reference_at, coalesce(nullif(k.title, ''), 'Refeição'),
         r.option_code, r.note,
         app_user_display_name(r.recorded_by)
    FROM check_result r
    JOIN collective_check k ON k.id = r.check_id
    JOIN person p ON p.id = r.person_id
   WHERE k.house_id = p_house
     AND app_house_in_scope(p_house)
     AND app_current_role() IN ('lider_diurno','equipe_tecnica','coordenador','gestor_geral')
     AND k.kind = 'alimentacao'
     AND k.reference_at BETWEEN p_de AND p_ate
     AND r.option_code IN ('parcial','recusou','desconforto','outro')
   ORDER BY k.reference_at, k.id
   LIMIT 500;
$$
SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_periodo_da_casa_alimentacao(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_periodo_da_casa_alimentacao(uuid, date, date) TO rede_app;


-- ------------------------------------------------------------
-- O QUE ACONTECEU, EM TEXTO — as duas metades juntas
--
-- *"As observações que os educadores botam têm que ser ponderadas para ser
-- trazido coisas boas e negativas."* Esta função é essa frase: numa consulta
-- só saem a ocorrência e a conquista, o episódio da ATA e a memória, a
-- observação do turno e a evolução escolar.
--
-- Não é enfeite. Um relatório que junta só o que deu errado ensina a equipe a
-- ler a própria semana como uma lista de falhas — e a criança, que é o assunto,
-- some dele. Cada seção tem teto de 150 linhas e o serviço avisa quando
-- truncou: relatório que corta em silêncio mente por omissão.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_periodo_da_casa_linhas(
  p_house uuid, p_de date, p_ate date)
RETURNS TABLE (secao text, quando date, quem text, titulo text, texto text, autor text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- A GUARDA FICA AQUI FORA, uma vez só, envolvendo a união inteira. Repetir
  -- `app_current_role()` em seis ramos é seis lugares para esquecer um no dia
  -- em que entrar o sétimo — e o ramo esquecido não falha: ele entrega.
  SELECT u.secao, u.quando, u.quem, u.titulo, u.texto, u.autor FROM (

  -- Ocorrência: só o que NÃO é de acesso restrito. O resto é contagem, e a
  -- razão está no cabeçalho deste arquivo.
  (SELECT 'ocorrencia' AS secao, (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date AS quando,
          NULL::text AS quem, i.category AS titulo, i.objective_fact AS texto,
          app_user_display_name(i.opened_by) AS autor
     FROM incident i
    WHERE i.house_id = p_house AND i.access_level <> 'restrito'
      AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate
    ORDER BY 2 DESC LIMIT 150)

  UNION ALL

  -- O episódio da ATA — o fato do turno, com a criança nomeada e a
  -- classificação do FATO. Nunca uma classificação da pessoa (§12.5).
  (SELECT 'episodio', (e.happened_at AT TIME ZONE 'America/Sao_Paulo')::date,
          coalesce(nullif(p.social_name, ''), p.full_name),
          e.classification, e.factual, app_user_display_name(e.created_by)
     FROM ata_episode e
     JOIN person p ON p.id = e.person_id
    WHERE e.house_id = p_house
      AND (e.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate
    ORDER BY 2 DESC LIMIT 150)

  UNION ALL

  -- A observação do turno, como o educador escreveu. Restrita fica de fora.
  (SELECT 'observacao', a.on_date, NULL::text, NULL::text, an.body,
          app_user_display_name(an.author_id)
     FROM ata_note an
     JOIN ata a ON a.id = an.ata_id
    WHERE an.house_id = p_house AND NOT an.restricted
      AND a.on_date BETWEEN p_de AND p_ate
    ORDER BY 2 DESC LIMIT 150)

  UNION ALL

  -- A parte boa, que ele pediu por escrito que viesse junto.
  (SELECT 'conquista', lm.happened_on,
          coalesce(nullif(p.social_name, ''), p.full_name),
          coalesce(lm.kind_other, lm.kind), lm.description,
          app_user_display_name(lm.registered_by)
     FROM life_milestone lm
     JOIN person p ON p.id = lm.person_id
    WHERE lm.house_id = p_house AND lm.happened_on BETWEEN p_de AND p_ate
    ORDER BY 2 DESC LIMIT 150)

  UNION ALL

  (SELECT 'educacao', ee.on_date,
          coalesce(nullif(p.social_name, ''), p.full_name),
          NULL::text, ee.narrative, app_user_display_name(ee.created_by)
     FROM education_evolution ee
     JOIN person p ON p.id = ee.person_id
    WHERE ee.house_id = p_house AND ee.on_date BETWEEN p_de AND p_ate
    ORDER BY 2 DESC LIMIT 150)

  UNION ALL

  (SELECT 'memoria', mr.happened_on,
          coalesce(nullif(p.social_name, ''), p.full_name),
          mr.event_type, mr.description, app_user_display_name(mr.created_by)
     FROM memory_record mr
     JOIN person p ON p.id = mr.person_id
    WHERE mr.happened_on BETWEEN p_de AND p_ate
      AND EXISTS (SELECT 1 FROM house_stay s
                   WHERE s.person_id = mr.person_id AND s.house_id = p_house)
    ORDER BY 2 DESC LIMIT 150)

  ) u
  WHERE app_house_in_scope(p_house)
    AND app_current_role() IN ('lider_diurno','equipe_tecnica','coordenador','gestor_geral');
$$
SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_periodo_da_casa_linhas(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_periodo_da_casa_linhas(uuid, date, date) TO rede_app;
