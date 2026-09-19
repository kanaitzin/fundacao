-- ============================================================
-- 1270 — O Gestor Geral passa a ver as oito casas, e em contagem
--
-- DECISÃO DA FUNDAÇÃO, 15/09/2026, nas palavras dele: *"o gestor vê tudo o
-- que ele quiser, em uma visão apenas contagens e métricas, na visão total ele
-- vê tudo, afinal ele é o chefe de todas as casas."*
--
-- A fase 117 tinha deixado o Gestor Geral DE FORA da leitura do trabalho da
-- equipe, e a ausência estava escrita aqui e num teste: ele não havia sido
-- nomeado, e num painel de oito casas é onde a comparação entre equipes fica
-- mais fácil de fazer. Era uma decisão minha, sujeita à dele. Ele decidiu.
--
-- O QUE MUDA, LITERALMENTE:
--
--  1. ele entra em `app_trabalho_da_equipe`. O recorte por casa não precisou
--     mudar: `app_casas_no_alcance()` já devolve as oito para o cargo dele
--     desde a 0920, e é assim que "ver tudo" acontece sem regra nova;
--  2. nasce `app_metricas_do_trabalho`, que CONTA — por casa, por setor, por
--     pessoa e por tipo de ação. É a primeira contagem por pessoa do sistema.
--
-- O QUE NÃO MUDA, E NÃO É TEIMOSIA:
--
--  * **criança não entra em contagem nenhuma.** Nem aqui, nem em lugar
--    nenhum: a regra 3 é sobre proteger quem é cuidado, e ela não foi o que a
--    Fundação revisou. As métricas contam ATOS DE TRABALHO — chamadas
--    abertas, doses confirmadas, linhas de ATA —, nunca pessoas acolhidas,
--    nunca comportamento, nunca "ocorrências por criança";
--  * **continua exigindo finalidade escrita**, e a consulta continua sendo
--    ela mesma auditada. O que mudou foi quem alcança, e não a condição de
--    alcançar;
--  * **a ordem não é classificação.** As linhas saem por nome e por código de
--    casa, nunca por total decrescente. Quem quiser ordenar por número
--    ordena na cabeça — e vai saber que está fazendo isso.
--
-- E FICA DITO, porque é a razão de eu ter recusado antes: um total ao lado de
-- um nome atravessa meses sem o contexto que o explicava. "12 linhas de ATA"
-- continua na tela em março; a noite em que ela ficou com uma criança no colo
-- em vez de escrever, não. Quem ler estas contagens está lendo o que foi
-- REGISTRADO, que é diferente do que foi feito — e a diferença costuma ser
-- maior justamente na noite mais difícil. A decisão é da Fundação, o aviso é
-- meu, e ele vai junto na tela.
-- ============================================================

-- ------------------------------------------------------------
-- 1. A leitura do trabalho passa a incluir o Gestor Geral
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_trabalho_da_equipe(
  p_pessoa     uuid,
  p_setor      text,
  p_de         date,
  p_ate        date,
  p_finalidade text
) RETURNS TABLE (
  id          uuid,
  quando      timestamptz,
  acao        text,
  quem        text,
  quem_cargo  text,
  casa        text,
  entidade    text,
  entidade_id uuid,
  finalidade  text,
  detalhe     jsonb
) AS $$
DECLARE
  v_me    uuid := app_current_user();
  v_fim   text := btrim(coalesce(p_finalidade, ''));
