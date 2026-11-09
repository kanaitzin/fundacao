-- O AVISO SÓ PELA FUNÇÃO (fase 298; o que a revisão de segurança achou).
--
-- Todo aviso nasce pelas funções `app_emit_notification` e `app_emit_escalation`, e a
-- aplicação só marca o próprio aviso como lido e ciente. A inserção direta aberta (`true`)
-- deixava forjar aviso para qualquer pessoa, e o UPDATE em todas as colunas deixava reescrever
-- o título e o texto do próprio aviso. Ficam do tamanho do que a aplicação faz.

REVOKE INSERT, UPDATE ON notification FROM rede_app;
GRANT UPDATE (read_at, acknowledged_at) ON notification TO rede_app;
DROP POLICY notif_insert ON notification;
