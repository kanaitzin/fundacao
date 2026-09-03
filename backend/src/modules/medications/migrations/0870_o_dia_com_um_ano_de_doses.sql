-- =========================================================================
-- O DIA DA CASA, COM UM ANO DE REGISTROS — 02/09/2026
--
-- O ensaio de carga (`npx tsx scripts/ensaio-carga.ts`) mediu, com doze meses
-- de dados fictícios, a rota que abre a Saúde: **8,4 segundos**. Com o banco
-- recém-semeado ela respondia em milissegundos, e por isso ninguém viu.
--
-- A correção principal é na CONSULTA, não aqui: o dia virou uma faixa de
-- `timestamptz` em vez de uma conversão da coluna, porque sob RLS só
-- predicados LEAKPROOF descem para o índice — e `timezone()` e o cast para
-- `date` não são. O filtro do dia ficava depois da política de segurança, e
-- `app_person_in_scope()` rodava uma vez para cada dose do ANO da casa.
--
-- O que falta é do banco: as faixas de tempo precisam de um índice que
-- comece pela pessoa. `idx_adm_house_day` já atende a grade da casa; o
-- histórico de UM acolhido — a folha que a Enfermagem leva para a consulta —
-- não tinha índice nenhum por `person_id`, e varria a tabela inteira.
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_adm_pessoa_quando
  ON medication_administration (person_id, scheduled_at DESC);
