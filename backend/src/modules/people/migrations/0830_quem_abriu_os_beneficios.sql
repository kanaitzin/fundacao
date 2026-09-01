-- =============================================================================
-- 0830 — QUEM ABRIU OS BENEFÍCIOS, QUANDO E PARA QUÊ (§6.10)
--
-- O cofre de credenciais tem `app_credential_history` desde a 0560: a
-- coordenação abre o cofre de uma criança e vê, ali mesmo, quem entrou antes
-- dela e com que finalidade. Os benefícios e os dados bancários — a área que o
-- documento chama de mais sensível do sistema — não tinham nada disso.
--
-- O log existia (`benefits.view`, `.create`, `.update`, `.export`, `.denied`),
-- mas só em `audit_event`, que é ÁREA RESTRITA. Quem responde pela criança não
-- tinha como saber quem andou olhando a conta dela sem pedir a auditoria — e
-- pedir auditoria por rotina é o oposto do que a auditoria serve.
--
-- Duas decisões desta função:
--
--  * a TENTATIVA RECUSADA (`benefits.denied`) entra na lista. É a linha mais
--    importante que existe aqui: alguém tentou entrar na conta desta criança e
--    o sistema não deixou. Esconder isso de quem responde por ela seria
--    proteger o sistema em vez da criança;
--  * o alcance é o mesmo do dado (`app_can_see_benefits`), e não um alcance
--    próprio. Histórico de acesso a dado bancário é dado bancário: quem não
--    pode ver a conta não fica sabendo quem a viu.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_benefit_history(p_person uuid)
RETURNS TABLE (quando timestamptz, quem text, acao text, finalidade text) AS $$
  SELECT a.at, u.full_name, a.action, a.purpose
    FROM audit_event a
    JOIN app_user u ON u.id = a.actor_id
   WHERE a.action IN ('benefits.view','benefits.create','benefits.update',
                      'benefits.export','benefits.denied')
     AND (
       -- `view`, `export` e `denied` gravam a PESSOA como entidade; `create` e
       -- `update` gravam o REGISTRO, e por isso é preciso olhar os dois lados.
       (a.entity = 'person' AND a.entity_id = p_person)
       OR (a.entity = 'benefit_record'
           AND a.entity_id IN (SELECT id FROM benefit_record WHERE person_id = p_person))
     )
     AND app_can_see_benefits(p_person)
   ORDER BY a.at DESC
   LIMIT 100
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_benefit_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_benefit_history(uuid) TO rede_app;

COMMENT ON FUNCTION app_benefit_history(uuid) IS
  'Quem abriu, alterou, exportou — ou TENTOU e foi recusado — os benefícios '
  'desta criança. Mesmo alcance do dado: histórico de acesso a dado bancário '
  'é dado bancário (§6.10).';
