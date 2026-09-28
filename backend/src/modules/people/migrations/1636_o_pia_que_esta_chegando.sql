-- O PIA QUE ESTÁ CHEGANDO (fase 178, decisão de 28/09, §10 item 9).
--
-- O PIA é um documento do dossiê (chave 'pia'), e a validade dele é a data do
-- próximo. A Fundação decidiu: aviso por criança, trinta dias antes, na tela da
-- técnica. Quem chama é o relógio do dia, com a conta institucional dele, e o
-- PIA é documento da área restrita: esta função devolve só o que o aviso
-- precisa (quem, qual documento e a data), nunca o documento.
--
-- Uma vez por PIA: o aviso que já saiu para aquele documento não sai de novo,
-- nem se o relógio rodar duas vezes no dia, nem nos trinta dias seguintes. Quem
-- guarda isso é pia_aviso, deste módulo: o escalonamento é do módulo de avisos,
-- que é removível, e a regra da casa não pode depender dele. A criança que não
-- tem PIA nenhum não entra aqui: ela já aparece como faltando no dossiê.

CREATE TABLE pia_aviso (
  document_id uuid PRIMARY KEY REFERENCES document(id),
  valid_until date NOT NULL,
  avisado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pia_aviso ENABLE ROW LEVEL SECURITY;
-- Sem política para o app: só a função abaixo escreve e lê.

CREATE OR REPLACE FUNCTION app_pia_chegando(p_house uuid, p_dias integer)
RETURNS TABLE (out_documento uuid, out_pessoa uuid, out_nome text, out_data date) AS $$
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH ultimo AS (
    SELECT DISTINCT ON (d.person_id) d.id, d.person_id, d.valid_until
      FROM document d
      JOIN house_stay s ON s.person_id = d.person_id AND s.house_id = p_house AND s.status = 'ativa'
     WHERE d.checklist_key = 'pia' AND d.valid_until IS NOT NULL
     ORDER BY d.person_id, d.valid_until DESC, d.created_at DESC
  )
  , novos AS (
    INSERT INTO pia_aviso (document_id, valid_until)
    SELECT u.id, u.valid_until FROM ultimo u
     WHERE u.valid_until BETWEEN app_hoje() AND app_hoje() + p_dias
    ON CONFLICT (document_id) DO NOTHING
    RETURNING document_id
  )
  SELECT u.id, u.person_id, coalesce(p.social_name, p.full_name), u.valid_until
    FROM ultimo u
    JOIN novos n ON n.document_id = u.id
    JOIN person p ON p.id = u.person_id
   ORDER BY u.valid_until;
END $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION app_pia_chegando(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_pia_chegando(uuid, integer) TO rede_app;
