-- ============================================================
-- 0810 — CORRIGIR O CADASTRO, SEM APAGAR O QUE ESTAVA (§6.2)
--
-- Nome escrito errado às 23h, com a criança na porta e a guia na mão. Data de
-- nascimento trocada porque a certidão veio depois. CPF que chegou uma semana
-- mais tarde. Isso acontece em toda casa, e hoje o sistema só sabia CADASTRAR:
-- não havia como corrigir, e a saída de quem usa é recadastrar — o que cria
-- uma segunda criança, parte o histórico em dois e é exatamente o que a
-- audiência pergunta.
--
-- Corrigir sem histórico seria pior do que não corrigir. Um nome que muda em
-- silêncio faz toda passagem assinada, toda ATA fechada e toda dose confirmada
-- passarem a falar de alguém que, nos papéis de antes, tinha outro nome — e
-- ninguém sabe por quê.
--
-- `person_correction` guarda O QUE ESTAVA, o que passou a estar, quem corrigiu,
-- quando e POR QUÊ. Uma linha por campo corrigido. Não se altera nem se apaga.
--
-- Ela é tabela e não `audit_event` de propósito: a auditoria é área restrita e
-- responde a outra pergunta ("quem mexeu no sistema"). Esta responde a uma
-- pergunta do CASO — "por que o nome dela mudou em março?" — e precisa ser
-- legível por quem cuida, na tela do perfil.
-- ============================================================

CREATE TABLE person_correction (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES person(id),
  field        text NOT NULL CHECK (field IN
    ('full_name','social_name','birth_date','cpf')),
  before_value text,
  after_value  text,
  reason       text NOT NULL,
  corrected_by uuid NOT NULL REFERENCES app_user(id),
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_person_correction ON person_correction (person_id, at DESC);

CREATE TRIGGER person_correction_no_change BEFORE UPDATE OR DELETE ON person_correction
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

ALTER TABLE person_correction ENABLE ROW LEVEL SECURITY;
-- Quem alcança a criança lê a correção: o educador que cuida dela precisa
-- saber que o nome mudou, e por quê, sem pedir a ninguém.
CREATE POLICY pc_select ON person_correction FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id));
-- Quem corrige assina a própria correção.
CREATE POLICY pc_insert ON person_correction FOR INSERT TO rede_app
  WITH CHECK (corrected_by = app_current_user() AND app_person_in_scope(person_id));
GRANT SELECT, INSERT ON person_correction TO rede_app;
REVOKE UPDATE, DELETE ON person_correction FROM rede_app;

-- ---------- A correção ----------
-- SECURITY DEFINER para gravar as duas coisas — a correção e o histórico — na
-- MESMA transação: um nome corrigido sem a linha que explica por quê é
-- justamente o que esta migração existe para impedir.
CREATE OR REPLACE FUNCTION app_corrigir_pessoa(
  p_person uuid, p_campos jsonb, p_motivo text)
RETURNS TABLE (corrigidos integer) AS $$
DECLARE
  v_antes person%ROWTYPE;
  v_n integer := 0;
  v_campo text; v_novo text; v_velho text;
BEGIN
  IF NOT app_person_in_scope(p_person) THEN
    RAISE EXCEPTION 'pessoa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_can_edit_profile() THEN
    RAISE EXCEPTION 'sem_permissao_para_corrigir' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;

  SELECT * INTO v_antes FROM person WHERE id = p_person;
  IF v_antes.id IS NULL THEN
    RAISE EXCEPTION 'pessoa_inexistente';
  END IF;

  FOR v_campo IN SELECT jsonb_object_keys(p_campos) LOOP
    IF v_campo NOT IN ('full_name','social_name','birth_date','cpf') THEN
      RAISE EXCEPTION 'campo_nao_corrigivel';
    END IF;
    v_novo := nullif(btrim(coalesce(p_campos ->> v_campo, '')), '');
    v_velho := CASE v_campo
      WHEN 'full_name'   THEN v_antes.full_name
      WHEN 'social_name' THEN v_antes.social_name
      WHEN 'birth_date'  THEN v_antes.birth_date::text
      WHEN 'cpf'         THEN v_antes.cpf
    END;
    -- Campo que não mudou não vira correção: uma lista de "correções" cheia de
    -- linhas iguais é uma lista que ninguém lê.
    CONTINUE WHEN v_novo IS NOT DISTINCT FROM v_velho;
    -- Nome civil e data de nascimento não podem ser ESVAZIADOS: o sistema não
    -- fica com criança sem nome nem sem data.
    IF v_novo IS NULL AND v_campo IN ('full_name','birth_date') THEN
      RAISE EXCEPTION 'campo_obrigatorio_nao_se_esvazia';
    END IF;

    INSERT INTO person_correction (person_id, field, before_value, after_value,
                                   reason, corrected_by)
    VALUES (p_person, v_campo, v_velho, v_novo, btrim(p_motivo), app_current_user());

    IF v_campo = 'full_name'   THEN UPDATE person SET full_name   = v_novo WHERE id = p_person;
    ELSIF v_campo = 'social_name' THEN UPDATE person SET social_name = v_novo WHERE id = p_person;
    ELSIF v_campo = 'birth_date'  THEN UPDATE person SET birth_date  = v_novo::date WHERE id = p_person;
    ELSIF v_campo = 'cpf' THEN
      UPDATE person SET cpf = v_novo, cpf_pending = (v_novo IS NULL) WHERE id = p_person;
    END IF;
    v_n := v_n + 1;
  END LOOP;

  IF v_n > 0 THEN
    UPDATE person SET updated_at = now(), version = version + 1 WHERE id = p_person;
  END IF;
  RETURN QUERY SELECT v_n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_corrigir_pessoa(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_corrigir_pessoa(uuid, jsonb, text) TO rede_app;
