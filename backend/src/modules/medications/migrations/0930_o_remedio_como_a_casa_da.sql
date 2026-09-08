-- =============================================================================
-- 0930 — O REMÉDIO É DADO POR QUEM ESTÁ NA CASA (§11.1, §11.3)
--
-- A pendência institucional 33.4.1 — "quem administra medicamentos em cada
-- período" — estava em aberto desde agosto, e o sistema respondia a ela com o
-- padrão mais protetivo que se podia escrever sem saber: SÓ A ENFERMAGEM, e
-- educador apenas se a coordenação tivesse escrito um protocolo para aquele
-- período E autorizado aquela pessoa nominalmente.
--
-- A resposta veio do Marcelo em 08/09/2026, e desfaz a hipótese:
--
--   * o remédio é dado pela Enfermagem OU pelo pessoal da casa, conforme a
--     bula do atendido;
--   * a ENFERMAGEM TRABALHA DAS 9h ÀS 17h. Depois disso é o educador de
--     plantão, e ponto — não por exceção autorizada, mas porque é ele quem
--     está lá. Vários tratamentos têm dose à noite;
--   * o medicamento fica numa caixa a que só a equipe tem acesso.
--
-- O que o sistema fazia com a hipótese antiga, agora que se sabe o horário da
-- Enfermagem: TODA dose noturna caía na recusa "o protocolo desta casa não
-- autoriza educadores a confirmar doses neste período. Acione a Enfermagem" —
-- às 22h, para acionar quem foi embora às 17h. A dose seria dada (a criança
-- precisa dela) e ficaria SEM REGISTRO, que é o pior dos dois mundos: o
-- remédio na criança e o sistema dizendo que ninguém deu.
--
-- INVERSÃO DO PADRÃO. O educador de plantão pode confirmar dose. O que passa a
-- existir é o contrário: a EXCEÇÃO, por medicamento — "este aqui só a
-- Enfermagem dá" —, com motivo escrito e histórico. É a decisão do Marcelo de
-- 08/09 na pergunta 4: a tela deixa de autorizar pessoas e passa a marcar
-- medicamentos.
--
-- Por que a exceção é por MEDICAMENTO e não por período ou por pessoa:
-- injetável, controlado ou de manejo difícil continua sendo injetável às 22h.
-- O período não diz nada sobre o remédio, e a autorização nominal fazia a
-- proteção depender de a coordenação lembrar de cadastrar cada educador novo —
-- e, quando ela esquecia, quem pagava era a dose da noite.
--
-- QUEM CADASTRA O ESQUEMA passa a ser também a coordenação e a equipe técnica,
-- e não só a Enfermagem: quem recebe a criança com a receita na mão às 20h é
-- quem está na casa. Continua valendo que o esquema NASCE RASCUNHO e só entra
-- na grade quando alguém o ativa, com o nome dele registrado — o que muda é
-- que esse alguém pode ser um dos três, e não uma pessoa que já foi embora.
--
-- O QUE NÃO MUDA, e é o que sustenta o resto:
--   * a confirmação continua UMA A UMA, por quem administrou (§11.2). Nada
--     aqui abre marcação em lote;
--   * `medication_protocol`, `medication_protocol_change` e
--     `medication_authorization` NÃO são apagadas: o que a casa decidiu em
--     agosto continua legível. Elas deixam de DECIDIR, não de existir (regra 6).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Quem cadastra e ativa o esquema
-- -----------------------------------------------------------------------------
-- A Enfermagem continua sendo quem mais entende do assunto; ela deixa de ser a
-- única porta. Cada prescrição já guarda `created_by` e `signed_by`: a troca
-- amplia quem pode, e não quem aparece no registro.
CREATE OR REPLACE FUNCTION app_can_prescribe() RETURNS boolean AS $$
  SELECT app_current_role() IN
    ('enfermagem','coordenador','equipe_tecnica','gestor_geral')
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 2. A exceção, por medicamento
-- -----------------------------------------------------------------------------
ALTER TABLE prescription
  ADD COLUMN IF NOT EXISTS nurse_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nurse_only_reason text;

COMMENT ON COLUMN prescription.nurse_only IS
  'Este medicamento só a Enfermagem administra. Exceção, com motivo escrito — '
  'o padrão é o educador de plantão poder dar (0930).';

-- O antes-e-depois, como em 0850 e 0860: a decisão de quem encosta no remédio
-- de uma criança não pode existir só na última linha gravada.
CREATE TABLE prescription_restriction_change (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescription(id),
  house_id        uuid NOT NULL REFERENCES house(id),
  was_nurse_only  boolean NOT NULL,
  is_nurse_only   boolean NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 15),
  changed_by      uuid NOT NULL REFERENCES app_user(id),
  changed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_presc_restr_presc ON prescription_restriction_change (prescription_id, changed_at DESC);