BEGIN
  IF app_current_role() NOT IN ('equipe_tecnica','lider_diurno','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'trabalho_fora_do_alcance' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF length(v_fim) < 10 THEN
    RAISE EXCEPTION 'finalidade_obrigatoria' USING ERRCODE = 'check_violation';
  END IF;
  IF (p_pessoa IS NULL) = (p_setor IS NULL) THEN
    RAISE EXCEPTION 'pessoa_ou_setor' USING ERRCODE = 'check_violation';
  END IF;
  IF p_ate < p_de OR (p_ate - p_de) > 92 THEN
    RAISE EXCEPTION 'janela_invalida' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO audit_event (institution_id, actor_id, action, entity, entity_id,
                           purpose, detail)
  SELECT u.institution_id, v_me, 'staff.work_view', 'app_user', p_pessoa, v_fim,
         jsonb_build_object('setor', p_setor, 'de', p_de, 'ate', p_ate)
    FROM app_user u WHERE u.id = v_me;

  RETURN QUERY
    SELECT a.id, a.at, a.action,
           app_user_display_name(a.actor_id), au.role::text, h.code,
           a.entity, a.entity_id, a.purpose, a.detail
      FROM audit_event a
      JOIN app_user au ON au.id = a.actor_id
      LEFT JOIN house h ON h.id = a.house_id
     WHERE a.at >= (p_de::timestamp AT TIME ZONE 'America/Sao_Paulo')
       AND a.at <  ((p_ate + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
       /* Para o Gestor Geral isto já são as OITO casas, desde a 0920 — "ver
          tudo" não precisou de regra nova, só do cargo na lista acima.
          Linha sem casa (login, troca de senha) continua fora: ela não é
          trabalho na casa, e numa tela de supervisão vira controle de ponto. */
       AND a.house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
       AND (p_pessoa IS NULL OR a.actor_id = p_pessoa)
       AND (p_setor  IS NULL OR au.role::text = p_setor)
       AND a.actor_id IS NOT NULL
     ORDER BY a.at DESC
     LIMIT 300;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_trabalho_da_equipe(uuid, text, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_trabalho_da_equipe(uuid, text, date, date, text) TO rede_app;

-- ------------------------------------------------------------
-- 2. As contagens — a primeira do sistema que soma por pessoa
-- ------------------------------------------------------------
--
-- Devolve QUATRO recortes numa consulta só, cada linha marcada pelo seu
-- `recorte`. Uma chamada, quatro leituras: a tela não precisa pedir de novo
-- para trocar de aba, e as quatro falam do MESMO período — duas consultas
-- separadas em horários diferentes dariam números que não fecham, e quem
-- lesse ia procurar o erro na casa.
CREATE OR REPLACE FUNCTION app_metricas_do_trabalho(
  p_de         date,
  p_ate        date,
  p_finalidade text
) RETURNS TABLE (
  recorte  text,     -- 'casa' | 'setor' | 'pessoa' | 'acao'
  chave    text,     -- o código, quando existe (para a tela traduzir)
  rotulo   text,     -- o nome legível
  extra    text,     -- cargo da pessoa, ou casa da pessoa — só onde ajuda
  quantos  bigint
) AS $$
DECLARE
  v_me  uuid := app_current_user();
  v_fim text := btrim(coalesce(p_finalidade, ''));
BEGIN
  /*
   * SÓ O GESTOR GERAL. Foi ele quem a Fundação nomeou para a visão de
   * contagens, e é ele quem responde pelas oito casas. Estender à coordenação
   * na própria casa é uma linha aqui e uma no serviço — e é uma decisão, não
   * um ajuste.
   */
  IF app_current_role() <> 'gestor_geral' THEN
    RAISE EXCEPTION 'metricas_fora_do_alcance' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF length(v_fim) < 10 THEN
    RAISE EXCEPTION 'finalidade_obrigatoria' USING ERRCODE = 'check_violation';
  END IF;
  IF p_ate < p_de OR (p_ate - p_de) > 366 THEN
    RAISE EXCEPTION 'janela_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Contar também é olhar, e olhar fica registrado.
  INSERT INTO audit_event (institution_id, actor_id, action, purpose, detail)
  SELECT u.institution_id, v_me, 'staff.work_metrics', v_fim,
         jsonb_build_object('de', p_de, 'ate', p_ate)
    FROM app_user u WHERE u.id = v_me;

  RETURN QUERY
  WITH base AS (
    SELECT a.action, a.actor_id, au.role::text AS cargo, h.code AS casa
      FROM audit_event a
      JOIN app_user au ON au.id = a.actor_id
      JOIN house h ON h.id = a.house_id
     WHERE a.at >= (p_de::timestamp AT TIME ZONE 'America/Sao_Paulo')
       AND a.at <  ((p_ate + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
       AND a.house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
       AND a.actor_id IS NOT NULL
  )
  -- A ordem FINAL não é daqui: o `ORDER BY` abaixo existe para a resposta ser
  -- determinística, e quem ordena para a tela é o serviço, em português.
  --
  -- Duas razões, e as duas apareceram na suíte: o PostgreSQL põe "Cátia"
  -- DEPOIS de "Cida" na colação deste banco, e o português não; e os SETORES
  -- aqui são códigos (`lider_diurno`), enquanto a tela mostra rótulos ("Líder
  -- Diurno") — ordenar por um e mostrar o outro é uma lista fora de ordem que
  -- nada acusa, porque alguém ordenou, só que outra coisa.
  SELECT 'casa'::text, b.casa, b.casa, NULL::text, count(*)
    FROM base b GROUP BY b.casa
  UNION ALL
  SELECT 'setor'::text, b.cargo, b.cargo, NULL::text, count(*)
    FROM base b GROUP BY b.cargo
  UNION ALL
  SELECT 'pessoa'::text, b.actor_id::text,
         app_user_display_name(b.actor_id), b.cargo, count(*)
    FROM base b GROUP BY b.actor_id, b.cargo
  UNION ALL
  SELECT 'acao'::text, b.action, b.action, NULL::text, count(*)
    FROM base b GROUP BY b.action
  ORDER BY 1, 3;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_metricas_do_trabalho(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_metricas_do_trabalho(date, date, text) TO rede_app;
