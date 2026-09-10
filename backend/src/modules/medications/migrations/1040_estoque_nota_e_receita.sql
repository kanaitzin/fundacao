-- ============================================================
-- 1040 — O estoque que se mexe sozinho, a nota fiscal e a receita
--
-- Três coisas que o Marcelo pediu em 09/09, e que se apoiam umas nas outras.
--
-- Quem CONTA o estoque é a Enfermagem — decisão dele, e é a certa: um número
-- com dois donos é um número que não bate. Quem COMPRA é a equipe técnica, o
-- líder e a coordenação, e eles precisam ver o que já entrou e prestar contas.
-- Então o desenho separa QUANTIDADE de GASTO: a Enfermagem responde pela
-- primeira, quem comprou anexa a segunda, e nenhuma disputa a outra.
--
-- ------------------------------------------------------------------
-- 1. O CONSUMO QUE NUNCA FOI REGISTRADO
--
-- Eu abri esta migração acreditando que confirmar a dose não dava baixa no
-- estoque. Estava errado: dá, desde a 0380, dentro de `app_confirm_dose`. O
-- teste `regressao-estado` me corrigiu na primeira rodada — meu gatilho tinha
-- criado uma SEGUNDA baixa, e o estoque caía duas vezes por dose.
--
-- O que falta é outra coisa, e é real: `medication_stock_movement` aceita
-- `consumo` desde a migração 0200, e NADA NUNCA ESCREVEU esse tipo. O número
-- do armário caía e o histórico não dizia por quê — só entradas, ajustes e
-- descartes apareciam. Quem abrisse o movimento para entender uma diferença
-- veria as caixas chegando e nenhuma saindo.
--
-- O gatilho agora só REGISTRA. Não decrementa: quem decrementa continua sendo
-- `app_confirm_dose`, que é o único caminho da dose e já trata o offline.
--
-- ------------------------------------------------------------------
-- 2. A NOTA FISCAL — prestação de contas
--
-- Sem data de validade: a Fundação presta contas do GASTO, e validade é
-- assunto do armário, que já a tem. Aqui interessa o que foi comprado, quanto
-- custou, e o papel que comprova.
--
-- ------------------------------------------------------------------
-- 3. A RECEITA DIGITALIZADA
--
-- A foto da receita fica junto da prescrição que ela autoriza. É documento
-- médico: nasce restrito, e quem o abre fica registrado — o mesmo caminho do
-- laudo do hospital.
-- ============================================================

-- ---------- 1. A baixa por dose ----------

CREATE OR REPLACE FUNCTION trg_dose_registra_consumo() RETURNS trigger AS $$
DECLARE v_med text; v_nominal boolean; v_stock uuid;
BEGIN
  /*
   * Só na TRANSIÇÃO para administrada, e nos dois estados que significam "o
   * remédio saiu da gaveta": no horário e com atraso. Recusada, não
   * administrada e indisponível não consomem nada — é para isso que elas
   * existem separadas.
   *
   * A guarda é a transição, não o estado final: reconfirmar, corrigir uma nota
   * ou sincronizar de novo não pode lançar dois consumos para a mesma dose.
   */
  IF NEW.state::text NOT LIKE 'administrado%'
     OR coalesce(OLD.state::text, 'x') LIKE 'administrado%' THEN
    RETURN NEW;
  END IF;

  SELECT p.medication INTO v_med FROM prescription p WHERE p.id = NEW.prescription_id;

  /*
   * A MESMA REGRA da `app_confirm_dose`: o estoque nominal tem precedência
   * sobre o comum da casa. Ela está escrita duas vezes, e isso é dívida — mas
   * a alternativa era reescrever `app_confirm_dose` com CREATE OR REPLACE, e
   * o comentário dentro dela avisa, por experiência própria, que reescrever a
   * função inteira para mudar uma coisa já deixou de fora o que ninguém estava
   * discutindo. Acrescentar por gatilho não toca no que funciona.
   */
  SELECT EXISTS (
    SELECT 1 FROM medication_stock st
     WHERE st.house_id = NEW.house_id AND st.medication = v_med
       AND st.person_id = NEW.person_id) INTO v_nominal;

  SELECT st.id INTO v_stock
    FROM medication_stock st
   WHERE st.house_id = NEW.house_id AND st.medication = v_med
     AND (CASE WHEN v_nominal THEN st.person_id = NEW.person_id
               ELSE st.person_id IS NULL END)
   LIMIT 1;

  -- Sem estoque cadastrado não há o que registrar. O cuidado nunca depende de
  -- a casa ter cadastrado a caixa.
  IF v_stock IS NULL THEN RETURN NEW; END IF;

  INSERT INTO medication_stock_movement (stock_id, kind, quantity, reason, by_user)
  VALUES (v_stock, 'consumo', 1,
          'Dose confirmada em ' || to_char(NEW.scheduled_at AT TIME ZONE app_fuso(),
                                           'DD/MM/YYYY HH24:MI'),
          NEW.administered_by);

  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS dose_da_baixa ON medication_administration;
