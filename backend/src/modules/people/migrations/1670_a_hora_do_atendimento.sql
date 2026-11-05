-- A HORA DO ATENDIMENTO (fase 275, pedido de 05/11).
--
-- "Cada anotação em atendimento deve constar a data e a hora, para facilitar na
-- organização, assim como na busca dos atendimentos." O atendimento da equipe
-- técnica guardava só o dia; quando foi registrado já ficava em created_at.
-- Agora guarda também a hora em que aconteceu. Os atendimentos de antes ficam
-- sem hora (nula): não se inventa a hora de um registro antigo.

ALTER TABLE technical_session ADD COLUMN IF NOT EXISTS happened_time time;

COMMENT ON COLUMN technical_session.happened_time IS
  'A hora em que o atendimento aconteceu, no fuso da instituição (fase 275). Nula nos atendimentos registrados antes da fase 275.';

DROP INDEX IF EXISTS idx_technical_session_person;
CREATE INDEX IF NOT EXISTS idx_technical_session_person
  ON technical_session (person_id, happened_on DESC, happened_time DESC NULLS LAST);
