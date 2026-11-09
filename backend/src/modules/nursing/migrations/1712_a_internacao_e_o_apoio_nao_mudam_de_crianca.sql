-- A INTERNAÇÃO E O APOIO ESCOLAR NÃO MUDAM DE CRIANÇA NEM DE CASA -- (fase 298; o que a revisão do banco achou depois da 1702.)
--
-- Provado como o papel da aplicação: a coordenação da Casa 04 levava uma internação para uma
-- criança da Casa 03, e o apoio escolar para a Casa 03. A aplicação só encerra a internação e
-- desliga o apoio.

REVOKE UPDATE ON hospitalization FROM rede_app;
GRANT UPDATE (status, ended_at, outcome, outcome_note, closed_by, closed_at) ON hospitalization TO rede_app;
REVOKE UPDATE ON education_support FROM rede_app;
GRANT UPDATE (active, updated_at, updated_by) ON education_support TO rede_app;
