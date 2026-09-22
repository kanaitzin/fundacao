-- ============================================================
-- 1470 — Quem não está na casa sai da grade do dia
--
-- Pedido da Fundação em 22/09: *"veja se está funcionando a internação
-- removendo temporariamente a criança da linha do tempo comum da casa e seus
-- horários pré-programados, assim como a remoção temporária por visitas
-- domiciliares."*
--
-- NÃO ESTAVA. Medido: com o Bruno internado desde ontem
-- (`app_esta_internado` = true), `app_generate_day` criou para ele o
-- "Reforço escolar" das 10h no estado `aguardando_ciencia` — uma pendência
-- pedindo que o plantão dê ciência de uma atividade de uma criança que está no
-- hospital.
--
-- É O MESMO DEFEITO DA FASE 127, NA SUPERFÍCIE QUE FALTOU. A 1350 pôs num
-- lugar só a resposta para "de quem esta chamada trata", e a Enfermagem já
-- omitia a dose de quem está fora (0200, com o argumento escrito). A GRADE DO
-- DIA ficou de fora das duas: `app_generate_day` (0110, refeita na 0400)
-- nasceu antes da internação (0890) e da convivência familiar (1010), e
-- ninguém voltou para lhe contar. Ela pergunta só se o acolhido está ATIVO na
-- casa — e a criança internada continua ativa na casa, que é o ponto: a
-- ausência é temporária, e por isso não mexe no vínculo.
--
-- A DECISÃO NÃO É NOVA, e é por isso que esta migração não inventa frase
-- nenhuma. Ela é a de 0200, por extenso: *"uma tela cheia de pendência
-- impossível é uma tela que a equipe aprende a não olhar"* — e a atividade
-- individual de quem não está aqui é exatamente isso. O item **não é apagado
-- nem marcado como não realizado**: o sistema não conclui que ele não
-- aconteceu, porque não sabe. Ele deixa de nascer, e o que já nasceu deixa de
-- ser cobrado (o serviço).
--
-- A ATIVIDADE COLETIVA NÃO MUDA. O café da manhã da casa acontece com dezenove
-- crianças do mesmo jeito que com vinte: `person_id IS NULL` não tem de quem
-- perguntar, e sumir com o café porque uma criança está internada seria
-- apagar a rotina da casa.
--
-- O COMPROMISSO TAMBÉM NÃO. Consulta marcada com profissional de fora não se
-- esconde: alguém precisa desmarcar, e para isso existe a
-- `commitment_exception`. Esconder faria a casa perder a consulta em silêncio.
--
-- E A RESPOSTA PASSA A TER UM LUGAR SÓ — `app_ausente_da_casa`. A fase 127
-- aprendeu isto do jeito caro: a regra estava escrita em quatro lugares e três
-- deles estavam errados. Regra nova de ausência — acampamento, escola em turno
-- integral, hospital-dia — se escreve UMA vez, aqui dentro.
-- ============================================================

