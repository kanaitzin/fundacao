-- =============================================================================
-- 1310 — A escala como ele descreveu: quem monta, a cor, e a substituição
--
-- A escala existe desde a 0950 e funciona quase exatamente como a Fundação a
-- descreveu em 15/09 — lançamento por data e turno, repetição de padrão,
-- preparação com meses de antecedência, retirada que some do turno na hora,
-- nada apagado. Antes de construir, eu MEDI o que faltava (§9, Grupo 2.5), e a
-- diferença eram quatro coisas. Esta migração fecha três.
--
--   *"Quando a gente cadastrar lá com o coordenador quem é o quadro da equipe,
--   eu quero que abra para ele lá a escala, onde ele possa lançar as pessoas.
--   Cada um com a sua cor diferente. […] Preparar semanas, meses antes. […]
--   Quando faltar alguém, eles só vão na escala e tiram aquela pessoa, e ela
--   automaticamente já sai. Substituir ou deixar a menos."*
--
-- E, sobre quem lança: *"pela equipe técnica, o coordenador ou o educador
-- líder."*
--
-- ---
--
-- 1. QUEM MONTA: entram a equipe técnica e o Líder Diurno
--
-- Até aqui, só coordenação e gestão. Ele nomeou três cargos, e os dois que
-- faltavam são exatamente quem está na casa quando a escala precisa mudar: o
-- Líder Diurno é quem descobre às 6h50 que alguém não veio, e a técnica é quem
-- remaneja quando a coordenadora está em audiência.
--
-- **O que NÃO muda junto:** a escala continua não sendo porta. Ela informa quem
-- devia estar e não impede ninguém de trabalhar — quem cobre um turno fora dela
-- assina a passagem do mesmo jeito, com o aviso de que não constava (§12.1).
-- Ampliar quem monta uma coisa que não bloqueia nada é barato; ampliar quem
-- monta uma trava seria outra conversa.
--
-- ---
--
-- 2. A COR, QUE EXISTIA E NÃO CHEGAVA AQUI
--
-- `app_user.line_color` existe desde a 0990, é escolhida pela pessoa, não se
-- repete dentro da casa — e era usada só na ATA. A escala, que é o lugar onde
-- *"cada um com a sua cor diferente"* faz mais sentido, não a carregava nem a
-- desenhava. Uma coluna a mais no retorno, e nenhuma tabela nova.
--
-- **A cor continua sendo APOIO.** O nome vai escrito ao lado, sempre. Um
-- sistema em que só a cor diz quem é quem mente para quem não distingue as
-- oito — e a folha da parede sai em preto e branco na impressora da casa.
--
-- ---
--
-- 3. SUBSTITUIR NUM GESTO SÓ
--
-- *"Substituir ou deixar a menos."* Hoje são dois atos separados — Retirar, e
-- depois Escalar outra pessoa —, e entre um e outro o turno fica vazio na tela
-- de quem está olhando. Pior: os dois atos não se sabem parentes, e daqui a
-- três meses a escala mostra uma revogação e uma escalação sem relação nenhuma
-- entre si, no mesmo dia e turno.
--
-- `app_substituir_no_plantao` faz os dois numa transação e **guarda o
-- parentesco**: a linha nova aponta para a que ela substituiu. É o que permite
-- a tela dizer *"entrou no lugar de Fulana"* em vez de deixar a coincidência
-- para quem lê deduzir.
--
-- *"Deixar a menos" continua existindo e continua sendo `app_desescalar`:* uma
-- casa pode mesmo passar o turno com uma pessoa a menos, e transformar toda
-- retirada numa substituição obrigatória seria o sistema exigindo da casa uma
-- pessoa que ela não tem.
--
-- ---
--
-- 4. O QUE ESTA MIGRAÇÃO **NÃO** FAZ, e por quê
--
-- *"A gente não vai deduzir a escala."* Hoje, quando a escala do dia existe,
-- ela manda; quando NÃO existe, o sistema ainda cai para a escala semanal e
-- depois para o vínculo da casa (0960), sempre declarando a fonte.
--
-- **Eu não retiro isso sem ele saber o que acontece no lugar.** Sem escala
-- lançada e sem dedução, a passagem de plantão fica sem ninguém para assinar —
-- e o dia em que isso aparece é o primeiro dia de uso, com a escala real ainda
-- não digitada. A pergunta está no §4.5 do `PARA-A-REUNIAO`, e a mudança é de
-- uma linha quando ele responder.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Quem monta
-- -----------------------------------------------------------------------------
-- A RLS primeiro: é ela quem recusa de verdade, e a função vem depois. Trocar
-- só a função deixaria a porta do banco aberta para o cargo novo por um lado e
-- fechada por outro — e a divergência só apareceria no dia de um `INSERT`
-- direto, que é quando ninguém está olhando.
DROP POLICY IF EXISTS sa_insert ON shift_assignment;
CREATE POLICY sa_insert ON shift_assignment FOR INSERT TO rede_app
  WITH CHECK (app_current_role()
                IN ('lider_diurno','equipe_tecnica','coordenador','gestor_geral')
              AND app_house_in_scope(house_id));

