-- A AUTORIZAÇÃO E O PROTOCOLO NÃO SE REESCREVEM DIRETO -- (fase 298; o que a revisão do banco achou depois da 1702.)
--
-- A aplicação não atualiza a autorização de quem dá remédio nem o protocolo; o UPDATE em todas
-- as colunas deixava trocar a pessoa autorizada.

REVOKE UPDATE ON medication_authorization FROM rede_app;
REVOKE UPDATE ON medication_protocol FROM rede_app;
