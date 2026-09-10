-- ============================================================
-- 1060 — O retorno da experiência familiar: o que ela trouxe de casa
--
-- Pedido do Marcelo em 09/09, item 3 da fila: "quando a criança volta da
-- família: se houve alteração, se trouxe algo de casa".
--
-- DUAS COISAS, E SÓ UMA VIROU CAMPO NOVO.
--
-- "Se trouxe algo de casa" é fato logístico, e a casa precisa dele agora:
-- veio remédio que não é o da grade? veio roupa para lavar antes da escola de
-- segunda? veio um documento que a técnica esperava? veio um brinquedo que vai
-- virar briga no quarto? Nada disso é sobre quem a criança é, e tudo isso
-- muda o que o turno seguinte faz nas próximas duas horas. Vira coluna.
--
-- "Se houve alteração" NÃO virou campo. A decisão 4 da migração 1010 já dizia
-- que o retorno pede FATO, não rótulo, e o campo livre `return_note` existe
-- exatamente para isso — a ajuda dele passa a perguntar "como ela chegou".
-- Um "houve alteração?" com sim e não seria o caminho curto, e o §8.14 diz por
-- que ele é caro: um "alteração: sim" atravessa seis meses e um relatório
-- judicial muito depois de o detalhe ao lado ter sido esquecido, e "alterada"
-- gruda na criança de um jeito que "chegou sem falar e foi direto para o
-- quarto" não gruda. O sistema não censura texto; ele pede o fato e guarda
-- autor e data. Está anotado para conversar com o Marcelo: ele pediu a palavra
-- "alteração", e o que foi entregue responde a pergunta dele sem criar o
-- rótulo. Se a casa quiser o sim/não mesmo assim, é uma linha — mas que seja
-- escolha consciente.
--
-- POR QUE NÃO UMA LISTA DE OPÇÕES (roupa, remédio, documento, objeto):
-- porque a quinta opção sempre existe, e "Outro" com nota é o que a casa
-- acabaria usando em metade dos retornos. Texto curto, e quem lê é gente.
-- ============================================================

ALTER TABLE family_stay
  ADD COLUMN IF NOT EXISTS brought_back text;

COMMENT ON COLUMN family_stay.brought_back IS
  'O que a criança trouxe de casa na volta — roupa, remédio, documento, '
  'objeto (1060). Fato logístico do turno seguinte. NÃO é inventário nem '
  'conferência: é o que quem recebeu viu e achou que a casa precisa saber.';

COMMENT ON COLUMN family_stay.return_note IS
  'COMO A CRIANÇA CHEGOU, em fato observado (1010, decisão 4; ajuda revista em '
  '1060). Não é avaliação dela: "chegou sem falar e foi direto para o quarto" '
  'e "voltou agressiva" descrevem coisas diferentes, e a segunda gruda (§8.14).';

-- ------------------------------------------------------------
-- O retorno, agora com o que ela trouxe.
--
-- A função de 1010 tinha três parâmetros. Esta tem quatro, e a de três é
-- DERRUBADA em vez de mantida ao lado: duas assinaturas para o mesmo ato
-- deixariam o `brought_back` como o campo que alguns caminhos gravam e outros
-- não — e o caminho que não grava é sempre o que fica.
--
-- Quem registra continua sendo QUEM RECEBE a criança, o educador de plantão
-- inclusive: é ele que está na porta às 18h de domingo.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS app_registrar_retorno_familiar(uuid, timestamptz, text);

CREATE OR REPLACE FUNCTION app_registrar_retorno_familiar(
  p_id uuid, p_quando timestamptz, p_nota text, p_trouxe text DEFAULT NULL)
RETURNS TABLE (encerrada boolean) AS $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM family_stay WHERE id = p_id;
  IF f IS NULL OR NOT app_house_in_scope(f.house_id) THEN
    RAISE EXCEPTION 'saida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF f.status = 'encerrada' THEN
    RAISE EXCEPTION 'retorno_ja_registrado' USING ERRCODE = 'check_violation';
  END IF;

  /*
   * O retorno ANTES da saída é erro de digitação, e um erro que estraga a
   * conta do turno: a convivência apareceria como encerrada num plantão que
   * aconteceu antes de ela existir, e a passagem daquele turno passaria a
   * mostrar um retorno que ninguém recebeu.
   */
  IF p_quando < f.started_at THEN
    RAISE EXCEPTION 'retorno_antes_da_saida' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE family_stay
     SET returned_at = p_quando,
         return_note = nullif(btrim(p_nota), ''),
         brought_back = nullif(btrim(p_trouxe), ''),
         status = 'encerrada', closed_by = app_current_user(), closed_at = now()
   WHERE id = p_id;

  RETURN QUERY SELECT true;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION app_registrar_retorno_familiar(uuid, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_retorno_familiar(uuid, timestamptz, text, text) TO rede_app;
