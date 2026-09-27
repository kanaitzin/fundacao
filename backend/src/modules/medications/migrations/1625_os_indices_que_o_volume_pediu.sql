-- =========================================================================
-- OS ÍNDICES QUE O VOLUME PEDIU — 27/09/2026 (fase 167)
--
-- O ensaio de carga com dois anos de casa (`scripts/ensaio-carga.ts 24`)
-- achou duas leituras que varriam a história inteira para responder uma
-- pergunta pequena.
-- =========================================================================

-- O MOVIMENTO DO ARMÁRIO. `medication_stock_movement` nasceu na 0200 sem
-- índice em `stock_id`, e ninguém sentiu: a tabela tinha dezenas de linhas.
-- Com trinta remédios por casa e uma baixa por dia, dois anos são 196 mil
-- linhas. A história de um item (`stock/:id/movements`) levava 178 ms e as
-- métricas do remédio num ano cruzavam um milhão de pares; com o índice, 7 ms
-- e 80 ms. A ordem (`at DESC`) é a da tela.
CREATE INDEX IF NOT EXISTS idx_movimento_do_item
  ON medication_stock_movement (stock_id, at DESC);

-- A ÚLTIMA DOSE DADA. O painel da Enfermagem mostra, por criança, quando foi
-- a última dose (`max(administered_at)`), e o único índice por pessoa era por
-- `scheduled_at`: cada criança lia a história inteira de doses. Com vinte
-- crianças e dois anos, 368 ms; com o índice, 80 ms.
CREATE INDEX IF NOT EXISTS idx_adm_pessoa_dada
  ON medication_administration (person_id, administered_at DESC)
  WHERE administered_at IS NOT NULL;
