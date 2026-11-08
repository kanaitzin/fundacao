-- O VÍNCULO DE CASA SÓ MUDA POR FUNÇÃO (fase 288, achado da revisão do banco sobre o A2
-- da análise geral de 08/11).
--
-- A 0010 deu à aplicação INSERT em `user_house_assignment`, e a política `uha_insert`
-- conferia só o cargo de quem pede (gestor ou coordenação) e se a casa estava no alcance
-- dele. Não conferia de quem era a conta nem quem assinava a linha. Provado em 08/11,
-- dentro de BEGIN e ROLLBACK, como o papel da aplicação: a sessão da coordenação da Casa
-- 03 vinculou uma educadora da Casa 04 à Casa 03, e a educadora passou a alcançar as
-- crianças das duas, sem auditoria e com a autoria escrita por quem quisesse. Nenhuma
-- rota fazia isso; era a mesma segunda camada que a 1679 fechou em `app_user`.
--
-- Nenhum TypeScript escreve nesta tabela. Quem dá e tira casa são as funções SECURITY
-- DEFINER da Equipe (`app_create_staff`, `app_update_staff`, `app_create_coordenacao_geral`),
-- que conferem o cargo, a casa da conta e gravam a auditoria. A aplicação continua lendo
-- (`uha_select`) e perde a escrita; a política de inserção sai junto, para não sobrar
-- regra que nada usa.
--
-- E `house`: a aplicação tinha INSERT sem política nenhuma (o RLS já recusava). Casa nova
-- entra pela instalação, como dono.

REVOKE INSERT, UPDATE, DELETE ON user_house_assignment FROM rede_app;
DROP POLICY IF EXISTS uha_insert ON user_house_assignment;

REVOKE INSERT, UPDATE, DELETE ON house FROM rede_app;
