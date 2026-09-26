-- O CARGO PORTARIA (fase 160).
--
-- Decisão do humano em 26/09: a portaria ganha LOGIN MÍNIMO — vê só quem pode
-- visitar hoje e registra entrada e saída. Isto revê o pedido de 09/09, em que
-- a portaria ficava só com a folha em papel.
--
-- O valor entra num arquivo só dele: `ALTER TYPE ... ADD VALUE` não pode ser
-- usado na mesma transação em que nasce, e cada migração é uma transação.
ALTER TYPE role_code ADD VALUE IF NOT EXISTS 'portaria';
