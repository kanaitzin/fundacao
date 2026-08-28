-- ============================================================
-- Rede Acolher — Migração 056: cofre de credenciais do acolhido
--
-- Decisão da Fundação (Leonardo, 28/08/2026): as senhas de gov.br, INSS, CTPS
-- e acessos bancários das crianças ficam NO SISTEMA, visíveis à coordenação da
-- casa. O raciocínio é o certo, e é por isso que a migração anterior foi
-- revista: a coordenação tem a guarda das crianças e precisa desses acessos
-- para resolver benefício, matrícula e documento. Se o sistema não guardar,
-- isso continua existindo — numa planilha compartilhada, sem controle de quem
-- abriu, sem registro e sem criptografia.
--
-- Então o objetivo aqui não é impedir o guardar. É guardar DIREITO:
--
--  1. **a senha nunca fica em texto claro no banco.** É cifrada pela
--     aplicação (AES-256-GCM) antes de chegar aqui. Um dump do banco, um
--     backup extraviado ou um SELECT de quem tem acesso ao servidor devolvem
--     bytes sem uso;
--
--  2. **o papel da aplicação NÃO LÊ a coluna cifrada.** Privilégio por coluna:
--     `rede_app` enxerga tipo, login, dica e responsável, e não enxerga o
--     segredo. Ver a senha exige o comando `app_reveal_credential`, que
--     verifica quem é, exige finalidade e REGISTRA ANTES de devolver;
--
--  3. **cada revelação é um evento com nome, hora e finalidade.** Não é o
--     mesmo que "abriu a planilha": a pergunta "quem viu a senha do fulano em
--     março?" passa a ter resposta;
--
--  4. **só a coordenação da casa atual.** Educador, líder, técnica,
--     enfermagem e cozinha não veem nem que existe credencial. O Gestor Geral
--     também não vê no dia a dia: ele tem acesso EXCEPCIONAL e justificado,
--     que fica marcado como exceção — sem isso, a saída de um coordenador
--     deixaria a instituição sem acesso aos benefícios das crianças, o que
--     seria pior;
--
--  5. **nunca sai em relatório, exportação, linha do tempo, notificação,
--     busca ou cópia para o Drive.** Credencial não é documento.
-- ============================================================

