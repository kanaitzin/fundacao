-- ============================================================
-- Rede Acolher — Migração 055: benefícios como a planilha real pede,
-- e uma coisa que a planilha faz e o sistema não vai fazer
--
-- A planilha "DADOS BANCÁRIOS - AI 03" tem colunas que o sistema ainda não
-- guardava e que a coordenação usa todo mês:
--
--   * número do benefício;
--   * operação da conta (poupança social costuma ter OP 013/023/644…);
--   * agência com nome, não só número;
--   * PENDÊNCIA BANCÁRIA sim/não — a coluna que diz o que ainda falta
--     resolver, e que é o motivo de a planilha existir;
--   * situação/observação em texto.
--
-- E tem uma coluna que este sistema NÃO vai ter: **SENHA (GOV | INSS | CTPS)**.
--
-- Na planilha atual, as senhas dos acessos gov.br de crianças e adolescentes
-- estão escritas em texto claro, num arquivo compartilhado, ao lado do CPF e
-- do nome da mãe — e há a anotação de que as contas ficam "logadas no celular
-- institucional". Guardar isso no sistema seria transformar um problema de
-- documento num problema de banco de dados: um vazamento passaria a dar
-- acesso ao gov.br de cada criança, com o CPF na linha de cima.
--
-- O sistema registra que existe credencial e QUEM responde por ela; a senha
-- em si fica num gerenciador de senhas institucional, fora daqui. Não é
-- limitação técnica: é a única forma de a resposta a "quem tinha acesso?" não
-- ser "todo mundo que abriu a pasta".
--
-- O CHECK abaixo recusa algo que pareça senha no campo de observação. É
-- grosseiro de propósito — não impede um determinado, impede o distraído.
-- ============================================================

ALTER TABLE benefit_record
  ADD COLUMN IF NOT EXISTS benefit_number text,
  ADD COLUMN IF NOT EXISTS account_op     text,          -- operação (013, 023, 644…)
  ADD COLUMN IF NOT EXISTS agency_name    text,
  ADD COLUMN IF NOT EXISTS bank_pending   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_note   text,
  -- Credencial gov.br/INSS/CTPS: registra a EXISTÊNCIA e o responsável.
  -- Nunca a senha (§6.10, §22).
  ADD COLUMN IF NOT EXISTS has_gov_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gov_access_holder text,       -- cargo/pessoa que responde pela credencial
  ADD COLUMN IF NOT EXISTS gov_access_note text;         -- onde está guardada, sem o segredo

ALTER TABLE benefit_record DROP CONSTRAINT IF EXISTS ck_benefit_sem_senha;
ALTER TABLE benefit_record ADD CONSTRAINT ck_benefit_sem_senha CHECK (
  coalesce(notes, '')          !~* '(senha|password|passwd)\s*[:=]'
  AND coalesce(pending_note, '')   !~* '(senha|password|passwd)\s*[:=]'
  AND coalesce(gov_access_note, '') !~* '(senha|password|passwd)\s*[:=]'
);

COMMENT ON COLUMN benefit_record.gov_access_note IS
  'Onde a credencial está guardada e quem responde por ela. NUNCA a senha — '
  'segredo fica no gerenciador institucional (§6.10, §22).';
