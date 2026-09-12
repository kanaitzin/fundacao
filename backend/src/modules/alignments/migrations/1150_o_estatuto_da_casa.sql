-- ============================================================
-- 1150 — O estatuto: as regras de convivência
--
-- Pedido do Marcelo em 09/09, na mesma frase da reunião com pauta: "regras de
-- convivência viram um estatuto dentro do sistema". Ficou de fora da fase 94
-- de propósito, porque é outra coisa.
--
-- POR QUE NÃO É COMBINADO. O combinado é operacional e datado — "a saída para
-- a fono passa a ser com a educadora da tarde". A regra de convivência é
-- permanente e vale para quem chegar depois: "ninguém entra no quarto sem
-- bater". Na mesma lista, o estatuto envelheceria entre decisões de terça, e a
-- casa perderia o lugar onde se lê o que vale sempre.
--
-- AS DECISÕES DE DESENHO, todas reversíveis e nenhuma vinda do pedido, que era
-- uma frase:
--
--  * DOIS ALCANCES. Regra da CASA (a coordenação escreve) e regra da
--    INSTITUIÇÃO (só o Gestor Geral). Sem isso, ou cada casa reescreve a regra
--    da Fundação com palavras diferentes, ou a Fundação decide o horário do
--    silêncio de oito casas que têm rotinas diferentes. A regra da instituição
--    aparece nas oito e nenhuma casa a edita;
--  * PARA QUEM É. `audience`: 'todos', 'equipe' ou 'acolhidos'. É o que
--    permite afixar na parede só o que é das crianças — uma folha com "não se
--    fala do processo judicial na frente da criança" pregada no corredor é o
--    oposto do que ela existe para fazer;
--  * O TEXTO É IMUTÁVEL, e mudar é criar OUTRA regra que substitui a anterior
--    (`replaces_id`), como o combinado. A anterior fica 'substituida' e
--    legível: quem foi advertido em março por uma regra que mudou em maio tem
--    direito a ler a de março;
--  * VIGÊNCIA COM DATA (`since`). "A partir de segunda" é como uma casa
--    combina regra nova, e sem data a regra vale desde sempre, inclusive para
--    trás;
--  * REVOGAR EXIGE MOTIVO, como encerrar combinado.
--
-- O QUE O ESTATUTO NÃO GUARDA, e não vai guardar: quem descumpriu, contagem de
-- descumprimento, e qualquer consequência prevista. O sistema já tem onde
-- registrar o que aconteceu com uma criança — a ocorrência, com revisão
-- técnica. Uma lista de infrações ao lado da regra transforma o estatuto num
-- instrumento disciplinar, e um histórico de "quantas vezes a Alice quebrou a
-- regra 4" é exatamente o documento que ninguém deveria poder gerar sobre uma
-- criança de 12 anos.
-- ============================================================

CREATE TABLE house_statute (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nulo quando a regra é da instituição: vale para as oito casas.
  house_id    uuid REFERENCES house(id),
  institution_id uuid NOT NULL REFERENCES institution(id),
  body        text NOT NULL CHECK (length(btrim(body)) >= 15),
  audience    text NOT NULL DEFAULT 'todos'
              CHECK (audience IN ('todos','equipe','acolhidos')),
  since       date NOT NULL DEFAULT current_date,
  status      text NOT NULL DEFAULT 'vigente'
              CHECK (status IN ('vigente','revogada','substituida')),
  status_reason text,
  status_by   uuid REFERENCES app_user(id),
  status_at   timestamptz,
  replaces_id uuid REFERENCES house_statute(id),
  created_by  uuid NOT NULL REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Revogar sem dizer por quê deixa a equipe sem saber se a regra caiu ou se
  -- alguém apagou por engano.
  CONSTRAINT ck_estatuto_revoga_explica CHECK (
    status <> 'revogada' OR length(btrim(coalesce(status_reason, ''))) >= 15),
  CONSTRAINT ck_estatuto_mudanca_tem_autor CHECK (
    status = 'vigente' OR (status_by IS NOT NULL AND status_at IS NOT NULL))
  /* O alcance não precisa de CHECK: `house_id` nulo É a regra da instituição.
     Uma restrição `(house_id IS NOT NULL) OR (house_id IS NULL)` seria sempre
     verdadeira — garantia que não garante nada é pior que garantia nenhuma,
     porque alguém a lê e acredita. Quem separa os dois alcances é a policy de
     escrita: casa é da coordenação, instituição é só do Gestor Geral. */
);
CREATE INDEX idx_estatuto_casa ON house_statute (house_id, status, since);
CREATE INDEX idx_estatuto_inst ON house_statute (institution_id, status)
  WHERE house_id IS NULL;