ALTER TABLE prescription_restriction_change ENABLE ROW LEVEL SECURITY;
-- Regra 16: o papel primeiro, o escopo por linha depois, e com CASE.
CREATE POLICY prestr_select ON prescription_restriction_change FOR SELECT TO rede_app
  USING (CASE WHEN app_current_role() = 'gestor_geral' THEN true
              ELSE house_id = ANY (ARRAY(SELECT app_casas_no_alcance())) END);
CREATE POLICY prestr_insert ON prescription_restriction_change FOR INSERT TO rede_app
  WITH CHECK (app_house_in_scope(house_id));

GRANT SELECT, INSERT ON prescription_restriction_change TO rede_app;
REVOKE UPDATE, DELETE ON prescription_restriction_change FROM rede_app;

CREATE TRIGGER prestr_no_change BEFORE UPDATE OR DELETE ON prescription_restriction_change
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Marcar (ou desmarcar) exige motivo e grava o antes-e-depois na mesma
-- transação. Quem marca é quem responde pelo cuidado: Enfermagem e
-- coordenação — e o Gestor Geral, que alcança as oito.
CREATE OR REPLACE FUNCTION app_definir_so_enfermagem(
  p_prescription uuid, p_so_enfermagem boolean, p_motivo text
) RETURNS boolean AS $$
DECLARE v_p prescription%ROWTYPE;
BEGIN
  IF app_current_role() NOT IN ('enfermagem','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'so_enfermagem: somente a Enfermagem, a coordenação ou a gestão marcam um medicamento como exclusivo da Enfermagem.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_p FROM prescription WHERE id = p_prescription;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'prescricao_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  -- Regra 8: SECURITY DEFINER com casa SEMPRE confere o alcance.
  IF NOT app_house_in_scope(v_p.house_id) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 15 THEN
    RAISE EXCEPTION 'so_enfermagem: escreva por que este medicamento exige a Enfermagem — quem ler daqui a seis meses precisa entender a decisão.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Marcar duas vezes o mesmo estado não é decisão: é ruído no histórico.
  IF v_p.nurse_only = p_so_enfermagem THEN
    RETURN false;
  END IF;

  INSERT INTO prescription_restriction_change
    (prescription_id, house_id, was_nurse_only, is_nurse_only, reason, changed_by)
  VALUES (p_prescription, v_p.house_id, v_p.nurse_only, p_so_enfermagem,
          btrim(p_motivo), app_current_user());

  UPDATE prescription
     SET nurse_only = p_so_enfermagem,
         nurse_only_reason = CASE WHEN p_so_enfermagem THEN btrim(p_motivo) ELSE NULL END,
         version = version + 1
   WHERE id = p_prescription;

  RETURN true;
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_definir_so_enfermagem(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_definir_so_enfermagem(uuid, boolean, text) TO rede_app;

-- -----------------------------------------------------------------------------
-- 3. Quem pode confirmar uma dose, aqui e agora
-- -----------------------------------------------------------------------------
-- A assinatura continua a mesma (`p_house`, `p_period`) porque o aparelho
-- pergunta antes de desenhar o botão e não conhece a dose. O período deixa de
-- decidir qualquer coisa e permanece no parâmetro por compatibilidade: quem o
-- lê hoje é a tela, e mudar a assinatura obrigaria a mexer no que não mudou.
--
-- A exceção por medicamento NÃO é conferida aqui, e sim na confirmação, que é
-- onde se sabe qual é o remédio. Esta função responde "você, neste turno,
-- confirma doses?" — a outra responde "você confirma ESTA dose?".
CREATE OR REPLACE FUNCTION app_can_administer(p_house uuid, p_period text)
RETURNS TABLE (pode boolean, motivo text) AS $$
DECLARE v_role role_code;
BEGIN
  v_role := app_current_role();

  IF NOT app_house_in_scope(p_house) THEN
    RETURN QUERY SELECT false, 'Esta casa não está no seu alcance.'::text; RETURN;
  END IF;

  IF v_role IN ('enfermagem','educador','lider_diurno') THEN
    RETURN QUERY SELECT true, NULL::text; RETURN;
  END IF;

  RETURN QUERY SELECT false,
    'Quem confirma a dose é quem a administrou: a Enfermagem ou o educador de plantão.'::text;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_can_administer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_can_administer(uuid, text) TO rede_app;

-- -----------------------------------------------------------------------------
-- 4. A confirmação da dose
-- -----------------------------------------------------------------------------
-- Duas mudanças, e as duas são de regra:
--
--  (a) a exceção por medicamento passa a ser conferida aqui, com o motivo
--      escrito na recusa — o educador precisa saber POR QUE aquele frasco não
--      é com ele, e a quem recorrer;
--
--  (b) DOSE NÃO SE CONFIRMA SEM SINAL, em aparelho nenhum. Até aqui a regra
--      era "offline, só o aparelho institucional" (§11.7), e ela existia para
--      impedir que a mesma dose fosse confirmada em dois aparelhos que não se
--      enxergam. O Marcelo decidiu em 08/09 que o sistema roda no celular de
--      cada um, com o e-mail institucional: não há mais "o aparelho da casa"
--      para ser a trava, e a alternativa — deixar cada celular guardar
--      confirmação de dose — devolveria exatamente a dose duplicada que a
--      regra evitava, com o agravante de a pessoa só descobrir horas depois.
--      A recusa é IMEDIATA e explica; o resto do turno continua funcionando
--      sem sinal.
CREATE OR REPLACE FUNCTION app_confirm_dose(
  p_admin_id uuid, p_state text, p_note text, p_happened_at timestamptz,
  p_offline boolean, p_device text, p_institutional boolean, p_client_op text
) RETURNS TABLE (out_id uuid, out_state text) AS $$
DECLARE
  v_adm medication_administration%ROWTYPE;
  v_period text; v_pode boolean; v_motivo text;
  v_nurse_only boolean; v_nurse_reason text; v_med text; v_nominal boolean;
BEGIN
  SELECT * INTO v_adm FROM medication_administration WHERE id = p_admin_id FOR UPDATE;
  IF v_adm.id IS NULL THEN
    RAISE EXCEPTION 'dose_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_adm.administered_by IS NOT NULL THEN
    RAISE EXCEPTION 'dose_ja_confirmada' USING ERRCODE = 'unique_violation';
  END IF;

  v_period := CASE
    WHEN (v_adm.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::time >= TIME '07:00'
     AND (v_adm.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::time <  TIME '19:00'
    THEN 'diurno' ELSE 'noturno' END;

  SELECT c.pode, c.motivo INTO v_pode, v_motivo
    FROM app_can_administer(v_adm.house_id, v_period) c;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'protocolo: %', v_motivo USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.nurse_only, p.nurse_only_reason, p.medication
    INTO v_nurse_only, v_nurse_reason, v_med
    FROM prescription p WHERE p.id = v_adm.prescription_id;

  IF coalesce(v_nurse_only, false) AND app_current_role() <> 'enfermagem' THEN
    RAISE EXCEPTION 'protocolo: % está marcado como exclusivo da Enfermagem: %. Acione a Enfermagem e registre a dose com ela.',
      v_med, coalesce(v_nurse_reason, 'sem motivo registrado')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF coalesce(p_offline, false) THEN
    RAISE EXCEPTION 'dose_sem_sinal' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE medication_administration
     SET state = p_state::administration_state,
         administered_by = app_current_user(),
         administered_at = coalesce(p_happened_at, now()),
         recorded_at = now(),
         offline = false,
         device = p_device,
         institutional_device = coalesce(p_institutional, false),
         note = p_note,
         client_op_id = coalesce(p_client_op, client_op_id)
   WHERE id = p_admin_id;

  /*
   * BAIXA DE ESTOQUE: UMA linha, nunca duas — o estoque nominal do acolhido
   * tem precedência sobre o comum da casa, porque é dele que a dose saiu.
   *
   * Este trecho vem da 0380 e por pouco não se perdeu aqui: reescrever a
   * função inteira para mudar duas regras deixou de fora a parte em que
   * ninguém estava pensando. Quem pegou foi `regressao-estado.e2e`, que conta
   * o estoque depois de confirmar — e é por isso que a suíte roda antes de
   * qualquer entrega. Vale como aviso para a próxima reescrita: CREATE OR
   * REPLACE substitui o corpo todo, inclusive o que não estava em discussão.
   */
  IF p_state LIKE 'administrado%' THEN
    SELECT EXISTS (
      SELECT 1 FROM medication_stock st
      WHERE st.house_id = v_adm.house_id AND st.medication = v_med
        AND st.person_id = v_adm.person_id) INTO v_nominal;

    UPDATE medication_stock st SET quantity = greatest(quantity - 1, 0), updated_at = now()
     WHERE st.house_id = v_adm.house_id AND st.medication = v_med
       AND (CASE WHEN v_nominal THEN st.person_id = v_adm.person_id
                 ELSE st.person_id IS NULL END);
  END IF;

  RETURN QUERY SELECT p_admin_id, p_state;
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_confirm_dose(uuid,text,text,timestamptz,boolean,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_confirm_dose(uuid,text,text,timestamptz,boolean,text,boolean,text) TO rede_app;