DROP TRIGGER IF EXISTS dose_registra_consumo ON medication_administration;
CREATE TRIGGER dose_registra_consumo
  AFTER INSERT OR UPDATE OF state ON medication_administration
  FOR EACH ROW EXECUTE FUNCTION trg_dose_registra_consumo();

-- ---------- 2. A nota fiscal ----------

CREATE TABLE IF NOT EXISTS medication_purchase (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id     uuid NOT NULL REFERENCES house(id),
  bought_on    date NOT NULL,
  supplier     text,
  -- O que foi comprado, escrito por quem comprou. Texto e não vínculo com o
  -- estoque: uma nota traz cinco itens, e obrigar a casar cada linha com uma
  -- caixa faria a prestação de contas parar por um detalhe de cadastro.
  items        text NOT NULL CHECK (length(btrim(items)) >= 3),
  total_cents  integer CHECK (total_cents IS NULL OR total_cents >= 0),
  invoice_ref  text,                          -- número da nota, quando existe
  -- O papel. `storage_ref` aponta para ARQUIVOS_DIR, como todo anexo.
  storage_ref  text,
  display_name text,
  note         text,
  bought_by    uuid NOT NULL REFERENCES app_user(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medication_purchase_casa
  ON medication_purchase (house_id, bought_on DESC);

ALTER TABLE medication_purchase ENABLE ROW LEVEL SECURITY;

/*
 * Quem lê: Enfermagem, equipe técnica, líder, coordenação e gestão. Quem
 * compra precisa ver o que já entrou para não comprar duas vezes, e a
 * Enfermagem precisa ver o que chegou para conferir com a gaveta.
 *
 * O educador NÃO lê: nota fiscal é documento financeiro da instituição, e não
 * há nada nela que ajude o turno.
 */
CREATE POLICY mp_select ON medication_purchase FOR SELECT TO rede_app
  USING (
    CASE
      WHEN app_current_role() IN ('enfermagem','equipe_tecnica','lider_diurno',
                                  'coordenador','gestor_geral')
        THEN house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
      ELSE false
    END
  );
CREATE POLICY mp_insert ON medication_purchase FOR INSERT TO rede_app WITH CHECK (false);
GRANT SELECT ON medication_purchase TO rede_app;

CREATE OR REPLACE FUNCTION app_registrar_compra_medicamento(
  p_house uuid, p_em date, p_itens text, p_fornecedor text,
  p_total_cents integer, p_nota text, p_obs text,
  p_storage text DEFAULT NULL, p_nome text DEFAULT NULL)
RETURNS TABLE (compra_id uuid) AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Quem compra: técnica, líder, coordenação, gestão — e a Enfermagem, que
  -- também compra o que falta no dia.
  IF app_current_role() NOT IN ('enfermagem','equipe_tecnica','lider_diurno',
                                'coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_compra' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(length(btrim(p_itens)), 0) < 3 THEN
    RAISE EXCEPTION 'itens_obrigatorios' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO medication_purchase (house_id, bought_on, items, supplier,
                                   total_cents, invoice_ref, note,
                                   storage_ref, display_name, bought_by)
  VALUES (p_house, p_em, btrim(p_itens), nullif(btrim(p_fornecedor), ''),
          p_total_cents, nullif(btrim(p_nota), ''), nullif(btrim(p_obs), ''),
          p_storage, p_nome, app_current_user())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_registrar_compra_medicamento(uuid,date,text,text,integer,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_compra_medicamento(uuid,date,text,text,integer,text,text,text,text) TO rede_app;

/*
 * As compras de um período, e o gasto somado.
 *
 * A soma vem junto porque é a pergunta da prestação de contas — e ela é do
 * PERÍODO e da CASA, nunca por pessoa: quem comprou tem nome em cada linha,
 * mas somar por comprador é medir gente.
 */
CREATE OR REPLACE FUNCTION app_compras_de_medicamento(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (id uuid, em date, itens text, fornecedor text, total_cents integer,
               nota text, observacao text, tem_anexo boolean,
               nome_do_anexo text, comprado_por text) AS $$
  SELECT c.id, c.bought_on, c.items, c.supplier, c.total_cents,
         c.invoice_ref, c.note, c.storage_ref IS NOT NULL, c.display_name,
         app_user_display_name(c.bought_by)
    FROM medication_purchase c
   WHERE c.house_id = p_house
     AND app_house_in_scope(p_house)
     /*
      * O CARGO CONFERIDO AQUI DENTRO, e não só na policy.
      *
      * `SECURITY DEFINER` roda como dono da função e PASSA POR CIMA do RLS —
      * a policy `mp_select` não se aplica a esta consulta. Sem esta linha, a
      * política era decoração: o educador chamava a rota e recebia as notas
      * fiscais da casa inteira. Quem pegou foi o teste que afirma que ele não
      * vê, e ele estava vendo.
      *
      * Vale para toda função SECURITY DEFINER que lê tabela com RLS.
      */
     AND app_current_role() IN ('enfermagem','equipe_tecnica','lider_diurno',
                                'coordenador','gestor_geral')
     AND c.bought_on BETWEEN p_de AND p_ate
   ORDER BY c.bought_on DESC, c.created_at DESC
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_compras_de_medicamento(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_compras_de_medicamento(uuid, date, date) TO rede_app;

-- ---------- 3. A receita digitalizada ----------

CREATE TABLE IF NOT EXISTS prescription_document (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescription(id),
  house_id        uuid NOT NULL REFERENCES house(id),
  -- Nome de exibição NEUTRO. CPF, diagnóstico e conteúdo judicial nunca
  -- aparecem em nome de arquivo (regra 3) — o nome original não é guardado.
  display_name    text NOT NULL,
  issued_on       date,
  prescriber      text,                 -- quem receitou, como está no papel
  storage_ref     text NOT NULL,
  uploaded_by     uuid NOT NULL REFERENCES app_user(id),
  uploaded_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prescription_document
  ON prescription_document (prescription_id);

ALTER TABLE prescription_document ENABLE ROW LEVEL SECURITY;

/*
 * A receita é DOCUMENTO MÉDICO: nasce restrita.
 *
 * Enfermagem, equipe técnica, coordenação e gestão. O educador vê que a dose
 * existe e a administra — mas a receita traz diagnóstico, CID e o nome do
 * prescritor, e nada disso muda o que ele faz às 22h.
 */
CREATE POLICY pd_select ON prescription_document FOR SELECT TO rede_app
  USING (
    CASE
      WHEN app_current_role() IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral')
        THEN house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
      ELSE false
    END
  );
CREATE POLICY pd_insert ON prescription_document FOR INSERT TO rede_app WITH CHECK (false);
GRANT SELECT ON prescription_document TO rede_app;

CREATE OR REPLACE FUNCTION app_anexar_receita(
  p_prescription uuid, p_nome text, p_storage text,
  p_em date DEFAULT NULL, p_prescritor text DEFAULT NULL)
RETURNS TABLE (documento_id uuid) AS $$
DECLARE v_casa uuid; v_id uuid;
BEGIN
  IF app_current_role() NOT IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_receita' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.house_id INTO v_casa FROM prescription p WHERE p.id = p_prescription;
  IF v_casa IS NULL OR NOT app_house_in_scope(v_casa) THEN
    RAISE EXCEPTION 'prescricao_fora_de_escopo' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO prescription_document (prescription_id, house_id, display_name,
                                     issued_on, prescriber, storage_ref, uploaded_by)
  VALUES (p_prescription, v_casa, btrim(p_nome), p_em,
          nullif(btrim(p_prescritor), ''), p_storage, app_current_user())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_anexar_receita(uuid, text, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_anexar_receita(uuid, text, text, date, text) TO rede_app;

CREATE OR REPLACE FUNCTION app_receitas_da_prescricao(p_prescription uuid)
RETURNS TABLE (id uuid, nome text, em date, prescritor text,
               anexado_por text, anexado_em timestamptz) AS $$
  SELECT d.id, d.display_name, d.issued_on, d.prescriber,
         app_user_display_name(d.uploaded_by), d.uploaded_at
    FROM prescription_document d
   WHERE d.prescription_id = p_prescription
     /* Mesma razão: SECURITY DEFINER ignora a policy `pd_select`. */
     AND app_current_role() IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral')
     AND d.house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
   ORDER BY d.uploaded_at DESC
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_receitas_da_prescricao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_receitas_da_prescricao(uuid) TO rede_app;
