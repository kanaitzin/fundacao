-- OS AVISOS DA COORDENAÇÃO GERAL (fase 178, decisão de 28/09).
--
-- Em um ano simulado das oito casas (fase 177) a Coordenação Geral não recebeu
-- nenhum aviso: ela não é da equipe de casa nenhuma, e por isso não entra no
-- escalonamento de nenhuma. A Fundação decidiu que chegam a ela os GRAVES das
-- oito casas: a ocorrência das categorias que exigem revisão técnica, a
-- internação aberta e a ATA Geral Noturna assinada com pendência. O resto
-- continua com a coordenação de cada casa.
--
-- Um nível próprio, e não o cargo coordenador: o nível transversal escolhe
-- pelo cargo, e cargo coordenador sem a marca é a coordenação de UMA casa, que
-- não deve receber o grave das outras sete. A lista de cargos do nível fica
-- vazia de propósito, e quem responde é a marca todas_as_casas (1634).

INSERT INTO escalation_level (level, roles, transversal, descricao) VALUES
  ('coordenacao_geral', ARRAY[]::text[], true,
   'Coordenação Geral: só os graves das oito casas (decisão de 28/09)');

CREATE OR REPLACE FUNCTION app_escalation_targets(p_house uuid, p_level text)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  -- Cargos ligados à casa: só quem tem vínculo vigente ali.
  SELECT DISTINCT a.user_id
  FROM escalation_level n
  JOIN user_house_assignment a ON a.valid_to IS NULL AND a.house_id = p_house
  JOIN app_user u ON u.id = a.user_id AND u.active
  WHERE n.level = p_level AND NOT n.transversal
    AND u.role::text = ANY (n.roles)
  UNION
  -- Cargos transversais: entram por função, sem vínculo de casa.
  SELECT u.id
  FROM escalation_level n
  JOIN app_user u ON u.active AND u.role::text = ANY (n.roles)
  JOIN house h ON h.id = p_house AND h.institution_id = u.institution_id
  WHERE n.level = p_level AND n.transversal
  UNION
  -- A Coordenação Geral (1635): pela marca, e só no nível dela.
  SELECT u.id
  FROM app_user u
  JOIN house h ON h.id = p_house AND h.institution_id = u.institution_id
  WHERE p_level = 'coordenacao_geral' AND u.active AND u.todas_as_casas
$function$;
