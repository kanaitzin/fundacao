-- ============================================================
-- 1180 — O que a aplicação não precisa poder
--
-- Varredura da fase 100: das 110 tabelas, quatro estavam sem RLS. Nenhuma
-- guarda dado de criança, mas `rede_app` tinha INSERT e UPDATE em todas —
-- inclusive nas duas em que a aplicação nunca escreve.
--
-- O QUE MUDA AQUI, e é só o que dá para mudar sem risco:
--
--   * `schema_migration` é do MIGRADOR, que roda como dono do banco. A
--     aplicação nunca escreveu nela, e agora não pode: um erro de código não
--     apaga o registro de qual migração já rodou — o único lugar onde se lê
--     em que estado o banco está;
--   * `institution` ganha RLS e a aplicação perde a escrita. Ela é a raiz do
--     isolamento entre instituições: hoje há uma só, e é exatamente por isso
--     que ninguém notaria se outra aparecesse e fosse legível por todos.
--
-- O QUE NÃO MUDA, e por quê: `user_session` e `login_attempt` continuam sem
-- RLS. O login acontece ANTES de haver identidade na sessão — `app.user_id`
-- ainda não existe quando se valida a senha e se cria a sessão —, e uma
-- política baseada em `app_current_user()` negaria o próprio login. Fechá-las
-- exige mover a autenticação para funções `SECURITY DEFINER`, que é uma fase
-- inteira e não se faz junto com outra coisa. Fica na §9, escrito com o risco:
-- quem alcançar a conexão da aplicação lê o hash de sessão e o IP de qualquer
-- pessoa, e a lista de tentativas de login diz quais e-mails existem.
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON schema_migration FROM rede_app;
REVOKE INSERT, UPDATE, DELETE ON institution FROM rede_app;

ALTER TABLE institution ENABLE ROW LEVEL SECURITY;

-- Cada pessoa enxerga a instituição a que pertence, e só ela.
CREATE POLICY institution_select ON institution FOR SELECT TO rede_app
  USING (id = app_minha_instituicao());

COMMENT ON TABLE institution IS
  'A fundação. RLS desde a 1180: cada pessoa lê a sua, e a aplicação não escreve aqui.';
