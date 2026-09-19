-- ============================================================================
-- A RECEITA E A NOTA FISCAL PASSAM A PODER SER O ARQUIVO — como a ocorrência
-- na 1220, e pelo mesmo motivo.
--
-- A própria 1040 escreveu a intenção: *"o papel. `storage_ref` aponta para
-- ARQUIVOS_DIR, como todo anexo"*. A intenção estava certa e o caminho nunca
-- foi construído: o serviço recebia um TEXTO e o guardava, e a tela oferecia um
-- campo onde a pessoa digitava alguma coisa. O §8.6 descreve as duas como
-- **digitalizadas** — e nenhuma das duas tinha por onde ser digitalizada.
--
-- O que isso custava, em cada uma:
--
--  * a RECEITA autoriza a prescrição. Ela nasce restrita porque traz CID e o
--    nome do prescritor, e a Enfermagem é quem confere o esquema contra o
--    papel. Sem o papel dentro, "conferir com a receita" é abrir outra pasta;
--  * a NOTA FISCAL é prestação de contas. O resumo já diz quantas linhas estão
--    **sem o papel** — e não havia papel que pudesse entrar, então a contagem
--    media a disciplina de quem digitava um número, não a de quem guardava o
--    documento.
--
-- Mesmo desenho da 1220: `storage_key` guarda os bytes, `storage_ref` continua
-- guardando o caminho no Drive, e o CHECK exige pelo menos um dos dois.
-- ============================================================================

-- ---------------------------------------------------------------- A RECEITA
ALTER TABLE prescription_document
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS mime        text,
  ADD COLUMN IF NOT EXISTS file_name   text,
  ADD COLUMN IF NOT EXISTS size_bytes  integer,
  ADD COLUMN IF NOT EXISTS sha256      text;

ALTER TABLE prescription_document ALTER COLUMN storage_ref DROP NOT NULL;

ALTER TABLE prescription_document
  DROP CONSTRAINT IF EXISTS receita_tem_onde_estar;
ALTER TABLE prescription_document
  ADD CONSTRAINT receita_tem_onde_estar
  CHECK (storage_key IS NOT NULL OR storage_ref IS NOT NULL);

-- ----------------------------------------------------------- A NOTA FISCAL
-- Aqui `storage_ref` já era opcional: a nota pode ser registrada sem papel
-- nenhum, e é justamente esse caso que o resumo conta como "sem o papel". O
-- CHECK, portanto, NÃO se aplica a esta tabela — exigir um dos dois obrigaria
-- a casa a ter o documento na hora de lançar o gasto, e quem lança o gasto no
-- fim do mês muitas vezes ainda vai atrás da nota.
ALTER TABLE medication_purchase
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS mime        text,
  ADD COLUMN IF NOT EXISTS size_bytes  integer,
  ADD COLUMN IF NOT EXISTS sha256      text;

-- ============================================================================
-- E AS FUNÇÕES QUE ESCREVEM E LEEM AS DUAS.
--
-- Tudo aqui passa por função `SECURITY DEFINER`, como já passava: é ela que
-- confere o CARGO por dentro, porque rodar como dona do banco passa por cima
-- do RLS — a lição escrita na 1040, que custou o educador vendo as notas
-- fiscais da casa inteira.
--
-- DROP e CREATE, e não CREATE OR REPLACE, porque mudam os parâmetros e o tipo
-- de retorno. E o `SET search_path` vai escrito em cada uma: redefinir apaga o
-- que a 1200 fixou (§4.3).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A APLICAÇÃO NÃO LÊ A CHAVE DO OBJETO.
--
-- Nestas duas tabelas o SELECT era de TABELA inteira, e `REVOKE ALL
-- (storage_key)` não faz nada contra isso: no Postgres não se tira uma coluna
-- de uma concessão de tabela. Então a concessão vira coluna a coluna, como já
-- era em `incident_attachment` — e `storage_key` fica de fora.
--
-- Escrita não aparece aqui porque não existe: as duas tabelas só recebem
-- INSERT por função `SECURITY DEFINER`, que roda como dona do banco.
REVOKE SELECT ON prescription_document FROM rede_app;
GRANT SELECT (id, prescription_id, house_id, display_name, issued_on, prescriber,
              storage_ref, uploaded_by, uploaded_at, mime, file_name, size_bytes, sha256)
  ON prescription_document TO rede_app;

