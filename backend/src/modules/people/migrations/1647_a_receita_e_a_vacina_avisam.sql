-- A RECEITA E A VACINAÇÃO AVISAM ANTES DE VENCER (fase 191; decidido em
-- 08/10: a receita dez dias antes, a caderneta de vacinação quinze, para a
-- Enfermagem e para a técnica e a coordenação da casa).
--
-- O mesmo caminho do PIA (1636): os dois já são documentos do dossiê com
-- validade (`receita` e `caderneta_vacinacao`, `vence: true` em
-- `dossie-exigido.ts`). Vale o ÚLTIMO de cada criança com aquela chave: a
-- receita renovada substitui a anterior, e quem anexou a nova não deve receber
-- aviso da velha. Uma vez por documento, guardado aqui e não no módulo de
-- avisos, que é removível.
--
-- A função devolve só o que o aviso precisa: quem, qual documento, de que tipo
-- e a data. Nunca o documento, nem o remédio da receita: o aviso chega a quem
-- está de plantão no sino, e o remédio de uma criança não é conteúdo de aviso.

CREATE TABLE document_due_notice (
  document_id   uuid PRIMARY KEY REFERENCES document(id),
  checklist_key text NOT NULL CHECK (checklist_key IN ('receita', 'caderneta_vacinacao')),
  valid_until   date NOT NULL,
  notified_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE document_due_notice ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON document_due_notice FROM rede_app;
-- Sem política para o app: só a função abaixo escreve e lê.

CREATE FUNCTION app_documentos_vencendo(p_house uuid, p_chave text, p_dias integer)
RETURNS TABLE (out_documento uuid, out_pessoa uuid, out_nome text, out_data date)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_chave NOT IN ('receita', 'caderneta_vacinacao') THEN
    RAISE EXCEPTION 'chave_sem_aviso';
  END IF;
  RETURN QUERY
  WITH ultimo AS (
    SELECT DISTINCT ON (d.person_id) d.id, d.person_id, d.valid_until
      FROM document d
      JOIN house_stay s ON s.person_id = d.person_id AND s.house_id = p_house AND s.status = 'ativa'
     WHERE d.checklist_key = p_chave AND d.valid_until IS NOT NULL
     ORDER BY d.person_id, d.valid_until DESC, d.created_at DESC
  ), novos AS (
    INSERT INTO document_due_notice (document_id, checklist_key, valid_until)
    SELECT u.id, p_chave, u.valid_until FROM ultimo u
     WHERE u.valid_until BETWEEN app_hoje() AND app_hoje() + p_dias
    ON CONFLICT (document_id) DO NOTHING
    RETURNING document_id
  )
  SELECT u.id, u.person_id, coalesce(p.social_name, p.full_name), u.valid_until
    FROM ultimo u
    JOIN novos n ON n.document_id = u.id
    JOIN person p ON p.id = u.person_id
   ORDER BY u.valid_until;
END $$;

REVOKE ALL ON FUNCTION app_documentos_vencendo(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_documentos_vencendo(uuid, text, integer) TO rede_app;
