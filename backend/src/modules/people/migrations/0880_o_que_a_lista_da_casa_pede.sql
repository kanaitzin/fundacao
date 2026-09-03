-- =========================================================================
-- O QUE A LISTA DA CASA TEM E O SISTEMA NÃO TINHA — 03/09/2026
--
-- A equipe técnica mantém, à mão, uma lista das vinte crianças da Casa 03 num
-- documento de texto. Ela é reenviada inteira toda vez que uma linha muda, e
-- na versão que chegou aqui trazia, por criança: filiação, RG, cartão SUS,
-- os telefones da mãe, do padrinho, da tia e do vínculo comunitário, o número
-- do processo e a CHAVE DE ACESSO a ele.
--
-- Esse documento é o problema que este sistema existe para resolver: um
-- arquivo com CPF, processo e chave de acesso de vinte crianças, circulando
-- por anexo, desatualizado no dia seguinte ao envio. O que ele NÃO é é um
-- defeito da equipe — é o que sobra quando não há onde guardar.
--
-- Esta migração traz os campos que faltavam. Nenhum dado real entra aqui: a
-- lista foi lida como ESPECIFICAÇÃO, e a carga dos dados de verdade é da
-- implantação, com a LGPD decidida (docs/implantacao.md §6).
-- =========================================================================

-- ---------------------------------------------------------------- Identidade

ALTER TABLE person
  -- RG e CNS são o que a rede pede no balcão: escola, posto, perícia. Sem
  -- eles no sistema, a educadora que leva a criança ao médico continua
  -- dependendo da planilha impressa que alguém lembrou de atualizar.
  ADD COLUMN IF NOT EXISTS rg   text,
  ADD COLUMN IF NOT EXISTS cns  text,
  -- FILIAÇÃO EM TEXTO, e não em duas colunas "mãe" e "pai".
  --
  -- A lista da casa escreve "Filiação:" e lista um ou dois nomes. Impor duas
  -- colunas nomeadas obrigaria a decidir, no cadastro, qual nome é de qual
  -- papel — e a família de uma criança acolhida raramente cabe nesse molde:
  -- há criança com uma mãe só, com duas, com o pai falecido, com a genitora
  -- em situação de rua. Um nome por linha, como está escrito no documento que
  -- a casa já usa.
  ADD COLUMN IF NOT EXISTS filiation text,
  -- A foto é de IDENTIFICAÇÃO, para a equipe reconhecer quem é quem — vinte
  -- crianças, plantão que troca a cada doze horas, gente nova toda semana.
  -- Fica junto dos objetos do dossiê, no mesmo armazenamento fora do banco.
  ADD COLUMN IF NOT EXISTS photo_key  text,
  ADD COLUMN IF NOT EXISTS photo_mime text,
  ADD COLUMN IF NOT EXISTS photo_at   timestamptz,
  ADD COLUMN IF NOT EXISTS photo_by   uuid REFERENCES app_user(id);

COMMENT ON COLUMN person.filiation IS
  'Filiação como a casa escreve: um nome por linha. Não presume dois responsáveis.';
COMMENT ON COLUMN person.photo_key IS
  'Foto de identificação — chave no armazenamento de objetos, nunca o binário no banco.';

-- ------------------------------------------------------- Contatos e vínculos

/*
 * OS TELEFONES QUE A CASA PRECISA ÀS 23H.
 *
 * A lista mistura, na mesma célula, genitora, padrinho, tia, irmã e "vínculo
 * comunitário" — e é assim mesmo que a casa pensa: o que importa é quem
 * atende quando a criança precisa, não o grau de parentesco no papel.
 *
 * Por isso o vínculo é um RÓTULO, e não uma hierarquia. "Madrinha Simoni" não
 * vale menos que "genitora Rosângela": em várias dessas histórias, a madrinha
 * é quem aparece.
 */
