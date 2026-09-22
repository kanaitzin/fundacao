-- =============================================================================
-- 1450 — O PAINEL DO GESTOR PASSA A CONTAR O CONCEITO DO BIMESTRE.
--
-- A caixa que a Fundação pediu em 09/09/2026 era *"quantas crianças tiveram boas
-- notas"*. O painel (1280) respondeu com a verdade da época: **nota não existe
-- neste sistema** — e mostrou, no lugar, apoio educacional e evoluções escritas,
-- *"duas coisas verdadeiras, em vez de uma estimada"*.
--
-- A fase 137 criou o que faltava: o **conceito por bimestre**, com o motivo
-- obrigatório ao lado, escrito pela equipe técnica, pela coordenação e pelo Líder
-- Diurno. Ele é contável, e por isso esta caixa passa a ter de onde sair. O que a
-- 137 deixou escrito no §9 — *"o painel ainda não conta o conceito"* — deixa de
-- ser verdade aqui, e a frase da tela muda junto (é o que a fase 137 aprendeu:
-- frase de tela que envelhece é frase que mente).
--
-- ---------------------------------------------------------------------------
-- DUAS CONTAGENS, E POR QUE DUAS.
--
--   * **`conceito_acompanha`** — crianças cujo conceito vigente no período é
--     *"está acompanhando o ano"*. É a caixa que ele pediu;
--   * **`conceito_nao_acompanha`** — as que **não** estão acompanhando. Esta é a
--     que faz a casa agir, e é a razão de ela existir ao lado da primeira: um
--     painel que mostrasse só quem vai bem ensinaria a olhar para o lado bom, e a
--     criança que precisa de reforço escolar não apareceria em lugar nenhum.
--
-- **O conceito "acompanha com apoio" não vira caixa**, de propósito. Ele não é
-- meio-termo entre os dois: é uma criança que ESTÁ acompanhando, com apoio em
-- curso — e o apoio já tem a sua própria caixa desde a 1280. Contá-lo aqui faria
-- a mesma criança aparecer como número em duas caixas que somam coisas
-- diferentes, e três caixas de conceito num painel de oito casas começam a pedir
-- uma comparação que ninguém pediu.
--
-- ---------------------------------------------------------------------------
-- O PERÍODO: O BIMESTRE QUE ENCOSTA NA JANELA, e não a data de digitação.
--
-- O conceito é de um BIMESTRE, e a janela do painel é de datas. Contar pelo
-- `created_at` — quando alguém digitou — poria o conceito do 3º bimestre, lançado
-- em novembro, na conta de novembro; e o retorno atrasado da escola é justamente
-- o caso comum. Então a conta é por INTERSECÇÃO: entram os bimestres que
-- encostam na janela pedida.
--
-- `ano * 10 + bimestre` é a forma de comparar os dois eixos de uma vez, e é a
-- mesma conta que a 1430 usa para recusar bimestre no futuro. Escrevê-la duas
-- vezes é o preço de a função do painel ser `sql` puro e a da 1430 ser `plpgsql`;
-- se ela aparecer uma terceira vez, vira função própria.
--
-- E **só o conceito VIGENTE conta** (`substituido_em IS NULL`): a versão
-- corrigida é história, e somá-la faria a criança contar duas vezes — uma pelo
-- que se pensava dela em agosto, outra pelo que se soube em setembro.
-- =============================================================================

DROP FUNCTION IF EXISTS app_metricas_das_casas(date, date);

