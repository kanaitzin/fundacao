-- A CONTA NÃO MUDA O PRÓPRIO CARGO (fase 288; achado A2 da análise geral de 08/11,
-- docs/historico/analise-geral-08-11.md).
--
-- A 0010 deu à aplicação UPDATE em TODAS as tabelas, e a política `user_update_self`
-- só confere que a linha é da própria pessoa. Juntas, deixavam uma sessão de educador
-- escrever na própria linha de `app_user` o que quisesse: o cargo, a marca de todas as
-- casas, a conta ativa, a instituição. Provado em 08/11, dentro de BEGIN e ROLLBACK,
-- como o papel da aplicação: a educadora virava coordenação com as oito casas no
-- alcance. Nenhuma rota fazia isso; era a segunda camada que não segurava, justamente
-- no dado que decide o que cada um vê.
--
-- O que a aplicação escreve em `app_user` pelo papel dela é uma coisa só: a troca da
-- própria senha (`auth.service.ts`, as três colunas abaixo). Todo o resto (criar
-- conta, cargo, casa, ativar, redefinir senha de colega, cor da linha, Coordenação
-- Geral) já passa por função SECURITY DEFINER, que confere quem pede e roda como dono.
-- A política continua, e a permissão passa a ser só destas colunas.
--
-- O que fica para o conserto A4, de propósito: a aplicação ainda LÊ o `password_hash`
-- das contas que a `user_select` alcança, e a própria pessoa ainda pode gravar
-- `must_change_password = false` sem trocar a senha. Os dois se fecham juntos com uma
-- função que troca a própria senha conferindo a atual, e então estas três colunas saem
-- da permissão da aplicação. O vínculo de casa, que tinha o mesmo defeito, é a 1680.

REVOKE INSERT, UPDATE ON app_user FROM rede_app;
GRANT UPDATE (password_hash, must_change_password, updated_at) ON app_user TO rede_app;

COMMENT ON POLICY user_update_self ON app_user IS
  'A própria linha, e só nas colunas que a aplicação pode escrever: password_hash, must_change_password e updated_at (1679). Cargo, casas e conta ativa só mudam por função SECURITY DEFINER.';