CREATE TABLE IF NOT EXISTS person_contact (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES person(id),
  name         text NOT NULL,
  bond         text NOT NULL CHECK (bond IN (
                 'genitora','genitor','irmao','avo','tio','padrinho','madrinha',
                 'vinculo_comunitario','servico_da_rede','outro')),
  bond_other   text,
  phone        text,
  note         text,
  -- Contato que não deve ser acionado sem falar com a técnica antes. Existe
  -- porque há situação em que o telefone está no papel e a aproximação está
  -- suspensa por decisão judicial — e quem descobre isso às 23h é tarde.
  restricted   boolean NOT NULL DEFAULT false,
  restriction_note text,
  active       boolean NOT NULL DEFAULT true,
  ended_reason text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES app_user(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES app_user(id),
  CHECK (bond <> 'outro' OR bond_other IS NOT NULL),
  CHECK (NOT restricted OR restriction_note IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_contact_person ON person_contact (person_id) WHERE active;

ALTER TABLE person_contact ENABLE ROW LEVEL SECURITY;

-- O educador LÊ. Foi decisão da coordenação em 03/09/2026: quem está com a
-- criança precisa saber quem é a madrinha que aparece no portão, e registrar
-- o encontro. Escrever no cadastro continua sendo da técnica e da coordenação.
DROP POLICY IF EXISTS contact_select ON person_contact;
CREATE POLICY contact_select ON person_contact FOR SELECT TO rede_app
  USING (app_person_in_scope(person_id));

DROP POLICY IF EXISTS contact_write ON person_contact;
CREATE POLICY contact_write ON person_contact FOR INSERT TO rede_app
  WITH CHECK (app_person_in_scope(person_id)
              AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));

DROP POLICY IF EXISTS contact_update ON person_contact;
CREATE POLICY contact_update ON person_contact FOR UPDATE TO rede_app
  USING (app_person_in_scope(person_id)
         AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral'));

GRANT SELECT, INSERT, UPDATE ON person_contact TO rede_app;

-- Contato não se apaga: encerra-se, com motivo. O telefone que deixou de
-- valer é informação — alguém tentou por ele e não conseguiu.
CREATE OR REPLACE FUNCTION app_contato_nao_e_apagado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'contato_nao_e_apagado';
END $$;

DROP TRIGGER IF EXISTS trg_contato_sem_delete ON person_contact;
CREATE TRIGGER trg_contato_sem_delete BEFORE DELETE ON person_contact
  FOR EACH ROW EXECUTE FUNCTION app_contato_nao_e_apagado();

-- ------------------------------------------------- A chave de acesso ao processo

/*
 * A CHAVE DE ACESSO VAI PARA O COFRE, e não para o cadastro.
 *
 * A coordenação pediu para guardar tudo, inclusive a chave de acesso ao
 * processo judicial — e está certa: hoje ela vive num .docx que circula por
 * anexo. O que muda é ONDE ela fica.
 *
 * Essa chave abre o processo da criança inteiro. Ela é da mesma natureza da
 * senha do gov.br e do INSS, e por isso entra no cofre que já existe (§11.4):
 * cifrada com a chave da instituição, aberta só pelo coordenador da casa e
 * pelo Gestor Geral, com reautenticação e um registro por visualização. No
 * cadastro comum, ela ficaria à vista de quem abrisse o perfil.
 */
ALTER TABLE person_credential DROP CONSTRAINT IF EXISTS person_credential_kind_check;
ALTER TABLE person_credential ADD CONSTRAINT person_credential_kind_check
  CHECK (kind IN ('gov_br','inss','ctps','banco','escola','processo_judicial','outro'));

-- --------------------------------------------- Corrigir também os documentos

/*
 * RG, CNS E FILIAÇÃO CORRIGEM-SE PELA MESMA PORTA DO NOME.
 *
 * `app_corrigir_pessoa` aceitava quatro campos: nome civil, nome social,
 * nascimento e CPF. Ela pede motivo escrito e guarda, campo a campo, o que
 * constava antes — que é exatamente o que um número de documento precisa
 * quando muda.
 *
 * Documento de identidade não "atualiza": ou estava errado, ou foi emitido
 * agora. Nos dois casos alguém vai perguntar, um ano depois, por que o RG da
 * criança no relatório de março não é o mesmo de setembro, e a resposta tem
 * de estar escrita. Por isso os três novos entram AQUI, e não em
 * `app_atualizar_detalhe_perfil`, que não pede motivo.
 */
ALTER TABLE person_correction DROP CONSTRAINT IF EXISTS person_correction_field_check;
ALTER TABLE person_correction ADD CONSTRAINT person_correction_field_check
  CHECK (field IN ('full_name','social_name','birth_date','cpf','rg','cns','filiation'));

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
    IF v_campo NOT IN ('full_name','social_name','birth_date','cpf',
                       'rg','cns','filiation') THEN
      RAISE EXCEPTION 'campo_nao_corrigivel';
    END IF;
    v_novo := nullif(btrim(coalesce(p_campos ->> v_campo, '')), '');
    v_velho := CASE v_campo
      WHEN 'full_name'   THEN v_antes.full_name
      WHEN 'social_name' THEN v_antes.social_name
      WHEN 'birth_date'  THEN v_antes.birth_date::text
      WHEN 'cpf'         THEN v_antes.cpf
      WHEN 'rg'          THEN v_antes.rg
      WHEN 'cns'         THEN v_antes.cns
      WHEN 'filiation'   THEN v_antes.filiation
    END;
    CONTINUE WHEN v_novo IS NOT DISTINCT FROM v_velho;
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
    ELSIF v_campo = 'rg'        THEN UPDATE person SET rg        = v_novo WHERE id = p_person;
    ELSIF v_campo = 'cns'       THEN UPDATE person SET cns       = v_novo WHERE id = p_person;
    ELSIF v_campo = 'filiation' THEN UPDATE person SET filiation = v_novo WHERE id = p_person;
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