CREATE TABLE person_credential (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES person(id),
  kind          text NOT NULL CHECK (kind IN ('gov_br','inss','ctps','banco','escola','outro')),
  kind_other    text,                       -- quando 'outro', qual é
  login         text,                       -- CPF, matrícula ou usuário — identifica, não abre
  -- Segredo cifrado pela aplicação. O banco guarda bytes; a chave vive fora
  -- daqui, na variável de ambiente do serviço (§22).
  secret_enc    text NOT NULL,
  secret_hint   text,                       -- dica curta, para conferir sem revelar
  holder        text,                       -- quem responde pela credencial, por cargo
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES app_user(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES app_user(id)
);
CREATE INDEX idx_credential_person ON person_credential (person_id);
-- Uma credencial por tipo (e por "qual", quando o tipo é 'outro').
CREATE UNIQUE INDEX uq_credential_tipo
  ON person_credential (person_id, kind, coalesce(kind_other, ''));

-- A dica não pode virar a própria senha por descuido.
ALTER TABLE person_credential ADD CONSTRAINT ck_credential_dica_curta
  CHECK (secret_hint IS NULL OR length(secret_hint) <= 40);

ALTER TABLE person_credential ENABLE ROW LEVEL SECURITY;

-- PRIVILÉGIO POR COLUNA: `secret_enc` fica de fora do SELECT do papel da
-- aplicação. Mesmo com a policy satisfeita, `SELECT *` falha — e é essa
-- falha que garante que ninguém leia o segredo por engano num relatório.
GRANT SELECT (id, person_id, kind, kind_other, login, secret_hint, holder,
              notes, created_at, created_by, updated_at, updated_by)
  ON person_credential TO rede_app;
GRANT INSERT, UPDATE ON person_credential TO rede_app;

-- Só a coordenação da casa atual (§6.10). O Gestor Geral entra pelo caminho
-- excepcional, abaixo — que registra a exceção.
CREATE OR REPLACE FUNCTION app_can_see_credentials(p uuid) RETURNS boolean AS $$
  SELECT app_current_role() = 'coordenador'
     AND app_person_house(p) IS NOT NULL
     AND app_person_house(p) IN (SELECT app_user_house_ids())
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE POLICY cred_select ON person_credential FOR SELECT TO rede_app
  USING (app_can_see_credentials(person_id));
CREATE POLICY cred_insert ON person_credential FOR INSERT TO rede_app
  WITH CHECK (app_can_see_credentials(person_id));
CREATE POLICY cred_update ON person_credential FOR UPDATE TO rede_app
  USING (app_can_see_credentials(person_id)) WITH CHECK (true);

-- Sem DELETE: credencial que deixou de valer é substituída, e a substituição
-- fica datada. Apagar esconderia que ela existiu e quem teve acesso.

-- ============================================================
-- Revelar uma senha
--
-- Registra ANTES de devolver. Se o registro falhar, a revelação não acontece —
-- é a mesma transação. Nesta área, "quem viu, quando e para quê" não é
-- metadado de conveniência: é a única coisa que separa um cofre de uma gaveta.
-- ============================================================
CREATE OR REPLACE FUNCTION app_reveal_credential(p_credential uuid, p_purpose text)
RETURNS TABLE (segredo text, excepcional boolean) AS $$
DECLARE c record; v_coord boolean; v_gestor boolean; v_excecao boolean := false;
BEGIN
  SELECT * INTO c FROM person_credential WHERE id = p_credential;
  IF c IS NULL THEN
    RAISE EXCEPTION 'credencial_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  v_coord  := app_can_see_credentials(c.person_id);
  v_gestor := app_current_role() = 'gestor_geral';

  IF NOT v_coord AND NOT v_gestor THEN
    RAISE EXCEPTION 'sem_permissao_credencial' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Finalidade obrigatória, e mais exigente na exceção: o Gestor Geral só
  -- entra aqui quando há motivo institucional escrito.
  IF v_coord THEN
    IF coalesce(length(btrim(p_purpose)), 0) < 5 THEN
      RAISE EXCEPTION 'finalidade_obrigatoria' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_excecao := true;
    IF coalesce(length(btrim(p_purpose)), 0) < 20 THEN
      RAISE EXCEPTION 'finalidade_excepcional_insuficiente' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO audit_event (actor_id, action, entity, entity_id, purpose, detail)
  VALUES (app_current_user(),
          CASE WHEN v_excecao THEN 'credential.reveal_exceptional' ELSE 'credential.reveal' END,
          'person_credential', p_credential, btrim(p_purpose),
          jsonb_build_object('tipo', c.kind, 'pessoa', c.person_id));

  RETURN QUERY SELECT c.secret_enc, v_excecao;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_reveal_credential(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_reveal_credential(uuid, text) TO rede_app;

-- Histórico de quem abriu o quê: a coordenação enxerga o próprio cofre.
CREATE OR REPLACE FUNCTION app_credential_history(p_person uuid)
RETURNS TABLE (quando timestamptz, quem text, acao text, finalidade text) AS $$
  SELECT a.at, u.full_name, a.action, a.purpose
    FROM audit_event a
    JOIN app_user u ON u.id = a.actor_id
   WHERE a.entity = 'person_credential'
     AND a.entity_id IN (SELECT id FROM person_credential WHERE person_id = p_person)
     AND (app_can_see_credentials(p_person) OR app_current_role() = 'gestor_geral')
   ORDER BY a.at DESC
   LIMIT 100
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_credential_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_credential_history(uuid) TO rede_app;

-- A restrição da migração 055 continua valendo para os campos de texto: a
-- senha tem um lugar próprio e cifrado, e não deve ser colada em observação.
COMMENT ON TABLE person_credential IS
  'Cofre de credenciais do acolhido (§6.10). Segredo cifrado pela aplicação; '
  'coluna não legível pelo papel rede_app. Revelar exige finalidade e gera '
  'registro nominal. Nunca entra em relatório, exportação ou arquivo.';
