-- ============================================================
-- O CARGO DA ÉPOCA (fase 165).
--
-- Pedido de 25/09: *"quando um funcionário trocar de cargo, registros antigos
-- devem continuar indicando corretamente qual era sua função naquele
-- momento"*. `app_user_cargo` devolve o cargo de HOJE: a educadora promovida a
-- líder aparecia como Líder Diurno nas linhas da ATA que escreveu quando ainda
-- era educadora, e o trabalho do setor mudava de setor para trás.
--
-- O histórico mora em `app_user_role_period`, um período por cargo, e quem o
-- escreve é o GATILHO de `app_user`: qualquer caminho que troque o cargo
-- (`app_update_staff`, uma correção feita à mão pelo suporte) passa por ele.
-- Nada se apaga: o período anterior é FECHADO, com a hora e quem trocou.
--
-- O QUE NÃO SE SABE, E A MIGRAÇÃO DIZ: antes dela não havia histórico. O cargo
-- conhecido de cada pessoa é o atual, e ele vale desde sempre ('-infinity').
-- Se alguém trocou de cargo antes desta data, a troca não foi registrada em
-- lugar nenhum, e inventar uma data seria pior do que admitir.
-- ============================================================

CREATE TABLE app_user_role_period (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_user(id),
  role       role_code NOT NULL,
  from_at    timestamptz NOT NULL,
  to_at      timestamptz,
  -- Quem trocou. Nulo no período de partida e numa troca feita fora da
  -- aplicação, sem identidade na sessão.
  changed_by uuid REFERENCES app_user(id),
  CHECK (to_at IS NULL OR to_at >= from_at)
);
CREATE UNIQUE INDEX uq_cargo_vigente ON app_user_role_period (user_id) WHERE to_at IS NULL;
CREATE INDEX idx_cargo_periodo ON app_user_role_period (user_id, from_at DESC);

-- Só as funções abaixo leem e escrevem: nenhuma política para rede_app.
ALTER TABLE app_user_role_period ENABLE ROW LEVEL SECURITY;

INSERT INTO app_user_role_period (user_id, role, from_at)
SELECT id, role, '-infinity'::timestamptz FROM app_user;

CREATE OR REPLACE FUNCTION app_registrar_troca_de_cargo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO app_user_role_period (user_id, role, from_at)
    VALUES (NEW.id, NEW.role, '-infinity');
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE app_user_role_period SET to_at = now()
     WHERE user_id = NEW.id AND to_at IS NULL;
    INSERT INTO app_user_role_period (user_id, role, from_at, changed_by)
    VALUES (NEW.id, NEW.role, now(), app_current_user());
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_cargo_da_epoca
  AFTER INSERT OR UPDATE OF role ON app_user
  FOR EACH ROW EXECUTE FUNCTION app_registrar_troca_de_cargo();

/*
 * O cargo de uma pessoa NUM INSTANTE. Mesma forma da irmã `app_user_cargo`
 * (1560): um campo, o código do cargo, sem casa e sem cadastro. Se o instante
 * cair fora de todo período (não deveria), devolve o cargo atual.
 */
CREATE OR REPLACE FUNCTION app_user_cargo_em(p_user uuid, p_at timestamptz)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT coalesce(
    (SELECT p.role::text FROM app_user_role_period p
      WHERE p.user_id = p_user AND p.from_at <= p_at
        AND (p.to_at IS NULL OR p.to_at > p_at)
      ORDER BY p.from_at DESC LIMIT 1),
    (SELECT u.role::text FROM app_user u WHERE u.id = p_user))
$$;
REVOKE ALL ON FUNCTION app_user_cargo_em(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_user_cargo_em(uuid, timestamptz) TO rede_app;

-- ------------------------------------------------------------------
-- As três leituras que mostravam o cargo de HOJE para um fato antigo.
-- Mesmas assinaturas e mesmos retornos; muda só de onde sai o cargo.
-- ------------------------------------------------------------------

-- A escala: o cargo da pessoa NAQUELE dia (meio-dia do dia do plantão).
CREATE OR REPLACE FUNCTION public.app_escala_do_periodo(p_house uuid, p_de date, p_ate date)
 RETURNS TABLE(on_date date, period text, assignment_id uuid, user_id uuid, quem text, cargo text, cor text, start_time time without time zone, end_time time without time zone, note text, revoked_at timestamp with time zone, revoke_reason text, revogou text, substituiu text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_ate < p_de OR p_ate > p_de + 186 THEN
    RAISE EXCEPTION 'escala: consulte no máximo seis meses por vez.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
    -- rls-join-ok: `shift_assignment` já responde à política de casa; o nome de
    -- quem trabalha sai por app_user_display_name (regra 10) — junção com
    -- `app_user`, que tem RLS de linha, sumiria com a LINHA da escala.
    SELECT d.dia::date, t.turno::text, a.id, a.user_id,
           app_user_display_name(a.user_id), u_role.papel, u_role.cor,
           a.start_time, a.end_time, a.note,
           a.revoked_at, a.revoke_reason, app_user_display_name(a.revoked_by),
           app_user_display_name(ant.user_id)
      FROM generate_series(p_de, p_ate, interval '1 day') AS d(dia)
      CROSS JOIN (VALUES ('diurno'), ('noturno')) AS t(turno)
      LEFT JOIN shift_assignment a
             ON a.house_id = p_house AND a.on_date = d.dia::date AND a.period = t.turno
      LEFT JOIN shift_assignment ant ON ant.id = a.replaces_assignment_id
      LEFT JOIN LATERAL (
        /* O cargo e a COR saem do mesmo lugar e na mesma passada: a cor é da
           pessoa (0990), não do plantão, e por isso não vira coluna aqui. */
        SELECT app_user_cargo_em(a.user_id,
                 ((d.dia::date + time '12:00') AT TIME ZONE 'America/Sao_Paulo')) AS papel,
               r.line_color AS cor
          FROM app_user r WHERE r.id = a.user_id
      ) u_role ON true
     ORDER BY d.dia, (t.turno = 'noturno'), app_user_display_name(a.user_id);
END $function$;

-- O trabalho do setor, para o Gestor Geral: agrupado pelo cargo de QUANDO a
-- ação aconteceu. A promovida não leva o trabalho de educadora para a liderança.
CREATE OR REPLACE FUNCTION public.app_metricas_do_trabalho(p_de date, p_ate date, p_finalidade text)
 RETURNS TABLE(recorte text, chave text, rotulo text, extra text, quantos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
    SELECT a.action, a.actor_id, app_user_cargo_em(a.actor_id, a.at) AS cargo, h.code AS casa
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
END $function$;

-- O trabalho da equipe: o cargo ao lado da ação é o da época, e o filtro por
-- setor também.
CREATE OR REPLACE FUNCTION public.app_trabalho_da_equipe(p_pessoa uuid, p_setor text, p_de date, p_ate date, p_finalidade text)
 RETURNS TABLE(id uuid, quando timestamp with time zone, acao text, quem text, quem_cargo text, casa text, entidade text, entidade_id uuid, finalidade text, detalhe jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
           app_user_display_name(a.actor_id), app_user_cargo_em(a.actor_id, a.at), h.code,
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
       AND (p_setor  IS NULL OR app_user_cargo_em(a.actor_id, a.at) = p_setor)
       AND a.actor_id IS NOT NULL
     ORDER BY a.at DESC
     LIMIT 300;
END $function$;
