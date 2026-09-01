-- =============================================================================
-- 0860 — QUEM DECIDIU QUE PODIA, E POR QUÊ (§11.3, pendência 33.4.1)
--
-- Segundo achado da conferência de 01/09/2026: `POST /medications/protocol`
-- existia com regra de cargo, RLS corrigida na 0820 e auditoria — e nunca teve
-- tela. A Saúde LIA o protocolo e desenhava, em cada período, a tarja
--
--     Sem definição
--
-- sem nenhum botão que definisse. A autorização NOMINAL de um educador tinha
-- formulário; a regra que fica POR CIMA dela, não. Quem abria a tela via a
-- pendência institucional escrita e nenhuma porta para respondê-la.
--
-- Ao abrir a porta, duas coisas mudam de peso:
--
--  1. o `ON CONFLICT ... DO UPDATE` de `setProtocol` sobrescrevia a decisão
--     anterior guardando só quem decidiu por ÚLTIMO. Trocar "educador
--     autorizado pode dar remédio no turno noturno" de sim para não — ou de
--     não para sim — é a decisão mais pesada que uma coordenação toma neste
--     sistema, e ela ficava sem antes-e-depois. `audit_event` registrava o
--     `periodo` e o `educadorAutorizado`, mas não o que estava valendo antes,
--     nem a nota, e a auditoria é área restrita: a Enfermagem que precisa
--     entender por que a regra da casa mudou não alcança.
--
--  2. a NOTA era opcional. "Quem pode dar remédio nesta casa" não é
--     configuração de sistema, é decisão da instituição (33.4.1) — e uma
--     decisão sem a linha que diz sob qual capacitação, sob qual reunião, sob
--     qual documento ela foi tomada é uma decisão que ninguém consegue rever.
--     Aqui o motivo passa a ser obrigatório, ao contrário do 0850: o campo
--     escolar muda todo ano e cobrar motivo vira ritual; este muda raramente e
--     cada mudança precisa se explicar.
--
-- O padrão protetivo continua sendo o do banco: sem linha, somente Enfermagem.
-- Esta migração não muda o padrão — ela dá um caminho de ida com memória.
-- =============================================================================

CREATE TABLE medication_protocol_change (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id        uuid NOT NULL REFERENCES house(id),
  period          text NOT NULL CHECK (period IN ('diurno','noturno','integral')),
  -- NULL nos "antes" = não havia definição, e valia o padrão protetivo. É
  -- diferente de `false`, que é uma decisão tomada de negar.
  before_nursing  boolean,
  before_educator boolean,
  after_nursing   boolean NOT NULL,
  after_educator  boolean NOT NULL,
  reason          text NOT NULL,
  decided_by      uuid NOT NULL REFERENCES app_user(id),
  at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_medication_protocol_change ON medication_protocol_change (house_id, at DESC);

COMMENT ON TABLE medication_protocol_change IS
  'Cada decisão sobre quem pode administrar medicamento na casa, com o que '
  'valia antes e o motivo escrito. Não se altera nem se apaga.';

CREATE TRIGGER medication_protocol_change_no_change
  BEFORE UPDATE OR DELETE ON medication_protocol_change
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

ALTER TABLE medication_protocol_change ENABLE ROW LEVEL SECURITY;
-- Lê quem alcança a casa — o mesmo alcance do protocolo vigente (`prot_select`).
-- A educadora que vai ou não vai dar o remédio tem o direito de ler quando isso
-- mudou e sob qual decisão; a Enfermagem, que acompanha as oito, também.
CREATE POLICY mpc_select ON medication_protocol_change FOR SELECT TO rede_app
  USING (app_house_in_scope(house_id));
-- Escreve só quem decide, e só na própria casa (mesma regra da 0820).
CREATE POLICY mpc_insert ON medication_protocol_change FOR INSERT TO rede_app
  WITH CHECK (decided_by = app_current_user()
              AND app_current_role() IN ('coordenador','gestor_geral')
              AND app_house_in_scope(house_id));
GRANT SELECT, INSERT ON medication_protocol_change TO rede_app;
REVOKE UPDATE, DELETE ON medication_protocol_change FROM rede_app;

-- ---------- A decisão ----------
-- Regra 8: SECURITY DEFINER com p_house confere `app_house_in_scope`.
-- O par decisão+registro na mesma transação, pelo mesmo motivo do 0850.
CREATE OR REPLACE FUNCTION app_definir_protocolo_medicacao(
  p_house uuid, p_period text, p_nursing boolean, p_educator boolean, p_motivo text)
RETURNS TABLE (definido boolean) AS $$
DECLARE
  v_antes medication_protocol%ROWTYPE;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app_current_role() NOT IN ('coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_para_definir_protocolo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_period NOT IN ('diurno','noturno','integral') THEN
    RAISE EXCEPTION 'periodo_invalido';
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;
  -- Um período em que ninguém pode administrar não é protocolo, é a grade
  -- parada: a dose venceria todo dia sem que existisse alguém autorizado a
  -- confirmá-la, e o escalonamento noturno viraria rotina.
  IF NOT p_nursing AND NOT p_educator THEN
    RAISE EXCEPTION 'protocolo_sem_ninguem';
  END IF;

  SELECT * INTO v_antes FROM medication_protocol
   WHERE house_id = p_house AND period = p_period FOR UPDATE;

  INSERT INTO medication_protocol_change
    (house_id, period, before_nursing, before_educator,
     after_nursing, after_educator, reason, decided_by)
  VALUES (p_house, p_period, v_antes.allows_nursing, v_antes.allows_authorized_educator,
          p_nursing, p_educator, btrim(p_motivo), app_current_user());

  INSERT INTO medication_protocol
    (house_id, period, allows_nursing, allows_authorized_educator, note, decided_by)
  VALUES (p_house, p_period, p_nursing, p_educator, btrim(p_motivo), app_current_user())
  ON CONFLICT (house_id, period) DO UPDATE
    SET allows_nursing = EXCLUDED.allows_nursing,
        allows_authorized_educator = EXCLUDED.allows_authorized_educator,
        note = EXCLUDED.note, decided_by = EXCLUDED.decided_by, decided_at = now();

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_definir_protocolo_medicacao(uuid, text, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_definir_protocolo_medicacao(uuid, text, boolean, boolean, text) TO rede_app;