DROP POLICY IF EXISTS sa_update ON shift_assignment;
CREATE POLICY sa_update ON shift_assignment FOR UPDATE TO rede_app
  USING (app_current_role()
           IN ('lider_diurno','equipe_tecnica','coordenador','gestor_geral')
         AND app_house_in_scope(house_id))
  WITH CHECK (app_house_in_scope(house_id));

-- -----------------------------------------------------------------------------
-- 3. O parentesco da substituição
-- -----------------------------------------------------------------------------
-- Sem FK circular: a coluna aponta para outra linha da MESMA tabela, e é a
-- linha nova que aponta para a antiga — quem entrou sabe de quem é o lugar.
ALTER TABLE shift_assignment
  ADD COLUMN IF NOT EXISTS replaces_assignment_id uuid REFERENCES shift_assignment(id);

COMMENT ON COLUMN shift_assignment.replaces_assignment_id IS
  'Quando este plantão nasceu de uma SUBSTITUIÇÃO, o plantão que ele substituiu. '
  'Guardar o parentesco é o que permite a tela dizer "entrou no lugar de Fulana" '
  'em vez de deixar a coincidência de dia e turno para quem lê deduzir.';

-- -----------------------------------------------------------------------------
-- As funções, com os dois cargos novos
-- -----------------------------------------------------------------------------
-- `CREATE OR REPLACE` APAGA o `SET search_path` que a 1200 fixou. Ele volta por
-- extenso nas três — é a lição da fase 102, e o `arquivo-tem-saida.spec` a
-- confere no catálogo.

CREATE OR REPLACE FUNCTION app_escalar(
  p_house uuid, p_user uuid, p_de date, p_periodo text,
  p_inicio time, p_fim time, p_nota text,
  p_repetir_a_cada integer DEFAULT NULL, p_ate date DEFAULT NULL
) RETURNS TABLE (criadas integer, ja_existiam integer) AS $$
DECLARE
  v_data date := p_de; v_criadas int := 0; v_pulou int := 0; v_passo int;
