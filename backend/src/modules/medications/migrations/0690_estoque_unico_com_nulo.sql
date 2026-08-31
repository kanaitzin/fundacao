-- ---------------------------------------------------------------------------
-- Defeito 4 — o UNIQUE do estoque nunca valia para o estoque comum da casa.
--
-- `UNIQUE (house_id, medication, person_id)` com `person_id` anulável: em SQL,
-- NULL não é igual a NULL, então duas linhas de Dipirona da mesma casa sem
-- acolhido nominal NÃO conflitam. O `ON CONFLICT DO UPDATE` de `upsertStock`
-- nunca disparava para o estoque comum — toda entrada criava linha nova.
--
-- O estrago não fica no cadastro. `app_confirm_dose` baixa o estoque com
-- `person_id IS NULL`, sem LIMIT: cada dose administrada descontava UMA
-- unidade de CADA duplicata. Com três linhas acumuladas, uma dose virava três
-- baixas, e o alerta de estoque baixo — que é manual e serve para a casa pedir
-- reposição — passava a apontar falta onde havia medicamento, e sobra onde não
-- havia. Num remédio de uso contínuo, é a criança que fica sem.
--
-- PostgreSQL 15+ resolve isso com NULLS NOT DISTINCT: o NULL passa a conflitar
-- com NULL, e o estoque comum volta a ser UMA linha por casa e medicamento.
-- ---------------------------------------------------------------------------

-- 1) Consolidar o que já existe duplicado, ANTES de criar a restrição.
--    Nada é apagado em silêncio: a soma das linhas absorvidas entra como
--    movimento 'ajuste' na linha que fica, com o motivo escrito (§5.1).
DO $$
DECLARE g record; v_fica uuid; v_soma numeric; v_n integer;
BEGIN
  FOR g IN
    SELECT house_id, medication FROM medication_stock
     WHERE person_id IS NULL
     GROUP BY house_id, medication HAVING count(*) > 1
  LOOP
    SELECT id INTO v_fica FROM medication_stock
     WHERE house_id = g.house_id AND medication = g.medication AND person_id IS NULL
     ORDER BY updated_at, id LIMIT 1;

    SELECT sum(quantity), count(*) INTO v_soma, v_n FROM medication_stock
     WHERE house_id = g.house_id AND medication = g.medication AND person_id IS NULL;

    -- Os movimentos das linhas absorvidas passam para a linha que fica: o
    -- histórico de entradas e consumos continua inteiro.
    UPDATE medication_stock_movement SET stock_id = v_fica
     WHERE stock_id IN (SELECT id FROM medication_stock
                         WHERE house_id = g.house_id AND medication = g.medication
                           AND person_id IS NULL AND id <> v_fica);

    UPDATE medication_stock SET quantity = v_soma, updated_at = now() WHERE id = v_fica;

    INSERT INTO medication_stock_movement (stock_id, kind, quantity, reason)
    VALUES (v_fica, 'ajuste', v_soma,
            format('Consolidação de %s linhas duplicadas do estoque comum (defeito 4). '
                   'A quantidade é a soma das linhas absorvidas; confira o físico.', v_n));

    DELETE FROM medication_stock
     WHERE house_id = g.house_id AND medication = g.medication
       AND person_id IS NULL AND id <> v_fica;
  END LOOP;
END $$;

-- 2) Trocar a restrição por uma que enxergue o NULL.
ALTER TABLE medication_stock
  DROP CONSTRAINT IF EXISTS medication_stock_house_id_medication_person_id_key;

ALTER TABLE medication_stock
  ADD CONSTRAINT uq_medication_stock_casa_med_pessoa
  UNIQUE NULLS NOT DISTINCT (house_id, medication, person_id);

-- 3) A baixa da dose nunca deve alcançar mais de uma linha. A restrição acima
--    já garante isso; este índice deixa a intenção explícita para quem ler o
--    esquema daqui a um ano.
COMMENT ON CONSTRAINT uq_medication_stock_casa_med_pessoa ON medication_stock IS
  'Uma linha por casa+medicamento+acolhido. NULLS NOT DISTINCT: o estoque comum '
  'da casa (person_id nulo) também é único — sem isso, uma dose baixava todas as duplicatas.';