CREATE FUNCTION app_metricas_das_casas(p_de date, p_ate date)
RETURNS TABLE (
  house_id uuid, code text, name text,
  -- Quem está, e quanto cabe
  acolhidos int, capacidade int, entradas int, saidas int,
  -- Educação e conquistas
  passou_de_ano int, marcos int, apoio_educacional int, evolucoes_educacionais int,
  -- O conceito do bimestre (1450): quem está acompanhando, e quem não está.
  conceito_acompanha int, conceito_nao_acompanha int,
  -- Cuidado
  internacoes int, medicamentos_saidos int,
  notas_centavos bigint, notas_sem_valor int,
  -- Alimento
  lanches int, cestas int,
  -- O trabalho da equipe com o caso
  reunioes int, acompanhamentos_aprovados int, acompanhamentos_abertos int,
  relatorios int, atas_fechadas int, atas_com_pendencia int,
  ocorrencias int, ocorrencias_restritas int,
  pessoas_na_escala int
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT h.id, h.code, h.name,

    (SELECT count(*)::int FROM house_stay s
      WHERE s.house_id = h.id AND s.status = 'ativa'),
    h.capacity,
    (SELECT count(*)::int FROM house_stay s
      WHERE s.house_id = h.id
        AND (s.started_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),
    (SELECT count(*)::int FROM house_stay s
      WHERE s.house_id = h.id AND s.ended_at IS NOT NULL
        AND (s.ended_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),

    -- "Passou de ano" é um MARCO DE VIDA, registrado por quem acompanhou — e
    -- não uma dedução de data ou de série. É por isso que ele é contável.
    (SELECT count(*)::int FROM life_milestone m
      WHERE m.house_id = h.id AND m.kind = 'aprovacao_escolar'
        AND m.happened_on BETWEEN p_de AND p_ate),
    (SELECT count(*)::int FROM life_milestone m
      WHERE m.house_id = h.id AND m.happened_on BETWEEN p_de AND p_ate),
    -- O que existe no lugar de "boas notas": crianças COM apoio educacional
    -- ativo, e evoluções escritas no período. Duas coisas verdadeiras, em vez
    -- de uma estimada.
    (SELECT count(DISTINCT e.person_id)::int FROM education_support e
      WHERE e.house_id = h.id AND e.active),
    (SELECT count(*)::int FROM education_evolution e
      WHERE e.house_id = h.id AND e.on_date BETWEEN p_de AND p_ate),

    -- O CONCEITO DO BIMESTRE (1430), por INTERSECÇÃO de período — nunca pela
    -- data de digitação, e só o vigente. O porquê está no cabeçalho.
    (SELECT count(DISTINCT k.person_id)::int FROM education_concept k
      WHERE k.house_id = h.id AND k.substituido_em IS NULL
        AND k.conceito = 'acompanha'
        AND (k.ano * 10 + k.bimestre)
              BETWEEN (EXTRACT(YEAR FROM p_de)::int * 10
                       + ceil(EXTRACT(MONTH FROM p_de)::numeric / 3)::int)
                  AND (EXTRACT(YEAR FROM p_ate)::int * 10
                       + ceil(EXTRACT(MONTH FROM p_ate)::numeric / 3)::int)),
    (SELECT count(DISTINCT k.person_id)::int FROM education_concept k
      WHERE k.house_id = h.id AND k.substituido_em IS NULL
        AND k.conceito = 'nao_acompanha'
        AND (k.ano * 10 + k.bimestre)
              BETWEEN (EXTRACT(YEAR FROM p_de)::int * 10
                       + ceil(EXTRACT(MONTH FROM p_de)::numeric / 3)::int)
                  AND (EXTRACT(YEAR FROM p_ate)::int * 10
                       + ceil(EXTRACT(MONTH FROM p_ate)::numeric / 3)::int)),

    (SELECT count(*)::int FROM hospitalization i
      WHERE i.house_id = h.id
        AND (i.started_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),
    -- O que SAIU do armário. `medication_stock_movement` não tem casa: ela vem
    -- do estoque a que o movimento pertence.
    (SELECT coalesce(sum(mv.quantity), 0)::int
       FROM medication_stock_movement mv
       JOIN medication_stock st ON st.id = mv.stock_id
      WHERE st.house_id = h.id
        AND mv.kind IN ('consumo', 'descarte', 'saida_com_acolhido')
        AND (mv.at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),
    (SELECT coalesce(sum(c.total_cents), 0)::bigint FROM medication_purchase c
      WHERE c.house_id = h.id AND c.bought_on BETWEEN p_de AND p_ate),
    (SELECT count(*)::int FROM medication_purchase c
      WHERE c.house_id = h.id AND c.bought_on BETWEEN p_de AND p_ate
        AND c.total_cents IS NULL),

    -- Porções e cestas: o pedido cancelado não conta, porque não foi entregue.
    (SELECT coalesce(sum(k.quantity), 0)::int FROM kitchen_request k
      WHERE k.house_id = h.id AND k.kind = 'lanche' AND k.status = 'aberto'
        AND k.on_date BETWEEN p_de AND p_ate),
    (SELECT coalesce(sum(k.quantity), 0)::int FROM kitchen_request k
      WHERE k.house_id = h.id AND k.kind = 'cesta_basica' AND k.status = 'aberto'
        AND k.on_date BETWEEN p_de AND p_ate),

    (SELECT count(*)::int FROM team_meeting t
      WHERE t.house_id = h.id AND t.happened_on BETWEEN p_de AND p_ate),
    (SELECT count(*)::int FROM followup f
      WHERE f.house_id = h.id AND f.status = 'aprovado'
        AND f.period_end BETWEEN p_de AND p_ate),
    (SELECT count(*)::int FROM followup f
      WHERE f.house_id = h.id AND f.status <> 'aprovado'
        AND f.period_end BETWEEN p_de AND p_ate),
    (SELECT count(*)::int FROM report_document r
      WHERE r.house_id = h.id
        AND (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),
    -- As DUAS situações de fecho, separadas: uma ATA fechada com pendência é
    -- uma ATA sem a assinatura de alguém, e somá-la com as inteiras esconderia
    -- justamente o que a coordenação precisa ver.
    (SELECT count(*)::int FROM ata a
      WHERE a.house_id = h.id AND a.status = 'fechada' AND a.on_date BETWEEN p_de AND p_ate),
    (SELECT count(*)::int FROM ata a
      WHERE a.house_id = h.id AND a.status = 'fechada_com_pendencia'
        AND a.on_date BETWEEN p_de AND p_ate),

    (SELECT count(*)::int FROM incident i
      WHERE i.house_id = h.id
        AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),
    -- As graves, pelo recorte que o sistema de fato tem: `access_level` é o que
    -- o gatilho `incident_defaults` marca a partir da categoria. Não existe
    -- coluna "gravidade", e inventar uma aqui seria classificar por fora do
    -- que a casa registrou.
    (SELECT count(*)::int FROM incident i
      WHERE i.house_id = h.id AND i.access_level = 'restrito'
        AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),

    -- Pessoas DISTINTAS escaladas no período, sem contar as revogadas: é
    -- "quantas pessoas tem na escala", e não quantos plantões cada uma fez.
    (SELECT count(DISTINCT e.user_id)::int FROM shift_assignment e
      WHERE e.house_id = h.id AND e.revoked_at IS NULL
        AND e.on_date BETWEEN p_de AND p_ate)

    FROM house h
   WHERE h.institution_id = (SELECT institution_id FROM app_user WHERE id = app_current_user())
     AND app_current_role() = 'gestor_geral'
   -- Pelo CÓDIGO da casa, nunca por resultado. A ordem de uma tela é uma
   -- afirmação, e "ordenado por quem foi melhor" é a classificação pronta.
   ORDER BY h.code;
$$
-- `SET search_path` por extenso, e não por herança: `CREATE OR REPLACE` APAGA o
-- que a migração 1200 fixou, e uma função que roda como DONA do banco sem
-- caminho fixo é a lição da fase 102. O `arquivo-tem-saida.spec` confere no
-- catálogo, e foi ele que pegou esta — eu tinha esquecido.
SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_metricas_das_casas(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_metricas_das_casas(date, date) TO rede_app;
