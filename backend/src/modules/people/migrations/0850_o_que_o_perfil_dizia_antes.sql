-- ============================================================
-- 0850 — O QUE O PERFIL DIZIA ANTES (§6.2, §6.4)
--
-- Defeito encontrado na conferência de 01/09/2026: `PATCH /people/:id`
-- (`updateDetail`) existia desde a fase 2, com regra de cargo e RLS, e NUNCA
-- teve tela. O perfil MOSTRAVA cuidados essenciais, escola, equipe de
-- referência e observações — e ninguém, em cargo nenhum, conseguia escrever
-- neles. A criança trocava de escola em março e a saída de quem usa era o
-- papel, o grupo de mensagens, ou nada.
--
-- Abrir a porta sem histórico seria trocar um problema por outro pior.
-- "Cuidados essenciais" é o bloco que a educadora lê antes de dar banho, antes
-- de deixar sozinha, antes de servir o prato: é ali que está escrito que ela
-- não pode ficar de costas para a janela, ou que ela engasga com comida em
-- pedaço. Reescrever esse campo às 23h sobre o texto de outra pessoa apaga uma
-- instrução de proteção sem deixar rastro — e a auditoria não salva, porque a
-- auditoria guarda o NOME dos campos alterados e nunca o conteúdo (§20).
--
-- `profile_detail_change` guarda o que estava, o que passou a estar, quem e
-- quando. Uma linha por campo. Não se altera nem se apaga.
--
-- Ela é irmã de `person_correction` (0810) e mora ao lado por um motivo, mas
-- NÃO é a mesma coisa, e a diferença está no motivo escrito:
--
--   * corrigir o NOME ou o NASCIMENTO exige motivo, porque muda a identidade
--     da criança nos papéis de antes;
--   * atualizar a SÉRIE ESCOLAR não exige, porque em fevereiro a série muda
--     mesmo — cobrar um motivo ali ensina a equipe a escrever "atualização"
--     mil vezes, e um campo que todo mundo preenche por obrigação deixa de ser
--     lido. O que se cobra aqui é o RASTRO, não a justificativa.
-- ============================================================

CREATE TABLE profile_detail_change (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES person(id),
  field        text NOT NULL CHECK (field IN
    ('essential_care','school_name','school_grade','school_shift',
     'school_address','reference_team','notes')),
  before_value text,
  after_value  text,
  changed_by   uuid NOT NULL REFERENCES app_user(id),
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profile_detail_change ON profile_detail_change (person_id, at DESC);

COMMENT ON TABLE profile_detail_change IS
  'O que o perfil dizia antes. Uma linha por campo descritivo alterado, legível '
  'por quem cuida — não é auditoria, que guarda só o nome do campo (§20).';

CREATE TRIGGER profile_detail_change_no_change
  BEFORE UPDATE OR DELETE ON profile_detail_change
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

ALTER TABLE profile_detail_change ENABLE ROW LEVEL SECURITY;
-- Lê quem alcança a criança. O educador do plantão precisa saber que o
-- cuidado essencial mudou hoje de manhã, e o que dizia antes, sem pedir a
-- ninguém: é ele quem vai agir sobre o texto novo.
CREATE POLICY pdc_select ON profile_detail_change FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id));
-- Quem altera assina a própria alteração.
CREATE POLICY pdc_insert ON profile_detail_change FOR INSERT TO rede_app
  WITH CHECK (changed_by = app_current_user() AND app_person_in_scope(person_id));
GRANT SELECT, INSERT ON profile_detail_change TO rede_app;
REVOKE UPDATE, DELETE ON profile_detail_change FROM rede_app;

-- ---------- A atualização ----------
-- SECURITY DEFINER pelo mesmo motivo de `app_corrigir_pessoa`: o histórico e a
-- alteração acontecem na MESMA transação, ou nenhum dos dois acontece. Um
-- cuidado essencial reescrito sem a linha que guarda o anterior é exatamente o
-- que esta migração existe para impedir.
CREATE OR REPLACE FUNCTION app_atualizar_detalhe_perfil(
  p_person uuid, p_campos jsonb)
RETURNS TABLE (alterados integer) AS $$
DECLARE
  v_antes profile_detail%ROWTYPE;
  v_n integer := 0;
  v_campo text; v_novo text; v_velho text;
BEGIN
  IF NOT app_person_in_scope(p_person) THEN
    RAISE EXCEPTION 'pessoa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_can_edit_profile() THEN
    RAISE EXCEPTION 'sem_permissao_para_editar' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A linha nasce na admissão (0050), mas o acolhido migrado de antes dela
  -- não teria onde gravar — e a resposta seria "0 alterados" com cara de
  -- sucesso, que é o defeito nº 17 da segunda varredura.
  INSERT INTO profile_detail (person_id, updated_by)
    VALUES (p_person, app_current_user())
    ON CONFLICT (person_id) DO NOTHING;

  SELECT * INTO v_antes FROM profile_detail WHERE person_id = p_person;

  FOR v_campo IN SELECT jsonb_object_keys(p_campos) LOOP
    IF v_campo NOT IN ('essential_care','school_name','school_grade','school_shift',
                       'school_address','reference_team','notes') THEN
      RAISE EXCEPTION 'campo_nao_editavel';
    END IF;
    v_novo := nullif(btrim(coalesce(p_campos ->> v_campo, '')), '');
    v_velho := CASE v_campo
      WHEN 'essential_care' THEN v_antes.essential_care
      WHEN 'school_name'    THEN v_antes.school_name
      WHEN 'school_grade'   THEN v_antes.school_grade
      WHEN 'school_shift'   THEN v_antes.school_shift
      WHEN 'school_address' THEN v_antes.school_address
      WHEN 'reference_team' THEN v_antes.reference_team
      WHEN 'notes'          THEN v_antes.notes
    END;
    -- Campo que não mudou não vira linha: uma lista de "alterações" cheia de
    -- linhas iguais é uma lista que ninguém lê — e é lida no plantão.
    CONTINUE WHEN v_novo IS NOT DISTINCT FROM v_velho;

    INSERT INTO profile_detail_change (person_id, field, before_value, after_value, changed_by)
    VALUES (p_person, v_campo, v_velho, v_novo, app_current_user());

    IF    v_campo = 'essential_care' THEN UPDATE profile_detail SET essential_care = v_novo WHERE person_id = p_person;
    ELSIF v_campo = 'school_name'    THEN UPDATE profile_detail SET school_name    = v_novo WHERE person_id = p_person;
    ELSIF v_campo = 'school_grade'   THEN UPDATE profile_detail SET school_grade   = v_novo WHERE person_id = p_person;
    ELSIF v_campo = 'school_shift'   THEN UPDATE profile_detail SET school_shift   = v_novo WHERE person_id = p_person;
    ELSIF v_campo = 'school_address' THEN UPDATE profile_detail SET school_address = v_novo WHERE person_id = p_person;
    ELSIF v_campo = 'reference_team' THEN UPDATE profile_detail SET reference_team = v_novo WHERE person_id = p_person;
    ELSIF v_campo = 'notes'          THEN UPDATE profile_detail SET notes          = v_novo WHERE person_id = p_person;
    END IF;
    v_n := v_n + 1;
  END LOOP;

  IF v_n > 0 THEN
    UPDATE profile_detail SET updated_at = now(), updated_by = app_current_user(),
                              version = version + 1
     WHERE person_id = p_person;
  END IF;
  RETURN QUERY SELECT v_n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_atualizar_detalhe_perfil(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_atualizar_detalhe_perfil(uuid, jsonb) TO rede_app;
