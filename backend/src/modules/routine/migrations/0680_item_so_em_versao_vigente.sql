-- ---------------------------------------------------------------------------
-- Defeito 12 — `addItem` aceitava qualquer `versionId`.
--
-- O identificador da versão vinha da tela e ninguém o conferia. Dois estragos:
--
--   * VERSÃO FECHADA. A rotina que vigorou até 3 de março é o que a casa
--     seguia naquele período — é assim que a coordenação explica, meses
--     depois, por que a atividade das 14h existia. Inserir item numa versão
--     encerrada reescreve o passado: passa a constar que a casa tinha uma
--     atividade que nunca teve. E como `app_generate_day` gera pela versão
--     vigente, o item também não produz nada hoje — o autor acha que criou,
--     e ninguém vê o item na grade;
--   * VERSÃO DE OUTRA CASA. `house_id` chega como parâmetro separado do
--     `version_id`. Nada impedia um item da Casa 03 pendurado na versão da
--     Casa 07, e o RLS de routine_item olha o house_id da LINHA — que estava
--     certo. O vínculo torto passava.
--
-- Vai no banco como gatilho, não no serviço: a rotina é copiada por
-- `app_new_routine_version` e alterada por rota, e as duas entradas precisam
-- da mesma trava.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_routine_item_guard() RETURNS trigger AS $$
DECLARE v_casa uuid; v_ate date;
BEGIN
  SELECT rv.house_id, rv.valid_to INTO v_casa, v_ate
    FROM routine_version rv WHERE rv.id = NEW.version_id;

  IF v_casa IS NULL THEN
    RAISE EXCEPTION 'versao_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_casa IS DISTINCT FROM NEW.house_id THEN
    RAISE EXCEPTION 'versao_de_outra_casa' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_ate IS NOT NULL THEN
    RAISE EXCEPTION 'versao_fechada' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_routine_item_guard ON routine_item;
CREATE TRIGGER tg_routine_item_guard
  BEFORE INSERT OR UPDATE OF version_id, house_id ON routine_item
  FOR EACH ROW EXECUTE FUNCTION app_routine_item_guard();
