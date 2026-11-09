-- A FILA SEM INTERNET E OS CONFLITOS QUE NÃO SE LEEM PELA CASA (fase 297; achado pela revisão
-- do banco junto do sigilo de saúde, nursing/1691 a 1693).
--
-- O que sobe pela fila fica guardado inteiro (`offline_operation.payload`), e o conflito guarda
-- as duas versões (`sync_conflict.version_a`): a cozinha lia o motivo e a receita de uma evolução
-- de saúde, e o Gestor Geral lia o atendimento sigiloso. Agora a fila se lê só por quem a mandou,
-- e o conflito só por quem o decide (a equipe técnica, a coordenação e o Gestor Geral, como o
-- `alcance.ts`); o conflito de um atendimento sigiloso, só por quem lê o sigilo.

-- A fila e os conflitos.
DROP POLICY oo_select ON offline_operation;
CREATE POLICY oo_select ON offline_operation FOR SELECT TO rede_app
  USING (user_id = app_current_user());

DROP POLICY sc_select ON sync_conflict;
CREATE POLICY sc_select ON sync_conflict FOR SELECT TO rede_app
  USING (house_id = ANY (ARRAY(SELECT app_casas_no_alcance()))
         AND app_current_role()::text IN ('equipe_tecnica', 'coordenador', 'gestor_geral')
         AND (entity <> 'health.evolution'
              OR coalesce(version_a #>> '{payload,sigiloso}', 'false') <> 'true'
              OR app_le_sigilo_de_saude()));
