-- =============================================================================
-- 0950 — A ESCALA DA CASA, POR DATA (§5.12, pendência institucional 33.4.3)
--
-- Pedido do Marcelo em 08/09/2026: uma aba onde ele prepare com antecedência
-- quem assume cada dia — da semana e do mês —, com os nomes dos educadores do
-- sistema, as datas e as horas, sem deixar a casa desassistida; que gere a
-- folha para pregar na parede; e que guarde o mês passado, para o dia em que
-- for preciso investigar um evento de meses atrás.
--
-- POR QUE UMA TABELA NOVA, E NÃO A `work_schedule` QUE EXISTE DESDE A FUNDAÇÃO
--
-- `work_schedule` é SEMANAL: dia da semana, hora de início e hora de fim. Ela
-- serve para quem tem horário fixo — a Enfermagem das 9h às 17h, a equipe
-- técnica — e é o que a 0420 lê para saber quem devia assinar a passagem.
--
-- **Uma 12x36 não cabe numa semana.** Trabalha-se 12 horas e descansa-se 36: o
-- ciclo é de 48 horas e ANDA PELO CALENDÁRIO. Quem trabalha terça esta semana
-- não trabalha terça na semana que vem. "Toda terça a Joana" é falso na terça
-- seguinte, e uma escala que mente sobre quem está na casa é pior do que
-- escala nenhuma: ela nomeia gente de folga na lista de faltas da ATA (foi
-- exatamente o defeito 1 da 0420, por outro caminho).
--
-- Por isso a escala é POR DATA. A semanal continua existindo e continua certa
-- para quem tem horário fixo — as duas convivem, e a 0960 diz em que ordem.
--
-- TRÊS DECISÕES QUE VALEM REGISTRO
--
--  1. **nada é apagado.** Tirar alguém de um plantão é REVOGAR, com autor e
--     horário; a linha continua lá. É o que permite responder, meses depois,
--     "quem estava na casa naquela noite?" — que é a pergunta que motivou o
--     pedido. Revogar plantão de data JÁ PASSADA exige motivo escrito: mudar o
--     futuro é organização, mudar o passado é outra coisa;
--  2. **a escala não bloqueia nada.** Ela informa quem devia estar, e a casa
--     continua funcionando quando a realidade não bate — quem cobriu um turno
--     fora da escala assina a passagem do mesmo jeito, com o aviso de que não
--     constava (§12.1). Escala que trava é escala que a casa contorna;
--  3. **sem contagem por pessoa.** A folha da parede traz o dia, o turno e os
--     nomes — nunca "Fulana: 15 plantões no mês". Somar plantões por pessoa é a
--     distância de um `ORDER BY` de virar medição de gente, que o §3.3 proíbe.
-- =============================================================================

CREATE TABLE shift_assignment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id     uuid NOT NULL REFERENCES house(id),
  user_id      uuid NOT NULL REFERENCES app_user(id),
  on_date      date NOT NULL,
  period       text NOT NULL CHECK (period IN ('diurno','noturno')),
  -- Horas próprias, quando o plantão não é o padrão da casa. Nulo = o horário
  -- do turno (7h–19h, 19h–7h). O Marcelo pediu "até as horas" justamente para
  -- a cobertura parcial: quem entra às 13h para cobrir metade do turno.
  start_time   time,
  end_time     time,
  note         text,
  created_by   uuid NOT NULL REFERENCES app_user(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_by   uuid REFERENCES app_user(id),
  revoked_at   timestamptz,
  revoke_reason text
);

-- A mesma pessoa não entra duas vezes no mesmo turno do mesmo dia — mas pode
-- voltar depois de revogada (troca desfeita), e por isso o índice é PARCIAL.
CREATE UNIQUE INDEX uq_shift_assignment_viva
  ON shift_assignment (house_id, user_id, on_date, period)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_shift_assignment_casa_dia
  ON shift_assignment (house_id, on_date, period) WHERE revoked_at IS NULL;
-- O histórico é lido por período; sem este índice, "o mês passado" varre tudo.
CREATE INDEX idx_shift_assignment_historico ON shift_assignment (house_id, on_date DESC);

ALTER TABLE shift_assignment ENABLE ROW LEVEL SECURITY;

-- LÊ QUEM TRABALHA NA CASA. Não é dado sensível: é o contrário — o educador
-- precisa saber quando ele trabalha, e a escala pregada na parede já é
-- pública dentro da casa. Regra 16: o papel primeiro, o escopo depois, com CASE.
CREATE POLICY sa_select ON shift_assignment FOR SELECT TO rede_app
  USING (CASE WHEN app_current_role() IN ('gestor_geral','enfermagem','lider_noturno_geral')
              THEN true
              ELSE house_id = ANY (ARRAY(SELECT app_casas_no_alcance())) END);

-- ESCREVE a coordenação da casa e a gestão. O escopo por linha é conferido
-- também aqui: coordenador é cargo de UMA casa (a lição da 0820).
CREATE POLICY sa_insert ON shift_assignment FOR INSERT TO rede_app
  WITH CHECK (app_current_role() IN ('coordenador','gestor_geral')
              AND app_house_in_scope(house_id));
CREATE POLICY sa_update ON shift_assignment FOR UPDATE TO rede_app
  USING (app_current_role() IN ('coordenador','gestor_geral')
         AND app_house_in_scope(house_id))
  WITH CHECK (app_house_in_scope(house_id));

GRANT SELECT, INSERT, UPDATE ON shift_assignment TO rede_app;
REVOKE DELETE ON shift_assignment FROM rede_app;