-- ------------------------------------------------------------
-- "Esta criança não está na casa neste dia."
--
-- NÃO É `SECURITY DEFINER`, pelo mesmo motivo da `app_efetivo_da_chamada`
-- (1350): chamada de dentro de uma função que é dona, lê como dona; chamada
-- pelo serviço, lê sob o RLS de quem perguntou. As duas que ela consulta já
-- são definer e trazem o `search_path` por extenso.
--
-- POR DIA, e não "agora": a grade de ontem, regerada hoje para conferência,
-- precisa saber como a casa estava ONTEM.
--
-- Os dois predicados continuam separados lá dentro de propósito — no hospital
-- outro profissional cuida; com a família, ninguém da casa cuida —, e é a 0200
-- que explica por que a diferença importa para o remédio.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_ausente_da_casa(p_person uuid, p_dia date DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_esta_internado(p_person, coalesce(p_dia, app_hoje()))
      OR app_em_convivencia_familiar(p_person, coalesce(p_dia, app_hoje()))
$$;
REVOKE ALL ON FUNCTION app_ausente_da_casa(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_ausente_da_casa(uuid, date) TO rede_app;

COMMENT ON FUNCTION app_ausente_da_casa(uuid, date) IS
  'A criança não está na casa neste dia — internada (0890) ou em convivência familiar (1010). Resposta única: regra nova de ausência se escreve aqui, e não em cada consulta.';

-- ------------------------------------------------------------
-- A GRADE DO DIA (0110, refeita na 0400) passa a perguntar.
--
-- O corpo abaixo foi COPIADO do arquivo da 0400, não redigitado: a lição das
-- fases 1450 e 1460 é que redigitar SQL de memória inventa coluna. A única
-- diferença é a linha do `app_ausente_da_casa`.
--
-- E O `SET search_path` VEM POR EXTENSO. `CREATE OR REPLACE` APAGA o que a
-- função já tinha, e esta é `SECURITY DEFINER` — o texto da 0400 não traz a
-- linha porque quem a fixou foi uma migração posterior. Quem olha só a
-- migração que criou não vê a que endureceu depois; o `arquivo-tem-saida.spec.ts`
-- lê o catálogo por isso.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_generate_day(p_house uuid, p_date date)
RETURNS TABLE (criadas integer, ja_existiam integer) AS $$
DECLARE v_criadas integer := 0; v_exist integer := 0; v_dow smallint;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_dow := extract(dow from p_date);

  SELECT count(*) INTO v_exist FROM activity
   WHERE house_id = p_house
     AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = p_date
     AND routine_item_id IS NOT NULL;

  WITH vigente AS (
    SELECT id FROM routine_version WHERE house_id = p_house AND valid_to IS NULL
  ), novos AS (
    INSERT INTO activity (house_id, person_id, routine_item_id, kind, title,
                          scheduled_at, ends_at, requires_ack, instructions,
                          state, created_by)
    SELECT ri.house_id,
           ri.person_id,
           ri.id,
           ri.kind::text,
           ri.title,
           (p_date + ri.start_time) AT TIME ZONE 'America/Sao_Paulo',
           CASE WHEN ri.end_time IS NOT NULL
                THEN (p_date + ri.end_time) AT TIME ZONE 'America/Sao_Paulo' END,
           ri.requires_ack,
           ri.instructions,
           CASE WHEN ri.requires_ack THEN 'aguardando_ciencia'::activity_state
                ELSE 'agendada'::activity_state END,
           app_current_user()
    FROM routine_item ri
    JOIN vigente v ON v.id = ri.version_id
    WHERE ri.house_id = p_house
      AND v_dow = ANY (ri.weekdays)
      -- Comparação no fuso da INSTITUIÇÃO, igual à da gravação logo acima.
      AND NOT EXISTS (
        SELECT 1 FROM activity a
        WHERE a.routine_item_id = ri.id
          AND (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = p_date)
      -- atividade individual só nasce se o acolhido está ativo na casa hoje
      AND (ri.person_id IS NULL OR EXISTS (
        SELECT 1 FROM house_stay s
        WHERE s.person_id = ri.person_id AND s.house_id = p_house AND s.status = 'ativa'))
      -- E SÓ NASCE SE ELA ESTÁ AQUI NESTE DIA (1470). Internada ou com a
      -- família, o item individual não nasce: pendência que ninguém pode
      -- cumprir ensina a equipe a não olhar a tela.
      AND (ri.person_id IS NULL OR NOT app_ausente_da_casa(ri.person_id, p_date))
    RETURNING 1
  )
  SELECT count(*) INTO v_criadas FROM novos;

  RETURN QUERY SELECT v_criadas, v_exist;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_generate_day(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_generate_day(uuid, date) TO rede_app;

-- ------------------------------------------------------------
-- A TERCEIRA PONTA, e é a que chegava a uma pessoa.
--
-- `app_mark_unconfirmed_ids` (0790) marca como "sem confirmação" o que venceu e
-- pede que alguém seja avisado — prioridade alta, para a coordenação e a equipe
-- técnica. Com a criança internada, o item individual dela vencia de hora em
-- hora e ESCALAVA: *"1 atividade venceu sem registro nesta casa"*, sobre uma
-- criança que está no hospital. Aviso falso repetido é pior do que aviso
-- nenhum, porque ensina a fechar a caixa sem ler.
--
-- Ela NÃO PASSA a marcar como "não realizada" nem apaga: o item fica como
-- está. `sem_confirmacao` é uma afirmação sobre o plantão — "venceu e ninguém
-- registrou" — e ela é falsa quando não havia o que registrar.
--
-- Corpo tirado do CATÁLOGO (`pg_get_functiondef`), com uma linha a mais.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_mark_unconfirmed_ids(p_house uuid, p_minutes integer DEFAULT 60)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_house IS NULL THEN
    RAISE EXCEPTION 'casa_obrigatoria';
  END IF;
  -- A checagem de escopo é a PRIMEIRA coisa, como manda a regra 8: SECURITY
  -- DEFINER desliga o RLS, e sem isto qualquer conta autenticada marcaria as
  -- atividades de outra casa passando o uuid dela.
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    UPDATE activity SET state = 'sem_confirmacao', updated_at = now()
     WHERE house_id = p_house
       AND state IN ('agendada','aguardando_ciencia','ciente')
       AND scheduled_at < now() - (p_minutes || ' minutes')::interval
       -- 1470: quem não está na casa neste dia não tem plantão a cobrar.
       AND (activity.person_id IS NULL
            OR NOT app_ausente_da_casa(activity.person_id,
                  (activity.scheduled_at AT TIME ZONE app_fuso())::date))
    RETURNING activity.id;
END $function$;
REVOKE ALL ON FUNCTION app_mark_unconfirmed_ids(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_mark_unconfirmed_ids(uuid, integer) TO rede_app;
