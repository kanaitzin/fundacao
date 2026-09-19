-- ============================================================
-- 1280 — As métricas das oito casas, para o Gestor Geral
--
-- RESPOSTA DA FUNDAÇÃO, 15/09/2026, à pergunta que estava aberta desde 09/09 e
-- que eu tinha me recusado a adivinhar: *"o que o Gestor Geral precisa ver de
-- cada casa?"*
--
-- Ele respondeu com uma lista, e esta função é essa lista:
--
--   *"quantas crianças passaram de ano, quantas crianças tiveram boas notas,
--   quais casas estão tendo bom acompanhamento, bom desenvolvimento
--   educacional, bons relatórios, a quantidade de criança de cada casa […]
--   quantas reuniões foram feitas em cada casa […] quantas pessoas tem na
--   escala de cada casa […] quantas internações teve em cada casa, quantos
--   medicamentos está saindo de cada casa, o preço total das notas fiscais
--   […] a quantidade de alimentos que são dados para eles, de lanches,
--   semanalmente, mensalmente"*
--
-- E o PARA QUÊ, que é o que decide o desenho: *"para ele poder dizer isso como
-- uma forma de amor que o Pão dos Pobres tem"*. Isto não é um painel de
-- controle: é a matéria-prima de um relatório de impacto.
--
-- ---
--
-- UMA MÉTRICA QUE ELE PEDIU E QUE NÃO TEM DE ONDE SAIR
--
-- *"quantas crianças tiveram boas notas."* Não existe campo de nota, boletim
-- ou conceito neste sistema. O que existe é a SÉRIE (`4º ano`, em
-- `profile_detail.school_grade`) e a evolução educacional em TEXTO LIVRE
-- (`education_evolution.narrative`) — que não se conta.
--
-- **Não inventei um número para ela.** A função devolve, no lugar, o que é
-- verdade hoje: quantas crianças têm APOIO EDUCACIONAL registrado e quantas
-- EVOLUÇÕES educacionais foram escritas no período. Para contar nota é preciso
-- passar a registrar nota, e isso é decisão da casa — está no §4.5 do
-- `PARA-A-REUNIAO`. Um painel que estimasse "boas notas" a partir de texto
-- livre daria ao Gestor Geral um número que ninguém digitou.
--
-- ---
--
-- COMPARAR CASAS: ELE RESPONDEU À MINHA OBJEÇÃO, E A RESPOSTA ESTÁ AQUI
--
-- Eu vinha recusando comparação entre casas. Ele foi direto:
--
--   *"Não interessa se para ti parece uma competição. Ele precisa ter os dados
--   reais. Qual é a casa que está dando mais resultado? Tem um motivo? […] é
--   uma forma de ele poder melhorar o acompanhamento das outras casas para as
--   outras crianças que não atingiram o tamanho dos resultados."*
--
-- Aceito, e a frase dele é melhor do que a minha recusa: o alvo da comparação
-- não é a equipe, é **a criança da outra casa que não teve o mesmo resultado**.
-- Então as casas saem lado a lado, com os números reais.
--
-- O que continua valendo, porque não foi o que ele revisou:
--
--  * **a ordem é o CÓDIGO da casa, nunca o total.** A lista ordenada por
--    resultado já é a classificação, e ela apareceria sem ninguém ter decidido
--    fazê-la. Quem quiser ordenar ordena na cabeça — e vai saber que fez isso;
--  * **nenhuma contagem é por criança nomeada.** São somas por casa;
--  * **nada de média, meta ou projeção.** Contagem é fato; média é juízo
--    disfarçado de fato, e a conversa que ela abre é sobre o número.
--
-- E UMA HONESTIDADE QUE VAI NA TELA: o preço das notas fiscais SOMA só o que
-- foi lançado. `medication_purchase.total_cents` aceita nulo — uma compra
-- registrada sem valor some da soma. Por isso a função devolve também
-- `notas_sem_valor`: um total de R$ 4.200 com seis notas sem valor lançado não
-- é R$ 4.200, e quem lê precisa saber disso ANTES de pôr o número num
-- relatório de prestação de contas.
-- ============================================================

CREATE OR REPLACE FUNCTION app_metricas_das_casas(p_de date, p_ate date)
RETURNS TABLE (
  house_id uuid, code text, name text,
  -- Quem está, e quanto cabe
  acolhidos int, capacidade int, entradas int, saidas int,
  -- Educação e conquistas
  passou_de_ano int, marcos int, apoio_educacional int, evolucoes_educacionais int,
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
