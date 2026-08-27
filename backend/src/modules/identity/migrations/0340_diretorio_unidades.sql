-- ============================================================
-- Diretório mínimo de unidades — o que a transferência exigiu
--
-- Dois problemas concretos apareceram ao montar a tela de Transferências, e
-- os dois são a mesma coisa vista de dois lados: a política de `house` (§5.13)
-- mostra ao coordenador apenas a PRÓPRIA casa — corretamente — e isso deixava
-- a transferência impossível de operar.
--
--   1. Para PEDIR, é preciso escolher o destino. Sem uma lista de unidades,
--      não há como apontar para onde a criança vai.
--   2. Para LER a conversa, é preciso saber de que casa fala cada mensagem.
--      Uma consulta que fazia `JOIN house` sumia silenciosamente com a
--      mensagem da outra casa — a linha existia, o JOIN não achava par.
--
-- A saída não é abrir `house`. É devolver o MÍNIMO por função própria: código,
-- nome e tipo da unidade. Isso é o catálogo institucional — o mesmo que está
-- na porta de cada casa —, não dado de acolhido, de equipe ou de operação.
-- Nada do que acontece dentro da outra casa fica visível por aqui.
-- ============================================================

-- Rótulo de uma unidade: só o código. Mesmo padrão de `app_user_display_name`,
-- criado na Fase 4 pelo mesmo motivo — mostrar autoria sem abrir o cadastro.
CREATE OR REPLACE FUNCTION app_house_label(p_house uuid) RETURNS text AS $$
  SELECT h.code
  FROM house h
  JOIN app_user u ON u.id = app_current_user()
  WHERE h.id = p_house AND h.institution_id = u.institution_id
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_house_label(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_house_label(uuid) TO rede_app;

-- Catálogo de unidades para escolher um destino de transferência (§15.6).
-- Restrito a quem decide transferência: educador não precisa desta lista.
-- `propria` marca a casa do usuário, para a tela não oferecer o destino igual
-- à origem.
CREATE OR REPLACE FUNCTION app_house_directory()
RETURNS TABLE (id uuid, code text, name text, kind text, propria boolean) AS $$
  SELECT h.id, h.code, h.name, h.kind,
         h.id IN (SELECT app_user_house_ids())
  FROM house h
  JOIN app_user u ON u.id = app_current_user()
  WHERE h.institution_id = u.institution_id
    AND h.active
    AND app_current_role() IN ('equipe_tecnica','coordenador','gestor_geral')
  ORDER BY h.code
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_house_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_house_directory() TO rede_app;