CREATE OR REPLACE FUNCTION tg_estatuto_texto_imutavel() RETURNS trigger AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body
     OR NEW.audience IS DISTINCT FROM OLD.audience
     OR NEW.house_id IS DISTINCT FROM OLD.house_id
     OR NEW.since IS DISTINCT FROM OLD.since
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'estatuto_nao_se_reescreve';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER estatuto_texto_imutavel BEFORE UPDATE ON house_statute
  FOR EACH ROW EXECUTE FUNCTION tg_estatuto_texto_imutavel();
CREATE TRIGGER estatuto_no_delete BEFORE DELETE ON house_statute
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

/**
 * A instituição de quem está na transação — não existe `app_current_institution`,
 * e a ATA Geral (0310) faz o mesmo pelo `app_user`.
 */
CREATE OR REPLACE FUNCTION app_minha_instituicao() RETURNS uuid AS $$
  SELECT institution_id FROM app_user WHERE id = app_current_user();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_minha_instituicao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_minha_instituicao() TO rede_app;

ALTER TABLE house_statute ENABLE ROW LEVEL SECURITY;

-- LER: a regra da casa, quem tem alcance nela; a da instituição, todo mundo da
-- instituição — é o ponto de uma regra que vale para as oito.
CREATE POLICY estatuto_select ON house_statute FOR SELECT TO rede_app
  USING (CASE WHEN house_id IS NULL THEN institution_id = app_minha_instituicao()
              ELSE app_house_in_scope(house_id) END);

-- ESCREVER: coordenação na própria casa; instituição, só o Gestor Geral.
CREATE POLICY estatuto_insert ON house_statute FOR INSERT TO rede_app
  WITH CHECK (created_by = app_current_user() AND (
    (house_id IS NOT NULL AND app_house_in_scope(house_id)
     AND app_current_role() IN ('coordenador','gestor_geral'))
    OR (house_id IS NULL AND app_current_role() = 'gestor_geral'
        AND institution_id = app_minha_instituicao())));

CREATE POLICY estatuto_update ON house_statute FOR UPDATE TO rede_app
  USING ((house_id IS NOT NULL AND app_house_in_scope(house_id)
          AND app_current_role() IN ('coordenador','gestor_geral'))
         OR (house_id IS NULL AND app_current_role() = 'gestor_geral'
             AND institution_id = app_minha_instituicao()))
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON house_statute TO rede_app;

/**
 * Revogar ou substituir uma regra — uma vez, com o estado no UPDATE (regra 11).
 *
 * `p_substituta` é preenchido quando a mudança nasce de uma regra nova: aí a
 * anterior fica 'substituida' e o motivo é dispensado, porque o motivo é o
 * texto novo, que está do lado.
 */
CREATE OR REPLACE FUNCTION app_mudar_estatuto(
  p_id uuid, p_status text, p_motivo text, p_substituta uuid DEFAULT NULL)
RETURNS TABLE (out_id uuid) AS $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM house_statute WHERE id = p_id;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'estatuto_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  /*
   * A FUNÇÃO É `SECURITY DEFINER`: ela roda como dona do banco e as políticas
   * de RLS NÃO se aplicam aqui dentro. Quem confere é este bloco — sem ele, a
   * coordenação de uma casa revogava regra da INSTITUIÇÃO, que a policy de
   * UPDATE recusa e a função aceitava. Achado pela suíte, na fase 95.
   *
   * Fora de alcance responde igual a inexistente (regra 8): a Casa 04 não
   * descobre o que existe na 03 pela diferença entre 403 e 404.
   */
  IF v.house_id IS NULL THEN
    IF app_current_role() <> 'gestor_geral'
       OR v.institution_id <> app_minha_instituicao() THEN
      RAISE EXCEPTION 'estatuto_inexistente' USING ERRCODE = 'no_data_found';
    END IF;
  ELSE
    IF NOT app_house_in_scope(v.house_id)
       OR app_current_role() NOT IN ('coordenador','gestor_geral') THEN
      RAISE EXCEPTION 'estatuto_inexistente' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  IF v.status <> 'vigente' THEN
    RAISE EXCEPTION 'estatuto_ja_encerrado' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status NOT IN ('revogada','substituida') THEN
    RAISE EXCEPTION 'estatuto_estado_invalido' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status = 'revogada' AND length(btrim(coalesce(p_motivo, ''))) < 15 THEN
    RAISE EXCEPTION 'estatuto_revoga_sem_motivo' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE house_statute
     SET status = p_status, status_reason = nullif(btrim(p_motivo), ''),
         status_by = app_current_user(), status_at = now()
   WHERE id = p_id
     AND status = 'vigente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estatuto_ja_encerrado' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY SELECT p_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_mudar_estatuto(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_mudar_estatuto(uuid, text, text, uuid) TO rede_app;

COMMENT ON TABLE house_statute IS
  'Regras de convivência — o estatuto (§9.4, fase 95). Permanentes, ao contrário do combinado; por casa ou da instituição; com público (todos, equipe, acolhidos) para a folha que vai à parede. NÃO guarda quem descumpriu, nem consequência: isso é ocorrência, com revisão técnica.';
