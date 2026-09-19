-- ============================================================
-- 1260 — O trabalho de quem trabalha na casa, para quem coordena
--
-- PEDIDO DA FUNDAÇÃO, 15/09/2026, nas palavras dele: *"quero que seja
-- possível ver todo o trabalho e ações de cada educador e setor para a visão
-- do coordenador, dessa forma vamos ter certeza que tudo que foi lançado tem
-- um fim e um controle total de tudo."*
--
-- ISTO DESFAZ UMA RECUSA MINHA, E A RECUSA ESTAVA ESCRITA.
--
-- O `auditoria.service.ts` diz, desde a fase 112, que não há busca por pessoa
-- da equipe, que *"'tudo o que a Joana fez ontem' é vigilância — mede a
-- pessoa"*, e termina assim: *"se a Fundação quiser a busca por pessoa, isso é
-- decisão dela e vira outro caminho, com finalidade escrita e registro da
-- própria consulta."* A decisão veio. Este é o outro caminho, e ele foi
-- construído com as três condições que eu tinha escrito:
--
--  1. **outro caminho** — função própria, rota própria, tela própria. A tela
--     que quarenta pessoas abrem todo dia não ganhou filtro nenhum;
--  2. **finalidade escrita** — quem abre diz por quê, com no mínimo dez
--     caracteres, como no cofre de acessos e no relato restrito;
--  3. **registro da própria consulta** — abrir o trabalho de alguém é, ele
--     mesmo, uma ação auditada, com o nome de quem olhou. Quem consulta
--     também é consultável.
--
-- E UMA QUARTA, QUE É A QUE MAIS IMPORTA: **não conta nada.** Nenhum total,
-- nenhuma média, nenhuma lista de pessoas lado a lado. Ela responde *"o que a
-- Joana fez na terça"* e não responde *"quem fez mais"*. O motivo está no §7 e
-- no §8.9.1 e não mudou com o pedido: um número sobrevive ao contexto — daqui
-- a seis meses "12 linhas de ATA" continua na tela, e a noite em que ela ficou
-- com uma criança no colo, não.
--
-- POR QUE `audit_event`, E NÃO OITENTA E CINCO TABELAS
--
-- A autoria está gravada em ~85 tabelas, e juntá-las numa consulta seria
-- refazer, pior, o que o sistema já faz: toda ação relevante já escreve em
-- `audit_event` com `actor_id`, `house_id`, `at` e finalidade. E desde a fase
-- 115 cada uma das 170 ações tem uma frase em português, conferida contra o
-- código. A leitura do trabalho é essa tabela, filtrada por quem agiu — nada
-- de novo é gravado para esta tela existir.
--
-- POR QUE UMA FUNÇÃO E NÃO UMA POLICY NOVA
--
-- A `audit_select` entrega `audit_event` a três cargos, e o §7 promete a
-- leitura do rastro DE UMA CRIANÇA a esses mesmos. Alargar a policy para a
-- equipe técnica e o líder abriria as duas coisas de uma vez — e só uma foi
-- pedida. A função roda como dona, aplica a SUA regra, e a policy fica onde
-- está.
--
-- QUEM LÊ: equipe técnica, Líder Diurno e coordenação — os três que a
-- Fundação nomeou, e nesta ordem de surpresa: **o Gestor Geral NÃO está na
-- lista.** Ele não foi nomeado, e num painel de oito casas é onde a comparação
-- entre equipes ficaria mais fácil de fazer. Acrescentá-lo é uma linha.
-- ============================================================

-- A leitura por ATOR precisa de índice próprio. `idx_audit_actor` existe desde
-- a 0010 (`actor_id, at DESC`) e serve a busca por pessoa; a busca por SETOR
-- entra por `house_id` e data, que a 0010 também indexou.

CREATE OR REPLACE FUNCTION app_trabalho_da_equipe(
  p_pessoa     uuid,     -- uma pessoa da equipe; null quando a busca é por setor
  p_setor      text,     -- um cargo; null quando a busca é por pessoa
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
  IF app_current_role() NOT IN ('equipe_tecnica','lider_diurno','coordenador') THEN
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

  /*
   * ABRIR O TRABALHO DE ALGUÉM É, ELE MESMO, UMA AÇÃO.
   *
   * Gravada ANTES de devolver a lista, e de propósito: se a consulta falhar
   * depois disso, o registro de que alguém tentou olhar continua lá.
   */
  INSERT INTO audit_event (institution_id, actor_id, action, entity, entity_id,
                           purpose, detail)
  SELECT u.institution_id, v_me, 'staff.work_view', 'app_user', p_pessoa, v_fim,
         jsonb_build_object('setor', p_setor, 'de', p_de, 'ate', p_ate)
    FROM app_user u WHERE u.id = v_me;

  RETURN QUERY
    SELECT a.id,
           a.at,
           a.action,
           app_user_display_name(a.actor_id),
           au.role::text,
           h.code,
           a.entity,
           a.entity_id,
           a.purpose,
           a.detail
      FROM audit_event a
      JOIN app_user au ON au.id = a.actor_id
      LEFT JOIN house h ON h.id = a.house_id
     WHERE a.at >= (p_de::timestamp AT TIME ZONE 'America/Sao_Paulo')
       AND a.at <  ((p_ate + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
       /*
        * O RECORTE POR CASA É O MESMO DE SEMPRE, e vale para os três cargos:
        * quem lê alcança as casas em que trabalha, e nada além. Linha sem casa
        * — login, troca de senha — fica de fora: ela não é trabalho na casa, e
        * numa tela de supervisão viraria controle de ponto.
        */
       AND a.house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
       AND (p_pessoa IS NULL OR a.actor_id = p_pessoa)
       AND (p_setor  IS NULL OR au.role::text = p_setor)
       /* Quem lê não se audita a si mesmo por aqui: para isso há a linha do
          próprio dia, e misturar as duas coisas confunde quem lê. */
       AND a.actor_id IS NOT NULL
     ORDER BY a.at DESC
     LIMIT 300;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_trabalho_da_equipe(uuid, text, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_trabalho_da_equipe(uuid, text, date, date, text) TO rede_app;