REVOKE SELECT ON medication_purchase FROM rede_app;
GRANT SELECT (id, house_id, bought_on, supplier, items, total_cents, invoice_ref,
              storage_ref, display_name, note, bought_by, created_at,
              mime, size_bytes, sha256)
  ON medication_purchase TO rede_app;

-- ------------------------------------------------------------ anexar receita
DROP FUNCTION IF EXISTS app_anexar_receita(uuid, text, text, date, text);

CREATE FUNCTION app_anexar_receita(
  p_prescription uuid, p_nome text, p_storage text,
  p_em date DEFAULT NULL, p_prescritor text DEFAULT NULL,
  p_key text DEFAULT NULL, p_mime text DEFAULT NULL, p_file_name text DEFAULT NULL,
  p_size integer DEFAULT NULL, p_sha text DEFAULT NULL)
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

  -- Uma das duas formas, sempre. O CHECK da tabela diria o mesmo, e esta linha
  -- existe para a frase que chega à tela ser a da casa, e não a do Postgres.
  IF nullif(btrim(coalesce(p_storage, '')), '') IS NULL AND p_key IS NULL THEN
    RAISE EXCEPTION 'receita_sem_papel' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO prescription_document (prescription_id, house_id, display_name,
                                     issued_on, prescriber, storage_ref, uploaded_by,
                                     storage_key, mime, file_name, size_bytes, sha256)
  VALUES (p_prescription, v_casa, btrim(p_nome), p_em,
          nullif(btrim(p_prescritor), ''), nullif(btrim(coalesce(p_storage, '')), ''),
          app_current_user(), p_key, p_mime, p_file_name, p_size, p_sha)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_anexar_receita(uuid,text,text,date,text,text,text,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_anexar_receita(uuid,text,text,date,text,text,text,text,integer,text) TO rede_app;

-- ------------------------------------------------------------- ler as receitas
DROP FUNCTION IF EXISTS app_receitas_da_prescricao(uuid);

CREATE FUNCTION app_receitas_da_prescricao(p_prescription uuid)
RETURNS TABLE (id uuid, nome text, em date, prescritor text,
               anexado_por text, anexado_em timestamptz,
               tem_arquivo boolean, nome_do_arquivo text) AS $$
  SELECT d.id, d.display_name, d.issued_on, d.prescriber,
         app_user_display_name(d.uploaded_by), d.uploaded_at,
         d.mime IS NOT NULL, d.file_name
    FROM prescription_document d
   WHERE d.prescription_id = p_prescription
     /* Mesma razão: SECURITY DEFINER ignora a policy `pd_select`. */
     AND app_current_role() IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral')
     AND d.house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
   ORDER BY d.uploaded_at DESC
$$ LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_receitas_da_prescricao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_receitas_da_prescricao(uuid) TO rede_app;

-- ------------------------------------------------------------ abrir a receita
/*
 * A receita NASCE RESTRITA (§8.6): ela traz CID e o nome do prescritor, e isso
 * não muda o que o educador faz às 22h. Abrir, portanto, é um ato — e como o
 * anexo da ocorrência, ele REGISTRA ANTES de devolver.
 */
CREATE OR REPLACE FUNCTION app_abrir_receita(p_id uuid)
RETURNS TABLE (out_key text, out_mime text, out_name text, out_ref text) AS $$
DECLARE v_d prescription_document%ROWTYPE;
BEGIN
  SELECT * INTO v_d FROM prescription_document WHERE id = p_id;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 'receita_inexistente' USING ERRCODE = 'no_data_found'; END IF;
  IF NOT app_house_in_scope(v_d.house_id)
     OR app_current_role() NOT IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'receita_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_d.house_id, app_current_user(), 'prescription.document_open',
          'prescription_document', p_id,
          jsonb_build_object('forma', CASE WHEN v_d.storage_key IS NOT NULL
                                           THEN 'arquivo' ELSE 'referencia' END));

  RETURN QUERY SELECT v_d.storage_key, v_d.mime,
                      coalesce(v_d.file_name, v_d.display_name), v_d.storage_ref;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_abrir_receita(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_abrir_receita(uuid) TO rede_app;

-- ------------------------------------------------------------ a nota fiscal
DROP FUNCTION IF EXISTS app_registrar_compra_medicamento(uuid,date,text,text,integer,text,text,text,text);

CREATE FUNCTION app_registrar_compra_medicamento(
  p_house uuid, p_em date, p_itens text, p_fornecedor text,
  p_total_cents integer, p_nota text, p_obs text,
  p_storage text DEFAULT NULL, p_nome text DEFAULT NULL,
  p_key text DEFAULT NULL, p_mime text DEFAULT NULL,
  p_size integer DEFAULT NULL, p_sha text DEFAULT NULL)
RETURNS TABLE (compra_id uuid) AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'casa_fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app_current_role() NOT IN ('enfermagem','equipe_tecnica','lider_diurno',
                                'coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_compra' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(length(btrim(p_itens)), 0) < 3 THEN
    RAISE EXCEPTION 'itens_obrigatorios' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO medication_purchase (house_id, bought_on, items, supplier,
                                   total_cents, invoice_ref, note,
                                   storage_ref, display_name, bought_by,
                                   storage_key, mime, size_bytes, sha256)
  VALUES (p_house, p_em, btrim(p_itens), nullif(btrim(p_fornecedor), ''),
          p_total_cents, nullif(btrim(p_nota), ''), nullif(btrim(p_obs), ''),
          nullif(btrim(coalesce(p_storage, '')), ''), p_nome, app_current_user(),
          p_key, p_mime, p_size, p_sha)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_registrar_compra_medicamento(uuid,date,text,text,integer,text,text,text,text,text,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_compra_medicamento(uuid,date,text,text,integer,text,text,text,text,text,text,integer,text) TO rede_app;

-- "Sem o papel" passa a contar as DUAS formas: a nota digitalizada conta tanto
-- quanto a que está numa pasta do Drive. Antes, subir o arquivo (que não dava)
-- deixaria a linha contada como pendente para sempre.
CREATE OR REPLACE FUNCTION app_compras_de_medicamento(p_house uuid, p_de date, p_ate date)
RETURNS TABLE (id uuid, em date, itens text, fornecedor text, total_cents integer,
               nota text, observacao text, tem_anexo boolean,
               nome_do_anexo text, comprado_por text) AS $$
  SELECT c.id, c.bought_on, c.items, c.supplier, c.total_cents,
         c.invoice_ref, c.note,
         (c.storage_ref IS NOT NULL OR c.mime IS NOT NULL), c.display_name,
         app_user_display_name(c.bought_by)
    FROM medication_purchase c
   WHERE c.house_id = p_house
     AND app_house_in_scope(p_house)
     AND app_current_role() IN ('enfermagem','equipe_tecnica','lider_diurno',
                                'coordenador','gestor_geral')
     AND c.bought_on BETWEEN p_de AND p_ate
   ORDER BY c.bought_on DESC, c.created_at DESC
$$ LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_compras_de_medicamento(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_compras_de_medicamento(uuid, date, date) TO rede_app;

-- ------------------------------------------------------- abrir a nota fiscal
/*
 * A nota é documento FINANCEIRO, e o educador não a lê (§8.6): não há nada
 * nela que ajude o turno. Os cargos são os mesmos que registram a compra.
 */
CREATE OR REPLACE FUNCTION app_abrir_nota_fiscal(p_id uuid)
RETURNS TABLE (out_key text, out_mime text, out_name text, out_ref text) AS $$
DECLARE v_c medication_purchase%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM medication_purchase WHERE id = p_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'nota_inexistente' USING ERRCODE = 'no_data_found'; END IF;
  IF NOT app_house_in_scope(v_c.house_id)
     OR app_current_role() NOT IN ('enfermagem','equipe_tecnica','lider_diurno',
                                   'coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'nota_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO audit_event (house_id, actor_id, action, entity, entity_id, detail)
  VALUES (v_c.house_id, app_current_user(), 'medication.invoice_open',
          'medication_purchase', p_id,
          jsonb_build_object('forma', CASE WHEN v_c.storage_key IS NOT NULL
                                           THEN 'arquivo' ELSE 'referencia' END));

  RETURN QUERY SELECT v_c.storage_key, v_c.mime,
                      coalesce(v_c.display_name, 'Nota fiscal'), v_c.storage_ref;
END $$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_abrir_nota_fiscal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_abrir_nota_fiscal(uuid) TO rede_app;