-- Só a revogação muda uma linha viva: o resto é imutável. Sem isto, corrigir
-- "quem estava de plantão" seria reescrever o passado sem deixar rastro.
CREATE OR REPLACE FUNCTION sa_so_revoga() RETURNS trigger AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'escala_ja_revogada' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.house_id <> OLD.house_id OR NEW.user_id <> OLD.user_id
     OR NEW.on_date <> OLD.on_date OR NEW.period <> OLD.period
     OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'escala_nao_se_reescreve' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER sa_so_revoga_trg BEFORE UPDATE ON shift_assignment
  FOR EACH ROW EXECUTE FUNCTION sa_so_revoga();

-- E APAGAR NÃO EXISTE, nem para o dono do banco.
--
-- `REVOKE DELETE` já barra a aplicação, mas o `rede_admin` — que é quem migra —
-- passaria por cima, e a pergunta que esta tabela existe para responder ("quem
-- estava na casa naquela noite?") não sobrevive a um DELETE feito às pressas.
-- Tirar alguém da escala é `app_desescalar`, que deixa a linha e o motivo.
CREATE TRIGGER sa_nao_apaga BEFORE DELETE ON shift_assignment
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- -----------------------------------------------------------------------------
-- Escalar alguém — e a repetição que preenche o mês
-- -----------------------------------------------------------------------------
-- A repetição existe porque a alternativa é a coordenação preencher trinta dias
-- um a um, e uma tela assim não é usada: a escala volta para o papel. "A cada 2
-- dias, mesmo turno" é o desenho de uma 12x36; "a cada 7" é o horário fixo.
--
-- Ela é IDEMPOTENTE: repetir o mesmo comando não duplica linha, porque o índice
-- parcial recusa e o comando pula. Quem clicar duas vezes no fim de um turno de
-- doze horas não vai descobrir isso lendo a lista.
CREATE OR REPLACE FUNCTION app_escalar(
  p_house uuid, p_user uuid, p_de date, p_periodo text,
  p_inicio time, p_fim time, p_nota text,
  p_repetir_a_cada integer DEFAULT NULL, p_ate date DEFAULT NULL
) RETURNS TABLE (criadas integer, ja_existiam integer) AS $$
DECLARE
  v_data date := p_de; v_criadas int := 0; v_pulou int := 0; v_passo int;
BEGIN
  IF app_current_role() NOT IN ('coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'escala: quem monta a escala da casa é a coordenação dela.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Regra 8: SECURITY DEFINER com casa SEMPRE confere o alcance.
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
  -- Um mês de cada vez: sem teto, um clique escreveria dez anos de plantão.
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
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_escalar(uuid,uuid,date,text,time,time,text,integer,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_escalar(uuid,uuid,date,text,time,time,text,integer,date) TO rede_app;

-- -----------------------------------------------------------------------------
-- Tirar alguém do plantão
-- -----------------------------------------------------------------------------
-- Revogar plantão FUTURO é organização: troca de folga, férias, remanejamento.
-- Revogar plantão que JÁ PASSOU é dizer que a pessoa não estava lá — e isso
-- muda a resposta de "quem estava na casa naquela noite?". Pede motivo escrito.
CREATE OR REPLACE FUNCTION app_desescalar(p_id uuid, p_motivo text)
RETURNS boolean AS $$
DECLARE v_a shift_assignment%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM shift_assignment WHERE id = p_id;
  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'escala_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF app_current_role() NOT IN ('coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'escala: quem monta a escala da casa é a coordenação dela.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_house_in_scope(v_a.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_a.revoked_at IS NOT NULL THEN
    RETURN false;
  END IF;
  IF v_a.on_date < app_hoje() AND length(btrim(coalesce(p_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'escala: este plantão já passou. Escreva por que a escala dele muda — é ela que responde quem estava na casa naquela noite.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE shift_assignment
     SET revoked_at = now(), revoked_by = app_current_user(),
         revoke_reason = nullif(btrim(coalesce(p_motivo,'')), '')
   WHERE id = p_id;
  RETURN true;
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_desescalar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_desescalar(uuid, text) TO rede_app;

-- -----------------------------------------------------------------------------
-- A escala de um período, e os turnos sem ninguém
-- -----------------------------------------------------------------------------
-- "Não deixando a casa desassistida" foi o jeito do Marcelo de pedir isto: a
-- tela precisa mostrar o BURACO, e não só o que já foi preenchido. Um dia sem
-- linha nenhuma se lê como "ainda não montei"; o que se quer ver é "ninguém
-- está escalado para a noite de sábado".
--
-- Ela devolve os dois turnos de TODOS os dias do período, mesmo os vazios —
-- ausência de linha não é informação, e é justamente o que precisa gritar.
CREATE OR REPLACE FUNCTION app_escala_do_periodo(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (
  on_date date, period text, assignment_id uuid, user_id uuid, quem text,
  cargo text, start_time time, end_time time, note text,
  revoked_at timestamptz, revoke_reason text, revogou text
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
           app_user_display_name(a.user_id), u_role.papel,
           a.start_time, a.end_time, a.note,
           a.revoked_at, a.revoke_reason, app_user_display_name(a.revoked_by)
      FROM generate_series(p_de, p_ate, interval '1 day') AS d(dia)
      CROSS JOIN (VALUES ('diurno'), ('noturno')) AS t(turno)
      LEFT JOIN shift_assignment a
             ON a.house_id = p_house AND a.on_date = d.dia::date AND a.period = t.turno
      LEFT JOIN LATERAL (
        SELECT r.role::text AS papel FROM app_user r WHERE r.id = a.user_id
      ) u_role ON true
     ORDER BY d.dia, (t.turno = 'noturno'), app_user_display_name(a.user_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_escala_do_periodo(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_escala_do_periodo(uuid, date, date) TO rede_app;
