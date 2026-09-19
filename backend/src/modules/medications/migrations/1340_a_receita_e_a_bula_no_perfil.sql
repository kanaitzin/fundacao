-- ============================================================
-- 1340 — A receita (e a bula) caindo direto no perfil da criança
--
-- O pedido da equipe, repassado pela Fundação em 15/09:
--
--   *"A enfermagem […] se elas quiserem botar alguma bula, alguma receita,
--   alguma coisa ali pela enfermagem, que já caia direto no perfil da
--   criança."*
--
-- E a regra que ele tirou dali para o sistema inteiro: *"todos os outros
-- lugares onde a gente preenche […] têm que ir individual para cada um no seu
-- registro."*
--
-- ---
--
-- 1. A RECEITA CHEGA AO DOSSIÊ
--
-- `app_anexar_receita` guardava em `prescription_document` e parava ali. A
-- receita ficava presa à prescrição, na tela de Saúde, e o dossiê — que só lê
-- `document` — não sabia que ela existia.
--
-- Agora a função pede o espelho a `app_espelhar_no_dossie` (migração 1330), que
-- aponta para o **mesmo objeto guardado**. Não há cópia do arquivo: duas cópias
-- divergem no dia em que alguém substituir uma delas.
--
-- **Só quando há ARQUIVO.** A receita pode ser anexada como REFERÊNCIA — "está
-- na pasta tal do Drive" —, e um espelho sem arquivo seria um documento no
-- dossiê que não abre. O dossiê ganharia uma linha e a criança não ganharia
-- nada.
--
-- ---
--
-- 2. A BULA, QUE NÃO EXISTIA EM LUGAR NENHUM
--
-- Ele pediu *"alguma bula, alguma receita"*, e só a receita existia. A bula
-- entra pela mesma porta: `prescription_document.kind`, com dois valores.
--
-- **Por que a mesma tabela, e não uma nova:** as duas são o mesmo fato — um
-- papel digitalizado, preso a uma prescrição, anexado por quem cuida. O que
-- muda é o rótulo. Uma tabela `prescription_leaflet` idêntica a esta, com outro
-- nome, seria a mesma coisa escrita duas vezes — e a segunda esqueceria a
-- correção que a primeira recebesse.
--
-- **E a bula NÃO é documento restrito da mesma forma.** A receita traz
-- diagnóstico, CID e o nome do prescritor, e por isso nasce restrita (§1040). A
-- bula é o papel que vem dentro da caixa do remédio: ela não diz nada sobre a
-- criança. Mesmo assim ela segue a mesma política, e a razão é prática: a bula
-- está presa a uma prescrição, e saber QUE bula alguém guardou é saber qual
-- remédio a criança toma. O sigilo não está no papel; está no vínculo.
-- ============================================================

ALTER TABLE prescription_document
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'receita';

ALTER TABLE prescription_document DROP CONSTRAINT IF EXISTS ck_prescription_document_kind;
ALTER TABLE prescription_document ADD CONSTRAINT ck_prescription_document_kind
  CHECK (kind IN ('receita', 'bula'));

COMMENT ON COLUMN prescription_document.kind IS
  'Receita ou bula. A mesma tabela porque é o mesmo fato — um papel '
  'digitalizado preso a uma prescrição —, e o que muda é o rótulo. Duas '
  'tabelas idênticas com nomes diferentes seriam a mesma coisa escrita duas '
  'vezes, e a segunda esqueceria a correção que a primeira recebesse.';

-- ------------------------------------------------------------
-- Anexar — e espelhar no dossiê da criança
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_anexar_receita(
  p_prescription uuid, p_nome text, p_storage text,
  p_em date DEFAULT NULL, p_prescritor text DEFAULT NULL,
  p_key text DEFAULT NULL, p_mime text DEFAULT NULL, p_file_name text DEFAULT NULL,
  p_size integer DEFAULT NULL, p_sha text DEFAULT NULL,
  p_kind text DEFAULT 'receita')
