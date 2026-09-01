-- ============================================================
-- 0780 — A CONFERÊNCIA DE MESA (§10)
--
-- A regra escrita é "sem marcação em lote SILENCIOSA" (§10, §11.2), e a deste
-- módulo é "não existe 'confirmar tudo' que preencha o que NÃO FOI OLHADO".
-- Nenhuma das duas proíbe registrar, de uma vez, o que foi olhado de uma vez.
--
-- O que a casa faz de verdade no almoço: a educadora olha a mesa, vê que as
-- vinte crianças estão comendo, e hoje precisa de vinte toques para dizer
-- isso. Vinte toques não deixam o registro mais verdadeiro — deixam a pessoa
-- com pressa, e pressa é o que faz pular a criança que não comeu.
--
-- A conferência de mesa é UM ATO, e fica gravada como um ato:
--
--   * uma linha em `check_bulk` com quem conferiu, quando, e quantos;
--   * as linhas de `check_result` que nasceram dela apontam para ela.
--
-- Assim, um ano depois, quem lê sabe a diferença entre "vinte observações
-- separadas" e "um olhar sobre a mesa, e vinte estavam bem". As duas coisas
-- são registros honestos; o que não pode existir é uma se passando pela outra.
--
-- TRÊS TRAVAS, e elas são o motivo de isto ser uma migração e não um laço na
-- tela:
--
--   1. a conferência de mesa só marca a opção NÃO-EXCEÇÃO do tipo. Exceção
--      exige justificativa objetiva por criança, e continua individual;
--   2. ela NUNCA sobrescreve quem já foi marcado. Quem já tem registro fica
--      como está — inclusive a criança que a educadora marcou "recusou" antes
--      de conferir a mesa;
--   3. a chamada final do turno não aceita conferência de mesa. Ela existe
--      justamente para alguém contar as crianças uma a uma antes de dormir, e
--      é a única em que "todos" não é uma observação, é uma suposição.
-- ============================================================

CREATE TABLE check_bulk (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id     uuid NOT NULL REFERENCES collective_check(id),
  option_code  text NOT NULL,
  -- Quantos a conferência de mesa cobriu. Guardado no ato, e não contado
  -- depois: se uma correção mudar uma linha amanhã, o número que a pessoa
  -- confirmou naquele momento continua sendo aquele.
  quantos      integer NOT NULL,
  recorded_by  uuid NOT NULL REFERENCES app_user(id),
  happened_at  timestamptz NOT NULL DEFAULT now(),
  recorded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_check_bulk_check ON check_bulk (check_id);

-- Nada de UPDATE nem DELETE: o ato aconteceu.
CREATE TRIGGER check_bulk_no_change BEFORE UPDATE OR DELETE ON check_bulk
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

ALTER TABLE check_result ADD COLUMN bulk_id uuid REFERENCES check_bulk(id);
COMMENT ON COLUMN check_result.bulk_id IS
  'Preenchido quando esta linha nasceu de uma conferência de mesa. Nulo = a '
  'pessoa marcou esta criança individualmente.';

ALTER TABLE check_bulk ENABLE ROW LEVEL SECURITY;
CREATE POLICY cb_select ON check_bulk FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM collective_check k WHERE k.id = check_id
                   AND app_house_in_scope(k.house_id)));
-- Quem confere assina a própria conferência; ninguém confere em nome de outro.
CREATE POLICY cb_insert ON check_bulk FOR INSERT TO rede_app
  WITH CHECK (recorded_by = app_current_user()
              AND EXISTS (SELECT 1 FROM collective_check k WHERE k.id = check_id
                            AND app_house_in_scope(k.house_id)));
GRANT SELECT, INSERT ON check_bulk TO rede_app;
REVOKE UPDATE, DELETE ON check_bulk FROM rede_app;

-- ---------- O ato ----------
-- SECURITY DEFINER porque precisa ler `house_stay` para saber quem ainda falta,
-- e a checagem de alcance é a PRIMEIRA coisa que ele faz.
CREATE OR REPLACE FUNCTION app_bulk_check(p_check uuid, p_option text)
RETURNS TABLE (bulk_id uuid, marcados integer, ja_tinham integer) AS $$
DECLARE
  v_house uuid; v_kind check_type; v_status text;
  v_bulk uuid; v_marcados integer; v_ja integer;
BEGIN
  SELECT house_id, kind, status INTO v_house, v_kind, v_status
    FROM collective_check WHERE id = p_check;
  IF v_house IS NULL THEN
    RAISE EXCEPTION 'chamada_inexistente';
  END IF;
  IF NOT app_house_in_scope(v_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_status <> 'aberta' THEN
    RAISE EXCEPTION 'chamada_confirmada';
  END IF;
  IF v_kind = 'chamada_final' THEN
    RAISE EXCEPTION 'chamada_final_e_um_a_um';
  END IF;

  -- Quem ainda NÃO tem registro nesta chamada. Quem já tem fica como está.
  SELECT count(*) INTO v_marcados
    FROM house_stay s
   WHERE s.house_id = v_house AND s.status = 'ativa'
     AND NOT EXISTS (SELECT 1 FROM check_result r
                      WHERE r.check_id = p_check AND r.person_id = s.person_id);
  IF v_marcados = 0 THEN
    RAISE EXCEPTION 'ninguem_pendente';
  END IF;

  SELECT count(*) INTO v_ja FROM check_result WHERE check_id = p_check;

  INSERT INTO check_bulk (check_id, option_code, quantos, recorded_by)
  VALUES (p_check, p_option, v_marcados, app_current_user())
  RETURNING id INTO v_bulk;

  INSERT INTO check_result (check_id, person_id, option_code, recorded_by, bulk_id)
  SELECT p_check, s.person_id, p_option, app_current_user(), v_bulk
    FROM house_stay s
   WHERE s.house_id = v_house AND s.status = 'ativa'
     AND NOT EXISTS (SELECT 1 FROM check_result r
                      WHERE r.check_id = p_check AND r.person_id = s.person_id);

  RETURN QUERY SELECT v_bulk, v_marcados, v_ja;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_bulk_check(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_bulk_check(uuid, text) TO rede_app;
