-- A CHAMADA NÃO SE REESCREVE DIRETO -- (fase 298; o que a revisão do banco achou depois da 1702.)
--
-- A aplicação não atualiza a chamada da casa (abrir e confirmar são funções do banco); o
-- UPDATE em todas as colunas deixava levá-la para outra casa.

REVOKE UPDATE ON collective_check FROM rede_app;
