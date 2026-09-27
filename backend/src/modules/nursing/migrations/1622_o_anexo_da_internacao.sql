-- ============================================================
-- O ANEXO DA INTERNAÇÃO: QUE DOCUMENTO É, E SE JÁ CHEGOU (fase 165).
--
-- Pedido de 25/09: os anexos da internação podem ser *"receitas, atestados,
-- relatórios médicos, exames, encaminhamentos, fotos de documentos, outros"*,
-- com *"autoria, data, horário e categoria do documento"*; e entre os testes,
-- *"mesmo arquivo enviado duas vezes"*.
--
-- A CATEGORIA é do anexo, e não do registro: o registro do dia continua com o
-- tipo que já tinha (relato, exame, retorno médico…), e o papel que veio junto
-- diz o que é. Um relato do dia pode vir com a foto da receita.
--
-- O MESMO ARQUIVO DUAS VEZES é recusado na mesma internação, pela soma de
-- verificação (sha256), e não pelo nome: o mesmo exame reenviado depois de o
-- sinal cair duplicaria a página no relatório, e quem lê não sabe se são dois
-- exames. Noutra internação o mesmo arquivo é outro fato, e entra.
-- ============================================================

ALTER TABLE hospitalization_note
  ADD COLUMN doc_category text
    CHECK (doc_category IN ('receita','atestado','relatorio_medico','exame',
                            'encaminhamento','foto_de_documento','outro')),
  ADD COLUMN sha256 text,
  ADD COLUMN size_bytes integer;

-- Categoria só existe onde há anexo.
ALTER TABLE hospitalization_note
  ADD CONSTRAINT ck_categoria_com_anexo CHECK (doc_category IS NULL OR storage_key IS NOT NULL);

CREATE UNIQUE INDEX uq_anexo_da_internacao ON hospitalization_note (hospitalization_id, sha256)
  WHERE sha256 IS NOT NULL;
