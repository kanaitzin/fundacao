-- A FORMA DO ATENDIMENTO E O ATENDIMENTO EM GRUPO (fase 309, pedido de 10/11).
--
-- A equipe técnica atende uma criança sozinha, com a família ou um grupo de crianças
-- da casa (a roda de conversa, a oficina). O atendimento em grupo era registrado na
-- ficha de uma criança só, ou repetido à mão em cada uma.
--
-- Agora o atendimento diz a forma: individual, familiar ou coletivo. O coletivo e o
-- familiar com irmãos da casa nascem como um registro por criança, todos com o mesmo
-- group_id: cada perfil tem o seu, a auditoria tem um por criança, e o cartão diz
-- quem mais participou. Nada se apaga nem se junta depois.

ALTER TABLE technical_session ADD COLUMN IF NOT EXISTS form text;
ALTER TABLE technical_session DROP CONSTRAINT IF EXISTS technical_session_form_check;
ALTER TABLE technical_session ADD CONSTRAINT technical_session_form_check
  CHECK (form IS NULL OR form IN ('individual','familiar','coletivo'));

ALTER TABLE technical_session ADD COLUMN IF NOT EXISTS group_id uuid;
CREATE INDEX IF NOT EXISTS idx_technical_session_group
  ON technical_session (group_id) WHERE group_id IS NOT NULL;

COMMENT ON COLUMN technical_session.form IS
  'A forma do atendimento (fase 309): individual, familiar ou coletivo. Nulo nos registros de antes da 309.';
COMMENT ON COLUMN technical_session.group_id IS
  'O mesmo valor em todos os registros de um atendimento com mais de uma criança da casa (fase 309).';

-- O grupo é só do coletivo e do familiar com irmãos: o individual nunca leva grupo.
ALTER TABLE technical_session DROP CONSTRAINT IF EXISTS technical_session_grupo_check;
ALTER TABLE technical_session ADD CONSTRAINT technical_session_grupo_check
  CHECK (group_id IS NULL OR form IN ('familiar','coletivo'));

-- Quantas crianças do mesmo atendimento quem lê NÃO alcança hoje (a transferida, a que
-- saiu). Só o número, e só a quem lê aquele registro: o cartão diz "e mais uma criança
-- fora do seu alcance" em vez de a lista encolher calada.
CREATE OR REPLACE FUNCTION app_criancas_do_grupo_fora_do_alcance(p_session uuid)
RETURNS integer AS $$
  SELECT CASE WHEN s.group_id IS NULL THEN 0 ELSE (
           SELECT count(*)::int FROM technical_session o
            WHERE o.group_id = s.group_id AND o.id <> s.id
              AND o.person_id NOT IN (SELECT app_pessoas_no_alcance())) END
    FROM technical_session s
   WHERE s.id = p_session
     AND s.person_id IN (SELECT app_pessoas_no_alcance())
     AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_criancas_do_grupo_fora_do_alcance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_criancas_do_grupo_fora_do_alcance(uuid) TO rede_app;
