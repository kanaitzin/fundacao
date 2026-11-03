-- O PRAZO DA REAVALIAÇÃO (fase 269, pedido de 03/11).
--
-- O ECA manda reavaliar a situação de toda criança acolhida no máximo a cada
-- três meses, com relatório da equipe técnica ao Juízo (art. 19, § 1º). A
-- âncora é o último relatório de reavaliação anexado ao dossiê no acolhimento
-- de agora (chave `relatorio_reavaliacao`, com a data do envio; sem a data, o
-- dia em que foi anexado). Sem nenhum, conta desde o acolhimento. A regra e os
-- números moram em `reavaliacao.regra.ts`; esta função os repete, e a suíte
-- `o-prazo-da-reavaliacao` confere que os dois dão o mesmo dia.
--
-- O mesmo caminho do PIA (1636): o relógio do dia pergunta casa a casa, e a
-- técnica e a coordenação recebem um aviso por criança, uma vez por prazo,
-- quando faltam quinze dias. Prazo que já passou não vira aviso: na
-- implantação, toda criança sem relatório anexado estaria vencida sem estar
-- (o relatório foi no papel), e vinte avisos de uma vez ninguém lê. O perfil
-- diz o que passou, na área restrita.
--
-- A função devolve só o que o aviso precisa: quem e a data. Nunca o relatório.

CREATE TABLE reavaliacao_aviso (
  person_id   uuid NOT NULL REFERENCES person(id),
  proximo_ate date NOT NULL,
  avisado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, proximo_ate)
);
ALTER TABLE reavaliacao_aviso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reavaliacao_aviso FROM rede_app;
-- Sem política para o app: só as funções abaixo escrevem e leem.
COMMENT ON TABLE reavaliacao_aviso IS
  'Marca de já avisei do prazo da reavaliação (fase 269): uma linha por criança e prazo, '
  'escrita e lida só por app_reavaliacao_chegando. Não há tela: o que a pessoa lê é o aviso.';

-- O último relatório de reavaliação de uma criança no acolhimento de agora, e o
-- dia em que esse acolhimento começou. Lido pela função do aviso e pela área
-- restrita do perfil (que já passou pela policy da área restrita).
--
-- O começo é a DATA DO INGRESSO da ficha de entrada, e não o dia em que o
-- episódio nasceu no sistema: na implantação, a criança que já está na casa há
-- meses é cadastrada hoje, com o ingresso de verdade na ficha. Sem ficha, vale o
-- dia do episódio.
CREATE FUNCTION app_reavaliacao_base(p_person uuid)
RETURNS TABLE (out_desde date, out_ultimo date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  WITH ep AS (
    SELECT coalesce(a.admitted_on, (e.started_at AT TIME ZONE app_fuso())::date) AS desde
      FROM care_episode e
      LEFT JOIN admission_record a ON a.episode_id = e.id
     WHERE e.person_id = p_person AND e.status = 'ativo'
       AND app_person_in_scope(p_person)
  )
  SELECT ep.desde,
         (SELECT max(coalesce(d.issued_on, (d.created_at AT TIME ZONE app_fuso())::date))
            FROM document d
           WHERE d.person_id = p_person
             AND d.checklist_key = 'relatorio_reavaliacao'
             AND coalesce(d.issued_on, (d.created_at AT TIME ZONE app_fuso())::date) >= ep.desde)
    FROM ep;
$$;
REVOKE ALL ON FUNCTION app_reavaliacao_base(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_reavaliacao_base(uuid) TO rede_app;

CREATE FUNCTION app_reavaliacao_chegando(p_house uuid, p_dias integer)
RETURNS TABLE (out_pessoa uuid, out_nome text, out_data date)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT app_house_in_scope(p_house) THEN
    RAISE EXCEPTION 'fora_de_escopo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH prazo AS (
    SELECT s.person_id,
           (coalesce(b.out_ultimo, b.out_desde) + interval '3 months')::date AS proximo
      FROM house_stay s
      CROSS JOIN LATERAL app_reavaliacao_base(s.person_id) b
     WHERE s.house_id = p_house AND s.status = 'ativa'
  ), novos AS (
    INSERT INTO reavaliacao_aviso (person_id, proximo_ate)
    SELECT pr.person_id, pr.proximo FROM prazo pr
     WHERE pr.proximo BETWEEN app_hoje() AND app_hoje() + p_dias
    ON CONFLICT DO NOTHING
    RETURNING person_id, proximo_ate
  )
  SELECT n.person_id, coalesce(p.social_name, p.full_name), n.proximo_ate
    FROM novos n
    JOIN person p ON p.id = n.person_id
   ORDER BY n.proximo_ate;
END $$;
REVOKE ALL ON FUNCTION app_reavaliacao_chegando(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_reavaliacao_chegando(uuid, integer) TO rede_app;
