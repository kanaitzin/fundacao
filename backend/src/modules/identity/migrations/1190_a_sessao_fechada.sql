-- ============================================================
-- 1190 — A sessão deixa de ficar aberta para a aplicação
--
-- A fase 100 anotou o risco e disse que fechar isto era uma fase própria. É
-- esta. `user_session` e `login_attempt` eram as duas únicas tabelas com dado
-- de pessoa sem RLS, e a aplicação lia e escrevia nelas direto:
--
--   * `user_session` guarda `token_hash`, IP e user-agent de TODA gente. Uma
--     consulta sem `WHERE user_id` — ou um `WHERE` com o id errado — lia ou
--     revogava a sessão de qualquer pessoa. Nada impedia;
--   * `login_attempt` guarda e-mail, IP e sucesso. Lida inteira, ela diz quais
--     e-mails existem na instituição.
--
-- POR QUE NÃO BASTAVA LIGAR RLS: o login acontece ANTES de existir identidade
-- na sessão. Não há `app.user_id` quando se confere a senha, nem quando se
-- cria a sessão, nem quando se valida o token da requisição seguinte — é
-- justamente o token que vai DIZER quem é. Uma política por usuário negaria o
-- próprio login.
--
-- O QUE SE FAZ EM VEZ DISSO: as cinco operações viram funções `SECURITY
-- DEFINER`, que rodam como dona do banco. A aplicação perde o acesso direto às
-- duas tabelas e passa a só poder o que estas funções permitem — cada uma com
-- o `WHERE` certo escrito aqui dentro, onde não se esquece.
--
-- O GANHO É ESTE, e é exatamente o mesmo princípio do resto do sistema: a
-- garantia deixa de depender de o serviço lembrar de filtrar. Depois desta
-- migração, um `SELECT * FROM user_session` feito pela aplicação recebe erro
-- de permissão, e não a tabela inteira.
-- ============================================================

-- ---------------------------------------------------------------- tentativas

/** Quantas tentativas falhas nos últimos `p_minutos` — a trava de força bruta. */
CREATE OR REPLACE FUNCTION auth_tentativas_recentes(p_email text, p_minutos int)
RETURNS int AS $$
  SELECT count(*)::int FROM login_attempt
   WHERE email = lower(p_email) AND success = false
     AND at > now() - (p_minutos || ' minutes')::interval;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_registrar_tentativa(p_email text, p_ip inet, p_ok boolean)
RETURNS void AS $$
  INSERT INTO login_attempt (email, ip, success) VALUES (lower(p_email), p_ip, p_ok);
$$ LANGUAGE sql SECURITY DEFINER;

-- -------------------------------------------------------------------- sessão

CREATE OR REPLACE FUNCTION auth_criar_sessao(
  p_user uuid, p_hash text, p_horas int, p_user_agent text, p_ip inet)
RETURNS uuid AS $$
  INSERT INTO user_session (user_id, token_hash, expires_at, user_agent, ip)
  VALUES (p_user, p_hash, now() + (p_horas || ' hours')::interval, p_user_agent, p_ip)
  RETURNING id;
$$ LANGUAGE sql SECURITY DEFINER;

/**
 * Valida o token e marca o uso, numa escrita só.
 *
 * O `WHERE` é o que protege: hash exato, não revogada, não vencida. Vive aqui
 * porque é ele que decide se a requisição continua — e uma condição esquecida
 * num serviço é uma sessão revogada que volta a funcionar.
 */
CREATE OR REPLACE FUNCTION auth_validar_sessao(p_hash text)
RETURNS TABLE (id uuid, user_id uuid, last_reauth_at timestamptz) AS $$
  UPDATE user_session SET last_used_at = now()
   WHERE token_hash = p_hash AND revoked_at IS NULL AND expires_at > now()
   RETURNING id, user_id, last_reauth_at;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_marcar_reautenticacao(p_sessao uuid)
RETURNS void AS $$
  UPDATE user_session SET last_reauth_at = now() WHERE id = p_sessao;
$$ LANGUAGE sql SECURITY DEFINER;

/**
 * Revoga sessões. Três usos, um lugar só:
 *   - a própria sessão (logout);
 *   - todas as de uma pessoa (senha alterada por outra pessoa, desligamento);
 *   - todas MENOS a atual (a pessoa trocou a própria senha e continua usando).
 *
 * `p_exceto` nunca é confundido com "todas": quando ele vem, a atual fica.
 */
CREATE OR REPLACE FUNCTION auth_revogar_sessoes(
  p_sessao uuid, p_user uuid, p_motivo text, p_exceto uuid DEFAULT NULL)
RETURNS int AS $$
  WITH alvo AS (
    UPDATE user_session SET revoked_at = now(), revoked_reason = p_motivo
     WHERE revoked_at IS NULL
       AND ((p_sessao IS NOT NULL AND id = p_sessao)
            OR (p_user IS NOT NULL AND user_id = p_user
                AND (p_exceto IS NULL OR id <> p_exceto)))
     RETURNING 1)
  SELECT count(*)::int FROM alvo;
$$ LANGUAGE sql SECURITY DEFINER;

-- ------------------------------------------------------- fechando as portas

REVOKE ALL ON user_session FROM rede_app;
REVOKE ALL ON login_attempt FROM rede_app;

/*
 * RLS ligado também. Com o acesso revogado ele é a segunda tranca: se um dia
 * alguém devolver o GRANT sem pensar, a tabela continua negando — e a
 * conferência da fase 100 deixa de precisar de exceção para as duas.
 */
ALTER TABLE user_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempt ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION auth_tentativas_recentes(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_registrar_tentativa(text, inet, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_criar_sessao(uuid, text, int, text, inet) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_validar_sessao(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_marcar_reautenticacao(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_revogar_sessoes(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_tentativas_recentes(text, int) TO rede_app;
GRANT EXECUTE ON FUNCTION auth_registrar_tentativa(text, inet, boolean) TO rede_app;
GRANT EXECUTE ON FUNCTION auth_criar_sessao(uuid, text, int, text, inet) TO rede_app;
GRANT EXECUTE ON FUNCTION auth_validar_sessao(text) TO rede_app;
GRANT EXECUTE ON FUNCTION auth_marcar_reautenticacao(uuid) TO rede_app;
GRANT EXECUTE ON FUNCTION auth_revogar_sessoes(uuid, uuid, text, uuid) TO rede_app;

COMMENT ON TABLE user_session IS
  'Sessões. Desde a 1190 a aplicação NÃO alcança esta tabela: só as funções auth_* (SECURITY DEFINER), que trazem o WHERE certo escrito nelas.';