RETURNS TABLE (documento_id uuid, no_dossie uuid) AS $$
DECLARE v_casa uuid; v_pessoa uuid; v_remedio text; v_id uuid; v_doc uuid;
BEGIN
  IF app_current_role() NOT IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral') THEN
    RAISE EXCEPTION 'sem_permissao_receita' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(p_kind, 'receita') NOT IN ('receita', 'bula') THEN
    RAISE EXCEPTION 'tipo_de_papel_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.house_id, p.person_id, p.medication
    INTO v_casa, v_pessoa, v_remedio
    FROM prescription p WHERE p.id = p_prescription;
  IF v_casa IS NULL OR NOT app_house_in_scope(v_casa) THEN
    RAISE EXCEPTION 'prescricao_fora_de_escopo' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_key IS NULL AND p_storage IS NULL THEN
    RAISE EXCEPTION 'receita_sem_papel' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO prescription_document (prescription_id, house_id, display_name,
                                     issued_on, prescriber, storage_ref, uploaded_by,
                                     storage_key, mime, file_name, size_bytes, sha256,
                                     kind)
  VALUES (p_prescription, v_casa, btrim(p_nome), p_em,
          nullif(btrim(p_prescritor), ''), p_storage, app_current_user(),
          p_key, p_mime, p_file_name, p_size, p_sha, coalesce(p_kind, 'receita'))
  RETURNING id INTO v_id;

  /*
   * E CAI NO PERFIL DA CRIANÇA — só quando há ARQUIVO.
   *
   * A receita pode ser anexada como REFERÊNCIA ("está na pasta tal do Drive"),
   * e um espelho sem arquivo seria um documento no dossiê que não abre: a pasta
   * ganharia uma linha e a criança não ganharia nada.
   */
  IF p_key IS NOT NULL THEN
    SELECT e.documento_id INTO v_doc
      FROM app_espelhar_no_dossie(
        v_pessoa, 'saude',
        /* A receita ocupa a vaga do checklist; a bula é avulsa, porque não é
           um documento que a casa precisa ter — é o papel da caixa. */
        CASE WHEN coalesce(p_kind, 'receita') = 'receita' THEN 'receita' ELSE NULL END,
        btrim(p_nome),
        CASE WHEN coalesce(p_kind, 'receita') = 'receita'
             THEN 'Receita anexada à prescrição de ' || coalesce(v_remedio, 'medicamento')
             ELSE 'Bula anexada à prescrição de ' || coalesce(v_remedio, 'medicamento') END,
        'prescription_document:' || v_id::text,
        p_key, p_sha, p_mime, p_file_name, p_em) e;
  END IF;

  RETURN QUERY SELECT v_id, v_doc;
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_anexar_receita(uuid,text,text,date,text,text,text,text,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_anexar_receita(uuid,text,text,date,text,text,text,text,integer,text,text) TO rede_app;

-- A assinatura de dez argumentos sai: ela existiu entre a 1230 e esta, e
-- deixá-la viva significaria dois caminhos para anexar uma receita — um que
-- espelha no dossiê e outro que não. O erro apareceria como uma receita que
-- "às vezes chega ao perfil".
DROP FUNCTION IF EXISTS app_anexar_receita(uuid,text,text,date,text,text,text,text,integer,text);

-- ------------------------------------------------------------
-- A leitura, agora com o tipo do papel
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS app_receitas_da_prescricao(uuid);
CREATE OR REPLACE FUNCTION app_receitas_da_prescricao(p_prescription uuid)
RETURNS TABLE (id uuid, nome text, tipo text, em date, prescritor text,
               anexado_por text, anexado_em timestamptz,
               tem_arquivo boolean, nome_do_arquivo text, no_dossie uuid) AS $$
  SELECT d.id, d.display_name, d.kind, d.issued_on, d.prescriber,
         app_user_display_name(d.uploaded_by), d.uploaded_at,
         d.storage_key IS NOT NULL, d.file_name,
         /* O espelho, para a tela poder dizer "também está no dossiê dela" —
            e não deixar a Enfermagem na dúvida sobre se chegou. */
         (SELECT doc.id FROM document doc
           WHERE doc.mirror_of = 'prescription_document:' || d.id::text)
    FROM prescription_document d
   WHERE d.prescription_id = p_prescription
     /* SECURITY DEFINER ignora a policy `pd_select`; o recorte é aqui. */
     AND app_current_role() IN ('enfermagem','equipe_tecnica','coordenador','gestor_geral')
     AND d.house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
   ORDER BY d.uploaded_at DESC
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_receitas_da_prescricao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_receitas_da_prescricao(uuid) TO rede_app;

-- ------------------------------------------------------------
-- E as que já estão guardadas passam a aparecer no dossiê
--
-- Sem isto, a entrega valeria só para as receitas anexadas DEPOIS desta
-- migração — e a casa abriria a pasta da criança no dia seguinte sem entender
-- por que a receita de ontem não está lá.
-- ------------------------------------------------------------
INSERT INTO document (person_id, category, title, checklist_key, issued_on,
                      source, mirror_of, created_by,
                      accepted_at, accepted_by, accepted_note)
SELECT p.person_id, 'saude'::doc_category, d.display_name, 'receita', d.issued_on,
       'Receita anexada à prescrição de ' || coalesce(p.medication, 'medicamento'),
       'prescription_document:' || d.id::text, d.uploaded_by,
       d.uploaded_at, d.uploaded_by,
       'Conferida na tela de origem, por quem anexou: receita da prescrição.'
  FROM prescription_document d
  JOIN prescription p ON p.id = d.prescription_id
 WHERE d.storage_key IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM document x
                    WHERE x.mirror_of = 'prescription_document:' || d.id::text);

INSERT INTO document_version (document_id, version, storage_key, sha256,
                              mime, file_name, created_by)
SELECT x.id, 1, d.storage_key, d.sha256, d.mime, d.file_name, d.uploaded_by
  FROM prescription_document d
  JOIN document x ON x.mirror_of = 'prescription_document:' || d.id::text
 WHERE d.storage_key IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM document_version v WHERE v.document_id = x.id);
