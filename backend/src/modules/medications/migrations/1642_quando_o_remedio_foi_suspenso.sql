-- QUANDO O REMÉDIO FOI SUSPENSO (fase 186).
--
-- A folha "o que mudou desde o meu último plantão" diz que um remédio foi
-- suspenso enquanto a pessoa estava fora. A prescrição guardava o motivo da
-- suspensão, mas não o instante: ele só existia na auditoria, que o educador
-- não lê. Passa a ficar na própria prescrição, com quem suspendeu.
--
-- As suspensões de antes desta migração ganham o instante e o autor que a
-- auditoria registrou; as que a auditoria não tiver ficam sem instante, e
-- nenhuma folha as chama de novidade.

ALTER TABLE prescription ADD COLUMN suspended_at timestamptz;
ALTER TABLE prescription ADD COLUMN suspended_by uuid REFERENCES app_user(id);

UPDATE prescription p
   SET suspended_at = a.at, suspended_by = a.actor_id
  FROM (SELECT DISTINCT ON (entity_id) entity_id, at, actor_id
          FROM audit_event
         WHERE action = 'prescription.suspend' AND entity = 'prescription'
         ORDER BY entity_id, at DESC) a
 WHERE a.entity_id = p.id AND p.status = 'suspensa';

CREATE INDEX idx_prescription_suspensa ON prescription (house_id, suspended_at)
  WHERE suspended_at IS NOT NULL;