BEGIN
  IF app_current_role() NOT IN
       ('lider_diurno','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'escala: quem monta a escala da casa é a coordenação, a equipe técnica ou o Líder Diurno dela.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_periodo NOT IN ('diurno','noturno') THEN
    RAISE EXCEPTION 'escala: o turno é diurno ou noturno.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = p_user AND u.active) THEN
    RAISE EXCEPTION 'escala: esta pessoa não está ativa no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_passo := coalesce(p_repetir_a_cada, 0);
  IF v_passo < 0 OR v_passo > 7 THEN
    RAISE EXCEPTION 'escala: a repetição vai de 1 a 7 dias.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_ate IS NOT NULL AND p_ate > p_de + 366 THEN
    RAISE EXCEPTION 'escala: monte no máximo um ano por vez.' USING ERRCODE = 'check_violation';
  END IF;

  LOOP
    BEGIN
      INSERT INTO shift_assignment
        (house_id, user_id, on_date, period, start_time, end_time, note, created_by)
      VALUES (p_house, p_user, v_data, p_periodo, p_inicio, p_fim,
              nullif(btrim(coalesce(p_nota,'')), ''), app_current_user());
      v_criadas := v_criadas + 1;
    EXCEPTION WHEN unique_violation THEN
      v_pulou := v_pulou + 1;
    END;

    EXIT WHEN v_passo = 0 OR p_ate IS NULL;
    v_data := v_data + v_passo;
    EXIT WHEN v_data > p_ate;
  END LOOP;

  RETURN QUERY SELECT v_criadas, v_pulou;
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_escalar(uuid,uuid,date,text,time,time,text,integer,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_escalar(uuid,uuid,date,text,time,time,text,integer,date) TO rede_app;


CREATE OR REPLACE FUNCTION app_desescalar(p_id uuid, p_motivo text)
RETURNS boolean AS $$
DECLARE v_a shift_assignment%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM shift_assignment WHERE id = p_id;
  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'escala_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF app_current_role() NOT IN
       ('lider_diurno','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'escala: quem monta a escala da casa é a coordenação, a equipe técnica ou o Líder Diurno dela.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_house_in_scope(v_a.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_a.revoked_at IS NOT NULL THEN
    RETURN false;
  END IF;
  -- Mudar o futuro é organização; mudar o passado é dizer que a pessoa não
  -- estava lá, e isso muda a resposta de "quem estava na casa naquela noite?".
  IF v_a.on_date < app_hoje() AND length(btrim(coalesce(p_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'escala: este plantão já passou. Escreva por que a escala dele muda — é ela que responde quem estava na casa naquela noite.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE shift_assignment
     SET revoked_at = now(), revoked_by = app_current_user(),
         revoke_reason = nullif(btrim(coalesce(p_motivo,'')), '')
   WHERE id = p_id;
  RETURN true;
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_desescalar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_desescalar(uuid, text) TO rede_app;


-- -----------------------------------------------------------------------------
-- 2. A escala do período, agora com a cor de cada pessoa
-- -----------------------------------------------------------------------------
-- DROP ANTES, e não `CREATE OR REPLACE`: esta função ganhou DUAS colunas no
-- `RETURNS TABLE` — a cor e de quem é o lugar —, e o Postgres recusa trocar o
-- tipo de retorno de uma função existente ("cannot change return type of
-- existing function"). O erro aparece na MIGRAÇÃO, e não em tempo de escrita,
-- e é por isso que ele vale um comentário: quem acrescentar uma terceira
-- coluna aqui vai esbarrar nele de novo.
DROP FUNCTION IF EXISTS app_escala_do_periodo(uuid, date, date);
CREATE OR REPLACE FUNCTION app_escala_do_periodo(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (
  on_date date, period text, assignment_id uuid, user_id uuid, quem text,
  cargo text, cor text, start_time time, end_time time, note text,
  revoked_at timestamptz, revoke_reason text, revogou text,
  -- De quem é o lugar que esta pessoa ocupou. Nulo quando não é substituição.
  substituiu text
) AS $$
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
        SELECT r.role::text AS papel, r.line_color AS cor
          FROM app_user r WHERE r.id = a.user_id
      ) u_role ON true
     ORDER BY d.dia, (t.turno = 'noturno'), app_user_display_name(a.user_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_escala_do_periodo(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_escala_do_periodo(uuid, date, date) TO rede_app;


-- -----------------------------------------------------------------------------
-- 3. Substituir num gesto só
-- -----------------------------------------------------------------------------
-- Os dois atos numa transação, e o parentesco guardado. A função é `plpgsql`
-- num bloco só: se a escalação da pessoa nova falhar — porque ela já está no
-- turno, porque está inativa —, a retirada da anterior **não acontece**. Duas
-- chamadas separadas da aplicação não dariam essa garantia, e o estado
-- intermediário (turno vazio) é exatamente o que a casa não pode ver.
CREATE OR REPLACE FUNCTION app_substituir_no_plantao(
  p_id uuid, p_novo_user uuid, p_motivo text)
RETURNS TABLE (novo_id uuid, saiu text, entrou text) AS $$
DECLARE v_a shift_assignment%ROWTYPE; v_novo uuid;
BEGIN
  SELECT * INTO v_a FROM shift_assignment WHERE id = p_id;
  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'escala_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF app_current_role() NOT IN
       ('lider_diurno','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'escala: quem monta a escala da casa é a coordenação, a equipe técnica ou o Líder Diurno dela.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_house_in_scope(v_a.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_a.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'escala: este plantão já tinha sido retirado da escala. Escale a pessoa nova direto.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_novo_user = v_a.user_id THEN
    RAISE EXCEPTION 'escala: a pessoa que entra é a mesma que sai. Para só mudar o horário, retire e escale de novo.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = p_novo_user AND u.active) THEN
    RAISE EXCEPTION 'escala: esta pessoa não está ativa no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- O passado pede motivo, como na retirada — e pela mesma razão.
  IF v_a.on_date < app_hoje() AND length(btrim(coalesce(p_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'escala: este plantão já passou. Escreva por que a escala dele muda — é ela que responde quem estava na casa naquela noite.'
      USING ERRCODE = 'check_violation';
  END IF;

  /*
   * A PESSOA NOVA ENTRA PRIMEIRO, e a antiga sai depois.
   *
   * Não é indiferente: se a nova já estivesse escalada neste turno, o
   * `unique_violation` estoura AQUI, antes de a antiga ter saído — e a
   * transação volta com o turno intacto. Na ordem inversa, o erro chegaria
   * depois de a casa já ter perdido quem estava escalado, e a recusa deixaria
   * um rastro pior do que o pedido.
   */
  INSERT INTO shift_assignment
    (house_id, user_id, on_date, period, start_time, end_time, note,
     created_by, replaces_assignment_id)
  VALUES (v_a.house_id, p_novo_user, v_a.on_date, v_a.period,
          v_a.start_time, v_a.end_time, v_a.note,
          app_current_user(), v_a.id)
  RETURNING shift_assignment.id INTO v_novo;

  UPDATE shift_assignment
     SET revoked_at = now(), revoked_by = app_current_user(),
         /* O motivo guarda a substituição por escrito, e não só pelo
            parentesco: quem lê a linha revogada seis meses depois lê uma
            frase, e não um id. */
         revoke_reason = coalesce(
           nullif(btrim(coalesce(p_motivo,'')), ''),
           'Substituído(a) por ' || app_user_display_name(p_novo_user) || '.')
   WHERE id = p_id;

  RETURN QUERY SELECT v_novo,
                      app_user_display_name(v_a.user_id),
                      app_user_display_name(p_novo_user);
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_substituir_no_plantao(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_substituir_no_plantao(uuid, uuid, text) TO rede_app;
