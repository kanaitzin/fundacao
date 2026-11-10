-- O PLANTÃO REGISTRA O ATENDIMENTO COMPORTAMENTAL (fase 307, decidido em 10/11).
--
-- Quem estava no plantão e conversou com a criança registra na hora: o educador, o
-- Líder Diurno e o Líder Noturno Geral registram o atendimento comportamental da casa,
-- e só ele. Ler continua com a equipe técnica, a coordenação e a gestão (ts_select não
-- muda): quem registra pelo plantão não passa a ler os atendimentos.
--
-- O arquivo junto: a conferência de que o atendimento é de quem anexa passava pela
-- leitura da tabela, que o plantão não tem. Ela vai para uma função que responde só
-- sim ou não, sobre o atendimento que a própria pessoa registrou.

CREATE OR REPLACE FUNCTION app_atendimento_que_registrei(p_session uuid, p_person uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM technical_session s
     WHERE s.id = p_session AND s.person_id = p_person
       AND s.created_by = app_current_user()
       AND (s.area = 'comportamental' OR app_current_role() IN ('equipe_tecnica','coordenador')))
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_atendimento_que_registrei(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_atendimento_que_registrei(uuid, uuid) TO rede_app;

DROP POLICY IF EXISTS ts_insert ON technical_session;
CREATE POLICY ts_insert ON technical_session FOR INSERT TO rede_app
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance())
              AND (app_current_role() IN ('equipe_tecnica','coordenador')
                   OR (app_current_role() IN ('educador','lider_diurno','lider_noturno_geral')
                       AND area = 'comportamental'))
              AND created_by = app_current_user()
              AND happened_on <= app_hoje());

DROP POLICY IF EXISTS tsa_insert ON technical_session_attachment;
CREATE POLICY tsa_insert ON technical_session_attachment FOR INSERT TO rede_app
  WITH CHECK (person_id IN (SELECT app_pessoas_no_alcance())
              AND app_current_role() IN ('equipe_tecnica','coordenador','educador','lider_diurno','lider_noturno_geral')
              AND created_by = app_current_user()
              AND app_atendimento_que_registrei(session_id, person_id));
