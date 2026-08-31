-- ---------------------------------------------------------------------------
-- Defeito 5 — a chamada sobrescrevia marcação E autoria, sem histórico.
--
-- `ON CONFLICT (check_id, person_id) DO UPDATE SET option_code, note,
-- recorded_by` faz o segundo registro apagar o primeiro. Some o que foi
-- marcado, some quem marcou e some quando. Três problemas de uma vez:
--
--   * é sobrescrita de registro fechado, que o projeto não admite;
--   * a autoria por linha existe justamente porque numa chamada longa
--     educadores diferentes registram partes — e era a autoria que sumia;
--   * numa audiência, "às 21h constava presente e às 23h constava ausente"
--     é uma informação; "consta ausente" sozinho não é a mesma coisa.
--
-- A correção continua permitida — quem marcou errado precisa poder consertar
-- no meio do plantão, e exigir adendo formal para trocar um clique faria a
-- equipe deixar errado. O que muda é que o valor anterior não morre: vai para
-- `check_result_amendment` antes de ser trocado.
--
-- O guardião é um GATILHO, não o serviço. Qualquer caminho que atualize a
-- linha — rota nova, correção manual, fila offline — passa por aqui.
-- ---------------------------------------------------------------------------

CREATE TABLE check_result_amendment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_result_id uuid NOT NULL REFERENCES check_result(id),
  check_id        uuid NOT NULL REFERENCES collective_check(id),
  person_id       uuid NOT NULL REFERENCES person(id),
  -- O que constava ANTES da correção.
  option_code     text NOT NULL,
  note            text,
  recorded_by     uuid NOT NULL REFERENCES app_user(id),
  happened_at     timestamptz NOT NULL,
  recorded_at     timestamptz NOT NULL,
  -- Quem corrigiu, e quando.
  replaced_by     uuid NOT NULL REFERENCES app_user(id),
  replaced_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_cra_result ON check_result_amendment (check_result_id);
CREATE INDEX ix_cra_check  ON check_result_amendment (check_id, person_id);

ALTER TABLE check_result_amendment ENABLE ROW LEVEL SECURITY;
-- Mesmo alcance do resultado que ele corrige: quem enxerga a chamada enxerga
-- o histórico dela. O escopo por casa vem da política de collective_check.
CREATE POLICY cra_select ON check_result_amendment FOR SELECT TO rede_app
  USING (EXISTS (SELECT 1 FROM collective_check k WHERE k.id = check_id));

GRANT SELECT ON check_result_amendment TO rede_app;
-- Ninguém escreve aqui pela aplicação: só o gatilho, e só o gatilho apaga
-- nada — que é dizer que nada é apagado (§5.1).
REVOKE INSERT, UPDATE, DELETE ON check_result_amendment FROM rede_app;

CREATE OR REPLACE FUNCTION app_check_result_amend() RETURNS trigger AS $$
BEGIN
  -- Reenvio idêntico não é correção: não polui o histórico com linhas iguais.
  IF NEW.option_code IS NOT DISTINCT FROM OLD.option_code
     AND NEW.note IS NOT DISTINCT FROM OLD.note THEN
    RETURN NEW;
  END IF;

  INSERT INTO check_result_amendment (
    check_result_id, check_id, person_id, option_code, note,
    recorded_by, happened_at, recorded_at, replaced_by)
  VALUES (OLD.id, OLD.check_id, OLD.person_id, OLD.option_code, OLD.note,
          OLD.recorded_by, OLD.happened_at, OLD.recorded_at, app_current_user());

  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tg_check_result_amend ON check_result;
CREATE TRIGGER tg_check_result_amend
  BEFORE UPDATE ON check_result
  FOR EACH ROW EXECUTE FUNCTION app_check_result_amend();

-- Histórico de um acolhido numa chamada, do mais recente ao mais antigo.
CREATE OR REPLACE FUNCTION app_check_history(p_check uuid, p_person uuid)
RETURNS TABLE (opcao text, nota text, por text, em timestamptz, corrigido_em timestamptz) AS $$
  SELECT a.option_code, a.note, app_user_display_name(a.recorded_by),
         a.happened_at, a.replaced_at
    FROM check_result_amendment a
   WHERE a.check_id = p_check AND a.person_id = p_person
   ORDER BY a.replaced_at DESC
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION app_check_history(uuid, uuid) TO rede_app;
