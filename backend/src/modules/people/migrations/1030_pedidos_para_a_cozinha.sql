-- ============================================================
-- 1030 — Pedidos para a cozinha
--
-- Pedido do Marcelo em 09/09: a cozinha NÃO entra no sistema agora. O que a
-- casa precisa é gerar documentos e entregá-los a eles — em Word, com timbre,
-- porque circulam entre setores.
--
-- Dois pedidos, uma tabela:
--
--  * LANCHE — a casa reserva lanche para um acolhido, com data, quantidade e
--    finalidade. É o que hoje se pede por bilhete ou de viva-voz.
--  * CESTA BÁSICA — a criança vai passar dias com a família e leva a cesta.
--    Nasce do mesmo lugar da experiência familiar (1010).
--
-- QUEM PEDE: qualquer educador ou líder. Foi decisão do Marcelo, e é a certa —
-- quem percebe que falta lanche para a saída de sábado é quem está no turno.
-- Fica registrado com o nome de quem pediu, e é isso que substitui a
-- autorização prévia: não é controle de acesso, é autoria.
--
-- O QUE NÃO ENTRA NO DOCUMENTO: diagnóstico, motivo judicial, CPF. A folha vai
-- para a cozinha, e a cozinha precisa de nome, data e quantidade. O resto não é
-- da conta de quem prepara a comida — e papel que circula entre setores é o
-- lugar onde dado sobra e ninguém percebe.
--
-- CANCELAR NÃO APAGA. O pedido cancelado fica, com motivo: a cozinha pode já
-- ter comprado, e "some do sistema" não desfaz compra.
-- ============================================================

CREATE TABLE IF NOT EXISTS kitchen_request (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id    uuid NOT NULL REFERENCES house(id),
  kind        text NOT NULL CHECK (kind IN ('lanche','cesta_basica')),
  -- A quem se destina. Coletivo (a casa toda) é NULL — a saída do grupo para o
  -- parque pede lanche para todo mundo, e nomear vinte crianças seria pior.
  person_id   uuid REFERENCES person(id),
  on_date     date NOT NULL,
  quantity    integer NOT NULL CHECK (quantity > 0),
  -- Para quê. Exigido: "1 lanche" sem finalidade obriga a cozinha a adivinhar.
  purpose     text NOT NULL CHECK (length(btrim(purpose)) >= 5),
  notes       text,
  -- A quem a cozinha entrega, quando não é quem pediu.
  handover_to text,
  status      text NOT NULL DEFAULT 'aberto'
              CHECK (status IN ('aberto','cancelado')),
  cancel_reason text,
  requested_by  uuid NOT NULL REFERENCES app_user(id),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  canceled_by   uuid REFERENCES app_user(id),
  canceled_at   timestamptz,
  CHECK (status = 'aberto' OR cancel_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_request_dia
  ON kitchen_request (house_id, on_date DESC);

ALTER TABLE kitchen_request ENABLE ROW LEVEL SECURITY;

/*
 * Toda a equipe da casa lê e a lista é a mesma para todos: o pedido de lanche
 * não guarda nada sobre a criança além do nome e da data, e a educadora do
 * turno seguinte precisa saber o que já foi pedido para não pedir de novo.
 */
CREATE POLICY kr_select ON kitchen_request FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance())));
CREATE POLICY kr_insert ON kitchen_request FOR INSERT TO rede_app WITH CHECK (false);
GRANT SELECT ON kitchen_request TO rede_app;

-- ------------------------------------------------------------
-- Pedir.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_pedir_a_cozinha(
  p_house uuid, p_kind text, p_person uuid, p_data date,
  p_quantidade integer, p_finalidade text, p_obs text DEFAULT NULL,
  p_entregar_a text DEFAULT NULL)
