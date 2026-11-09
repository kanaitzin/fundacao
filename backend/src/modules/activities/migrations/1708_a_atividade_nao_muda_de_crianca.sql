-- A ATIVIDADE NÃO MUDA DE CRIANÇA -- (fase 298; o que a revisão do banco achou depois da 1702.)
--
-- A aplicação tinha UPDATE em todas as colunas da atividade: provado como o papel da
-- aplicação, a coordenação da Casa 04 levava uma atividade para uma criança da Casa 03. A
-- aplicação só muda a situação, a nota da exceção e a versão. O compromisso da agenda e a
-- designação de quem faz a atividade, que a aplicação nunca atualiza, perdem o UPDATE.

REVOKE UPDATE ON activity FROM rede_app;
GRANT UPDATE (state, exception_note, updated_at, version) ON activity TO rede_app;
REVOKE UPDATE ON commitment FROM rede_app;
REVOKE UPDATE ON activity_assignment FROM rede_app;
