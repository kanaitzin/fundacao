-- ============================================================
-- Rede Acolher — Migração 003: consultas protegidas
--
-- Duas informações que uma pessoa PRECISA ver sem poder ver o conteúdo:
--   1. quantos documentos restritos existem ("há anexo", §6.8/§13.7);
--   2. o resumo mínimo de uma transferência pendente, para o destino decidir
--      antes de ter acesso ao perfil (§15.6).
-- Ambas são funções SECURITY DEFINER que devolvem o MÍNIMO e checam escopo
-- internamente — nunca uma abertura genérica de leitura.
-- ============================================================

-- Contagem (número, nunca título ou conteúdo) de documentos que este papel
-- não pode abrir. Saber que existe é operacional; ler não é.
CREATE OR REPLACE FUNCTION app_count_restricted_docs(p uuid) RETURNS integer AS $$
  SELECT count(*)::int FROM document d
  WHERE d.person_id = p AND app_person_in_scope(p) AND NOT app_can_open_doc(d.category)
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_count_restricted_docs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_count_restricted_docs(uuid) TO rede_app;

-- Caixa de entrada de transferências do destino.
-- Antes do aceite o destino NÃO acessa o perfil (o RLS de person o impede),
-- mas precisa de base para decidir: unidade de origem, motivo e idade.
-- Sem nome, sem CPF, sem saúde, sem histórico.
CREATE OR REPLACE FUNCTION app_transfer_inbox(p_house uuid)
RETURNS TABLE (id uuid, origem text, motivo text, idade integer, solicitada_em timestamptz) AS $$
  SELECT t.id, h.code, t.reason,
         date_part('year', age(p.birth_date))::int,
         t.requested_at
  FROM transfer_request t
  JOIN house h ON h.id = t.from_house_id
  JOIN person p ON p.id = t.person_id
  WHERE t.to_house_id = p_house
    AND t.status = 'solicitada'
    AND app_house_in_scope(p_house)          -- guarda: só a própria caixa de entrada
  ORDER BY t.requested_at
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_transfer_inbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_transfer_inbox(uuid) TO rede_app;
