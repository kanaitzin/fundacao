-- A VERSÃO DA ROTINA NÃO SE REESCREVE -- (fase 298; o que a revisão do banco achou depois da 1702.)
--
-- A rotina muda criando versão nova; a aplicação nunca atualiza uma versão, e o UPDATE em
-- todas as colunas deixava reescrever a de antes.

REVOKE UPDATE ON routine_version FROM rede_app;