RETURNS TABLE (pedido_id uuid) AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Quem pede é quem está no turno. A cozinha não é área restrita: o controle
  -- aqui é de AUTORIA, não de acesso.
  IF app_current_role() NOT IN ('educador','lider_diurno','lider_noturno_geral',
                                'equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_pedido_cozinha' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(length(btrim(p_finalidade)), 0) < 5 THEN
    RAISE EXCEPTION 'finalidade_obrigatoria' USING ERRCODE = 'check_violation';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'quantidade_invalida' USING ERRCODE = 'check_violation';
  END IF;
  /*
   * NÃO HÁ TRAVA DE DATA — e isso foi corrigido em 09/09, depois de eu ter
   * posto uma que ninguém pediu.
   *
   * A casa tem dezenove crianças e no dia chega a vigésima. O lanche vai ser
   * entregue de qualquer jeito: o que o sistema pode fazer é REGISTRAR, ou
   * ficar sem saber. Recusar a data de ontem não faz o lanche deixar de sair —
   * faz o registro deixar de existir, e a contagem do mês nascer errada.
   *
   * A cozinha aceita pedido com 48h de antecedência para se organizar; isso é
   * combinado entre as pessoas, e o sistema não é o lugar de impor.
   */
  IF p_person IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM house_stay s
       WHERE s.person_id = p_person AND s.house_id = p_house AND s.status = 'ativa') THEN
    RAISE EXCEPTION 'pessoa_fora_da_casa' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO kitchen_request (house_id, kind, person_id, on_date, quantity,
                               purpose, notes, handover_to, requested_by)
  VALUES (p_house, p_kind, p_person, p_data, p_quantidade,
          btrim(p_finalidade), nullif(btrim(p_obs), ''),
          nullif(btrim(p_entregar_a), ''), app_current_user())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_pedir_a_cozinha(uuid,text,uuid,date,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_pedir_a_cozinha(uuid,text,uuid,date,integer,text,text,text) TO rede_app;

-- ------------------------------------------------------------
-- Cancelar — com motivo, e sem apagar.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_cancelar_pedido_cozinha(p_id uuid, p_motivo text)
RETURNS TABLE (cancelado boolean) AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM kitchen_request WHERE id = p_id;
  IF r IS NULL OR NOT app_house_in_scope(r.house_id) THEN
    RAISE EXCEPTION 'pedido_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 5 THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE kitchen_request
     SET status = 'cancelado', cancel_reason = btrim(p_motivo),
         canceled_by = app_current_user(), canceled_at = now()
   WHERE id = p_id AND status = 'aberto';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pedido_ja_cancelado' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_cancelar_pedido_cozinha(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_cancelar_pedido_cozinha(uuid, text) TO rede_app;

-- ------------------------------------------------------------
-- Os pedidos de um período.
--
-- O cancelado VEM JUNTO, marcado. Some-lo faria a lista mentir sobre o que a
-- casa pediu — e a cozinha pode já ter comprado.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_pedidos_da_cozinha(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (id uuid, kind text, person_id uuid, para_quem text, em date,
               quantidade integer, finalidade text, observacao text,
               entregar_a text, status text, motivo_cancelamento text,
               pedido_por text, pedido_em timestamptz) AS $$
  SELECT k.id, k.kind, k.person_id,
         CASE WHEN k.person_id IS NULL THEN 'Casa toda'
              ELSE coalesce(nullif(p.social_name,''), p.full_name) END,
         k.on_date, k.quantity, k.purpose, k.notes, k.handover_to,
         k.status, k.cancel_reason,
         /* Nome SEMPRE por app_user_display_name: `app_user` tem RLS de linha,
            e a junção sumiria com o nome em silêncio (regra 10). */
         app_user_display_name(k.requested_by), k.requested_at
    FROM kitchen_request k
    LEFT JOIN person p ON p.id = k.person_id
   WHERE k.house_id = p_house
     AND app_house_in_scope(p_house)
     AND k.on_date BETWEEN p_de AND p_ate
   ORDER BY k.on_date, k.requested_at
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_pedidos_da_cozinha(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_pedidos_da_cozinha(uuid, date, date) TO rede_app;

-- ============================================================
-- A CONTABILIZAÇÃO — quanto de comida saiu, e para quantas crianças.
--
-- Pedido do Marcelo em 09/09: a casa precisa saber quantas porções de lanche
-- saíram na semana e no mês, e quantas cestas foram para as famílias. Isso é
-- métrica de gestão, e é uma das poucas que fazem sentido aqui: o impacto
-- alimentar do acolhimento.
--
-- O QUE ELA CONTA: porções, crianças alcançadas, cestas, e QUANTAS PESSOAS
-- pediram.
--
-- O QUE ELA NÃO CONTA, DE PROPÓSITO: quanto cada educador pediu. A autoria de
-- cada pedido está na lista e na folha — quem pediu o quê tem nome. Mas somar
-- por pessoa é medir gente, e o projeto recusa isso desde o painel do plantão:
-- um número por educador é comparado mesmo sem tela de comparação, e "quem
-- pede mais lanche" não descreve trabalho nenhum. `quem_pediu` é a contagem de
-- pessoas DISTINTAS, que responde "a casa inteira usa isto ou só duas
-- pessoas?" sem apontar para ninguém.
--
-- E ela não olha restrição alimentar. Volume de comida e saúde de criança são
-- assuntos diferentes, e juntá-los num painel faria diagnóstico virar
-- estatística.
-- ============================================================
CREATE OR REPLACE FUNCTION app_resumo_da_cozinha(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (
  lanches_porcoes bigint, lanches_pedidos bigint, lanches_criancas bigint,
  cestas bigint, cestas_criancas bigint,
  cancelados bigint, quem_pediu bigint) AS $$
  SELECT
    /* Porções e pedidos são números diferentes: um pedido de 20 lanches para a
       saída do grupo é um pedido e vinte porções, e confundir os dois faz a
       casa parecer que pede pouco. */
    coalesce(sum(k.quantity) FILTER (WHERE k.kind = 'lanche' AND k.status = 'aberto'), 0),
    count(*) FILTER (WHERE k.kind = 'lanche' AND k.status = 'aberto'),
    count(DISTINCT k.person_id) FILTER (WHERE k.kind = 'lanche' AND k.status = 'aberto'),
    coalesce(sum(k.quantity) FILTER (WHERE k.kind = 'cesta_basica' AND k.status = 'aberto'), 0),
    count(DISTINCT k.person_id) FILTER (WHERE k.kind = 'cesta_basica' AND k.status = 'aberto'),
    count(*) FILTER (WHERE k.status = 'cancelado'),
    count(DISTINCT k.requested_by)
  FROM kitchen_request k
  WHERE k.house_id = p_house
    AND app_house_in_scope(p_house)
    AND k.on_date BETWEEN p_de AND p_ate
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_resumo_da_cozinha(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resumo_da_cozinha(uuid, date, date) TO rede_app;
