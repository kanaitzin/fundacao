-- ============================================================
-- Migração 0060 — Nome de exibição de autoria
--
-- Problema encontrado no teste da Fase 4: a Enfermagem não conseguia ver a
-- fila de triagem porque a consulta juntava `app_user` para mostrar QUEM
-- acompanhou o atendimento — e a política de usuários (corretamente) não
-- entrega o cadastro de funcionários à Enfermagem.
--
-- Mas autoria visível é requisito: "todos veem quem tomou ciência, foi
-- responsável, executou" (§9). O que estava errado não era a política — era
-- pedir o CADASTRO quando só se precisa do NOME.
--
-- Esta função entrega exatamente isso: o nome de exibição de quem assinou um
-- registro. Nada de e-mail, cargo, vínculo, escala ou situação da conta.
-- ============================================================

CREATE OR REPLACE FUNCTION app_user_display_name(p_user uuid) RETURNS text AS $$
  SELECT full_name FROM app_user WHERE id = p_user
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_user_display_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_user_display_name(uuid) TO rede_app;

COMMENT ON FUNCTION app_user_display_name(uuid) IS
  'Nome de exibição para atribuir autoria (§9). Não substitui a política de acesso ao cadastro de usuários.';
