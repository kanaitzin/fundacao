-- ============================================================
-- 1120 — Quem pode visitar: a folha da portaria
--
-- Pedido do Marcelo em 09/09 (§10.5, item 1 da fila): a portaria recebe uma
-- folha, tipo planilha, com quem pode visitar cada acolhido — foto 3×4, nome,
-- CPF e telefone. A portaria não entra no sistema, como a cozinha: recebe o
-- papel.
--
-- ESTAR NO CADASTRO NÃO É ESTAR AUTORIZADO. O contato diz quem é da vida da
-- criança; a folha diz quem a casa deixa ENTRAR. Um tio recém-localizado, a
-- técnica do CRAS, um vínculo comunitário ainda em avaliação — nenhum deles
-- tem restrição, e nenhum deles deveria aparecer na guarita como liberado só
-- por isso. A autorização é uma marca explícita, com quem deu e quando
-- (decisão de 11/09, recomendação aceita).
--
-- O CPF VAI IMPRESSO — decisão do Marcelo, registrada no §10.5 e levada ao DPO
-- (§11, item 12). É dado pessoal de terceiro, e por isso fica guardado
-- normalizado e só aparece inteiro para quem escreve no cadastro.
--
-- A FOTO DO VISITANTE É OPCIONAL. A folha sai sem ela, com o espaço marcado,
-- porque travar a folha em quem ainda não trouxe foto deixaria o visitante de
-- verdade do lado de fora.
-- ============================================================

ALTER TABLE person_contact
  ADD COLUMN IF NOT EXISTS cpf                 text,
  ADD COLUMN IF NOT EXISTS visit_authorized    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visit_authorized_by uuid REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS visit_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS photo_key           text,
  ADD COLUMN IF NOT EXISTS photo_mime          text,
  ADD COLUMN IF NOT EXISTS photo_at            timestamptz,
  ADD COLUMN IF NOT EXISTS photo_by            uuid REFERENCES app_user(id);

-- Normalizado: onze dígitos, sem ponto nem traço. Formatar é da folha.
ALTER TABLE person_contact
  ADD CONSTRAINT contato_cpf_normalizado CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

-- Contato com aproximação restrita NUNCA aparece como autorizado — a regra
-- que vale de qualquer jeito (§10.5). Está no banco, e não só na tela e no
-- serviço, porque a folha da guarita é o último lugar onde um erro disso pode
-- ser corrigido antes de alguém entrar.
ALTER TABLE person_contact
  ADD CONSTRAINT contato_restrito_nao_visita CHECK (NOT (restricted AND visit_authorized));

-- Contato encerrado também não: o telefone que deixou de valer não vira
-- visitante liberado numa folha impressa semanas antes.
ALTER TABLE person_contact
  ADD CONSTRAINT contato_encerrado_nao_visita CHECK (active OR NOT visit_authorized);

COMMENT ON COLUMN person_contact.visit_authorized IS
  'Autorizado a visitar — marca explícita da técnica ou da coordenação. Sem ela o contato não entra na folha da portaria.';
COMMENT ON COLUMN person_contact.cpf IS
  'CPF do contato, normalizado. Dado de terceiro: inteiro só para quem escreve no cadastro, e na folha da portaria (decisão de 09/09).';
