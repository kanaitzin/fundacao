-- ============================================================
-- Rótulo mínimo de acolhido — fechando uma classe inteira de defeitos
--
-- O PROBLEMA, em uma frase: `JOIN` com tabela protegida por RLS não filtra
-- coluna — ele **elimina a linha**, em silêncio, sem erro.
--
-- Isso já tinha mordido duas vezes (nome do educador na Fase 4, casa da
-- mensagem de transferência na revisão da transferência). Uma auditoria do
-- código inteiro mostrou que o mesmo padrão estava em mais oito lugares, todos
-- com a mesma causa de fundo:
--
--   * um REGISTRO (episódio de ATA, ocorrência, atividade, evolução, estoque,
--     item de rotina) pertence a uma CASA e continua visível para ela;
--   * a PESSOA é visível pela PERMANÊNCIA ATIVA — e a permanência muda quando
--     a criança é transferida ou sai.
--
-- Resultado: no dia em que a criança sai da casa, o episódio de contenção
-- some da ATA fechada; a ocorrência de violência perde o nome de quem ela
-- trata; a atividade fica sem acolhido. Nada disso dá erro. Simplesmente
-- desaparece — e desaparecer em silêncio é o pior comportamento possível num
-- sistema de proteção.
--
-- A CORREÇÃO não é afrouxar a política de `person`. É a mesma de sempre:
-- devolver o MÍNIMO por função própria. Aqui, o nome e a idade — o suficiente
-- para ler um registro que já é seu por direito.
--
-- A guarda: você só nomeia quem ALGUM DIA teve permanência numa casa do seu
-- escopo. Uma criança que nunca passou pela sua unidade continua sem nome
-- para você, mesmo que alguém adivinhe o identificador.
-- ============================================================

CREATE OR REPLACE FUNCTION app_person_display_name(p_person uuid) RETURNS text AS $$
  SELECT coalesce(nullif(p.social_name, ''), p.full_name)
  FROM person p
  WHERE p.id = p_person
    AND EXISTS (SELECT 1 FROM house_stay s
                WHERE s.person_id = p.id AND app_house_in_scope(s.house_id))
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_person_display_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_person_display_name(uuid) TO rede_app;

CREATE OR REPLACE FUNCTION app_person_age(p_person uuid) RETURNS integer AS $$
  SELECT date_part('year', age(p.birth_date))::int
  FROM person p
  WHERE p.id = p_person
    AND EXISTS (SELECT 1 FROM house_stay s
                WHERE s.person_id = p.id AND app_house_in_scope(s.house_id))
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_person_age(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_person_age(uuid) TO rede_app;
