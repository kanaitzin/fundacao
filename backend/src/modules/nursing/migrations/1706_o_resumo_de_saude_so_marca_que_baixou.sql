-- O RESUMO DE SAÚDE SÓ MARCA QUE BAIXOU (fase 298; o que a revisão de segurança achou).
--
-- A emissão do resumo de saúde é o rastro de quem tirou dado de saúde da casa. Quem emitiu
-- podia reescrever a criança, a finalidade e a casa da própria emissão; a aplicação só grava
-- quando baixou.

REVOKE UPDATE ON health_summary_issue FROM rede_app;
GRANT UPDATE (downloaded_at) ON health_summary_issue TO rede_app;
