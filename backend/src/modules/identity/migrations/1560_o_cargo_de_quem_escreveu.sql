-- ============================================================
-- O CARGO DE QUEM ESCREVEU — a irmã de app_user_display_name (fase 152).
--
-- A LEITURA DO NOME JÁ TINHA RESPOSTA, E O CARGO NÃO.
--
-- `app_user` tem RLS por linha (0920): educador, líder e Enfermagem leem só a
-- PRÓPRIA. Para o NOME de um colega a casa já tinha a saída desde a 0060 —
-- `app_user_display_name`, que devolve o nome e nada mais —, e por isso a ATA
-- sempre mostrou quem escreveu cada linha. O CARGO, não: ele vinha por
-- subconsulta direta em `app_user`, sob o RLS de quem lê, e voltava NULO para
-- todo mundo que não fosse coordenação, técnica ou gestão.
--
-- O que isso fazia na tela: a educadora que abria a ATA de ontem para saber
-- como a casa passou a noite via "— · 02:10" na linha da colega, onde devia ler
-- "Educador social · 02:10". E o protótipo mostrava o cargo, porque o
-- servidor de mentira o preenche sempre — a demonstração mostrava o que o
-- produto escondia.
--
-- A MESMA FORMA DA IRMÃ, de propósito: devolve UM campo, o código do cargo, e
-- nada mais. O cargo é o que já está escrito ao lado do nome em toda linha de
-- ATA e em toda escala da parede; ele não abre cadastro, e não diz em que casa
-- a pessoa trabalha. Sem `p_house`, e por isso sem `app_house_in_scope` —
-- exatamente como `app_user_display_name`.
--
-- E `search_path` por extenso, que é o que o `arquivo-tem-saida.spec.ts` cobra
-- de toda função SECURITY DEFINER lendo o catálogo.
-- ============================================================

CREATE OR REPLACE FUNCTION app_user_cargo(p_user uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT role::text FROM app_user WHERE id = p_user
$$;

REVOKE ALL ON FUNCTION app_user_cargo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_user_cargo(uuid) TO rede_app;

COMMENT ON FUNCTION app_user_cargo(uuid) IS
  'O código do cargo de uma pessoa da equipe, e nada mais — a irmã de app_user_display_name. Existe porque app_user tem RLS por linha e o cargo de quem escreveu uma linha da ATA voltava nulo para educador, líder e Enfermagem (fase 152).';
